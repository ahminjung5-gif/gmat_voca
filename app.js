(() => {
  "use strict";

  /* =========================================================
     설정값
     ========================================================= */
  const TIME_LIMIT = 60;          // 단어당 제한 시간(초)
  const MAX_LIVES = 3;            // 목숨
  const CHOICE_COUNT = 4;         // 보기 개수
  const AUTO_NEXT_MS = 1400;      // 정답일 때 자동으로 넘어가는 시간
  const STORAGE_KEY = "gmat-voca-settings";

  const WORDS = Array.isArray(window.WORDS) ? window.WORDS : [];
  const FIELD_LABEL = { m: "meaning", v: "derivative" };

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
    backVerdict: $("back-verdict"), backWord: $("back-word"), backPron: $("back-pron"),
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

  const settings = { days: new Set(), mode: "m" };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved) {
      (saved.days || []).forEach((d) => dayCounts[d] && settings.days.add(d));
      if (saved.mode === "m" || saved.mode === "v") settings.mode = saved.mode;
    }
  } catch (_) { /* 저장소 사용 불가 시 무시 */ }

  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ days: [...settings.days], mode: settings.mode })); } catch (_) {}
  }

  function buildDayGrid() {
    el.dayGrid.innerHTML = allDays.map((d) =>
      `<button type="button" class="day-chip" data-day="${d}" aria-pressed="${settings.days.has(d)}">
         <span class="d">Day ${d}</span><span class="n">${dayCounts[d]}단어</span>
       </button>`).join("");
  }

  function playablePool(days = settings.days, mode = settings.mode) {
    return WORDS.filter((w) => days.has(w.d) && w.w && w[mode]);
  }

  function updateSummary() {
    document.querySelectorAll(".day-chip").forEach((b) =>
      b.setAttribute("aria-pressed", String(settings.days.has(Number(b.dataset.day)))));
    const n = playablePool().length;
    if (settings.days.size === 0) {
      el.summary.textContent = "Day를 하나 이상 선택하세요.";
    } else if (n === 0) {
      el.summary.textContent = "선택한 Day에 이 방법으로 풀 수 있는 단어가 없습니다. 다른 Day를 추가해 보세요.";
    } else {
      const sorted = [...settings.days].sort((a, b) => a - b);
      const label = sorted.length <= 4 ? sorted.map((d) => `Day ${d}`).join(", ") : `Day ${sorted.length}개`;
      el.summary.textContent = `${label}, ${n}단어 출제`;
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
    r.addEventListener("change", () => { settings.mode = r.value; updateSummary(); });
  });
  el.start.addEventListener("click", () => startGame(playablePool()));

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
      queue: shuffle(pool),       // 앞으로 나올 단어 (중복 없음, 틀린 단어만 다시 끼워 넣음)
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
      autoNext: null,
      ended: false,
      lastOk: false,
    };
    renderLives();
    showScreen("game");
    nextWord();
  }

  function renderLives() {
    const heart = '<svg viewBox="0 0 24 24" class="life{c}" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.5-9.3C1.1 8.3 3.3 4.5 7 4.5c2.1 0 3.6 1.1 5 2.9 1.4-1.8 2.9-2.9 5-2.9 3.7 0 5.9 3.8 4.5 7.2C19.5 16.4 12 21 12 21z"/></svg>';
    el.lives.innerHTML = Array.from({ length: MAX_LIVES }, (_, i) => heart.replace("{c}", i < game.lives ? "" : " lost")).join("");
    el.lives.setAttribute("aria-label", `남은 목숨 ${game.lives}개`);
  }

  function buildChoices(item) {
    const f = game.mode;
    const answer = item[f];
    const seen = new Set([norm(answer)]);
    const picks = [];
    const tryFrom = (list) => {
      for (const w of shuffle(list)) {
        if (picks.length >= CHOICE_COUNT - 1) break;
        if (w === item || !w[f]) continue;
        const k = norm(w[f]);
        if (seen.has(k)) continue;
        seen.add(k);
        picks.push(w[f]);
      }
    };
    tryFrom(game.pool);                                   // 선택한 Day에서 먼저
    if (picks.length < CHOICE_COUNT - 1) tryFrom(WORDS);  // 부족하면 전체에서
    return shuffle([{ text: answer, ok: true }, ...picks.map((t) => ({ text: t, ok: false }))]);
  }

  function nextWord() {
    clearTimeout(game.autoNext);
    if (game.queue.length === 0) return endGame("clear");

    const item = game.queue.shift();
    game.current = item;
    game.answered = false;

    // 카드 앞면
    el.card.classList.remove("flipped");
    el.cardDay.textContent = `Day ${item.d}`;
    el.cardSrc.textContent = item.s || "";
    el.cardSrc.hidden = !item.s;
    el.word.textContent = item.w;
    el.pron.textContent = item.p || "발음 정보 없음";
    el.question.textContent = game.mode === "m" ? "이 단어의 뜻은?" : "이 단어의 파생어·유의어는?";
    el.hintBox.hidden = true;
    el.hintBox.innerHTML = "";
    el.hint.disabled = !item.e;
    el.hint.hidden = false;
    el.next.hidden = true;
    el.progress.textContent = game.queue.length + 1;

    // 이전 단어의 뒷면 내용 비우기 (카드 높이가 이전 단어 기준으로 남지 않도록)
    setTimeout(() => {
      if (game && !game.answered) [el.backVerdict, el.backWord, el.backPron, el.backMeaning, el.backDeriv, el.backEx].forEach((n) => { n.textContent = ""; });
    }, 600);

    // 보기
    const choices = buildChoices(item);
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
    el.timerNum.classList.toggle("warn", warn);
  }

  /* ---------- 정답 처리 ---------- */
  // btn === null 이면 시간 초과
  function answer(btn) {
    if (!game || game.answered || game.paused) return;
    game.answered = true;
    stopTimer();

    const item = game.current;
    const isOk = !!btn && btn.dataset.ok === "true";
    const buttons = [...el.choices.querySelectorAll(".choice")];
    buttons.forEach((b) => {
      b.disabled = true;
      if (b.dataset.ok === "true") b.classList.add("correct");
      else if (b === btn) b.classList.add("wrong");
      else b.classList.add("dim");
    });

    game.lastOk = isOk;
    if (isOk) {
      game.correct++;
    } else {
      game.wrong++;
      game.lives--;
      game.wrongWords.set(item.w, item);
      renderLives();
      // 틀린 단어는 같은 라운드에서 다시 나오도록 뒤쪽 임의 위치에 다시 넣음
      const minGap = Math.min(3, game.queue.length);
      const pos = minGap + Math.floor(Math.random() * (game.queue.length - minGap + 1));
      game.queue.splice(pos, 0, item);
      el.card.classList.remove("shake");
      void el.card.offsetWidth;
      el.card.classList.add("shake");
    }

    // 카드 뒷면: 정답 바로 보여주기
    el.backVerdict.textContent = isOk ? "정답입니다" : btn ? "오답입니다. 정답을 확인하세요" : "시간 초과. 정답을 확인하세요";
    el.backVerdict.className = "verdict " + (isOk ? "ok" : "bad");
    el.backWord.textContent = item.w;
    el.backPron.textContent = item.p || "";
    el.backMeaning.textContent = item.m || "정보 없음";
    el.backDeriv.textContent = item.v;
    el.backDerivRow.hidden = !item.v;
    el.backEx.innerHTML = renderExample(item.e, item.w);
    el.backExRow.hidden = !item.e;
    setTimeout(() => el.card.classList.add("flipped"), isOk ? 150 : 420);

    el.hint.hidden = true;

    if (game.lives <= 0) {
      el.next.hidden = false;
      el.next.firstChild.textContent = "결과 보기 ";
      el.next.focus({ preventScroll: true });
      return;
    }
    el.next.firstChild.textContent = "다음 단어 ";
    el.next.hidden = false;
    el.next.focus({ preventScroll: true });
    if (isOk) game.autoNext = setTimeout(goNext, AUTO_NEXT_MS);
  }

  function goNext() {
    if (!game || !game.answered || game.paused) return;
    clearTimeout(game.autoNext);
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
    clearTimeout(game.autoNext);
    el.overlay.hidden = false;
    el.resume.focus();
  }
  function resumeGame() {
    if (!game || !game.paused) return;
    game.paused = false;
    el.overlay.hidden = true;
    if (!game.answered) resumeTimer();
    else if (game.lastOk) game.autoNext = setTimeout(goNext, 600); // 정답 직후 멈췄다면 자동 진행을 이어감
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
    clearTimeout(game.autoNext);
    game.ended = true;
    game.paused = false;

    const left = game.queue.length + (game.answered ? 0 : 1);
    const titles = {
      clear: ["라운드 완료", "선택한 단어를 모두 맞혔습니다."],
      over: ["Game over", "목숨 3개를 모두 잃었습니다. 틀린 단어부터 다시 보세요."],
      quit: ["학습 종료", "중간에 멈춘 지점까지의 결과입니다."],
    };
    $("result-title").textContent = titles[reason][0];
    $("result-sub").textContent = titles[reason][1];
    $("st-correct").textContent = game.correct;
    $("st-wrong").textContent = game.wrong;
    $("st-hint").textContent = game.hints;
    $("st-left").textContent = reason === "clear" ? 0 : left;

    const wrongs = [...game.wrongWords.values()];
    $("wrong-wrap").hidden = wrongs.length === 0;
    $("wrong-list").innerHTML = wrongs.map((w) =>
      `<li><span class="w">${esc(w.w)}</span><span class="m">${esc(w[game.mode] || w.m)}</span></li>`).join("");
    $("btn-retry-wrong").hidden = wrongs.length === 0;

    showScreen("result");
  }

  $("btn-retry-wrong").addEventListener("click", () => {
    const wrongs = [...game.wrongWords.values()];
    if (!wrongs.length) return;
    startGame(wrongs, game.mode, game.pool); // 보기는 원래 Day 범위에서
  });
  $("btn-retry").addEventListener("click", () => startGame(game.source, game.mode, game.pool));
  $("btn-home").addEventListener("click", () => { game = null; showScreen("setup"); });

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
     시작
     ========================================================= */
  if (!WORDS.length) {
    el.summary.textContent = "단어 데이터를 불러오지 못했습니다. data/words.js 파일이 있는지 확인하세요.";
  }
  buildDayGrid();
  updateSummary();
})();
