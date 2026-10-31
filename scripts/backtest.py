"""삼성전자·SK하이닉스·NAVER에 여섯 가지 매매 방법을 돌려 보고 "이렇게 샀으면 얼마 벌었을까?"를 비교합니다.

- 주가: FinanceDataReader DataReader(코드) 기본 기간 (2014-08부터 지금까지). 거래량 0인 날(거래정지 등)은 뺍니다.
- 엔진: backtesting.py (https://github.com/kernc/backtesting.py)
  · 신호는 그날 종가로 보고, 주문은 다음 날 시가에 체결 (trade_on_close=False, 기본값)
  · 수수료+세금 0.25% — 살 때와 팔 때 각각 붙습니다 (commission=0.0025)
  · 시작 돈 1억 원, 살 때는 가진 돈으로 살 수 있는 만큼(1주 단위) 삽니다. 공매도 없음
  · 첫날은 신호만 보고 둘째 날 신호부터 주문이 나가므로, ①도 셋째 거래일(2014-08-08) 시가에 삽니다
  · 마지막 날까지 들고 있는 주식은 마지막 날 시가로 판 것으로 쳐서 거래 횟수에 넣습니다 (finalize_trades=True)
- 이동평균·1년 최고가 같은 지표는 앞쪽이 비어 있으므로, 그 방법은 지표가 다 채워진 날부터 사고팔 수 있습니다
  (⑥은 200거래일, ⑤는 250거래일 뒤). 표의 '첫 매수일'을 보세요.

실행:  .venv/Scripts/python -m pip install -r scripts/requirements.txt
      .venv/Scripts/python scripts/backtest.py
결과:  backtest/results.md (표), backtest/results.csv, backtest/chart_<코드>.html (종목별 1등 방법 차트)
      data/backtest.js (사이트의 backtest.html 전략 비교 페이지가 읽는 파일)
"""

import json
import warnings
from datetime import datetime, timezone
from pathlib import Path

import FinanceDataReader as fdr
import pandas as pd
from backtesting import Backtest, Strategy
from backtesting.lib import crossover

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "backtest"
STOCKS = [("005930", "삼성전자"), ("000660", "SK하이닉스"), ("035420", "NAVER")]
CASH = 100_000_000
COMMISSION = 0.0025


def sma(values, n):
    return pd.Series(values).rolling(n).mean()


def rsi(values, n=14):
    """Wilder 방식 RSI."""
    delta = pd.Series(values).diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / n, min_periods=n, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / n, min_periods=n, adjust=False).mean()
    return 100 - 100 / (1 + gain / loss)


def prior_high(values, n):
    """어제까지 n거래일 최고가 (오늘은 빼고)."""
    return pd.Series(values).rolling(n).max().shift(1)


def prior_low(values, n):
    """어제까지 n거래일 최저가 (오늘은 빼고)."""
    return pd.Series(values).rolling(n).min().shift(1)


class BuyHold(Strategy):
    """① 첫날 사서 끝까지 들고 있기."""

    def init(self):
        pass

    def next(self):
        if not self.position:
            self.buy()


class SmaCross(Strategy):
    """②③ 짧은 이동평균이 긴 이동평균을 뚫고 올라가면 사고, 다시 내려가면 팔기."""

    fast = 5
    slow = 20

    def init(self):
        self.ma_fast = self.I(sma, self.data.Close, self.fast, name=f"SMA{self.fast}")
        self.ma_slow = self.I(sma, self.data.Close, self.slow, name=f"SMA{self.slow}")

    def next(self):
        if crossover(self.ma_fast, self.ma_slow) and not self.position:
            self.buy()
        elif crossover(self.ma_slow, self.ma_fast) and self.position:
            self.position.close()


class SmaCross20_60(SmaCross):
    fast = 20
    slow = 60


class RsiReversal(Strategy):
    """④ RSI(14)가 30 밑이면 사고 70 넘으면 팔기."""

    def init(self):
        self.rsi = self.I(rsi, self.data.Close, 14, name="RSI14")

    def next(self):
        if self.rsi[-1] < 30 and not self.position:
            self.buy()
        elif self.rsi[-1] > 70 and self.position:
            self.position.close()


class Breakout(Strategy):
    """⑤ 종가가 직전 1년(250거래일) 최고가를 넘기면 사고, 직전 20거래일 최저가 밑으로 빠지면 팔기."""

    def init(self):
        self.high250 = self.I(prior_high, self.data.High, 250, name="1년 최고가")
        self.low20 = self.I(prior_low, self.data.Low, 20, name="20일 최저가")

    def next(self):
        close = self.data.Close[-1]
        if close > self.high250[-1] and not self.position:
            self.buy()
        elif close < self.low20[-1] and self.position:
            self.position.close()


class TrendTemplate(Strategy):
    """⑥ 종가 > 50일선 > 150일선 > 200일선일 때만 들고 있기."""

    def init(self):
        self.ma50 = self.I(sma, self.data.Close, 50, name="SMA50")
        self.ma150 = self.I(sma, self.data.Close, 150, name="SMA150")
        self.ma200 = self.I(sma, self.data.Close, 200, name="SMA200")

    def next(self):
        ok = self.data.Close[-1] > self.ma50[-1] > self.ma150[-1] > self.ma200[-1]
        if ok and not self.position:
            self.buy()
        elif not ok and self.position:
            self.position.close()


STRATEGIES = [
    ("① 사서 계속 들고 있기", BuyHold),
    ("② 5일선↗20일선 사고 ↘ 팔기", SmaCross),
    ("③ 20일선↗60일선 사고 ↘ 팔기", SmaCross20_60),
    ("④ RSI 30 밑 사고 70 위 팔기", RsiReversal),
    ("⑤ 1년 최고가 돌파 사고 20일 최저가 이탈 팔기", Breakout),
    ("⑥ 종가>50일>150일>200일선일 때만 보유", TrendTemplate),
]


def load(code):
    df = fdr.DataReader(code)
    df = df[(df["Volume"] > 0) & (df["Open"] > 0) & (df["Close"] > 0)]
    return df[["Open", "High", "Low", "Close", "Volume"]].astype(float)


def run_one(df, strategy):
    bt = Backtest(df, strategy, cash=CASH, commission=COMMISSION, finalize_trades=True)
    stats = bt.run()
    trades = stats["_trades"]
    first_trade = trades["EntryTime"].min() if len(trades) else None
    return bt, stats, {
        "trades": int(stats["# Trades"]),
        "wins": int((trades["PnL"] > 0).sum()) if len(trades) else 0,
        "return_pct": float(stats["Return [%]"]),
        "final_equity": float(stats["Equity Final [$]"]),
        "max_dd_pct": float(stats["Max. Drawdown [%]"]),
        "exposure_pct": float(stats["Exposure Time [%]"]),
        "first_entry": first_trade.date().isoformat() if first_trade is not None else "-",
    }


def trade_list(stats):
    """사고판 묶음마다 [산 날, 산 값, 판 날, 판 값, 수익률(%, 수수료 뺌)]."""
    return [
        [t.EntryTime.date().isoformat(), round(float(t.EntryPrice)), t.ExitTime.date().isoformat(),
         round(float(t.ExitPrice)), round(float(t.ReturnPct) * 100, 2)]
        for t in stats["_trades"].itertuples()
    ]


def main():
    warnings.filterwarnings("ignore", module="backtesting")
    OUT.mkdir(exist_ok=True)
    rows, errors, best = [], [], {}
    periods = {}
    site = []  # data/backtest.js 로 나갈 종목별 주가·결과

    for code, name in STOCKS:
        try:
            df = load(code)
        except Exception as e:  # 주가를 못 받으면 그 종목 전체를 실패로 남김
            errors.append(f"{name}({code}) 주가 받기 실패: {e!r}")
            continue
        periods[code] = (df.index[0].date().isoformat(), df.index[-1].date().isoformat(), len(df))
        stock = {
            "code": code, "name": name,
            "bars": [[d.date().isoformat(), int(r.Open), int(r.High), int(r.Low), int(r.Close)] for d, r in df.iterrows()],
            "results": [],
        }
        site.append(stock)

        for label, strat in STRATEGIES:
            try:
                bt, stats, r = run_one(df, strat)
            except Exception as e:
                errors.append(f"{name}({code}) {label} 실행 실패: {e!r}")
                continue
            rows.append({"code": code, "name": name, "strategy": label, **r})
            stock["results"].append({"strategy": label, **r, "tradeList": trade_list(stats)})
            if code not in best or r["return_pct"] > best[code][1]["return_pct"]:
                best[code] = (bt, r, label)

    for code, (bt, r, label) in best.items():
        path = OUT / f"chart_{code}.html"
        bt.plot(filename=str(path), open_browser=False, resample=False)
        print(f"차트 저장: {path.relative_to(ROOT)}  ({label})")

    for stock in site:
        stock["best"] = best[stock["code"]][2] if stock["code"] in best else None
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "cash": CASH, "commission": COMMISSION,
        "engine": "backtesting.py", "stocks": site, "errors": errors,
    }
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    (ROOT / "data" / "backtest.js").write_text(
        "// scripts/backtest.py 가 만든 파일입니다. 직접 고치지 마세요.\n"
        f"window.BACKTEST = {body};\n",
        encoding="utf-8",
    )

    table = pd.DataFrame(rows)
    table.to_csv(OUT / "results.csv", index=False, encoding="utf-8-sig")

    lines = [
        "# 이렇게 샀으면 얼마 벌었을까?",
        "",
        f"`scripts/backtest.py`가 {datetime.now(timezone.utc).isoformat(timespec='seconds')}에 실제로 돌린 결과입니다.",
        f"시작 돈 {CASH:,}원, 수수료+세금 {COMMISSION:.2%} (살 때·팔 때 각각), 신호는 종가 · 체결은 다음 날 시가.",
        "마지막 날까지 들고 있던 주식은 마지막 날 시가로 정리. 사고판 횟수 = 산 뒤 판 한 묶음을 1번으로 셈, 이긴 횟수 = 그중 수수료 빼고 돈을 번 횟수.",
        "",
    ]
    for code, name in STOCKS:
        if code in periods:
            s, e, n = periods[code]
            lines.append(f"- {name}({code}) 주가 {s} ~ {e}, {n}거래일")
    lines += [
        "",
        "| 종목 | 방법 | 수익률 | 1억 → | 최대 낙폭 | 사고판 횟수 | 이긴 횟수 | 첫 매수일 |",
        "|---|---|---:|---:|---:|---:|---:|---|",
    ]
    for r in rows:
        mark = " **(1등)**" if best.get(r["code"], (None, None, None))[2] == r["strategy"] else ""
        lines.append(
            f"| {r['name']} | {r['strategy']}{mark} | {r['return_pct']:+,.1f}% | {r['final_equity'] / 1e8:,.2f}억 "
            f"| {r['max_dd_pct']:.1f}% | {r['trades']} | {r['wins']} | {r['first_entry']} |"
        )
    lines += ["", "## 실행 실패", ""]
    lines += [f"- {e}" for e in errors] or ["- 없음 (18개 모두 실행됨)"]
    (OUT / "results.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    print("\n".join(lines))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
