"""최신 코스피 상대강도(RS) 점수와 KRX-DESC 업종을 합쳐 data/data.js를 만듭니다.

- RS 점수: https://dalinaum.github.io/rs/ 에 공개된 '코스피 상대강도' 글의 표만 읽습니다 (그 사이트의 코드는 쓰지 않음).
- 업종: FinanceDataReader의 StockListing('KRX-DESC') → KOSPI 종목의 Industry 열.

실행:  .venv/Scripts/python scripts/update_data.py
"""

import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

import FinanceDataReader as fdr

ROOT = Path(__file__).resolve().parent.parent
FEED_URL = "https://dalinaum.github.io/rs/feed.xml"
SITE_URL = "https://dalinaum.github.io/rs/"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "saju-stock-lab/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8")


def latest_kospi_post():
    """피드에서 가장 최근 '코스피 상대강도 YYYY년 M월 D일' 글을 찾습니다."""
    feed = fetch(FEED_URL)
    for title, link in re.findall(
        r'<entry><title type="html">([^<]+)</title><link href="([^"]+)"', feed
    ):
        m = re.fullmatch(r"코스피 상대강도 (\d{4})년 (\d{1,2})월 (\d{1,2})일", title.strip())
        if m:
            y, mo, d = map(int, m.groups())
            return {"title": title.strip(), "url": link, "date": f"{y:04d}-{mo:02d}-{d:02d}"}
    sys.exit("피드에서 코스피 상대강도 글을 찾지 못했습니다.")


class TableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self._row, self._cell, self._in_td = [], None, "", False

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self._row = []
        elif tag == "td" and self._row is not None:
            self._in_td, self._cell = True, ""

    def handle_endtag(self, tag):
        if tag == "td" and self._in_td:
            self._row.append(self._cell.strip())
            self._in_td = False
        elif tag == "tr" and self._row is not None:
            if self._row:
                self.rows.append(self._row)
            self._row = None

    def handle_data(self, data):
        if self._in_td:
            self._cell += data


def parse_rs(html):
    p = TableParser()
    p.feed(html)
    out = []
    for cells in p.rows:
        if len(cells) != 6:
            continue
        code, name, _prev, close, ret, rs = cells
        m = re.match(r"(\d+)", rs)
        if not m:
            continue
        out.append({
            "code": code,
            "name": name,
            "close": int(close.replace(",", "")) if close.replace(",", "").isdigit() else None,
            "ret": ret,
            "rs": int(m.group(1)),
        })
    return out


def main():
    post = latest_kospi_post()
    print(f"RS 글: {post['title']}  {post['url']}")
    rs_rows = parse_rs(fetch(post["url"]))
    print(f"RS 종목 수: {len(rs_rows)}")

    desc = fdr.StockListing("KRX-DESC")
    kospi = desc[desc["Market"] == "KOSPI"]
    industry = {
        row.Code: row.Industry
        for row in kospi.itertuples()
        if isinstance(row.Industry, str) and row.Industry.strip()
    }

    groups = json.loads((ROOT / "data" / "element_map.json").read_text(encoding="utf-8"))["groups"]
    ind_to_el = {ind: g["element"] for g in groups for ind in g["industries"]}
    unmapped = sorted(set(industry.values()) - set(ind_to_el))
    if unmapped:
        print("⚠ 오행 짝이 없는 업종:", unmapped)

    no_industry = 0
    for r in rs_rows:
        ind = industry.get(r["code"])
        # 우선주는 KRX-DESC에 없어서 보통주(코드 앞 5자리 + '0')의 업종을 빌려 씁니다.
        if ind is None and "우" in r["name"]:
            ind = industry.get(r["code"][:5] + "0")
            if ind:
                r["pref"] = True
        r["industry"] = ind
        r["element"] = ind_to_el.get(ind)
        if ind is None:
            no_industry += 1
    print(f"업종 못 찾은 종목: {no_industry}")

    data = {
        "rs": {
            "site": SITE_URL,
            "title": post["title"],
            "url": post["url"],
            "date": post["date"],
        },
        "industrySource": {
            "name": "FinanceDataReader StockListing('KRX-DESC')",
            "url": "https://github.com/FinanceData/FinanceDataReader",
            "fdrVersion": fdr.__version__,
        },
        "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "elementMap": groups,
        "stocks": rs_rows,
    }
    js = "// scripts/update_data.py 가 만든 파일입니다. 직접 고치지 마세요.\nwindow.STOCK_DATA = " + json.dumps(
        data, ensure_ascii=False, separators=(",", ":")
    ) + ";\n"
    (ROOT / "data" / "data.js").write_text(js, encoding="utf-8")
    print("data/data.js 저장 완료")


if __name__ == "__main__":
    main()
