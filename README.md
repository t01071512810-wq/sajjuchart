# 사주 체력 종목

태어난 날·시간으로 사주를 계산해 부족한 오행을 찾고, 그 오행에 짝지은 업종에서 RS 80점 넘는 코스피 종목을 보여 줍니다.
사주는 재미용이고, 종목 숫자는 공개된 실제 데이터입니다. 투자 권유가 아닙니다.

## 실행

`index.html`을 바로 열어도 되고, 로컬 서버로 열어도 됩니다 (링크 복사는 서버로 열 때 잘 됩니다).

```bash
.venv/Scripts/python -m http.server 8765
```

## 데이터 새로 받기

```bash
.venv/Scripts/python scripts/update_data.py
```

- RS 점수: [달리나음의 코스피 상대 강도](https://dalinaum.github.io/rs/) 피드에서 가장 최근 "코스피 상대강도" 글의 표만 읽습니다. 그 사이트의 코드는 쓰지 않습니다.
- 업종: [FinanceDataReader](https://github.com/FinanceData/FinanceDataReader) `StockListing('KRX-DESC')`의 `Industry` 열 (코스피 종목은 `Sector` 열이 비어 있음). 우선주는 보통주 업종을 따릅니다.
- 오행 ↔ 업종 짝짓기: `data/element_map.json`에서 고칠 수 있습니다. 짝이 없는 업종이 생기면 스크립트가 경고합니다.

## 디자인 고르기

맨 위 메뉴에서 기본 / Revolut / Coinbase / Wise / Binance 느낌을 고를 수 있고, 고른 값은 브라우저(localStorage)에 남습니다.

- 원본 설명서: `designs/<이름>/DESIGN.md` ([awesome-design-md](https://github.com/VoltAgent/awesome-design-md), MIT)
- 옮긴 토큰(색·글씨체·모서리·버튼): `designs.css`. 기본 토큰은 `style.css` 맨 위 `:root`
- 상승 빨강 / 하락 파랑(`--up` / `--down`)은 모든 디자인에서 고정
- 각 회사의 전용 글꼴은 공개되어 있지 않아, 설명서가 권하는 대체 글꼴(Inter, JetBrains Mono)과 한글용 Pretendard를 씁니다.

## 사용한 것

- [ssaju](https://github.com/golbin/ssaju) v0.2.0 (MIT) → `vendor/ssaju.js` (npm 빌드본을 전역 스크립트로 감쌈)
- [html2canvas](https://html2canvas.hertzen.com/) 1.4.1 (MIT) → 자랑 카드 그림 저장
