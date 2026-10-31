(function () {
  "use strict";

  const RS_MIN = 80; // 이 점수를 "넘는" 종목만 (80점은 제외)
  const ELEMENTS = ["목", "화", "토", "금", "수"];
  const HANJA = { 목: "木", 화: "火", 토: "土", 금: "金", 수: "水" };
  const COLORS = {
    목: ["#2f9e44", "#0b6b2a"],
    화: ["#f03e3e", "#a61e4d"],
    토: ["#e8a317", "#a35d00"],
    금: ["#868e96", "#343a40"],
    수: ["#1c7ed6", "#1b2a6b"],
  };

  const DATA = window.STOCK_DATA;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${y}년 ${m}월 ${d}일`; };
  const withJosa = (word, a, b) => { // 받침에 따라 은/는, 이/가
    const code = word.charCodeAt(word.length - 1) - 0xac00;
    return word + (code >= 0 && code % 28 ? a : b);
  };

  const form = $("form");
  const leapWrap = document.querySelector(".leap-wrap");

  form.addEventListener("change", () => {
    leapWrap.hidden = form.cal.value !== "lunar";
    $("time").disabled = $("noTime").checked;
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    run(readForm(), true);
  });

  function readForm() {
    return {
      name: $("name").value.trim(),
      cal: form.cal.value,
      leap: form.cal.value === "lunar" && $("leap").checked,
      year: Number($("year").value),
      month: Number($("month").value),
      day: Number($("day").value),
      time: $("noTime").checked ? null : $("time").value || "12:00",
    };
  }

  function fillForm(p) {
    $("name").value = p.name;
    form.cal.value = p.cal;
    $("leap").checked = p.leap;
    $("year").value = p.year;
    $("month").value = p.month;
    $("day").value = p.day;
    $("noTime").checked = p.time === null;
    if (p.time) $("time").value = p.time;
    form.dispatchEvent(new Event("change"));
  }

  function showError(msg) {
    $("formError").textContent = msg;
    $("formError").hidden = !msg;
  }

  // ---------- 사주 ----------
  function calcSaju(p) {
    const [hour, minute] = p.time ? p.time.split(":").map(Number) : [12, 0];
    const r = window.ssaju.calculateSaju({
      year: p.year, month: p.month, day: p.day, hour, minute,
      calendar: p.cal, leap: p.leap,
    });
    const keys = p.time ? ["hour", "day", "month", "year"] : ["day", "month", "year"];
    const counts = Object.fromEntries(ELEMENTS.map((e) => [e, 0]));
    keys.forEach((k) => {
      const d = r.pillarDetails[k];
      counts[d.element.stem]++;
      counts[d.element.branch]++;
    });
    const min = Math.min(...ELEMENTS.map((e) => counts[e]));
    const lacking = ELEMENTS.filter((e) => counts[e] === min);
    return { r, counts, lacking, total: keys.length * 2 };
  }

  function renderSaju(p, s) {
    const calTxt = p.cal === "lunar" ? `음력${p.leap ? "(윤달)" : ""}` : "양력";
    const so = s.r.solar;
    $("birthLine").textContent =
      `${p.name} · ${calTxt} ${p.year}년 ${p.month}월 ${p.day}일 ${p.time || "시간 모름"}` +
      (p.cal === "lunar" ? ` (양력 ${so.year}.${so.month}.${so.day})` : "");

    const titles = { hour: "시주", day: "일주", month: "월주", year: "연주" };
    $("pillars").innerHTML = ["hour", "day", "month", "year"].map((k) => {
      const d = s.r.pillarDetails[k];
      if (k === "hour" && !p.time) {
        return `<div class="pillar"><div class="ptitle">${titles[k]}</div><div class="char empty">?</div><div class="char empty">?</div></div>`;
      }
      return `<div class="pillar"><div class="ptitle">${titles[k]}</div>
        <div class="char el-${d.element.stem}">${d.stem}<small>${d.stemKo} · ${d.element.stem}</small></div>
        <div class="char el-${d.element.branch}">${d.branch}<small>${d.branchKo} · ${d.element.branch}</small></div></div>`;
    }).join("");

    const max = Math.max(...ELEMENTS.map((e) => s.counts[e]), 1);
    $("bars").innerHTML = ELEMENTS.map((e) => `
      <div class="bar-row ${s.lacking.includes(e) ? "lacking" : ""}">
        <span class="bar-name tx-${e}">${e} ${HANJA[e]}</span>
        <div class="bar-track"><div class="bar-fill el-${e}" style="width:0" data-w="${(s.counts[e] / max) * 100}%"></div></div>
        <span class="bar-num">${s.counts[e]}</span>
      </div>`).join("");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.querySelectorAll(".bar-fill").forEach((el) => { el.style.width = el.dataset.w; });
    }));

    const lackTxt = s.lacking.map((e) => `<b class="tx-${e}">${e}(${HANJA[e]})</b>`).join(", ");
    $("lackLine").innerHTML =
      `${s.total}글자 중 가장 적은 기운은 ${lackTxt} — ${s.counts[s.lacking[0]]}개예요.` +
      (p.time ? "" : ` <span class="sub">(시간을 몰라서 6글자로만 셌어요)</span>`);

    $("map").innerHTML = DATA.elementMap.map((g) => {
      const on = s.lacking.includes(g.element);
      return `<details class="map-row ${on ? "on" : ""}" style="--c:${COLORS[g.element][0]}" ${on ? "open" : ""}>
        <summary><span class="map-el el-${g.element}">${g.element} ${HANJA[g.element]}</span>
          <span class="map-reason">${esc(g.reason)}</span><span class="map-n">${g.industries.length}개</span></summary>
        <div class="chips">${g.industries.map((i) => `<span>${esc(i)}</span>`).join("")}</div>
      </details>`;
    }).join("");
  }

  // ---------- 종목 ----------
  function pickStocks(lacking) {
    return DATA.stocks
      .filter((x) => x.rs > RS_MIN && lacking.includes(x.element))
      .sort((a, b) => b.rs - a.rs || parseFloat(b.ret) - parseFloat(a.ret));
  }

  function renderStocks(lacking, list) {
    const rs = DATA.rs;
    $("stocksTitle").textContent = `${lacking.join("·")} 업종에서 RS ${RS_MIN}점 넘는 코스피 종목 ${list.length}개`;
    $("sourceLine").innerHTML =
      `<b>${fmtDate(rs.date)} 기준</b> 코스피 상대강도(RS) 점수 · 출처: <a href="${esc(rs.url)}" target="_blank" rel="noopener">${esc(rs.title)}</a>` +
      ` (<a href="${esc(rs.site)}" target="_blank" rel="noopener">달리나음의 코스피 상대 강도</a>)<br>` +
      `업종: <a href="${esc(DATA.industrySource.url)}" target="_blank" rel="noopener">FinanceDataReader</a> KRX-DESC 상장회사 목록`;

    if (!list.length) {
      $("cards").innerHTML = `<p class="empty-msg">이번에는 조건에 맞는 종목이 없어요.</p>`;
    } else {
      $("cards").innerHTML = list.map((x) => {
        const up = x.ret.trim().startsWith("+");
        return `<a class="card" style="--c:${COLORS[x.element][0]}" href="https://dalinaum.github.io/rs/charts/${encodeURIComponent(x.code)}.html" target="_blank" rel="noopener">
          <div class="row1"><span class="nm" title="${esc(x.name)}">${esc(x.name)}</span><span class="rs"><small>RS</small>${x.rs}</span></div>
          <div class="meta"><span class="num">${esc(x.code)}</span> · 종가 <span class="num">${x.close != null ? x.close.toLocaleString("ko-KR") : "-"}</span>${x.close != null ? "원" : ""} · 1년 <span class="num ${up ? "up" : "down"}">${esc(x.ret)}</span></div>
          <div class="ind"><span class="tag el-${x.element}">${x.element}</span><span>${esc(x.industry)}${x.pref ? " (우선주)" : ""}</span></div>
        </a>`;
      }).join("");
    }
    const missing = DATA.stocks.filter((x) => x.rs > RS_MIN && !x.element).length;
    $("stocksFoot").textContent =
      `RS는 1년 동안 주가가 다른 코스피 종목보다 얼마나 강했는지를 1~99로 매긴 점수예요. 앞으로 오른다는 뜻이 아니에요. ` +
      `카드를 누르면 원래 사이트의 차트로 가요.` +
      (missing ? ` KRX-DESC에서 업종을 못 찾은 종목 ${missing}개는 빠졌어요.` : "") +
      ` 우선주는 보통주의 업종을 따랐어요.`;
  }

  function renderShare(p, lacking, list) {
    const [c1, c2] = COLORS[lacking[0]];
    const card = $("shareCard");
    card.style.setProperty("--c1", c1);
    card.style.setProperty("--c2", lacking[1] ? COLORS[lacking[1]][1] : c2);
    const top = list.slice(0, 3);
    const lackWord = lacking.map((e) => `${e}(${HANJA[e]})`).join(" · ");
    card.innerHTML = `
      <div class="sc-name">${esc(p.name)}</div>
      <div class="sc-lack">${esc(withJosa(p.name, "이", "가"))} 채워야 할 기운<b>${lackWord}</b></div>
      <div class="sc-label">채워 줄 체력 TOP 3 · RS 점수</div>
      <ol>${top.length ? top.map((x, i) => `
        <li><span class="rk">${i + 1}</span>
          <span><div class="sn">${esc(x.name)}</div><div class="si">${x.element} · ${esc(x.industry)}</div></span>
          <span class="sr"><small>RS</small>${x.rs}</span></li>`).join("")
        : `<li><span></span><span class="sn">조건 맞는 종목 없음</span><span></span></li>`}</ol>
      <div class="sc-foot">🔮 사주는 재미로 · 📊 RS ${fmtDate(DATA.rs.date)} 기준 코스피, 출처 dalinaum.github.io/rs · 투자 권유 아님</div>`;
  }

  // ---------- 실행 ----------
  function run(p, pushUrl) {
    showError("");
    if (!p.name) return showError("이름을 적어 주세요.");
    if (!(p.year >= 1900 && p.year <= 2100) || !(p.month >= 1 && p.month <= 12) || !(p.day >= 1 && p.day <= 31)) {
      return showError("날짜를 다시 확인해 주세요. (1900~2100년)");
    }
    if (p.cal === "solar") {
      const d = new Date(p.year, p.month - 1, p.day);
      if (d.getMonth() !== p.month - 1) return showError("그 달에는 그런 날이 없어요.");
    }
    let s;
    try {
      s = calcSaju(p);
    } catch (err) {
      return showError("이 날짜로는 사주를 계산할 수 없어요. 음력이면 윤달 여부와 날짜를 확인해 주세요.");
    }
    const list = pickStocks(s.lacking);
    renderSaju(p, s);
    renderStocks(s.lacking, list);
    renderShare(p, s.lacking, list);
    $("result").hidden = false;
    if (pushUrl) {
      history.replaceState(null, "", "?" + toQuery(p));
      $("result").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function toQuery(p) {
    const q = new URLSearchParams({
      n: p.name,
      d: `${p.year}-${p.month}-${p.day}`,
      c: p.cal === "lunar" ? (p.leap ? "leap" : "lunar") : "solar",
      t: p.time || "x",
    });
    return q.toString();
  }

  function fromQuery() {
    const q = new URLSearchParams(location.search);
    if (!q.get("n") || !q.get("d")) return null;
    const [year, month, day] = q.get("d").split("-").map(Number);
    const c = q.get("c") || "solar";
    const t = q.get("t");
    return {
      name: q.get("n"), year, month, day,
      cal: c === "solar" ? "solar" : "lunar",
      leap: c === "leap",
      time: !t || t === "x" ? null : t,
    };
  }

  // ---------- 저장 / 복사 ----------
  function toast(msg) {
    $("toast").textContent = msg;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { $("toast").textContent = ""; }, 2500);
  }

  $("saveImg").addEventListener("click", async () => {
    try {
      await document.fonts.ready;
      const canvas = await window.html2canvas($("shareCard"), { scale: 3, backgroundColor: null, useCORS: true });
      const a = document.createElement("a");
      a.download = `사주체력_${readForm().name || "카드"}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
      toast("그림을 저장했어요.");
    } catch (err) {
      toast("그림 저장에 실패했어요: " + err.message);
    }
  });

  $("copyLink").addEventListener("click", async () => {
    const url = location.href.split("?")[0] + "?" + toQuery(readForm());
    try {
      await navigator.clipboard.writeText(url);
      toast("링크를 복사했어요.");
    } catch {
      window.prompt("이 링크를 복사하세요", url);
    }
  });

  const initial = fromQuery();
  if (initial) {
    fillForm(initial);
    run(initial, false);
  }
})();
