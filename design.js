// 디자인 고르기 (겉모습만 바뀜, 새로고침해도 유지). 모든 페이지가 같이 씁니다.
(function () {
  "use strict";
  const DESIGNS = ["default", "revolut", "coinbase", "wise", "binance"];
  const DESIGN_KEY = "saju-design";

  function applyDesign(name) {
    if (!DESIGNS.includes(name)) name = "default";
    if (name === "default") delete document.documentElement.dataset.design;
    else document.documentElement.dataset.design = name;
    document.querySelectorAll(".design-opts button").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.design === name));
    });
  }

  document.querySelectorAll(".design-opts button").forEach((b) => {
    b.addEventListener("click", () => {
      applyDesign(b.dataset.design);
      try { localStorage.setItem(DESIGN_KEY, b.dataset.design); } catch {}
    });
  });
  applyDesign(document.documentElement.dataset.design || "default");
})();
