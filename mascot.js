/* =========================================================
   연속 학습일 캐릭터: 평범한 수험생 → 마법소녀 (오리지널 도트 캐릭터)
   ========================================================= */
(() => {
  "use strict";

  const PAL = {
    hair: "#5b3f63", hairD: "#3c2842", skin: "#f7d9c6", eye: "#3a1d3d", mouth: "#d9707f",
    shirt: "#a7b1c2", pants: "#4b5568", shoe: "#2d3443",
    dress: "#e8678f", dressL: "#fcd5e1", boot: "#e8678f", ribbon: "#ff8fb3",
    wand: "#fff1c2", star: "#ffd34d", wing: "#bfe2ff", crown: "#ffd34d", spark: "#ffd34d", blush: "#f4a3b3",
  };

  const TIERS = [
    { d: 0,   name: "평범한 수험생", line: "<평범한 수험생>이 나타났다!",       say: "단어장… 오늘부터 해볼까?" },
    { d: 1,   name: "첫 반짝임",     line: "눈빛이 반짝이기 시작했다!",        say: "어? 단어가 조금 보이는데?" },
    { d: 3,   name: "마법 리본",     line: "마법의 리본을 얻었다!",            say: "작심삼일은 넘겼어!" },
    { d: 7,   name: "요술봉",        line: "요술봉을 손에 넣었다!",            say: "일주일 연속, 이제 진짜 시작이야." },
    { d: 14,  name: "변신 드레스",   line: "변신 완료! 마법소녀 등장!",         say: "헷갈리는 단어 따위 지지 않아!" },
    { d: 30,  name: "별빛 날개",     line: "등 뒤로 날개가 돋아났다!",          say: "한 달째, 날아오를 준비 완료." },
    { d: 100, name: "별의 왕관",     line: "별의 왕관을 썼다! 전설의 마법소녀!", say: "100일의 마법, GMAT도 문제없어." },
  ];

  function tierOf(days) {
    let t = 0;
    TIERS.forEach((x, i) => { if (days >= x.d) t = i; });
    return t;
  }

  function svg(stage, label) {
    const s = stage;
    let o = "";
    const r = (x, y, w, h, k) => { o += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${PAL[k]}"/>`; };

    if (s >= 5) [[2, 15, 4, 2], [1, 17, 5, 3], [2, 20, 4, 2], [3, 22, 3, 1], [18, 15, 4, 2], [18, 17, 5, 3], [18, 20, 4, 2], [18, 22, 3, 1]].forEach((a) => r(...a, "wing"));
    r(6, 4, 12, 3, "hair"); r(5, 6, 14, s >= 4 ? 17 : 15, "hair");   // 뒷머리
    if (s < 4) {   // 평범한 옷
      r(8, 15, 8, 7, "shirt"); r(6, 15, 2, 6, "shirt"); r(16, 15, 2, 6, "shirt");
      r(6, 21, 2, 1, "skin"); r(16, 21, 2, 1, "skin"); r(10, 15, 4, 1, "pants");
      r(8, 22, 8, 4, "pants"); r(8, 26, 3, 6, "pants"); r(13, 26, 3, 6, "pants");
      r(7, 32, 4, 2, "shoe"); r(13, 32, 4, 2, "shoe");
    } else {       // 변신 드레스
      r(8, 15, 8, 6, "dress"); r(10, 15, 4, 1, "dressL"); r(11, 17, 2, 2, "star");
      r(6, 15, 2, 2, "dressL"); r(16, 15, 2, 2, "dressL"); r(6, 17, 2, 5, "skin"); r(16, 17, 2, 5, "skin");
      r(7, 21, 10, 2, "dress"); r(6, 23, 12, 3, "dress"); r(6, 26, 12, 1, "dressL");
      r(9, 27, 2, 4, "skin"); r(13, 27, 2, 4, "skin"); r(8, 31, 3, 3, "boot"); r(13, 31, 3, 3, "boot");
    }
    r(8, 7, 8, 7, "skin"); r(11, 14, 2, 1, "skin");   // 얼굴, 목
    r(7, 5, 10, 2, "hair"); r(8, 7, 2, 1, "hairD"); r(14, 7, 2, 1, "hairD"); r(7, 7, 1, 5, "hair"); r(16, 7, 1, 5, "hair");
    r(9, 10, 2, 2, "eye"); r(13, 10, 2, 2, "eye");
    if (s >= 1) { r(9, 10, 1, 1, "wand"); r(13, 10, 1, 1, "wand"); r(8, 12, 1, 1, "blush"); r(15, 12, 1, 1, "blush"); }
    r(11, 12, 2, 1, "mouth");
    if (s >= 6) { r(8, 2, 6, 2, "crown"); r(8, 1, 1, 1, "crown"); r(10, 1, 2, 1, "crown"); r(13, 1, 1, 1, "crown"); r(10, 0, 2, 1, "crown"); }
    if (s >= 2) { r(14, 2, 3, 3, "ribbon"); r(17, 3, 1, 1, "hairD"); r(18, 2, 3, 3, "ribbon"); }
    if (s >= 3) { r(18, 12, 1, 10, "wand"); r(17, 9, 3, 3, "star"); r(18, 8, 1, 1, "star"); r(16, 10, 1, 1, "star"); r(20, 10, 1, 1, "star"); }
    const sp = [[2, 3], [21, 6], [2, 29], [21, 29], [1, 11], [22, 24], [4, 1], [20, 1]].slice(0, s >= 1 ? Math.min(s * 2 - 1, 8) : 0);
    sp.forEach(([x, y]) => { r(x - 1, y, 3, 1, "spark"); r(x, y - 1, 1, 3, "spark"); });

    return `<svg viewBox="0 0 24 34" shape-rendering="crispEdges" role="img" aria-label="${label || TIERS[s].name}">${o}</svg>`;
  }

  window.Mascot = { TIERS, tierOf, svg };
})();
