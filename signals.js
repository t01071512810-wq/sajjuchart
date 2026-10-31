// 신호 차트의 세 가지 신호(▲ ★ W)를 계산합니다. 기준은 맨 위 RULES 에서 고칠 수 있습니다.
// 브라우저에서는 window.Signals, node 에서는 require("./signals.js") 로 씁니다.
(function (root) {
  "use strict";

  const RULES = {
    // ▲ 5일선이 20일선을 아래에서 위로 뚫은 날 (종가 이동평균)
    maFast: 5,
    maSlow: 20,

    // ★ 종가가 직전 1년(250거래일) 동안의 최고가(고가 기준)를 넘긴 날
    highLookback: 250,
    // 처음 다시 넘긴 날만: 직전 20거래일 안에 ★ 조건을 만족한 날이 있으면 찍지 않음
    highQuietDays: 20,

    // W 쌍바닥
    pivotSpan: 3,        // 앞뒤 3거래일보다 저가가 낮으면 '바닥'
    bottomDiffMax: 0.03, // 두 바닥 저가 차이 3% 이내 (낮은 바닥 기준)
    gapMin: 10,          // 두 바닥 사이 10~60거래일
    gapMax: 60,
    reboundMin: 0.10,    // 가운데 고점이 첫 바닥보다 10% 이상 높아야 함
    confirmMax: 60,      // 두 번째 바닥 뒤 60거래일 안에 종가가 가운데 고점을 넘으면 완성
  };

  function sma(values, n) {
    const out = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= n) sum -= values[i - n];
      if (i >= n - 1) out[i] = sum / n;
    }
    return out;
  }

  // bars: [{time, open, high, low, close}] 날짜 오름차순
  function compute(bars, rules) {
    const R = Object.assign({}, RULES, rules);
    const close = bars.map((b) => b.close);
    const fast = sma(close, R.maFast);
    const slow = sma(close, R.maSlow);

    // ▲ 골든크로스
    const cross = [];
    for (let i = 1; i < bars.length; i++) {
      if (slow[i - 1] == null) continue;
      if (fast[i - 1] <= slow[i - 1] && fast[i] > slow[i]) {
        cross.push({ i, time: bars[i].time, price: close[i], ma5: fast[i], ma20: slow[i] });
      }
    }

    // ★ 1년 최고가 돌파 (처음 다시 넘긴 날만)
    const high = [];
    let lastBreak = -Infinity;
    for (let i = R.highLookback; i < bars.length; i++) {
      let prevMax = -Infinity, prevMaxAt = -1;
      for (let k = i - R.highLookback; k < i; k++) {
        if (bars[k].high >= prevMax) { prevMax = bars[k].high; prevMaxAt = k; }
      }
      if (close[i] > prevMax) {
        if (i - lastBreak > R.highQuietDays) {
          high.push({ i, time: bars[i].time, price: close[i], prevHigh: prevMax, prevHighTime: bars[prevMaxAt].time });
        }
        lastBreak = i;
      }
    }

    // W 쌍바닥
    const pivots = [];
    for (let i = R.pivotSpan; i < bars.length - R.pivotSpan; i++) {
      let ok = true;
      for (let k = i - R.pivotSpan; k <= i + R.pivotSpan && ok; k++) {
        if (k !== i && bars[k].low < bars[i].low) ok = false;
      }
      if (ok) pivots.push(i);
    }

    const w = [];
    const usedSecond = new Set();
    const doneDays = new Set();
    for (let b = 0; b < pivots.length; b++) {
      const i2 = pivots[b];
      for (let a = b - 1; a >= 0; a--) {
        const i1 = pivots[a];
        const gap = i2 - i1;
        if (gap < R.gapMin) continue;
        if (gap > R.gapMax) break;
        if (usedSecond.has(i2)) break;

        const l1 = bars[i1].low, l2 = bars[i2].low;
        const base = Math.min(l1, l2);
        if (Math.abs(l1 - l2) / base > R.bottomDiffMax) continue;

        // 두 바닥 사이에 더 낮은 저가가 없어야 하고, 가운데 고점을 찾음
        let lower = false, mid = -Infinity, midAt = -1;
        for (let k = i1 + 1; k < i2; k++) {
          if (bars[k].low < base) { lower = true; break; }
          if (bars[k].high > mid) { mid = bars[k].high; midAt = k; }
        }
        if (lower || (mid - l1) / l1 < R.reboundMin) continue;

        // 완성: 두 번째 바닥이 확인된 뒤(pivotSpan일 후부터) 종가가 가운데 고점을 넘는 첫날.
        // 그 전에 저가가 두 번째 바닥 아래로 깨지면 무효.
        let done = -1;
        for (let j = i2 + 1; j < bars.length && j <= i2 + R.confirmMax; j++) {
          if (bars[j].low < l2) break;
          if (close[j] > mid) { if (j >= i2 + R.pivotSpan) done = j; break; }
        }
        if (done < 0 || doneDays.has(done)) continue;

        usedSecond.add(i2);
        doneDays.add(done);
        w.push({
          i: done, time: bars[done].time, price: close[done],
          b1: { time: bars[i1].time, price: l1 },
          b2: { time: bars[i2].time, price: l2 },
          mid: { time: bars[midAt].time, price: mid },
        });
        break;
      }
    }
    w.sort((x, y) => x.i - y.i);

    return { rules: R, ma: { fast, slow }, cross, high, w };
  }

  const api = { RULES, sma, compute };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Signals = api;
})(this);
