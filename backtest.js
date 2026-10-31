// 전략 비교 페이지. 숫자는 모두 scripts/backtest.py 가 실제로 돌려 만든 data/backtest.js 에서 읽습니다.
(function () {
  "use strict";

  const DATA = window.BACKTEST;
  const LWC = window.LightweightCharts;
  const $ = (id) => document.getElementById(id);
  const won = (n) => Math.round(n).toLocaleString("ko-KR") + "원";
  const signed = (v, d = 1) => (v > 0 ? "+" : "") + v.toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d }) + "%";
  const eok = (n) => (n / 1e8).toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "억";
  const fmtDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${y}년 ${m}월 ${d}일`; };
  const cls = (v) => (v > 0 ? "up" : v < 0 ? "dn" : "");

  let stock = DATA.stocks[0];
  let result = null;
  let bars = [];

  // ---------- 색 (디자인 토큰을 그대로 읽음) ----------
  function tokens() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    return { bg: v("--panel"), ink: v("--ink"), muted: v("--muted"), line: v("--line"), up: v("--up"), down: v("--down"), accent: v("--accent"), font: v("--font-num") || v("--font") };
  }
  function alpha(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ---------- 차트 ----------
  const chart = LWC.createChart($("chart"), {
    autoSize: true,
    localization: { locale: "ko-KR", priceFormatter: (p) => Math.round(p).toLocaleString("ko-KR") },
    timeScale: { rightOffset: 3, minBarSpacing: 0.1 },
    crosshair: { mode: LWC.CrosshairMode.Normal },
  });
  // 12년치라 봉 대신 종가 선 하나. 들고 있던 날은 강조색, 아닌 날은 흐린 색으로 칠함
  const price = chart.addLineSeries({ lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true });

  let T = tokens();
  function paint() {
    T = tokens();
    chart.applyOptions({
      layout: { background: { color: T.bg }, textColor: T.muted, fontFamily: T.font },
      grid: { vertLines: { color: alpha(T.line, 0.6) }, horzLines: { color: alpha(T.line, 0.6) } },
      rightPriceScale: { borderColor: T.line },
      timeScale: { borderColor: T.line },
    });
    price.applyOptions({ color: alpha(T.muted, 0.6) });
    drawTrades();
  }

  function drawTrades() {
    if (!result) return;
    const idx = new Map(bars.map((b, i) => [b.time, i]));
    // 산 날 다음부터 판 날까지의 선분을 강조색으로 (점 i의 색이 i-1→i 선분 색)
    const on = new Array(bars.length).fill(false);
    for (const [ein, , eout] of result.tradeList) {
      for (let i = idx.get(ein) + 1; i <= idx.get(eout); i++) on[i] = true;
    }
    const off = alpha(T.muted, 0.6);
    price.setData(bars.map((b, i) => ({ time: b.time, value: b.close, color: on[i] ? T.accent : off })));

    const ms = [];
    result.tradeList.forEach(([ein, , eout], k) => {
      ms.push({ time: ein, position: "belowBar", shape: "arrowUp", color: T.up, size: 1 });
      const last = k === result.tradeList.length - 1 && eout === bars[bars.length - 1].time;
      ms.push({ time: eout, position: "aboveBar", shape: "arrowDown", color: T.down, size: 1, text: last ? "마지막 날 정리" : "" });
    });
    ms.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    price.setMarkers(ms);
  }

  function legend(time) {
    const i = time ? bars.findIndex((b) => b.time === time) : bars.length - 1;
    const b = bars[i < 0 ? bars.length - 1 : i];
    $("legend").innerHTML =
      `<span class="lg-date">${b.time}</span><span>종가 <b>${won(b.close)}</b></span>` +
      `<span class="lg-ma"><i style="background:var(--accent)"></i>들고 있던 기간</span>`;
  }
  chart.subscribeCrosshairMove((p) => legend(p.time));

  function showRange(r) {
    const n = bars.length;
    if (r === "all") chart.timeScale().fitContent();
    else chart.timeScale().setVisibleLogicalRange({ from: n - Number(r), to: n + 2 });
    document.querySelectorAll("#rangeSeg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.range === r)));
  }
  document.querySelectorAll("#rangeSeg button").forEach((b) => b.addEventListener("click", () => showRange(b.dataset.range)));

  // 사고판 한 줄을 누르면 그 앞뒤를 확대
  function zoomTo(ein, eout) {
    const i = bars.findIndex((b) => b.time === ein), j = bars.findIndex((b) => b.time === eout);
    const pad = Math.max(20, Math.round((j - i) * 0.5));
    chart.timeScale().setVisibleLogicalRange({ from: i - pad, to: j + pad });
    document.querySelectorAll("#rangeSeg button").forEach((b) => b.setAttribute("aria-pressed", "false"));
    $("chart").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ---------- 표 ----------
  function renderTable() {
    $("rows").innerHTML = stock.results.map((r, i) => {
      const best = r.strategy === stock.best;
      return `<tr data-i="${i}" tabindex="0" aria-selected="${r === result}">` +
        `<th scope="row">${r.strategy}${best ? ' <span class="bt-best">1등</span>' : ""}</th>` +
        `<td class="num ${cls(r.return_pct)}">${signed(r.return_pct)}</td>` +
        `<td class="num">${eok(r.final_equity)}</td>` +
        `<td class="num dn">${signed(r.max_dd_pct)}</td>` +
        `<td class="num">${r.trades}번</td>` +
        `<td class="num">${r.wins}번</td></tr>`;
    }).join("");
    $("rows").querySelectorAll("tr").forEach((tr) => {
      const pick = () => selectResult(stock.results[Number(tr.dataset.i)]);
      tr.addEventListener("click", pick);
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
    });
  }

  function renderTrades() {
    const n = result.tradeList.length;
    $("tradeTitle").textContent = `${result.strategy} — 사고판 내역 ${n}번 (이긴 ${result.wins}번)`;
    $("trades").innerHTML = result.tradeList.map(([ein, pin, eout, pout, ret], k) =>
      `<tr data-k="${k}" tabindex="0"><td class="num">${k + 1}</td><td>${ein}</td><td class="num">${won(pin)}</td>` +
      `<td>${eout}</td><td class="num">${won(pout)}</td><td class="num ${cls(ret)}">${signed(ret, 2)}</td></tr>`
    ).join("");
    $("trades").querySelectorAll("tr").forEach((tr) => {
      const t = result.tradeList[Number(tr.dataset.k)];
      const go = () => zoomTo(t[0], t[2]);
      tr.addEventListener("click", go);
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    });
  }

  function selectResult(r) {
    result = r;
    $("rows").querySelectorAll("tr").forEach((tr) => tr.setAttribute("aria-selected", String(stock.results[Number(tr.dataset.i)] === r)));
    drawTrades();
    renderTrades();
  }

  function selectStock(code) {
    stock = DATA.stocks.find((s) => s.code === code);
    bars = stock.bars.map(([time, , , , close]) => ({ time, close }));
    document.querySelectorAll("#stockSeg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.code === code)));
    $("period").textContent = `${stock.name}(${stock.code}) · ${fmtDate(bars[0].time)} ~ ${fmtDate(bars[bars.length - 1].time)} · ${bars.length.toLocaleString("ko-KR")}거래일`;
    result = stock.results.find((r) => r.strategy === stock.best) || stock.results[0];
    renderTable();
    selectResult(result);
    legend();
    showRange("all");
  }

  $("stockSeg").innerHTML = DATA.stocks.map((s) => `<button type="button" data-code="${s.code}">${s.name}</button>`).join("");
  document.querySelectorAll("#stockSeg button").forEach((b) => b.addEventListener("click", () => selectStock(b.dataset.code)));

  // ---------- 기준 설명 ----------
  const fee = (DATA.commission * 100).toFixed(2);
  const rules = [
    ["① 사서 계속 들고 있기", "처음에 사서 마지막 날까지 그대로 둬요."],
    ["② 5일선 ↗ 20일선", "종가 5일 평균이 20일 평균을 아래에서 위로 뚫으면 사고, 다시 아래로 내려가면 팔아요."],
    ["③ 20일선 ↗ 60일선", "②와 같은 방식으로 20일 평균과 60일 평균을 봐요."],
    ["④ RSI 30 / 70", "RSI(14일, Wilder 방식)가 30 밑이면 사고 70을 넘으면 팔아요."],
    ["⑤ 1년 최고가 돌파", "종가가 직전 250거래일 최고가(고가 기준)를 넘기면 사고, 직전 20거래일 최저가(저가 기준) 밑으로 빠지면 팔아요."],
    ["⑥ 50 > 150 > 200일선", "종가 > 50일선 > 150일선 > 200일선일 때만 들고 있고, 하나라도 깨지면 팔아요."],
    ["사고파는 때", "신호는 그날 종가로 보고, 실제로는 다음 날 시가에 사고팔아요. 첫날은 신호만 봐서 ①도 셋째 거래일 시가에 샀어요."],
    ["돈", `처음 ${(DATA.cash / 1e8).toLocaleString("ko-KR")}억 원, 살 때마다 가진 돈으로 살 수 있는 만큼(1주 단위) 사요. 공매도는 없어요.`],
    ["수수료·세금", `살 때와 팔 때 각각 ${fee}%씩 빼요. 이긴 횟수는 이걸 빼고도 돈을 번 횟수예요.`],
    ["마지막 날", "마지막 날까지 들고 있던 주식은 그날 시가에 판 것으로 쳐서 횟수에 넣어요."],
    ["지표가 쌓이기 전", "⑤는 1년치, ⑥은 200일치 주가가 있어야 판단할 수 있어서 첫 매수가 2016년에야 나와요. 그 전에는 현금으로 쉬고 있었던 셈이에요."],
  ];
  $("rules").innerHTML = rules.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join("");
  if (DATA.errors.length) {
    $("rules").insertAdjacentHTML("beforeend", `<dt>실행 실패</dt><dd>${DATA.errors.join("<br>")}</dd>`);
  }

  $("footer").insertAdjacentHTML("afterbegin", `계산한 때: ${DATA.generatedAt.slice(0, 10)} · `);

  selectStock(DATA.stocks[0].code);
  paint();
  new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ["data-design"] });
  if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paint);
})();
