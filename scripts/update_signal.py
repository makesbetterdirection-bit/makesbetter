#!/usr/bin/env python3
"""
Better.7 매일 신호 — studio/indicators.js(24개 지표) + 기초지수 가격 위치 → studio/signal.json

- 규칙은 스튜디오 화면의 판정 규칙과 같다(축 점수 → 우호/중립/비우호, 가격 위치 → 바닥권/보통/과열, 표로 합쳐 확대·기본·축소).
- 매일 계산한 값(raw)과 화면에 내는 값(sig)을 나눈다. sig 는 같은 raw 가 3거래일 연속일 때만 바뀐다(하루짜리 뒤집힘 방지).
- 지표가 24개 모두 있어야 계산한다. 하나라도 없으면 그날은 건너뛴다(추정 없음).
- history 는 지우지 않고 뒤에 붙인다. 이미 기록한 날짜는 고치지 않는다.
stdlib 만 사용.
"""
import json
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from update_better7_prices import KST, UAS, http_get, log  # noqa: E402

IND = os.environ.get("IND_OUT", "studio/indicators.js")
OUT = os.environ.get("SIG_OUT", "studio/signal.json")
HOLD = 3

# 지표 → 축 (가중치 w). 화면 SIG_IND 와 같은 구성.
AXIS = {
    "R": ["US2Y|美 2년물", "US10Y|美 10년물", "US30Y|美 30년물", "CPI|美 CPI", "FOMC|FOMC 인상 확률"],
    "SK": ["KOSPI|코스피", "VKOSPI|VKOSPI (국내 공포지수)", "FOREIGN|외국인 순매수 5일", "BREADTH|상승·하락 종목"],
    "SU": ["S&P500|S&P 500", "NASDAQ|나스닥 종합", "VIX|VIX (미국 공포지수)"],
    "A": ["SOX|반도체지수 20일선 대비", "SOX|반도체지수 추세"],
    "VK": ["VKOSPI|국내 옵션 프리미엄"],
    "VU": ["VIX|미국 옵션 프리미엄"],
    "G": ["GOLD|금 (COMEX 12월물)"],
    "C": ["IG OAS|美 우량 회사채 스프레드"],
    "F": ["USD/KRW|원/달러 52주 위치", "TRADE|무역수지", "FOREIGN|외국인 주식 매도 → 달러 수요",
          "KR-US|한미 기준금리차", "USD/KRW|원/달러 20일 변화", "DXY|달러인덱스"],
}
WEIGHT = {"USD/KRW|원/달러 52주 위치": 2}
ETFS = [  # code, 가격 규칙, 지수, 축 노출
    ("488770", "NONE", None, {"Q": 1}),
    ("473330", "NONE", None, {"R": 1.5, "Q": 1, "VU": 0.25, "F": 0.5}),
    ("332610", "NONE", None, {"R": 0.5, "C": 1, "Q": 0.5, "F": 0.5}),
    ("480030", "SPX", "S&P500", {"SU": 1, "R": 0.5, "VU": 0.25, "F": 0.5}),
    ("441640", "SPX", "S&P500", {"SU": 0.5, "R": 0.5, "VU": 0.25, "F": 0.5}),
    ("494300", "NDX", "NASDAQ100", {"SU": 1, "A": 1, "R": 0.5, "VU": 0.25, "F": 0.5}),
    ("498400", "KR", "KOSPI", {"SK": 1, "A": 0.5, "VK": 0.25}),
    ("0022T0", "GOLD", "GOLD", {"G": 1, "R": 0.5, "F": 0.5}),
    ("497570", "SOX", "SOX", {"A": 1.5, "SU": 1, "R": 0.5, "F": 0.5}),
    ("485690", "SOX", "SOX", {"A": 1.5, "SU": 1, "R": 0.5, "F": 0.5}),
    ("0036R0", "NDX", "NASDAQ100", {"A": 1, "SU": 1, "R": 0.5, "F": 0.5}),
]
SYM = {"KOSPI": "%5EKS11", "S&P500": "%5EGSPC", "NASDAQ100": "%5ENDX", "SOX": "%5ESOX", "GOLD": "GC=F"}
ZONE = {"KR": {"ratio": 50}, "SPX": {"rsi": 30, "dd": -15, "ratio": 50}, "NDX": {"rsi": 30, "dd": -15, "ratio": 40},
        "SOX": {"ratio": 50}, "GOLD": {"rsi": 30, "dd": -15}}
GRID = {"유리": {"보통": "강", "바닥권": "강", "과열": "중립"}, "중립": {"보통": "중립", "바닥권": "강", "과열": "보류"},
        "불리": {"보통": "보류", "바닥권": "중립", "과열": "보류"}}


def clip(v, a=-1.0, b=1.0):
    return max(a, min(b, v))


def rsi14(cl):
    g = l = 0.0
    for i in range(1, 15):
        d = cl[i] - cl[i - 1]
        g, l = g + max(d, 0), l + max(-d, 0)
    g, l = g / 14, l / 14
    for i in range(15, len(cl)):
        d = cl[i] - cl[i - 1]
        g, l = (g * 13 + max(d, 0)) / 14, (l * 13 + max(-d, 0)) / 14
    return 100.0 if l == 0 else 100 - 100 / (1 + g / l)


def daily(sym, years=26):
    import time
    now = int(time.time())
    last = None
    for ua in UAS:
        for host in ("query1.finance.yahoo.com", "query2.finance.yahoo.com"):
            try:
                url = f"https://{host}/v8/finance/chart/{sym}?period1={now - years * 366 * 86400}&period2={now}&interval=1d"
                res = json.loads(http_get(url, tries=1, ua=ua, timeout=60))["chart"]["result"][0]
                off = res["meta"].get("gmtoffset", 0)
                return [(datetime.utcfromtimestamp(t + off).date(), float(c))
                        for t, c in zip(res["timestamp"], res["indicators"]["quote"][0]["close"]) if c is not None]
            except Exception as e:  # noqa: BLE001
                last = e
    raise RuntimeError(f"yahoo {sym}: {last}")


def index_pos(name):
    bars = daily(SYM[name])
    cut = bars[-1][0] - timedelta(days=365 * 25 + 7)
    bars = [b for b in bars if b[0] >= cut]
    if len(bars) < 2500:
        raise RuntimeError(f"{name}: 25년 자료 부족({len(bars)})")
    peak, mdd = bars[0][1], 0.0
    for _, c in bars:
        peak = max(peak, c)
        mdd = min(mdd, c / peak - 1)
    dd = bars[-1][1] / peak - 1
    return {"close": round(bars[-1][1], 2), "dd": round(dd * 100, 1), "mdd": round(mdd * 100, 1),
            "ratio": round(dd / mdd * 100) if mdd else 0, "rsi": round(rsi14([c for _, c in bars[-300:]])),
            "date": bars[-1][0].isoformat()}


def stage(rule, x):
    if rule == "NONE":
        return "해당 없음"
    z = ZONE[rule]
    if rule not in ("KR", "SOX") and x["rsi"] >= 75:
        return "과열"
    hit = ("ratio" in z and x["ratio"] >= z["ratio"]) or ("dd" in z and x["dd"] <= z["dd"]) or ("rsi" in z and x["rsi"] <= z["rsi"])
    return "바닥권" if hit else "보통"


def main():
    txt = open(IND, encoding="utf-8").read()
    live = json.loads(txt[txt.index("{"):txt.rindex("}") + 1])
    ind = live["ind"]
    need = [k for ks in AXIS.values() for k in ks]
    miss = [k for k in need if k not in ind or k in (live.get("failed") or [])]
    if miss:
        log("지표 누락 — 신호 계산 건너뜀:", miss)
        print("signal_changed=false")
        return
    ax = {}
    for a, ks in AXIS.items():
        s = sum(WEIGHT.get(k, 1) * ind[k]["state"] for k in ks)
        w = sum(WEIGHT.get(k, 1) for k in ks)
        ax[a] = round(clip(s / w), 2)
    ax["Q"] = 1 if (ax["SK"] <= -0.5 or ax["SU"] <= -0.5) else 0
    idx = {n: index_pos(n) for n in SYM}
    raw, detail = {}, {}
    for code, rule, name, exp in ETFS:
        score = round(sum(round(w * ax[k], 2) for k, w in exp.items()), 2)
        wind = "유리" if score >= 1 else "불리" if score <= -1 else "중립"
        st = stage(rule, idx[name]) if name else "해당 없음"
        raw[code] = GRID[wind]["보통" if st == "해당 없음" else st]
        detail[code] = {"score": score, "wind": wind, "stage": st}

    today = idx["KOSPI"]["date"]   # 기준일 = 코스피 최근 종가일(휴장일에 다시 돌아도 같은 날짜)
    old = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {"history": []}
    hist = [h for h in old.get("history", []) if h["date"] != today] if os.environ.get("SIG_REDO") else old.get("history", [])
    if hist and hist[-1]["date"] == today:
        print("signal_changed=false")
        return
    prev = hist[-1]["sig"] if hist else None
    sig = {}
    for code in raw:
        if prev is None:
            sig[code] = raw[code]
            continue
        run = [h["raw"].get(code) for h in hist[-(HOLD - 1):]] + [raw[code]]
        sig[code] = raw[code] if (len(run) >= HOLD and len(set(run)) == 1) else prev[code]
    hist.append({"date": today, "raw": raw, "sig": sig})
    since = today
    for h in reversed(hist):
        if h["sig"] != sig:
            break
        since = h["date"]
    data = {"asof": today, "updated": datetime.now(KST).strftime("%Y-%m-%d %H:%M KST"), "since": since,
            "rule": f"24개 지표와 기초지수 가격 위치로 매일 계산. 같은 결과가 {HOLD}거래일 이어질 때만 신호를 바꿈",
            "axis": ax, "index": idx, "sig": sig, "raw": raw, "detail": detail, "history": hist}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    lite = dict(data, history=hist[-30:])
    with open(os.path.splitext(OUT)[0] + ".js", "w", encoding="utf-8") as f:
        f.write("/* 자동 생성: scripts/update_signal.py — 매일 신호 */\n")
        f.write("window.SIGNAL=" + json.dumps(lite, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print("signal_changed=true")
    log("신호", sig)


if __name__ == "__main__":
    main()
