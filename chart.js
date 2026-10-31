(function () {
  "use strict";

  const DATA = window.CHART_DATA;
  const LWC = window.LightweightCharts;
  const $ = (id) => document.getElementById(id);
  const won = (n) => Math.round(n).toLocaleString("ko-KR") + "원";
  const fmtDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${y}년 ${m}월 ${d}일`; };
  const pct = (a, b) => { const v = (a / b - 1) * 100; return (v > 0 ? "+" : "") + v.toFixed(1) + "%"; };

  const bars = DATA.bars.map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume }));
  const byTime = new Map(bars.map((b, i) => [b.time, i]));
  const sig = window.Signals.compute(bars);

  const SIGNALS = {
    cross: { mark: "▲", name: "5일선 골든크로스", list: sig.cross },
    high: { mark: "★", name: "1년 신고가", list: sig.high },
    w: { mark: "W", name: "쌍바닥 완성", list: sig.w },
  };
  const on = { cross: true, high: true, w: true };
  const sigAt = {}; // time → { cross, high, w }
  for (const key in SIGNALS) {
    $("count-" + key).textContent = SIGNALS[key].list.length + "회";
    for (const s of SIGNALS[key].list) (sigAt[s.time] = sigAt[s.time] || {})[key] = s;
  }

  $("subLine").textContent = `${DATA.name}(${DATA.code}) 일봉 · ${fmtDate(bars[0].time)} ~ ${fmtDate(bars[bars.length - 1].time)} · ${bars.length}거래일`;

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
  const HIGH_COLOR = "#f59f00";

  // ---------- 차트 ----------
  const el = $("chart");
  const chart = LWC.createChart(el, {
    autoSize: true,
    localization: { locale: "ko-KR", priceFormatter: (p) => Math.round(p).toLocaleString("ko-KR") },
    timeScale: { rightOffset: 3, minBarSpacing: 0.5 },
    crosshair: { mode: LWC.CrosshairMode.Normal },
  });

  const candles = chart.addCandlestickSeries({ priceLineVisible: false });
  candles.setData(bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));

  const volume = chart.addHistogramSeries({ priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
  chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

  const lineOpts = { lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
  const ma5 = chart.addLineSeries(lineOpts);
  const ma20 = chart.addLineSeries(lineOpts);
  const toLine = (arr) => arr.map((v, i) => (v == null ? null : { time: bars[i].time, value: v })).filter(Boolean);
  ma5.setData(toLine(sig.ma.fast));
  ma20.setData(toLine(sig.ma.slow));

  // 누른 W의 모양(바닥1 → 가운데 고점 → 바닥2 → 완성)을 잠깐 그려 주는 선
  const wPath = chart.addLineSeries({ lineWidth: 2, lineStyle: LWC.LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, pointMarkersVisible: true });

  let T = tokens();
  function paint() {
    T = tokens();
    chart.applyOptions({
      layout: { background: { color: T.bg }, textColor: T.muted, fontFamily: T.font },
      grid: { vertLines: { color: alpha(T.line, 0.6) }, horzLines: { color: alpha(T.line, 0.6) } },
      rightPriceScale: { borderColor: T.line },
      timeScale: { borderColor: T.line },
    });
    candles.applyOptions({ upColor: T.up, downColor: T.down, borderUpColor: T.up, borderDownColor: T.down, wickUpColor: T.up, wickDownColor: T.down });
    volume.setData(bars.map((b, i) => ({
      time: b.time, value: b.volume,
      color: alpha(i && b.close < bars[i - 1].close ? T.down : T.up, 0.35),
    })));
    ma5.applyOptions({ color: "#e8590c" });
    ma20.applyOptions({ color: "#2b8a3e" });
    wPath.applyOptions({ color: T.accent });
    setMarkers();
    legend();
  }

  function setMarkers() {
    const ms = [];
    if (on.cross) for (const s of sig.cross) ms.push({ id: "cross:" + s.time, time: s.time, position: "belowBar", shape: "arrowUp", color: T.up, size: 1 });
    if (on.high) for (const s of sig.high) ms.push({ id: "high:" + s.time, time: s.time, position: "aboveBar", shape: "circle", color: HIGH_COLOR, size: 0, text: "★" });
    if (on.w) for (const s of sig.w) ms.push({ id: "w:" + s.time, time: s.time, position: "belowBar", shape: "square", color: T.accent, size: 0, text: "W" });
    ms.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    candles.setMarkers(ms);
  }

  // ---------- 위쪽 범례: 마우스가 있는 날(없으면 마지막 날) ----------
  function legend(time) {
    const i = byTime.has(time) ? byTime.get(time) : bars.length - 1;
    const b = bars[i], prev = bars[i - 1];
    const chg = prev ? pct(b.close, prev.close) : "";
    const cls = prev && b.close < prev.close ? "dn" : "up";
    const f5 = sig.ma.fast[i], f20 = sig.ma.slow[i];
    $("legend").innerHTML =
      `<span class="lg-date">${b.time}</span>` +
      `<span>종가 <b class="${cls}">${won(b.close)}</b> <span class="${cls}">${chg}</span></span>` +
      `<span class="lg-ma"><i style="background:#e8590c"></i>5일 ${f5 ? won(f5) : "-"}</span>` +
      `<span class="lg-ma"><i style="background:#2b8a3e"></i>20일 ${f20 ? won(f20) : "-"}</span>`;
  }
  chart.subscribeCrosshairMove((p) => legend(p.time));

  // ---------- 표시 누르면 날짜·가격 ----------
  const pop = $("pop");
  function hidePop() { pop.hidden = true; wPath.setData([]); }

  function showPop(time, point, prefer) {
    const hits = sigAt[time];
    const keys = hits ? Object.keys(SIGNALS).filter((k) => hits[k] && on[k]) : [];
    if (!keys.length) return hidePop();
    if (prefer && keys.includes(prefer)) keys.sort((a, b) => (a === prefer ? -1 : b === prefer ? 1 : 0));

    const i = byTime.get(time), b = bars[i], prev = bars[i - 1];
    let html = `<button type="button" class="pop-x" aria-label="닫기">×</button>` +
      `<div class="pop-date">${fmtDate(time)}</div>` +
      `<div class="pop-price">종가 <b>${won(b.close)}</b>${prev ? ` <span class="${b.close < prev.close ? "dn" : "up"}">${pct(b.close, prev.close)}</span>` : ""}</div>` +
      `<div class="pop-ohlc">시 ${won(b.open)} · 고 ${won(b.high)} · 저 ${won(b.low)}</div>`;

    let path = null;
    for (const k of keys) {
      const s = hits[k];
      html += `<div class="pop-sig"><span class="sig-mark ${k}">${SIGNALS[k].mark}</span><b>${SIGNALS[k].name}</b>`;
      if (k === "cross") html += `<div>5일선 ${won(s.ma5)}이 20일선 ${won(s.ma20)}을 뚫고 올라감</div>`;
      if (k === "high") html += `<div>직전 1년 최고가 ${won(s.prevHigh)} (${s.prevHighTime})를 종가로 넘김</div>`;
      if (k === "w") {
        html += `<div>바닥① ${s.b1.time} ${won(s.b1.price)}</div>` +
          `<div>가운데 고점 ${s.mid.time} ${won(s.mid.price)} (바닥①보다 ${pct(s.mid.price, s.b1.price)})</div>` +
          `<div>바닥② ${s.b2.time} ${won(s.b2.price)} (바닥①과 ${pct(s.b2.price, s.b1.price)})</div>` +
          `<div>→ 종가가 가운데 고점을 넘어 완성</div>`;
        path = [s.b1, s.mid, s.b2, { time: s.time, price: s.price }].map((p) => ({ time: p.time, value: p.price }));
      }
      html += `</div>`;
    }
    wPath.setData(path || []);
    pop.innerHTML = html;
    pop.hidden = false;
    pop.querySelector(".pop-x").addEventListener("click", hidePop);

    // 누른 자리 옆에 띄우되 차트 밖으로 나가지 않게
    const W = el.clientWidth, H = el.clientHeight;
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    const x = point ? point.x : W / 2, y = point ? point.y : H / 2;
    let left = x + 14; if (left + pw > W - 4) left = Math.max(4, x - pw - 14);
    let top = y - ph / 2; top = Math.min(Math.max(4, top), Math.max(4, H - ph - 4));
    pop.style.left = left + "px";
    pop.style.top = top + "px";
  }

  // 봉이 촘촘하면 정확히 누르기 어려워서, 누른 곳에서 가로 14px 안의 가장 가까운 신호를 잡음
  const SNAP_PX = 14;
  function nearestSignal(x) {
    const ts = chart.timeScale();
    let best = null, bestD = SNAP_PX + 1;
    for (const k in SIGNALS) {
      if (!on[k]) continue;
      for (const s of SIGNALS[k].list) {
        const sx = ts.timeToCoordinate(s.time);
        if (sx == null) continue;
        const d = Math.abs(sx - x);
        if (d < bestD) { bestD = d; best = { time: s.time, key: k }; }
      }
    }
    return best;
  }

  chart.subscribeClick((p) => {
    if (!p.point) return hidePop();
    let time = null, prefer = null;
    if (typeof p.hoveredObjectId === "string" && p.hoveredObjectId.includes(":")) {
      [prefer, time] = p.hoveredObjectId.split(":");
    } else if (p.time && sigAt[p.time] && Object.keys(sigAt[p.time]).some((k) => on[k])) {
      time = p.time;
    } else {
      const near = nearestSignal(p.point.x);
      if (near) { time = near.time; prefer = near.key; }
    }
    if (!time) return hidePop();
    showPop(time, p.point, prefer);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hidePop(); });

  // ---------- 신호 켜고 끄기 ----------
  document.querySelectorAll(".sig-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const k = btn.dataset.sig;
      on[k] = !on[k];
      btn.setAttribute("aria-pressed", String(on[k]));
      setMarkers();
      hidePop();
    });
  });

  // ---------- 기간 ----------
  function showRange(r) {
    const n = bars.length;
    hidePop();
    if (r === "all") chart.timeScale().fitContent();
    else chart.timeScale().setVisibleLogicalRange({ from: n - Number(r), to: n + 2 });
    document.querySelectorAll(".range-seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.range === r)));
  }
  document.querySelectorAll(".range-seg button").forEach((b) => b.addEventListener("click", () => showRange(b.dataset.range)));

  // ---------- 기준 설명 ----------
  const R = sig.rules;
  const rules = [
    ["▲ 골든크로스", `종가 ${R.maFast}일 이동평균이 전날엔 ${R.maSlow}일 이동평균 아래(같음 포함)였는데 오늘 위로 올라선 날`],
    ["★ 1년 신고가", `종가가 직전 ${R.highLookback}거래일(약 1년) 동안의 최고가(고가 기준)를 넘긴 날. 처음 다시 넘긴 날만 찍어요 — 직전 ${R.highQuietDays}거래일 안에 이미 넘긴 날이 있으면 건너뜀. 1년치 앞 데이터가 필요해서 첫 1년은 ★이 없어요.`],
    ["W 쌍바닥", `앞뒤 ${R.pivotSpan}거래일보다 저가가 낮은 날을 '바닥'으로 봐요. 두 바닥의 저가 차이 ${R.bottomDiffMax * 100}% 이내, 두 바닥 사이 ${R.gapMin}~${R.gapMax}거래일, 그 사이에 두 바닥보다 낮은 날이 없고, 가운데 고점이 첫 바닥보다 ${R.reboundMin * 100}% 이상 높을 것. 두 번째 바닥 뒤 ${R.confirmMax}거래일 안에 (두 번째 바닥을 깨지 않고) 종가가 가운데 고점을 넘는 첫날을 완성으로 표시해요.`],
  ];
  $("rules").innerHTML = rules.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join("");

  $("footer").insertAdjacentHTML("afterbegin", `데이터 받은 때: ${DATA.fetchedAt.slice(0, 10)} · `);

  paint();
  showRange("250");
  new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ["data-design"] });
  if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paint);
})();
