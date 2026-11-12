#!/usr/bin/env python3
"""
월배당 분배 일정·금액을 운용사 공시에서 모아 한 파일로 만든다 → studio/dividends.json, studio/dividends.js

이 파일 하나를 Studio(분배 달력·다음 지급)와 월배당 안내 페이지(/monthly/)가 함께 읽는다.

출처(우선순위 순)
- KODEX: 삼성자산운용 분배금 공지(표) → 금액·분배율. 지급 뒤에는 '분배금 현황' API 의 실제 기준일·지급일로 확정.
- ACE  : 한국투자신탁운용 공지 API(표) → 금액·분배율.
- SOL  : 신한자산운용 공지 API → 공지에 걸린 네이버 블로그 본문(일정표·금액표).
- 그 밖(PLUS 등)·공시를 못 읽은 경우: 야후파이낸스 배당락 기록(배당락 뒤에 금액이 잡힘).
날짜는 공시에서 읽지 못하면 규칙으로 계산해 est=true(예정)로 둔다.
  기준일 = 15일(중간)·말일(월말) 또는 그 직전 영업일, 매수 마감 = 기준일 2영업일 전, 지급 = 기준일 2영업일 뒤(SOL 은 1영업일 뒤)
조회에 실패한 항목은 추정하지 않고 이전 값을 그대로 둔다. 한 번 들어간 기록은 지우지 않는다.

출력: div_changed=true|false (GITHUB_OUTPUT 용). stdlib 만 사용.
"""
import html
import json
import os
import re
import sys
import time
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from update_better7_prices import KST, from_yahoo, http_get, log  # noqa: E402

OUT_JSON = os.environ.get("DIV_OUT", "studio/dividends.json")
OUT_JS = os.path.splitext(OUT_JSON)[0] + ".js"
BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
MOBILE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"

# code: (전체 이름, Studio 표시 이름, 운용사, 주기 mid|end)
ETF = {
    "498400": ("KODEX 200타겟위클리커버드콜", "KODEX 200타겟위클리커버드콜", "KODEX", "mid"),
    "480030": ("ACE 미국500데일리타겟커버드콜(합성)", "ACE 미국500커버드콜", "ACE", "mid"),
    "441640": ("KODEX 미국배당커버드콜액티브", "KODEX 미국배당커버드콜", "KODEX", "mid"),
    "494300": ("KODEX 미국나스닥100데일리커버드콜OTM", "KODEX 미국나스닥100커버드콜", "KODEX", "end"),
    "0022T0": ("SOL 국제금커버드콜액티브", "SOL 국제금커버드콜", "SOL", "end"),
    "473330": ("SOL 미국30년국채커버드콜(합성)", "SOL 미국30년국채커버드콜", "SOL", "end"),
    "332610": ("PLUS 미국단기회사채(AAA~A)", "PLUS 미국단기회사채", "PLUS", "end"),
    # Ver.6 에서만 쓰는 종목 (월배당 안내 계산기용)
    "475080": ("KODEX 테슬라커버드콜채권혼합액티브", "KODEX 테슬라커버드콜채권혼합", "KODEX", "end"),
    "481060": ("KODEX 미국30년국채타겟커버드콜(합성 H)", "KODEX 미국30년국채타겟커버드콜", "KODEX", "mid"),
}
SOL_NAMES = {"국제금커버드콜": "0022T0", "미국30년국채커버드콜(합성)": "473330"}
# KRX 휴장일(평일). 해가 바뀌면 추가.
HOL = {"2026-10-05", "2026-10-09", "2026-12-25", "2026-12-31", "2027-01-01"}


def biz(d):
    return d.weekday() < 5 and d.isoformat() not in HOL


def add_biz(d, n):
    step = 1 if n > 0 else -1
    while n:
        d += timedelta(days=step)
        if biz(d):
            n -= step
    return d


def on_or_before(d):
    while not biz(d):
        d -= timedelta(days=1)
    return d


def rule_dates(code, ym, cyc):
    y, m = int(ym[:4]), int(ym[5:])
    base = date(y, m, 15) if cyc == "mid" else (date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1))
    rec = on_or_before(base)
    return add_biz(rec, -2), rec, add_biz(rec, 1 if ETF[code][2] == "SOL" else 2)


def text_of(h):
    h = re.sub(r"<script.*?</script>|<style.*?</style>", " ", h, flags=re.S)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h))).replace("​", "")


def num(s):
    return int(s.replace(",", ""))


class Book:
    def __init__(self, prev):
        self.ev = {(e["code"], e["ym"]): dict(e) for e in prev.get("ev", [])}

    def get(self, code, ym):
        k = (code, ym)
        if k not in self.ev:
            buy, rec, pay = rule_dates(code, ym, ETF[code][3])
            self.ev[k] = {"code": code, "ym": ym, "cyc": ETF[code][3], "buy": buy.isoformat(), "rec": rec.isoformat(),
                          "pay": pay.isoformat(), "amt": None, "rate": None, "est": True, "src": ""}
        return self.ev[k]

    def put(self, code, ym, amt=None, rate=None, buy=None, rec=None, pay=None, src="", final=False):
        if code not in ETF:
            return
        e = self.get(code, ym)
        if e.get("final") and not final:      # 지급 확정된 기록은 공지·야후 값으로 덮지 않는다
            return
        if amt is not None:
            e["amt"] = int(amt)
        if rate is not None:
            e["rate"] = round(float(rate), 2)
        if rec:
            e["rec"] = rec
            if not buy:
                e["buy"] = add_biz(date.fromisoformat(rec), -2).isoformat()
        if buy:
            e["buy"] = buy
        if pay:
            e["pay"] = pay
        if rec and pay:
            e["est"] = False
        if src:
            e["src"] = src
        if final:
            e["final"] = True

    def out(self):
        return sorted(self.ev.values(), key=lambda e: (e["rec"], e["code"]))


# ── 운용사별 수집 ─────────────────────────────────────────────────────────────
def kodex(book, today):
    try:
        _kodex_notices(book)
    except Exception as e:  # noqa: BLE001
        log(f"[warn] kodex notice: {e}")
    _kodex_paid(book, today)


def _kodex_notices(book):
    lst = http_get("https://www.samsungfund.com/etf/lounge/notice.do?category=DIVIDEND", ua=BROWSER)
    seen = 0
    for no, title in re.findall(r'notice-view\.do\?no=(\d+)"[^>]*>\s*<h3[^>]*>\s*(.*?)\s*</h3>', lst, re.S):
        m = re.search(r"['’]?(\d{2})\.(\d{1,2})월_(월중|월말)배당", html.unescape(title))
        if not m:
            continue
        ym, cyc = f"20{m.group(1)}-{int(m.group(2)):02d}", ("mid" if m.group(3) == "월중" else "end")
        url = f"https://www.samsungfund.com/etf/lounge/notice-view.do?no={no}"
        time.sleep(3)                      # 삼성자산운용은 연달아 부르면 429 를 낸다
        t = text_of(http_get(url, ua=BROWSER))
        for code, rate, amt in re.findall(r"\b([0-9A-Z]{6})\s+KODEX.{2,60}?ETF\s+([\d.]+)\s+([\d,]+)\b", t):
            if code in ETF and ETF[code][3] == cyc:
                book.put(code, ym, amt=num(amt), rate=rate, src=url)
        seen += 1
        if seen >= 2:
            break


def _kodex_paid(book, today):
    # 지급된 뒤: 실제 기준일·지급일·금액으로 확정
    for code, v in ETF.items():
        if v[2] != "KODEX":
            continue
        try:
            time.sleep(3)
            j = json.loads(http_get("https://www.samsungfund.com/api/v1/kodex/distribution.do?pageNo=1&ordrColm=DIVID_Y"
                                    f"&period=3&ordrSort=DESC&srchVal={code}", ua=BROWSER))
            for r in j.get("dividList") or []:
                if r.get("stkTicker") != code or not r.get("basicD") or not r.get("payD") or not r.get("dividA"):
                    continue
                rec = f"{r['basicD'][:4]}-{r['basicD'][4:6]}-{r['basicD'][6:]}"
                pay = f"{r['payD'][:4]}-{r['payD'][4:6]}-{r['payD'][6:]}"
                if (today - date.fromisoformat(rec)).days > 120:
                    continue
                book.put(code, rec[:7], amt=num(r["dividA"]), rate=r.get("dividY"), rec=rec, pay=pay,
                         final=True)   # src 는 공지 링크 그대로 둔다
        except Exception as e:  # noqa: BLE001
            log(f"[warn] kodex dist {code}: {e}")


def ace(book, today):  # noqa: ARG001
    j = json.loads(http_get("https://papi.aceetf.co.kr/api/notices?categoryNo=&page=1&searchValue=%EB%B6%84%EB%B0%B0%EA%B8%88&size=12&fundCd=", ua=BROWSER))
    n = 0
    for it in j.get("data") or []:
        m = re.search(r"(\d{4})년\s*(\d{1,2})월\s*분배금 안내", it.get("title", ""))
        if not m:
            continue
        ym = f"{m.group(1)}-{int(m.group(2)):02d}"
        d = json.loads(http_get(f"https://papi.aceetf.co.kr/api/notices/{it['id']}", ua=BROWSER))
        t = text_of((d.get("current") or {}).get("content", ""))
        url = f"https://www.aceetf.co.kr/cs/notice/{it['id']}"
        for code, amt, rate in re.findall(r"\b(\d{6})\s+([\d,]+)\s+([\d.]+)\b", t):
            if code in ETF:
                book.put(code, ym, amt=num(amt), rate=rate, src=url)
        n += 1
        if n >= 4:
            break


def sol(book, today):
    j = json.loads(http_get("https://www.soletf.com/api/cs/notice?pageNo=1&pageSize=20&page=1", ua=BROWSER))
    done, n = set(), 0
    for it in j.get("items") or []:
        if it.get("NO") in done or "분배금 안내" not in it.get("TITLE", ""):
            continue
        done.add(it.get("NO"))
        b = re.search(r"blog\.naver\.com/soletf/(\d+)", it.get("CONTENT", ""))
        if not b:
            continue
        url = f"https://blog.naver.com/soletf/{b.group(1)}"
        t = text_of(http_get(f"https://m.blog.naver.com/soletf/{b.group(1)}", ua=MOBILE))
        reg = datetime.strptime(it["REG_DATE"][:10], "%Y-%m-%d").date()

        def md(label):
            m = re.search(label + r"\s*(\d{1,2})월\s*(\d{1,2})일", t)
            if not m:
                return None
            mo, dd = int(m.group(1)), int(m.group(2))
            y = reg.year + (1 if mo < reg.month - 6 else 0) - (1 if mo > reg.month + 6 else 0)
            return date(y, mo, dd).isoformat()

        buy, rec, pay = md("매수 기준일"), md("지급 기준일"), md("지급 예정일")
        if not rec:
            continue
        i = t.find("분배금 내역")
        for name, amt, rate in re.findall(r"\d+\s+(SOL\s.+?)\s+([\d,]+)\s+(\d+\.\d+)(?=\s)", t[i:] if i >= 0 else t):
            for key, code in SOL_NAMES.items():
                if key in name.replace(" ", ""):
                    book.put(code, rec[:7], amt=num(amt), rate=rate, buy=buy, rec=rec, pay=pay, src=url)
        n += 1
        if n >= 4:
            break


def yahoo_fill(book, today):
    """공시를 못 읽은 종목: 배당락이 지난 뒤 야후 기록으로 금액만 채운다(날짜는 규칙·예정 그대로)."""
    for (code, ym), e in list(book.ev.items()):
        if e.get("amt") is not None or date.fromisoformat(e["rec"]) > today:
            continue
        try:
            for d, amt in from_yahoo(code)["divs"] or []:
                if abs((d - date.fromisoformat(e["rec"])).days) <= 4:
                    book.put(code, ym, amt=round(amt), src="https://finance.yahoo.com/quote/%s.KS" % code)
        except Exception as ex:  # noqa: BLE001
            log(f"[warn] yahoo div {code}: {ex}")


def main():
    today = datetime.now(KST).date()
    try:
        prev = json.load(open(OUT_JSON, encoding="utf-8"))
    except Exception:  # noqa: BLE001
        prev = {}
    book = Book(prev)
    # 이번 달과 다음 달 일정 뼈대(공시 전에도 매수 마감·기준일을 보여 주기 위해)
    for k in (-2, -1, 0, 1):
        t0 = today.year * 12 + today.month - 1 + k
        y, m = t0 // 12, t0 % 12 + 1
        for code in ETF:
            book.get(code, f"{y}-{m:02d}")
    failed = []
    for name, fn in (("KODEX", kodex), ("ACE", ace), ("SOL", sol), ("yahoo", yahoo_fill)):
        try:
            fn(book, today)
        except Exception as e:  # noqa: BLE001
            failed.append(name)
            log(f"[warn] {name}: {e}")
    try:                          # 분배율을 못 읽은 종목은 최근 종가로 계산 (Better.7 종목만)
        pj = json.load(open("better7_prices.json", encoding="utf-8"))
        px = dict(zip(pj["codes"], pj["prices"]))
        for e in book.ev.values():
            if e["amt"] is not None and e.get("rate") is None and px.get(e["code"]):
                e["rate"] = round(e["amt"] / px[e["code"]] * 100, 2)
    except Exception as ex:  # noqa: BLE001
        log(f"[warn] rate fallback: {ex}")
    for e in book.ev.values():   # 지급일이 지났고 금액이 있으면 '예정' 표시를 뗀다
        if e["est"] and e["amt"] is not None and date.fromisoformat(e["pay"]) < today:
            e["est"] = False
    ev = book.out()
    etf = {c: {"name": v[0], "short": v[1], "brand": v[2], "cyc": v[3]} for c, v in ETF.items()}
    changed = ev != prev.get("ev") or etf != prev.get("etf")
    if changed:
        out = {"updated": datetime.now(KST).strftime("%Y-%m-%d %H:%M"), "hol": sorted(HOL), "etf": etf, "ev": ev}
        s = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
        with open(OUT_JSON, "w", encoding="utf-8") as f:
            f.write(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
        with open(OUT_JS, "w", encoding="utf-8") as f:
            f.write("/* 자동 생성: scripts/update_dividends.py — 직접 고치지 말 것 */\nwindow.__DIV=" + s + ";\n")
    log(f"[dividends] events={len(ev)} with_amount={sum(1 for e in ev if e['amt'] is not None)} failed={','.join(failed) or 'none'} changed={changed}")
    print(f"div_changed={'true' if changed else 'false'}")


if __name__ == "__main__":
    main()
