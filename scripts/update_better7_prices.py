#!/usr/bin/env python3
"""
Better.7 ETF 시세 자동 갱신 스크립트 (GitHub Actions에서 평일 하루 3회 실행)

- 07:50 KST: 직전 거래일 종가        → date = 직전 거래일, source "야후파이낸스 종가 · ..."
- 12:50 KST: 당일 장중 현재가        → date = 당일,       source "야후파이낸스 장중 HH:MM · ..."
- 15:50 KST: 당일 종가(15:30 마감 후) → date = 당일,       source "야후파이낸스 종가 · ..."
- 휴장일(주말·공휴일): 가장 최근 거래일 종가. date/prices/dist 가 직전 파일과 같으면 파일을 건드리지 않음.

가격 소스: 1순위 야후파이낸스(종목코드.KS), 실패 시 구글파이낸스(종목코드:KRX). 둘 다 실패한 종목은
추정하지 않고 직전 값 유지 + pending 에 기록.
dist = 최근(배당락 기준) 월 분배금 / 가격 * 100 (%, 소수 2자리). 최근 100일 내 배당이 2회 미만인
종목(분기·연 1회 분배)은 0. 배당 정보를 못 가져오면 직전 dist 유지.

stdlib 만 사용.
"""
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
CODES = [
    "480030", "494300", "498400", "497570", "485690", "0036R0",
    "473330", "0022T0", "332610", "182480", "488770",
]
DEFAULT_PRICES = [9585, 8995, 21070, 22440, 22890, 20070, 7755, 12765, 122515, 13270, 105642]
DEFAULT_DIST = [2.03, 1.75, 1.47, 0, 0, 0, 0.8, 0.34, 0.30, 0.26, 0]
OUT = os.environ.get("BETTER7_OUT", "better7_prices.json")
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128 Safari/537.36",
      "Accept": "application/json,text/html,*/*"}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def http_get(url, tries=2, timeout=30):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", "ignore")
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError(f"GET failed {url}: {last}")


def from_yahoo(code):
    last = None
    for host in ("query1.finance.yahoo.com", "query2.finance.yahoo.com"):
        try:
            url = (f"https://{host}/v8/finance/chart/{code}.KS"
                   f"?range=6mo&interval=1d&events=div&includePrePost=false")
            res = json.loads(http_get(url))["chart"]["result"][0]
            bars = [(datetime.fromtimestamp(t, KST).date(), float(c))
                    for t, c in zip(res["timestamp"], res["indicators"]["quote"][0]["close"]) if c is not None]
            if not bars:
                raise RuntimeError("empty bars")
            meta = res["meta"]
            divs = sorted((datetime.fromtimestamp(v["date"], KST).date(), float(v["amount"]))
                          for v in (res.get("events", {}).get("dividends", {}) or {}).values())
            ptime = datetime.fromtimestamp(meta["regularMarketTime"], KST) if meta.get("regularMarketTime") else None
            last_price = float(meta["regularMarketPrice"]) if meta.get("regularMarketPrice") else bars[-1][1]
            return {"last_date": bars[-1][0], "last_price": last_price, "bars": bars,
                    "ptime": ptime, "divs": divs, "src": "yahoo"}
        except Exception as e:  # noqa: BLE001
            last = e
    raise RuntimeError(f"yahoo {code}: {last}")


def from_google(code):
    h = http_get(f"https://www.google.com/finance/quote/{code}:KRX")
    # AF_initDataCallback 데이터: [["480030","KRX"],"이름",5,"KRW",[9595,-50,-0.518,...],null,9645,...,[1790580830],"Asia/Seoul"
    m = re.search(r'\["%s","KRX"\],"[^"]*",\d+,"KRW",\[([\d.]+),[-\d.]+,[-\d.]+[^\]]*\],null,([\d.]+|null).{0,200}?\[(\d{10})\]' % re.escape(code), h)
    if not m:
        raise RuntimeError(f"google {code}: pattern not found")
    price = float(m.group(1))
    prev_close = float(m.group(2)) if m.group(2) != "null" else None
    ptime = datetime.fromtimestamp(int(m.group(3)), KST)
    return {"last_date": ptime.date(), "last_price": price, "bars": None, "prev_close": prev_close,
            "ptime": ptime, "divs": None, "src": "google"}


def fetch(code):
    try:
        return from_yahoo(code)
    except Exception as e:  # noqa: BLE001
        log(f"[warn] {e} → google fallback")
    return from_google(code)


def load_prev():
    try:
        with open(OUT, encoding="utf-8") as f:
            j = json.load(f)
        if len(j.get("prices", [])) == 11 and len(j.get("dist", [])) == 11:
            return j
    except Exception as e:  # noqa: BLE001
        log(f"[warn] prev json unreadable: {e}")
    return {"date": "", "prices": DEFAULT_PRICES[:], "dist": DEFAULT_DIST[:], "source": "", "pending": []}


def monthly_dist(divs, price, ref_date):
    recent = [d for d in divs if 0 <= (ref_date - d[0]).days <= 100]
    if len(recent) < 2 or not price:
        return 0
    return round(recent[-1][1] / price * 100, 2)


def main():
    now = datetime.now(KST)
    today = now.date()
    prev = load_prev()
    log(f"now KST {now:%Y-%m-%d %H:%M}, prev date {prev.get('date')}")

    data = {}
    for c in CODES:
        try:
            data[c] = fetch(c)
            log(f"[ok] {c} {data[c]['src']} {data[c]['last_date']} {data[c]['last_price']}")
        except Exception as e:  # noqa: BLE001
            log(f"[error] {c}: {e}")
            data[c] = None

    last_dates = [d["last_date"] for d in data.values() if d]
    if not last_dates:
        log("[fatal] no market data at all — nothing written")
        return 2
    ref_date = max(set(last_dates), key=last_dates.count)  # 종목별 최근 거래일의 최빈값

    in_session = ref_date == today and (9, 0) <= (now.hour, now.minute) < (15, 35)
    mode = "intraday" if in_session else "close"

    prices, dist, pending, ptimes, google_used = [], [], [], [], []
    for i, c in enumerate(CODES):
        d = data[c]
        price = None
        if d:
            if mode == "intraday":
                if d["ptime"] and d["ptime"].date() == today:
                    price = d["last_price"]
                    ptimes.append(d["ptime"])
            else:
                if d["bars"]:
                    cands = [b for b in d["bars"] if b[0] <= ref_date]
                    if cands:
                        price = cands[-1][1]
                        if cands[-1][0] != ref_date:
                            log(f"[info] {c}: no bar on {ref_date}, using {cands[-1][0]} close")
                elif d["last_date"] <= ref_date:
                    price = d["last_price"]
                elif d.get("prev_close"):
                    price = d["prev_close"]  # 오늘 봉이 잡혔지만 종가 모드가 아닌 경우(09:00 이전 비정상) 대비
        if price is None or price <= 0:
            log(f"[pending] {c}: keep previous {prev['prices'][i]}")
            prices.append(int(prev["prices"][i]))
            dist.append(prev["dist"][i])
            pending.append(c)
            continue
        p = int(round(price))
        prices.append(p)
        dist.append(monthly_dist(d["divs"], p, ref_date) if d["divs"] is not None else prev["dist"][i])
        if d["src"] == "google":
            google_used.append(c)

    if mode == "intraday" and ptimes:
        label = f"야후파이낸스 장중 {max(ptimes):%H:%M}"
    else:
        label = "야후파이낸스 종가"
    if google_used:
        label += f" (구글파이낸스 보조: {','.join(google_used)})"
    out = {
        "date": ref_date.isoformat(),
        "prices": prices,
        "dist": dist,
        "source": f"{label} · {now:%Y-%m-%d %H:%M} KST 조회",
        "pending": pending,
    }
    assert len(out["prices"]) == 11 and all(isinstance(x, int) and x > 0 for x in out["prices"])
    assert len(out["dist"]) == 11

    if (out["date"] == prev.get("date") and out["prices"] == prev.get("prices")
            and out["dist"] == prev.get("dist")):
        log(f"[skip] same date/prices/dist as previous ({out['date']}) — file untouched")
        print("changed=false")
        return 0

    with open(OUT, "w", encoding="utf-8") as f:
        f.write(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")
    log(json.dumps(out, ensure_ascii=False))
    print("changed=true")
    print(f"mode={mode}")
    print(f"date={out['date']}")
    print(f"pending={','.join(pending) or 'none'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
