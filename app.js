(() => {
  "use strict";

  /* =========================================================
     설정값
     ========================================================= */
  const TIME_LIMIT = 60;          // 단어당 제한 시간(초)
  const MAX_LIVES = 3;            // 목숨
  const CHOICE_COUNT = 4;         // 보기 개수
  const STORAGE_KEY = "gmat-voca-settings";
  const THEME_KEY = "gmat-voca-theme";

  const WORDS = Array.isArray(window.WORDS) ? window.WORDS : [];

  // DERIVATIVE 문자열을 단어 하나하나로 쪼갬
  // "(1) conjecture, guess (2) theorize" -> ["conjecture", "guess", "theorize"]
  function toTerms(v, headword) {
    if (!v) return [];
    const head = headword.toLowerCase();
    const seen = new Set();
    return v
      .replace(/\*?\([^)]*\)/g, ",")       // (1), (명사형) 등 괄호 제거
      .replace(/[*\[\]]/g, " ")
      .split(/[,;\/\n]/)
      .map((t) => t.replace(/\s+/g, " ").trim())
      .filter((t) => {
        const k = t.toLowerCase();
        if (!t || t.length > 28 || t.split(" ").length > 4) return false;
        if (!/^[a-z][a-z' \-.]*$/i.test(t)) return false;   // 영어 단어(구)만
        if (k === head || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  }
  WORDS.forEach((w) => { w.t = toTerms(w.v, w.w); });

  /* =========================================================
     DOM
     ========================================================= */
  const $ = (id) => document.getElementById(id);
  const screens = { setup: $("screen-setup"), game: $("screen-game"), result: $("screen-result") };
  const el = {
    dayGrid: $("day-grid"), summary: $("selection-summary"), start: $("btn-start"),
    lives: $("lives"), progress: $("hud-progress"),
    card: $("card"), cardDay: $("card-day"), cardSrc: $("card-src"),
    word: $("card-word"), pron: $("card-pron"), question: $("card-question"),
    hintBox: $("hint-box"), timerBar: $("timer-bar"), timerNum: $("timer-num"),
    backVerdict: $("back-verdict"), backQuestion: $("back-question"), backWord: $("back-word"), backPron: $("back-pron"),
    backMeaning: $("back-meaning"), backDeriv: $("back-deriv"), backDerivRow: $("back-deriv-row"),
    backEx: $("back-ex"), backExRow: $("back-ex-row"),
    choices: $("choices"), hint: $("btn-hint"), next: $("btn-next"),
    pause: $("btn-pause"), overlay: $("pause-overlay"), resume: $("btn-resume"), quit: $("btn-quit"),
    speak: $("btn-speak"),
  };

  /* =========================================================
     유틸
     ========================================================= */
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const norm = (s) => String(s).replace(/\s+/g, " ").trim().toLowerCase();

  function showScreen(name) {
    Object.entries(screens).forEach(([k, node]) => node.classList.toggle("active", k === name));
    window.scrollTo(0, 0);
  }

  // 예문: 줄 단위로 나누고 [RC] 같은 출처 표시를 꾸미고, 단어를 형광펜으로 강조
  function renderExample(text, word) {
    if (!text) return "";
    const stem = word.length > 4 ? word.slice(0, Math.max(4, word.length - 2)) : word;
    const re = /^[a-z][a-z\- ]*$/i.test(word) ? new RegExp(`\\b(${escRe(stem)}[a-z]*)`, "gi") : null;
    return text.split(/\n+/).filter(Boolean).map((line) => {
      let src = "";
      const m = line.match(/^\[([^\]]+)\]\s*/);
      if (m) { src = `<span class="src">${esc(m[1])}</span>`; line = line.slice(m[0].length); }
      let html = esc(line).replace(/\s*\/\/\s*/g, "<br>");
      if (re) html = html.replace(re, "<mark>$1</mark>");
      return `<p>${src}${html}</p>`;
    }).join("");
  }

  /* =========================================================
     설정 화면
     ========================================================= */
  const dayCounts = {};
  WORDS.forEach((w) => { dayCounts[w.d] = (dayCounts[w.d] || 0) + 1; });
  const allDays = Object.keys(dayCounts).map(Number).sort((a, b) => a - b);

  const settings = { days: new Set(), mode: "m", skip: false };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved) {
      (saved.days || []).forEach((d) => dayCounts[d] && settings.days.add(d));
      if (saved.mode === "m" || saved.mode === "v") settings.mode = saved.mode;
      settings.skip = !!saved.skip;
    }
  } catch (_) { /* 저장소 사용 불가 시 무시 */ }

  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ days: [...settings.days], mode: settings.mode, skip: settings.skip })); } catch (_) {}
  }

  function buildDayGrid() {
    el.dayGrid.innerHTML = allDays.map((d) =>
      `<button type="button" class="day-chip" data-day="${d}" aria-pressed="${settings.days.has(d)}">
         <span class="d">Day ${d}</span><span class="n">${dayCounts[d]}단어</span>
         <span class="prog" aria-hidden="true"><i></i></span>
       </button>`).join("");
  }

  // Day별 진도: 이 모드에서 익힌 단어 비율
  function renderDayProgress() {
    const mode = settings.mode;
    const by = {};
    WORDS.forEach((w) => {
      if (mode === "v" && !w.t.length) return;
      const o = by[w.d] || (by[w.d] = { t: 0, m: 0, seen: 0 });
      o.t++;
      if (Store.isMastered(mode, w.w)) o.m++;
      if (Store.wordStat(mode, w.w)) o.seen++;
    });
    document.querySelectorAll(".day-chip").forEach((b) => {
      const o = by[b.dataset.day] || { t: 0, m: 0, seen: 0 };
      const pct = o.t ? Math.round((o.m / o.t) * 100) : 0;
      b.querySelector(".prog i").style.width = pct + "%";
      b.classList.toggle("done", o.t > 0 && o.m === o.t);
      b.title = `익힌 단어 ${o.m}/${o.t}, 본 단어 ${o.seen}`;
    });
  }

  function playablePool(days = settings.days, mode = settings.mode, skipMastered = false) {
    return WORDS.filter((w) => days.has(w.d) && w.w && (mode === "v" ? w.t.length > 0 : w.m)
      && !(skipMastered && Store.isMastered(mode, w.w)));
  }
  const studyPool = () => playablePool(settings.days, settings.mode, settings.skip);

  function updateSummary() {
    document.querySelectorAll(".day-chip").forEach((b) =>
      b.setAttribute("aria-pressed", String(settings.days.has(Number(b.dataset.day)))));
    const n = studyPool().length;
    if (settings.days.size === 0) {
      el.summary.textContent = "Day를 하나 이상 선택하세요.";
    } else if (n === 0) {
      el.summary.textContent = settings.skip && playablePool().length
        ? "고른 Day의 단어를 전부 익혔어요. 다른 Day로 넘어가 볼까요?"
        : "이 방법으로 풀 수 있는 단어가 없어요. Day를 더 추가해 보세요.";
    } else {
      const sorted = [...settings.days].sort((a, b) => a - b);
      const label = sorted.length <= 4 ? sorted.map((d) => `Day ${d}`).join(", ") : `Day ${sorted.length}개`;
      el.summary.textContent = `${label} 선택, 오늘의 단어 ${n}개`;
    }
    el.start.disabled = n === 0;
    saveSettings();
  }

  el.dayGrid.addEventListener("click", (e) => {
    const chip = e.target.closest(".day-chip");
    if (!chip) return;
    const d = Number(chip.dataset.day);
    settings.days.has(d) ? settings.days.delete(d) : settings.days.add(d);
    updateSummary();
  });
  $("btn-all").addEventListener("click", () => { allDays.forEach((d) => settings.days.add(d)); updateSummary(); });
  $("btn-none").addEventListener("click", () => { settings.days.clear(); updateSummary(); });
  document.querySelectorAll('input[name="mode"]').forEach((r) => {
    r.checked = r.value === settings.mode;
    r.addEventListener("change", () => { settings.mode = r.value; updateSummary(); renderRecords(); renderDayProgress(); });
  });
  const optSkip = $("opt-skip");
  optSkip.checked = settings.skip;
  optSkip.addEventListener("change", () => { settings.skip = optSkip.checked; updateSummary(); });
  el.start.addEventListener("click", () => startGame(studyPool()));

  /* =========================================================
     게임 상태
     ========================================================= */
  let game = null;

  // pool: 출제할 단어 / choicePool: 오답 보기를 뽑을 단어 범위
  function startGame(pool, mode = settings.mode, choicePool = pool) {
    if (!pool.length) return;
    game = {
      mode,
      source: pool,               // 다시 하기용 원본
      pool: choicePool,           // 보기 생성용
      // 앞으로 나올 단어 (중복 없음, 틀린 단어만 다시 끼워 넣음)
      // 자주 틀린 단어, 처음 보는 단어가 먼저 나오도록 약한 순서로 정렬 (약간의 무작위 포함)
      queue: pool.map((w) => ({ w, k: Store.weakness(mode, w.w) + Math.random() * 2 }))
                 .sort((a, b) => b.k - a.k).map((o) => o.w),
      startedAt: Date.now(),
      isNote: false,
      current: null,
      lives: MAX_LIVES,
      correct: 0,
      wrong: 0,
      hints: 0,
      wrongWords: new Map(),      // word -> item
      answered: false,
      paused: false,
      remaining: TIME_LIMIT * 1000,
      deadline: 0,
      tick: null,
      ended: false,
    };
    renderLives();
    showScreen("game");
    nextWord();
  }

  function renderLives(popIndex = -1) {
    const heart = '<svg class="life{c}" aria-hidden="true"><use href="#i-heart"/></svg>';
    el.lives.innerHTML = Array.from({ length: MAX_LIVES }, (_, i) => heart.replace("{c}", (i < game.lives ? "" : " lost") + (i === popIndex ? " pop" : ""))).join("");
    el.lives.setAttribute("aria-label", `남은 목숨 ${game.lives}개`);
  }

  // 뜻 모드: 보기 = 뜻 4개 중 정답 1개
  function buildMeaningChoices(item) {
    const answer = item.m;
    const seen = new Set([norm(answer)]);
    const picks = [];
    const tryFrom = (list) => {
      for (const w of shuffle(list)) {
        if (picks.length >= CHOICE_COUNT - 1) break;
        if (w === item || !w.m) continue;
        const k = norm(w.m);
        if (seen.has(k)) continue;
        seen.add(k);
        picks.push(w.m);
      }
    };
    tryFrom(game.pool);                                   // 선택한 Day에서 먼저
    if (picks.length < CHOICE_COUNT - 1) tryFrom(WORDS);  // 부족하면 전체에서
    return shuffle([{ text: answer, ok: true }, ...picks.map((t) => ({ text: t, ok: false }))]);
  }

  // 다른 단어의 유의어·파생어에서 '이 단어와 관계없는' 단어를 n개 뽑음
  function outsiderTerms(item, n) {
    const own = new Set(item.t.map((t) => t.toLowerCase()));
    const stem = item.w.toLowerCase().slice(0, 5);
    const picked = new Set();
    const out = [];
    const tryFrom = (list) => {
      for (const w of shuffle(list)) {
        if (out.length >= n) break;
        if (w === item || !w.t.length) continue;
        const t = w.t[Math.floor(Math.random() * w.t.length)];
        const k = t.toLowerCase();
        if (own.has(k) || picked.has(k) || k === item.w.toLowerCase() || k.startsWith(stem)) continue;
        picked.add(k);
        out.push(t);
      }
    };
    tryFrom(game.pool);
    if (out.length < n) tryFrom(WORDS);
    return out;
  }

  // 유의어·파생어 모드: 보기마다 단어 하나
  //  yes = "유의어·파생어인 것은?"  -> 이 단어의 것 1개 + 관계없는 것 3개
  //  no  = "유의어·파생어가 아닌 것은?" -> 이 단어의 것 3개 + 관계없는 것 1개
  function buildTermChoices(item) {
    const canAskNo = item.t.length >= CHOICE_COUNT - 1;
    const type = canAskNo && Math.random() < 0.5 ? "no" : "yes";
    const own = shuffle(item.t);
    let choices;
    if (type === "yes") {
      choices = [{ text: own[0], ok: true }, ...outsiderTerms(item, CHOICE_COUNT - 1).map((t) => ({ text: t, ok: false }))];
    } else {
      choices = [...own.slice(0, CHOICE_COUNT - 1).map((t) => ({ text: t, ok: false })), ...outsiderTerms(item, 1).map((t) => ({ text: t, ok: true }))];
    }
    return { type, choices: shuffle(choices) };
  }

  function nextWord() {
    if (game.queue.length === 0) return endGame("clear");

    const item = game.queue.shift();
    game.current = item;
    game.answered = false;

    // 카드 앞면
    const wasFlipped = el.card.classList.contains("flipped");
    el.card.classList.remove("flipped");
    el.cardDay.textContent = `Day ${item.d}`;
    el.cardSrc.textContent = item.s || "";
    el.cardSrc.hidden = !item.s;
    el.word.textContent = item.w;
    el.pron.textContent = item.p || "발음 정보 없음";
    el.hintBox.hidden = true;
    el.hintBox.innerHTML = "";
    el.hint.disabled = !item.e;
    el.hint.hidden = false;
    el.next.hidden = true;
    el.progress.textContent = game.queue.length + 1;

    // 이전 단어의 뒷면 내용 비우기 (카드 높이가 이전 단어 기준으로 남지 않도록)
    const clearBack = () => {
      if (game && !game.answered) [el.backVerdict, el.backQuestion, el.backWord, el.backPron, el.backMeaning, el.backDeriv, el.backEx].forEach((n) => { n.textContent = ""; });
    };
    wasFlipped ? setTimeout(clearBack, 600) : clearBack();

    // 보기 + 질문
    let choices;
    if (game.mode === "m") {
      choices = buildMeaningChoices(item);
      el.question.innerHTML = '<span class="q-pill">이 단어의 뜻은?</span>';
    } else {
      const r = buildTermChoices(item);
      choices = r.choices;
      el.question.innerHTML = r.type === "yes"
        ? '<span class="q-pill yes">유의어·파생어<u>인</u> 것은?</span>'
        : '<span class="q-pill no">유의어·파생어가 <u>아닌</u> 것은?</span>';
    }
    el.choices.classList.toggle("terms", game.mode === "v");
    el.choices.innerHTML = choices.map((c, i) =>
      `<button type="button" class="choice" data-ok="${c.ok}"><span class="key">${i + 1}</span><span>${esc(c.text)}</span></button>`).join("");

    startTimer();
  }

  /* ---------- 타이머 ---------- */
  function startTimer() {
    game.remaining = TIME_LIMIT * 1000;
    resumeTimer();
  }
  function resumeTimer() {
    clearInterval(game.tick);
    game.deadline = performance.now() + game.remaining;
    drawTimer();
    game.tick = setInterval(() => {
      game.remaining = Math.max(0, game.deadline - performance.now());
      drawTimer();
      if (game.remaining <= 0) { stopTimer(); answer(null); }
    }, 100);
  }
  function stopTimer() {
    clearInterval(game.tick);
    game.tick = null;
    if (game && game.deadline) game.remaining = Math.max(0, game.deadline - performance.now());
  }
  function drawTimer() {
    const ratio = game.remaining / (TIME_LIMIT * 1000);
    const secs = Math.ceil(game.remaining / 1000);
    el.timerBar.style.transform = `scaleX(${ratio})`;
    el.timerNum.textContent = secs;
    const warn = secs <= 10;
    el.timerBar.classList.toggle("warn", warn);
    el.timerNum.parentElement.classList.toggle("warn", warn);
  }

  /* ---------- 정답 처리 ---------- */
  // btn === null 이면 시간 초과
  function answer(btn) {
    if (!game || game.answered || game.paused) return;
    game.answered = true;
    stopTimer();
    const spent = TIME_LIMIT - game.remaining / 1000;

    const item = game.current;
    const isOk = !!btn && btn.dataset.ok === "true";
    const buttons = [...el.choices.querySelectorAll(".choice")];
    buttons.forEach((b) => {
      b.disabled = true;
      if (b.dataset.ok === "true") b.classList.add("correct");
      else if (b === btn) b.classList.add("wrong");
      else b.classList.add("dim");
    });

    Store.recordAnswer(item.w, game.mode, isOk, spent);
    if (isOk) {
      game.correct++;
    } else {
      game.wrong++;
      game.lives--;
      game.wrongWords.set(item.w, item);
      renderLives(game.lives);
      // 틀린 단어는 같은 라운드에서 다시 나오도록 뒤쪽 임의 위치에 다시 넣음
      const minGap = Math.min(3, game.queue.length);
      const pos = minGap + Math.floor(Math.random() * (game.queue.length - minGap + 1));
      game.queue.splice(pos, 0, item);
      el.card.classList.remove("shake");
      void el.card.offsetWidth;
      el.card.classList.add("shake");
    }

    // 카드 뒷면: 정답 바로 보여주기
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const verdictText = isOk
      ? pick(["정답", "정확해요", "좋아요, 이 감각 그대로", "확실히 알고 있네요"])
      : btn ? pick(["괜찮아요, 지금 익히면 됩니다", "여기서 한 번 더 새겨두세요", "틀린 만큼 기억에 남아요"])
            : "시간 초과, 천천히 한 번 더 보세요";
    el.backVerdict.innerHTML = `<svg class="ic" aria-hidden="true"><use href="#i-${isOk ? "check" : "x"}"/></svg>${esc(verdictText)}`;
    el.backVerdict.className = "verdict " + (isOk ? "ok" : "bad");
    el.backQuestion.innerHTML = el.question.innerHTML;
    el.backWord.textContent = item.w;
    el.backPron.textContent = item.p || "";
    el.backMeaning.textContent = item.m || "정보 없음";
    el.backDeriv.textContent = item.v;
    el.backDerivRow.hidden = !item.v;
    el.backEx.innerHTML = renderExample(item.e, item.w);
    el.backExRow.hidden = !item.e;
    setTimeout(() => el.card.classList.add("flipped"), isOk ? 150 : 420);

    el.hint.hidden = true;

    // 정답이든 오답이든 '다음' 버튼을 눌러야 넘어감
    el.next.querySelector(".label").textContent = game.lives <= 0 ? "결과 보기" : "다음 단어";
    el.next.hidden = false;
    el.next.focus({ preventScroll: true });
  }

  function goNext() {
    if (!game || !game.answered || game.paused) return;
    if (game.lives <= 0) return endGame("over");
    nextWord();
  }

  el.choices.addEventListener("click", (e) => {
    const b = e.target.closest(".choice");
    if (b) answer(b);
  });
  el.next.addEventListener("click", goNext);

  /* ---------- 힌트 ---------- */
  function showHint() {
    if (!game || game.answered || game.paused || !game.current.e || !el.hintBox.hidden) return;
    el.hintBox.innerHTML = `<div class="example">${renderExample(game.current.e, game.current.w)}</div>`;
    el.hintBox.hidden = false;
    el.hint.disabled = true;
    game.hints++;
  }
  el.hint.addEventListener("click", showHint);

  /* ---------- 발음 듣기 ---------- */
  function speak() {
    if (!game || !game.current || !("speechSynthesis" in window)) return;
    const word = game.current.w.replace(/\(.*?\)|\*.*$/g, "").trim();
    const u = new SpeechSynthesisUtterance(word);
    u.lang = "en-US";
    u.rate = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }
  if (!("speechSynthesis" in window)) el.speak.hidden = true;
  el.speak.addEventListener("click", speak);

  /* ---------- 일시정지 ---------- */
  function pauseGame() {
    if (!game || game.paused || game.ended) return;
    game.paused = true;
    stopTimer();
    el.overlay.hidden = false;
    el.resume.focus();
  }
  function resumeGame() {
    if (!game || !game.paused) return;
    game.paused = false;
    el.overlay.hidden = true;
    if (!game.answered) resumeTimer();
  }
  el.pause.addEventListener("click", pauseGame);
  el.resume.addEventListener("click", resumeGame);
  el.quit.addEventListener("click", () => { el.overlay.hidden = true; endGame("quit"); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && screens.game.classList.contains("active")) pauseGame();
  });

  /* =========================================================
     결과
     ========================================================= */
  function endGame(reason) {
    if (!game) return;
    stopTimer();
    game.ended = true;
    game.paused = false;

    const left = game.queue.length + (game.answered ? 0 : 1);
    const titles = {
      clear: ["라운드 완료", "고른 단어를 전부 맞혔어요. 오늘 몫은 충분히 해냈습니다.", "trophy"],
      over: ["Game over", "여기서 틀린 단어가 오늘 가장 값진 단어예요. 그것만 다시 보고 가요.", "target"],
      quit: ["오늘은 여기까지", "멈춘 곳까지 기록했어요. 다음에 이어서 하면 됩니다.", "flag"],
    };
    $("result-icon").innerHTML = `<use href="#i-${titles[reason][2]}"/>`;
    $("result-title").textContent = titles[reason][0];
    $("result-sub").textContent = titles[reason][1];
    $("st-correct").textContent = game.correct;
    $("st-wrong").textContent = game.wrong;
    $("st-hint").textContent = game.hints;
    $("st-left").textContent = reason === "clear" ? 0 : left;

    const wrongs = [...game.wrongWords.values()];
    $("wrong-wrap").hidden = wrongs.length === 0;
    $("wrong-list").innerHTML = wrongs.map((w) =>
      `<li><span class="w">${esc(w.w)}</span><span class="m">${esc(w.m)}</span>${game.mode === "v" ? `<span class="m">${esc(w.t.join(", "))}</span>` : ""}</li>`).join("");
    $("btn-retry-wrong").hidden = wrongs.length === 0;

    const answeredCount = game.correct + game.wrong;
    if (answeredCount > 0) {
      Store.recordSession({
        mode: game.mode,
        days: [...new Set(game.source.map((w) => w.d))].sort((a, b) => a - b),
        total: game.source.length, correct: game.correct, wrong: game.wrong, hints: game.hints,
        result: game.isNote ? `note-${reason}` : reason,
        dur: Math.round((Date.now() - game.startedAt) / 1000),
      });
    }
    const streak = Store.streakDays();
    const nick = Store.state.profile && Store.state.profile.nickname;
    $("result-streak").textContent = answeredCount === 0 ? "" :
      streak >= 2 ? `${nick ? nick + "님, " : ""}${streak}일째 이어가는 중이에요. 내일도 이 자리에서 만나요.`
                  : `${nick ? nick + "님, " : ""}오늘 기록이 저장됐어요. 내일 한 번 더 오면 연속 학습이 시작돼요.`;

    showScreen("result");
  }

  $("btn-retry-wrong").addEventListener("click", () => {
    const wrongs = [...game.wrongWords.values()];
    if (!wrongs.length) return;
    startGame(wrongs, game.mode, game.pool); // 보기는 원래 Day 범위에서
  });
  $("btn-retry").addEventListener("click", () => startGame(game.source, game.mode, game.pool));
  $("btn-home").addEventListener("click", () => { game = null; showScreen("setup"); refreshSetup(); });

  /* =========================================================
     키보드 단축키
     1~4: 보기 선택 / H: 힌트 / Enter: 다음 / Esc, P: 멈춤
     ========================================================= */
  document.addEventListener("keydown", (e) => {
    if (!screens.game.classList.contains("active") || !game) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (game.paused) {
      if (k === "Escape" || k === "p" || k === "P") { e.preventDefault(); resumeGame(); }
      return;
    }
    if (k === "Escape" || k === "p" || k === "P") { e.preventDefault(); pauseGame(); return; }
    if (!game.answered && /^[1-9]$/.test(k)) {
      const b = el.choices.querySelectorAll(".choice")[Number(k) - 1];
      if (b) { e.preventDefault(); answer(b); }
      return;
    }
    if (k === "h" || k === "H") { e.preventDefault(); showHint(); return; }
    if (k === "Enter" && game.answered) { e.preventDefault(); goNext(); }
  });

  /* =========================================================
     계정 · 기록
     ========================================================= */
  const MODE_LABEL = { m: "뜻", v: "유의어·파생어" };
  const RESULT_LABEL = { clear: "완료", over: "Game over", quit: "중단" };

  function openModal(node) { node.hidden = false; const f = node.querySelector("input, button:not([data-close])"); if (f) f.focus(); }
  function closeModal(node) { node.hidden = true; }
  document.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", () => closeModal(b.closest(".overlay"))));

  function renderUser() {
    const st = Store.state;
    const box = $("user-box");
    const nudge = $("login-nudge");
    if (!Store.hasCloud) {
      box.innerHTML = "";
      nudge.hidden = false;
      nudge.textContent = "지금은 이 기기에만 기록이 저장돼요. config.js에 Supabase 정보를 넣으면 로그인이 켜집니다.";
      return;
    }
    if (st.user) {
      const name = (st.profile && st.profile.nickname) || "닉네임 설정";
      box.innerHTML = `<button type="button" class="user-chip" id="btn-account"><svg class="ic" aria-hidden="true"><use href="#i-user"/></svg><span>${esc(name)}</span></button>`;
      $("btn-account").addEventListener("click", () => openAccount(false));
      nudge.hidden = true;
    } else {
      box.innerHTML = `<button type="button" class="btn ghost small" id="btn-login"><svg class="ic" aria-hidden="true"><use href="#i-login"/></svg>로그인</button>`;
      $("btn-login").addEventListener("click", () => { $("login-msg").textContent = ""; openModal($("login-modal")); });
      nudge.hidden = false;
      nudge.textContent = "로그인하면 폰과 PC 어디서든 기록이 이어져요. 지금까지의 기록도 계정으로 옮겨집니다.";
    }
  }

  function renderSync() {
    const map = { local: "이 기기에 저장", idle: Store.state.user ? "동기화됨" : "", saving: "저장 중…", error: "동기화 실패, 다시 시도하는 중" };
    const node = $("sync-status");
    node.textContent = map[Store.state.sync] || "";
    node.dataset.state = Store.state.sync;
  }

  function renderRecords() {
    const st = Store.state;
    const mode = settings.mode;
    const nick = st.profile && st.profile.nickname;
    $("records-title").textContent = nick ? `${nick}님의 기록` : "내 기록";

    $("k-streak").textContent = Store.streakDays();
    const today = st.daily[Store.dayKey()];
    $("k-today").textContent = today ? today.n : 0;

    const pool = WORDS.filter((w) => mode === "m" ? w.m : w.t.length);
    const mastered = pool.filter((w) => Store.isMastered(mode, w.w)).length;
    $("k-master").textContent = mastered;
    $("k-master-total").textContent = ` / ${pool.length}`;
    $("k-master-label").textContent = `익힌 단어 (${MODE_LABEL[mode]})`;
    const noteCount = pool.filter((w) => Store.inNote(mode, w.w)).length;
    $("k-note").textContent = noteCount;
    const noteBtn = $("btn-note");
    noteBtn.disabled = noteCount === 0;
    noteBtn.title = noteCount ? `${MODE_LABEL[mode]} 모드 오답 노트 ${noteCount}개` : "아직 오답 노트가 비어 있어요";

    // 최근 14일 학습량
    const days = Store.lastDays(14);
    const max = Math.max(10, ...days.map((d) => d.n));
    $("activity").innerHTML = days.map((d, i) => {
      const h = d.n ? Math.max(8, Math.round((d.n / max) * 100)) : 0;
      const label = `${d.date.getMonth() + 1}/${d.date.getDate()}`;
      return `<div class="bar-col${i === days.length - 1 ? " today" : ""}" title="${label}: ${d.n}개 (정답 ${d.c})">
        <div class="bar"><i style="height:${h}%"></i></div><span>${i === days.length - 1 ? "오늘" : d.date.getDate()}</span></div>`;
    }).join("");

    // 최근 학습 목록
    const list = st.sessions.slice(0, 8);
    $("recent-count").textContent = st.sessions.length ? `${st.sessions.length}회` : "";
    $("recent-list").innerHTML = list.length ? list.map((x) => {
      const d = new Date(x.at);
      const when = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      const isNote = String(x.result).startsWith("note-");
      const res = String(x.result).replace("note-", "");
      const dayLabel = isNote ? "오답 노트" : x.days.length > 3 ? `Day ${x.days.length}개` : x.days.map((n) => `Day ${n}`).join(", ");
      return `<li><span class="num muted">${when}</span><span>${esc(dayLabel)} <small class="muted">${MODE_LABEL[x.mode] || ""}</small></span>
        <span class="num">${x.correct}/${x.correct + x.wrong}</span><span class="tag ${res}">${RESULT_LABEL[res] || res}</span></li>`;
    }).join("") : `<li class="empty">첫 학습을 시작하면 여기에 쌓여요.</li>`;
  }

  function refreshSetup() {
    renderUser(); renderSync(); renderRecords(); renderDayProgress(); updateSummary();
  }

  // 오답 노트 학습
  $("btn-note").addEventListener("click", () => {
    const mode = settings.mode;
    const words = WORDS.filter((w) => (mode === "m" ? w.m : w.t.length) && Store.inNote(mode, w.w));
    if (!words.length) return;
    const choicePool = playablePool(new Set(words.map((w) => w.d)), mode);
    startGame(words, mode, choicePool);
    game.isNote = true;
  });

  // 로그인
  $("btn-google").addEventListener("click", async () => {
    $("login-msg").textContent = "Google로 이동하는 중…";
    const { error } = await Store.signInGoogle();
    if (error) $("login-msg").textContent = "Google 로그인을 시작하지 못했어요. Supabase에서 Google 로그인이 켜져 있는지 확인하세요.";
  });
  async function sendEmailLink() {
    const email = $("login-email").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $("login-msg").textContent = "이메일 주소를 확인해 주세요."; return; }
    $("btn-email").disabled = true;
    $("login-msg").textContent = "보내는 중…";
    const { error } = await Store.signInEmail(email);
    $("btn-email").disabled = false;
    $("login-msg").textContent = error
      ? "메일을 보내지 못했어요. 잠시 후 다시 시도하세요."
      : `${email}로 로그인 링크를 보냈어요. 메일의 링크를 누르면 바로 들어와집니다.`;
  }
  $("btn-email").addEventListener("click", sendEmailLink);
  $("login-email").addEventListener("keydown", (e) => { if (e.key === "Enter") sendEmailLink(); });

  // 닉네임 / 계정
  function openAccount(required) {
    const st = Store.state;
    $("nick-input").value = (st.profile && st.profile.nickname) || "";
    $("nick-msg").textContent = "";
    $("account-title").textContent = required ? "반가워요" : "계정";
    $("account-desc").textContent = required
      ? "뭐라고 불러드릴까요? 닉네임은 나중에 바꿀 수 있어요."
      : "닉네임은 언제든 바꿀 수 있어요.";
    $("account-close").hidden = required;
    $("account-extra").hidden = required;
    $("account-email").textContent = st.user ? st.user.email || "" : "";
    openModal($("account-modal"));
  }
  async function saveNick() {
    const v = $("nick-input").value.trim();
    if (!v) { $("nick-msg").textContent = "닉네임을 입력해 주세요."; return; }
    $("btn-nick-save").disabled = true;
    const { error } = await Store.setNickname(v);
    $("btn-nick-save").disabled = false;
    if (error) { $("nick-msg").textContent = "저장하지 못했어요. 잠시 후 다시 시도하세요."; return; }
    closeModal($("account-modal"));
  }
  $("btn-nick-save").addEventListener("click", saveNick);
  $("nick-input").addEventListener("keydown", (e) => { if (e.key === "Enter") saveNick(); });
  $("btn-logout").addEventListener("click", async () => { closeModal($("account-modal")); await Store.signOut(); });

  let lastUserId = null;
  Store.onChange(() => {
    const st = Store.state;
    if (screens.setup.classList.contains("active")) refreshSetup();
    else renderSync();
    // 로그인 직후: 로그인 창 닫고, 닉네임이 없으면 설정 창 띄우기
    const uid = st.user ? st.user.id : null;
    if (uid && uid !== lastUserId) closeModal($("login-modal"));
    lastUserId = uid;
    if (uid && st.sync === "idle" && !(st.profile && st.profile.nickname) && $("account-modal").hidden) openAccount(true);
  });

  /* =========================================================
     테마 (낮 / 밤)
     ========================================================= */
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    document.querySelectorAll("[data-theme-toggle]").forEach((b) => {
      b.setAttribute("aria-label", t === "dark" ? "낮 모드로 바꾸기" : "밤 모드로 바꾸기");
    });
  }
  document.querySelectorAll("[data-theme-toggle]").forEach((b) =>
    b.addEventListener("click", () => {
      const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
    }));
  applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

  /* =========================================================
     시작
     ========================================================= */
  if (!WORDS.length) {
    el.summary.textContent = "단어 데이터를 불러오지 못했습니다. data/words.js 파일이 있는지 확인하세요.";
  }
  buildDayGrid();
  updateSummary();
  Store.init();
})();
