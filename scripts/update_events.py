#!/usr/bin/env python3
"""
이벤트 변동성 경보용 실적 발표 일정 → studio/events.json

- 대상: 미국 7사(AAPL·MSFT·GOOGL·AMZN·META·NVDA·TSLA) + 삼성전자. 일정은 야후파이낸스 예정일(yfinance)이며 회사 공시 전까지 바뀔 수 있다.
- 경보(alert) 대상은 2023.10~2026.11 이벤트 스터디(발표 전날 종가→다음날 종가, 평소 2일 변동 대비 배수)에서 정한다.
    · 미국 7사 61개 발표일: 나스닥100 1.29배(p=0.010), 반도체지수 1.24배(p=0.014). 2025.3.20~5.15 제외해도 동일.
    · 삼성전자: 반도체지수 1.37배(제외 시 1.49배). 코스피는 유의하지 않아 표시하지 않음.
    · 종목별 배수는 표본 12~13건 참고값. 분기마다 재검증.
- 방향(상승·하락) 신호는 없다. 매수 신호(확대·기본·축소)와 수량에는 반영하지 않고, 경보 기간(D-1~D+1)에는 분할 매수 시점 안내에만 쓴다.
- 조회 실패한 종목은 기존 일정을 유지한다(추정값으로 채우지 않음).
출력: changed=true|false
"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
OUT = os.environ.get("EVENTS_JSON", "studio/events.json")
# ticker: (표시명, 지역, 경보 대상, 나스닥100 배수, 반도체지수 배수)
WATCH = {
    "AAPL": ("애플", "US", True, 1.75, 1.61),
    "AMZN": ("아마존", "US", True, 1.80, 1.82),
    "GOOGL": ("알파벳", "US", True, 1.41, 1.14),
    "005930.KS": ("삼성전자", "KR", True, None, 1.37),
    "NVDA": ("엔비디아", "US", False, 0.85, 0.92),
    "MSFT": ("마이크로소프트", "US", False, 0.96, 1.09),
    "META": ("메타", "US", False, 1.08, 1.13),
    "TSLA": ("테슬라", "US", False, 1.20, 1.07),
}


def log(m):
    print(m, file=sys.stderr)


def upcoming(ticker, region, today):
    import yfinance as yf  # noqa: PLC0415
    d = yf.Ticker(ticker).get_earnings_dates(limit=8)
    d = d[d["Reported EPS"].isna()]
    tz = "America/New_York" if region == "US" else "Asia/Seoul"
    out = []
    for ts in d.index:
        dt = ts.tz_convert(tz).date()
        if today - timedelta(days=3) <= dt <= today + timedelta(days=150):
            out.append(dt.isoformat())
    return sorted(set(out))


def main():
    today = datetime.now(KST).date()
    try:
        old = json.load(open(OUT, encoding="utf-8"))
    except Exception:  # noqa: BLE001
        old = {}
    keep = {}
    for e in old.get("events", []):
        keep.setdefault(e["t"], []).append(e["date"])
    events = []
    for t, (name, region, alert, ndx, sox) in WATCH.items():
        try:
            ds = upcoming(t, region, today)
        except Exception as e:  # noqa: BLE001
            log(f"{t} 조회 실패 — 기존 일정 유지: {e}")
            ds = keep.get(t, [])
        events += [{"t": t, "date": x} for x in ds]
    events.sort(key=lambda e: (e["date"], e["t"]))
    out = {
        "rule": "발표 D-1~D+1 변동성 경보. 방향 신호 없음, 매수 신호·수량에는 반영하지 않음",
        "basis": "2023.10~2026.11 이벤트 스터디: 미국 7사 61개 발표일 나스닥100 1.29배·반도체지수 1.24배, 삼성전자 반도체지수 1.37배(평소 2일 변동 대비)",
        "note": "일정은 예정일이며 회사 공시 전까지 바뀔 수 있음. 종목별 배수는 표본 12~13건 참고값",
        "watch": {t: {"name": n, "alert": a, "ndx": nd, "sox": sx} for t, (n, r, a, nd, sx) in WATCH.items()},
        "events": events,
    }
    prev = {k: v for k, v in old.items() if k != "updated"}
    changed = prev != out
    if changed:
        out["updated"] = datetime.now(KST).strftime("%Y-%m-%d %H:%M KST")
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
            f.write("\n")
    log(f"events {len(events)}건 changed={changed}")
    print(f"changed={'true' if changed else 'false'}")


if __name__ == "__main__":
    main()
