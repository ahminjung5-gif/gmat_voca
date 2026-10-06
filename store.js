/* =========================================================
   기록 저장소
   - 로그인 전: 이 기기(localStorage)에만 저장
   - 로그인 후: Supabase에 저장하고 기기 사이에 동기화
   ========================================================= */
(() => {
  "use strict";

  const cfg = window.APP_CONFIG || {};
  const hasCloud = !!(cfg.SUPABASE_URL && cfg.SUPABASE_KEY && window.supabase);
  const sb = hasCloud ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY) : null;

  const MASTER_STREAK = 3;   // 연속 3번 맞히면 '익힌 단어'
  const NOTE_CLEAR = 2;      // 오답 노트 단어를 연속 2번 맞히면 노트에서 빠짐
  const FLUSH_MS = 2500;

  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

  const state = {
    user: null,         // Supabase user
    profile: null,      // { nickname }
    stats: {},          // "m:word" -> { c, w, s, last, note }
    daily: {},          // "2026-10-05" -> { n, c, sec }
    sessions: [],       // 최근 학습 기록 (최신순)
    marks: {},          // 단어 체크: word -> { s: "known"(오키=외운 단어) | "vague"(애매=헷갈리는 단어), at: 체크한 시각 }
    studyPos: {},       // 공부 모드 이어보기: key -> 위치
    needsMigration: false, // Supabase에 새 SQL(공부 모드용)이 아직 없으면 true
    sync: hasCloud ? "idle" : "local",   // local | idle | saving | error
    ready: false,
  };

  const dirtyStats = new Set();
  const dirtyDays = new Set();
  let flushTimer = null;

  /* ---------- 날짜 (내 기기 시간 기준) ---------- */
  // vd / rd = 그날 VOCA / RC set Day 하나를 끝까지 봤는지 (예전 기록은 undefined)
  const newDay = () => ({ n: 0, c: 0, sec: 0, v: 0, vd: false, rd: false });
  function dayKey(d = new Date()) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  /* ---------- 로컬 캐시 ---------- */
  const lsKey = () => "gmat-voca-data:" + (state.user ? state.user.id : "guest");
  function saveLocal() {
    try {
      localStorage.setItem(lsKey(), JSON.stringify({
        profile: state.profile, stats: state.stats, daily: state.daily, sessions: state.sessions.slice(0, 60),
        marks: state.marks, studyPos: state.studyPos, todayViews: state.todayViews,
        pendingStudySync: !!(state.user && state.needsMigration) || undefined,
      }));
    } catch (_) {}
  }
  function loadLocal(key = lsKey()) {
    try {
      const d = JSON.parse(localStorage.getItem(key) || "null");
      return d && typeof d === "object" ? d : null;
    } catch (_) { return null; }
  }
  function applyLocal(d) {
    state.profile = (d && d.profile) || null;
    state.stats = (d && d.stats) || {};
    state.daily = (d && d.daily) || {};
    state.sessions = (d && d.sessions) || [];
    state.marks = normMarks(d && (d.marks || d.flags));
    state.studyPos = (d && d.studyPos) || {};
    state.todayViews = (d && d.todayViews) || null;
  }

  /* ---------- 기록 남기기 ---------- */
  function recordAnswer(word, mode, ok, seconds) {
    const k = `${mode}:${word}`;
    const s = state.stats[k] || { c: 0, w: 0, s: 0, last: null, note: false };
    if (ok) {
      s.c++; s.s++;
      if (s.note && s.s >= NOTE_CLEAR) s.note = false;
    } else {
      s.w++; s.s = 0; s.note = true;
    }
    s.last = new Date().toISOString();
    state.stats[k] = s;
    dirtyStats.add(k);

    const dk = dayKey();
    const day = state.daily[dk] || newDay();
    day.n++; if (ok) day.c++;
    day.sec += Math.max(0, Math.round(seconds || 0));
    state.daily[dk] = day;
    dirtyDays.add(dk);

    saveLocal();
    scheduleFlush();
  }

  // 공부 모드에서 카드 한 장을 본 것
  // deck: "voca" | "rc", dayNo: 그 카드의 Day, key: 카드 키, total: 그 Day의 카드 수
  function todayViewsFor(deck) {
    const t = dayKey();
    if (!state.todayViews || state.todayViews.date !== t) state.todayViews = { date: t, voca: {}, rc: {} };
    return state.todayViews[deck];
  }
  function recordView(deck, dayNo, key, total) {
    const dk = dayKey();
    const day = state.daily[dk] || newDay();
    const views = todayViewsFor(deck);
    const list = views[dayNo] || (views[dayNo] = []);
    if (!list.includes(key)) {
      list.push(key);
      day.v = (day.v || 0) + 1;
      const flag = deck === "rc" ? "rd" : "vd";
      if (!day[flag] && total && list.length >= total) { day[flag] = true; emit(); }
      if (day.vd === undefined) day.vd = false;
      if (day.rd === undefined) day.rd = false;
      state.daily[dk] = day;
      dirtyDays.add(dk);
      saveLocal();
      scheduleFlush();
    }
  }
  // 오늘 덱별로 Day마다 본 카드 수: { [day]: count }
  function todayViewCounts(deck) {
    const v = todayViewsFor(deck);
    const out = {};
    Object.keys(v).forEach((d) => { out[d] = v[d].length; });
    return out;
  }
  function todayDone(deck) {
    const x = state.daily[dayKey()];
    return !!(x && x[deck === "rc" ? "rd" : "vd"]);
  }

  // 헷갈리는 단어 체크 / 해제
  // 예전 형식(word -> 시각 문자열 = 헷갈리는 단어)도 읽을 수 있게 변환
  function normMarks(m) {
    const out = {};
    Object.entries(m || {}).forEach(([w, v]) => {
      if (typeof v === "string") out[w] = { s: "vague", at: v };
      else if (v && (v.s === "known" || v.s === "vague")) out[w] = { s: v.s, at: v.at || new Date().toISOString() };
    });
    return out;
  }
  const dirtyMarks = new Set();
  function getMark(word) { return state.marks[word] ? state.marks[word].s : null; }
  function isFlagged(word) { return getMark(word) === "vague"; }
  function isKnown(word) { return getMark(word) === "known"; }
  // status: "known" | "vague" | null(해제)
  function setMark(word, status) {
    if (status) state.marks[word] = { s: status, at: new Date().toISOString() };
    else delete state.marks[word];
    dirtyMarks.add(word);
    saveLocal();
    scheduleFlush();
    emit();
    return status;
  }
  // 같은 버튼을 다시 누르면 해제
  function toggleMark(word, status) { return setMark(word, getMark(word) === status ? null : status); }
  function toggleFlag(word) { return toggleMark(word, "vague") === "vague"; }
  function markedWords(status) {
    return Object.entries(state.marks).filter(([, v]) => v.s === status)
      .sort((a, b) => (a[1].at < b[1].at ? 1 : -1)).map(([w, v]) => ({ word: w, at: v.at }));
  }
  function countMarks(status) { let n = 0; for (const k in state.marks) if (state.marks[k].s === status) n++; return n; }
  function todayKnown() {
    const t = dayKey();
    let n = 0;
    for (const k in state.marks) { const v = state.marks[k]; if (v.s === "known" && dayKey(new Date(v.at)) === t) n++; }
    return n;
  }

  // 공부 모드 이어보기 위치
  const dirtyPos = new Set();
  function getStudyPos(key) { return state.studyPos[key] || 0; }
  function setStudyPos(key, idx) {
    if (state.studyPos[key] === idx) return;
    state.studyPos[key] = idx;
    dirtyPos.add(key);
    saveLocal();
    scheduleFlush();
  }

  function recordSession(sess) {
    const row = { at: new Date().toISOString(), ...sess };
    state.sessions.unshift(row);
    state.sessions = state.sessions.slice(0, 60);
    saveLocal();
    emit();
    if (state.user && sb) {
      sb.from("sessions").insert({
        user_id: state.user.id, played_at: row.at, mode: row.mode, days: row.days,
        total: row.total, correct: row.correct, wrong: row.wrong, hints: row.hints,
        result: row.result, duration_sec: row.dur,
      }).then(({ error }) => { if (error) console.error(error); });
    }
    flush();
  }

  /* ---------- 클라우드 동기화 ---------- */
  function setSync(s) { state.sync = s; emit(); }

  function scheduleFlush() {
    if (!state.user || !sb) return;
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, FLUSH_MS);
  }

  async function flush() {
    clearTimeout(flushTimer);
    if (!state.user || !sb) return;
    if (!dirtyStats.size && !dirtyDays.size && !dirtyMarks.size && !dirtyPos.size) return;
    const uid = state.user.id;
    const statKeys = [...dirtyStats].filter((k) => !(state.needsMigration && k.startsWith("r:")));
    const statRows = statKeys.map((k) => {
      const i = k.indexOf(":");
      const s = state.stats[k];
      return { user_id: uid, mode: k.slice(0, i), word: k.slice(i + 1), correct: s.c, wrong: s.w, streak: s.s, last_seen: s.last, in_note: s.note };
    });
    const dayRows = [...dirtyDays].map((d) => {
      const v = state.daily[d];
      const row = { user_id: uid, day: d, answered: v.n, correct: v.c, seconds: v.sec };
      if (!state.needsMigration) {
        row.viewed = v.v || 0;
        row.voca_done = v.vd === undefined ? null : !!v.vd;
        row.rc_done = v.rd === undefined ? null : !!v.rd;
      }
      return row;
    });
    const flagAdds = [], flagDels = [];
    dirtyMarks.forEach((w) => (state.marks[w] ? flagAdds : flagDels).push(w));
    const posRows = [...dirtyPos].map((k) => ({ user_id: uid, key: k, idx: state.studyPos[k] || 0, updated_at: new Date().toISOString() }));
    const extraOk = !state.needsMigration;
    statKeys.forEach((k) => dirtyStats.delete(k)); dirtyDays.clear();
    if (extraOk) { dirtyMarks.clear(); dirtyPos.clear(); }
    setSync("saving");
    try {
      for (let i = 0; i < statRows.length; i += 500) {
        const { error } = await sb.from("word_stats").upsert(statRows.slice(i, i + 500), { onConflict: "user_id,mode,word" });
        if (error) throw error;
      }
      if (dayRows.length) {
        const { error } = await sb.from("daily_activity").upsert(dayRows, { onConflict: "user_id,day" });
        if (error) throw error;
      }
      if (extraOk && flagAdds.length) {
        const rows = flagAdds.filter((w) => state.marks[w]).map((w) => ({ user_id: uid, word: w, created_at: state.marks[w].at, status: state.marks[w].s }));
        if (rows.length) {
          const { error } = await sb.from("bookmarks").upsert(rows, { onConflict: "user_id,word" });
          if (error) throw error;
        }
      }
      if (extraOk && flagDels.length) {
        const { error } = await sb.from("bookmarks").delete().eq("user_id", uid).in("word", flagDels);
        if (error) throw error;
      }
      if (extraOk && posRows.length) {
        const { error } = await sb.from("study_progress").upsert(posRows, { onConflict: "user_id,key" });
        if (error) throw error;
      }
      setSync("idle");
    } catch (e) {
      console.error(e);
      // 실패한 건 다시 표시해 두고 나중에 재시도
      statRows.forEach((r) => dirtyStats.add(`${r.mode}:${r.word}`));
      dayRows.forEach((r) => dirtyDays.add(r.day));
      flagAdds.concat(flagDels).forEach((w) => dirtyMarks.add(w));
      posRows.forEach((r) => dirtyPos.add(r.key));
      setSync("error");
      clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, 15000);
    }
  }

  // Supabase는 한 번에 최대 1000행까지 주므로 나눠서 받음
  async function fetchAll(table, columns) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(table).select(columns).range(from, from + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  }

  async function loadCloud() {
    setSync("saving");
    const uid = state.user.id;
    // 이번 업데이트용 SQL(migration.sql)을 실행했는지 확인
    const probe = await sb.from("daily_activity").select("voca_done").limit(1);
    const hasV3 = !probe.error;
    const [{ data: prof }, statRows, dayRows, { data: sessRows }] = await Promise.all([
      sb.from("profiles").select("nickname").eq("id", uid).maybeSingle(),
      fetchAll("word_stats", "mode,word,correct,wrong,streak,last_seen,in_note"),
      fetchAll("daily_activity", hasV3 ? "day,answered,correct,seconds,viewed,voca_done,rc_done" : "day,answered,correct,seconds"),
      sb.from("sessions").select("played_at,mode,days,total,correct,wrong,hints,result,duration_sec").order("played_at", { ascending: false }).limit(60),
    ]);

    // 공부 모드용 테이블 (아직 SQL을 안 돌렸으면 없어도 나머지는 동작)
    let flagRows = [], posRows = [];
    try {
      flagRows = await fetchAll("bookmarks", "word,created_at,status");
      const { data, error } = await sb.from("study_progress").select("key,idx");
      if (error) throw error;
      posRows = data || [];
      state.needsMigration = !hasV3;
    } catch (e) {
      console.warn("새 테이블이 없어요. supabase/migration.sql 을 실행하세요.", e);
      state.needsMigration = true;
    }

    const cloudEmpty = statRows.length === 0 && dayRows.length === 0;
    const guest = loadLocal("gmat-voca-data:guest");

    state.profile = prof || null;
    state.stats = {};
    statRows.forEach((r) => {
      state.stats[`${r.mode}:${r.word}`] = { c: r.correct, w: r.wrong, s: r.streak, last: r.last_seen, note: r.in_note };
    });
    state.daily = {};
    const localDaily = (loadLocal() || {}).daily || {};
    dayRows.forEach((r) => {
      const x = { n: r.answered, c: r.correct, sec: r.seconds, v: r.viewed || 0 };
      if (r.voca_done !== undefined && r.voca_done !== null) x.vd = r.voca_done;
      if (r.rc_done !== undefined && r.rc_done !== null) x.rd = r.rc_done;
      // SQL 실행 전이라 클라우드에 완료 표시가 없으면 이 기기 기록을 사용
      const l = localDaily[r.day];
      if (l) { if (x.vd === undefined && l.vd !== undefined) x.vd = l.vd; if (x.rd === undefined && l.rd !== undefined) x.rd = l.rd; }
      state.daily[r.day] = x;
    });
    Object.keys(localDaily).forEach((k) => { if (!state.daily[k]) { state.daily[k] = localDaily[k]; dirtyDays.add(k); } });
    if (!state.needsMigration) {
      const cached = loadLocal();
      state.marks = {};
      flagRows.forEach((r) => { state.marks[r.word] = { s: r.status === "known" ? "known" : "vague", at: r.created_at }; });
      state.studyPos = {};
      posRows.forEach((r) => { state.studyPos[r.key] = r.idx; });
      // SQL을 실행하기 전에 이 기기에만 저장해 둔 단어장이 있으면 올림
      if (cached && cached.pendingStudySync) {
        Object.entries(normMarks(cached.marks || cached.flags)).forEach(([w, v]) => { if (!state.marks[w]) { state.marks[w] = v; dirtyMarks.add(w); } });
        Object.entries(cached.studyPos || {}).forEach(([k, i]) => { if (!(k in state.studyPos)) { state.studyPos[k] = i; dirtyPos.add(k); } });
      }
    } else {
      const cached = loadLocal();
      state.marks = normMarks(cached && (cached.marks || cached.flags));
      state.studyPos = (cached && cached.studyPos) || {};
    }
    state.sessions = (sessRows || []).map((r) => ({
      at: r.played_at, mode: r.mode, days: r.days, total: r.total, correct: r.correct,
      wrong: r.wrong, hints: r.hints, result: r.result, dur: r.duration_sec,
    }));

    // 처음 로그인했고 로그인 전에 공부한 기록이 있으면 계정으로 옮김
    // 로그인 전에 체크한 단어장도 계정에 합치기
    const guestMarks = guest ? normMarks(guest.marks || guest.flags) : {};
    if (Object.keys(guestMarks).length) {
      Object.entries(guestMarks).forEach(([w, v]) => { if (!state.marks[w]) { state.marks[w] = v; dirtyMarks.add(w); } });
      Object.entries(guest.studyPos || {}).forEach(([k, i]) => { if (!(k in state.studyPos)) { state.studyPos[k] = i; dirtyPos.add(k); } });
      guest.flags = {}; guest.marks = {}; guest.studyPos = {};
      try { localStorage.setItem("gmat-voca-data:guest", JSON.stringify(guest)); } catch (_) {}
    }
    if (cloudEmpty && guest && guest.stats && Object.keys(guest.stats).length) {
      state.stats = guest.stats;
      state.daily = guest.daily || {};
      state.sessions = (guest.sessions || []).concat(state.sessions).slice(0, 60);
      Object.keys(state.stats).forEach((k) => dirtyStats.add(k));
      Object.keys(state.daily).forEach((k) => dirtyDays.add(k));
      const uid2 = state.user.id;
      const rows = (guest.sessions || []).map((r) => ({
        user_id: uid2, played_at: r.at, mode: r.mode, days: r.days, total: r.total, correct: r.correct,
        wrong: r.wrong, hints: r.hints, result: r.result, duration_sec: r.dur,
      }));
      if (rows.length) {
        const { error } = await sb.from("sessions").insert(rows);
        if (error) console.error(error);
      }
      try { localStorage.removeItem("gmat-voca-data:guest"); } catch (_) {}
      await flush();
    }
    saveLocal();
    setSync("idle");
    if (dirtyMarks.size || dirtyPos.size) flush();
  }

  async function onUser(user) {
    const changed = (user && user.id) !== (state.user && state.user.id);
    state.user = user || null;
    if (!changed && state.ready) return;
    applyLocal(loadLocal());   // 화면을 먼저 캐시로 그리고
    state.ready = true;
    emit();
    if (state.user && sb) {
      try { await loadCloud(); } catch (e) { console.error(e); setSync("error"); }
    } else {
      setSync(hasCloud ? "idle" : "local");
    }
    emit();
  }

  /* ---------- 로그인 ---------- */
  const redirectTo = () => location.origin + location.pathname;

  async function signInGoogle() {
    if (!sb) return { error: new Error("no-config") };
    return sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
  }
  async function signInEmail(email) {
    if (!sb) return { error: new Error("no-config") };
    return sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
  }
  async function signOut() {
    await flush();
    if (sb) await sb.auth.signOut();
  }
  async function setNickname(nickname) {
    const name = String(nickname || "").trim().slice(0, 16);
    if (!name) return { error: new Error("empty") };
    state.profile = { ...(state.profile || {}), nickname: name };
    saveLocal();
    emit();
    if (state.user && sb) {
      const { error } = await sb.from("profiles").upsert({ id: state.user.id, nickname: name, updated_at: new Date().toISOString() });
      if (error) { console.error(error); return { error }; }
    }
    return {};
  }

  /* ---------- 계산된 값 ---------- */
  function wordStat(mode, word) { return state.stats[`${mode}:${word}`] || null; }

  // 먼저 출제할 단어일수록 큰 값: 헷갈리는 단어 > 자주 틀린 단어 > 나머지(무작위)
  function priority(mode, word, markKey) {
    const s = wordStat(mode, word);
    const m = getMark(markKey || word);
    return (m === "vague" ? 4 : m === "known" ? -2 : 0) + (s ? Math.min(s.w, 4) * 0.8 : 0);
  }

  function dayMet(x, key) {
    if (!x) return false;
    if (x.vd === undefined && x.rd === undefined) {
      if (key === dayKey()) return false;                 // 오늘은 새 규칙으로
      return x.n > 0 || (x.v || 0) > 0;                   // 규칙이 바뀌기 전 기록
    }
    return !!(x.vd && x.rd);
  }
  function streakDays() {
    let n = 0;
    const d = new Date();
    if (!dayMet(state.daily[dayKey(d)], dayKey(d))) d.setDate(d.getDate() - 1);   // 오늘 아직 조건을 못 채웠으면 어제부터 셈
    while (dayMet(state.daily[dayKey(d)], dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  function bestStreak() {
    const days = Object.keys(state.daily).filter((k) => dayMet(state.daily[k], k)).sort();
    let best = 0, cur = 0, prev = null;
    days.forEach((k) => {
      const d = new Date(k + "T00:00:00");
      if (prev) { const diff = Math.round((d - prev) / 86400000); cur = diff === 1 ? cur + 1 : 1; } else cur = 1;
      best = Math.max(best, cur); prev = d;
    });
    return Math.max(best, streakDays());
  }

  function lastDays(count) {
    const out = [];
    const d = new Date();
    d.setDate(d.getDate() - (count - 1));
    for (let i = 0; i < count; i++) {
      const k = dayKey(d);
      out.push({ key: k, date: new Date(d), ...{ n: 0, c: 0, sec: 0, v: 0 }, ...(state.daily[k] || {}) });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  /* ---------- 시작 ---------- */
  async function init() {
    if (sb) {
      // 콜백 안에서 바로 Supabase를 호출하면 멈출 수 있어 한 박자 늦게 처리
      sb.auth.onAuthStateChange((_evt, session) => { setTimeout(() => onUser(session ? session.user : null), 0); });
      const { data } = await sb.auth.getSession();
      await onUser(data.session ? data.session.user : null);
    } else {
      await onUser(null);
    }
  }

  window.addEventListener("pagehide", () => { flush(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });

  window.Store = {
    state, hasCloud,
    init, onChange: (fn) => listeners.add(fn),
    recordAnswer, recordSession, recordView, flush,
    todayViewCounts, todayDone,
    getMark, setMark, toggleMark, isFlagged, isKnown, toggleFlag, markedWords, countMarks, todayKnown, bestStreak,
    getStudyPos, setStudyPos,
    signInGoogle, signInEmail, signOut, setNickname,
    wordStat, priority, streakDays, lastDays, dayKey,
  };
})();
