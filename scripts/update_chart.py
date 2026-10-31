"""삼성전자(005930)의 최근 5년 일봉을 받아 신호 차트용 data/chart_005930.js 를 만듭니다.

- 주가: FinanceDataReader의 DataReader('005930', 시작일) → 날짜·시가·고가·저가·종가·거래량.
- 신호(▲ ★ W)는 여기서 계산하지 않고 signals.js 가 브라우저에서 계산합니다.

실행:  .venv/Scripts/python -m pip install -r scripts/requirements.txt
      .venv/Scripts/python scripts/update_chart.py
"""

import json
from datetime import date, datetime, timezone
from pathlib import Path

import FinanceDataReader as fdr

ROOT = Path(__file__).resolve().parent.parent
CODE = "005930"
NAME = "삼성전자"
YEARS = 5


def main():
    today = date.today()
    try:
        start = today.replace(year=today.year - YEARS)
    except ValueError:  # 2월 29일
        start = today.replace(year=today.year - YEARS, day=28)

    df = fdr.DataReader(CODE, start.isoformat())
    df = df[(df["Volume"] > 0) & (df["Close"] > 0)]  # 거래정지일 등 빈 줄 제외

    bars = [
        [d.strftime("%Y-%m-%d"), int(r.Open), int(r.High), int(r.Low), int(r.Close), int(r.Volume)]
        for d, r in df.iterrows()
    ]
    if len(bars) < 300:
        raise SystemExit(f"받은 일봉이 너무 적습니다: {len(bars)}개")

    out = {
        "code": CODE,
        "name": NAME,
        "source": {"name": "FinanceDataReader DataReader", "url": "https://github.com/FinanceData/FinanceDataReader", "fdrVersion": fdr.__version__},
        "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "columns": ["date", "open", "high", "low", "close", "volume"],
        "bars": bars,
    }
    body = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    path = ROOT / "data" / f"chart_{CODE}.js"
    path.write_text(
        "// scripts/update_chart.py 가 만든 파일입니다. 직접 고치지 마세요.\n"
        f"window.CHART_DATA = {body};\n",
        encoding="utf-8",
    )
    print(f"{NAME}({CODE}) 일봉 {len(bars)}개 ({bars[0][0]} ~ {bars[-1][0]}) → {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
