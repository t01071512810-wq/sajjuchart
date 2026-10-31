# 사주 체력 종목

태어난 날·시간으로 사주를 계산해 부족한 오행을 찾고, 그 오행에 짝지은 업종에서 RS 80점 넘는 코스피 종목을 보여 줍니다.
사주는 재미용이고, 종목 숫자는 공개된 실제 데이터입니다. 투자 권유가 아닙니다.

## 실행

`index.html`을 바로 열어도 되고, 로컬 서버로 열어도 됩니다 (링크 복사는 서버로 열 때 잘 됩니다).

```bash
.venv/Scripts/python -m http.server 8765
```

## 배포 (Vercel)

빌드 없는 정적 사이트입니다. `vercel.json`이 프레임워크를 끄고(`"framework": null`) 폴더를 그대로 내보내며,
`.vercelignore`가 `scripts/`, `designs/`를 배포에서 뺍니다. 파이썬은 데이터를 만들 때만 쓰므로
`requirements.txt`는 `scripts/` 안에 둡니다 (맨 위에 두면 Vercel이 파이썬 서버로 착각합니다).

## 데이터 새로 받기

```bash
.venv/Scripts/python -m pip install -r scripts/requirements.txt
.venv/Scripts/python scripts/update_data.py
```

- RS 점수: [달리나음의 코스피 상대 강도](https://dalinaum.github.io/rs/) 피드에서 가장 최근 "코스피 상대강도" 글의 표만 읽습니다. 그 사이트의 코드는 쓰지 않습니다.
- 업종: [FinanceDataReader](https://github.com/FinanceData/FinanceDataReader) `StockListing('KRX-DESC')`의 `Industry` 열 (코스피 종목은 `Sector` 열이 비어 있음). 우선주는 보통주 업종을 따릅니다.
- 오행 ↔ 업종 짝짓기: `data/element_map.json`에서 고칠 수 있습니다. 짝이 없는 업종이 생기면 스크립트가 경고합니다.

## 신호 차트 (`chart.html`)

삼성전자(005930) 최근 5년 일봉에 세 가지 신호를 표시합니다. 신호마다 켜고 끌 수 있고, 표시를 누르면 그날 날짜·가격이 뜹니다.

- ▲ 5일선이 20일선을 아래에서 위로 뚫은 날
- ★ 종가가 직전 250거래일 최고가(고가 기준)를 넘긴 날. 직전 20거래일 안에 이미 넘긴 적이 없을 때만(처음 다시 넘긴 날만)
- W 쌍바닥: 두 바닥 저가 차이 3% 이내, 10~60거래일 간격, 가운데 고점이 첫 바닥보다 10% 이상. 두 번째 바닥 뒤 종가가 가운데 고점을 넘는 날 완성

기준 숫자는 `signals.js` 맨 위 `RULES`에서 고칠 수 있습니다. 주가 파일(`data/chart_005930.js`)은 이렇게 새로 받습니다.

```bash
.venv/Scripts/python scripts/update_chart.py
```

## 백테스트 ("이렇게 샀으면 얼마 벌었을까?")

삼성전자·SK하이닉스·NAVER에 여섯 가지 매매 방법을 [backtesting.py](https://github.com/kernc/backtesting.py)로 돌립니다.
신호는 종가, 체결은 다음 날 시가, 수수료+세금 0.25%(살 때·팔 때 각각). 방법과 규칙은 `scripts/backtest.py` 맨 위 설명에 있습니다.

```bash
.venv/Scripts/python scripts/backtest.py
```

결과 표는 `backtest/results.md`, 종목별 1등 방법의 사고판 자리 차트는 `backtest/chart_<코드>.html`에 저장됩니다.
같은 결과를 `data/backtest.js`로도 저장해, 사이트의 **전략 비교** 페이지(`backtest.html`)가 읽습니다.
종목을 고르고 표에서 방법을 누르면 그 방법으로 사고판 자리(▲ 산 날, ▼ 판 날)와 들고 있던 기간이 차트에 칠해지고,
사고판 내역 한 줄을 누르면 그 구간으로 확대됩니다.

## 디자인 고르기

맨 위 메뉴에서 기본 / Revolut / Coinbase / Wise / Binance 느낌을 고를 수 있고, 고른 값은 브라우저(localStorage)에 남습니다.

- 원본 설명서: `designs/<이름>/DESIGN.md` ([awesome-design-md](https://github.com/VoltAgent/awesome-design-md), MIT)
- 옮긴 토큰(색·글씨체·모서리·버튼): `designs.css`. 기본 토큰은 `style.css` 맨 위 `:root`
- 상승 빨강 / 하락 파랑(`--up` / `--down`)은 모든 디자인에서 고정
- 각 회사의 전용 글꼴은 공개되어 있지 않아, 설명서가 권하는 대체 글꼴(Inter, JetBrains Mono)과 한글용 Pretendard를 씁니다.

## 사용한 것

- [ssaju](https://github.com/golbin/ssaju) v0.2.0 (MIT) → `vendor/ssaju.js` (npm 빌드본을 전역 스크립트로 감쌈)
- [html2canvas](https://html2canvas.hertzen.com/) 1.4.1 (MIT) → 자랑 카드 그림 저장
- [TradingView Lightweight Charts™](https://github.com/tradingview/lightweight-charts) 4.2.3 (Apache-2.0) → `vendor/lightweight-charts.standalone.production.js`, 신호 차트
