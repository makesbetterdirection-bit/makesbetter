#!/usr/bin/env python3
"""
스튜디오 24개 지표 중 시세로 계산되는 지표를 매일 갱신 → studio/indicators.js

- 출처: 야후파이낸스 일별 종가(금리·지수·VIX·금·달러인덱스·원/달러), FRED(美 우량 회사채 스프레드 BAMLC0A0CM).
- 판정 규칙은 스튜디오 화면에 적힌 규칙(rule)을 그대로 계산한다. 20일 = 20거래일 전 종가 대비.
- 이 파일은 "표시용"이다. 확대·기본·축소 신호는 신호일 스냅샷(studio/index.html 의 SIG_IND)으로만 계산한다.
- 조회에 실패한 지표는 추정하지 않고 빠진다(화면은 신호일 값 그대로 표시). 실패 목록은 failed 에 기록.
- 조사가 필요한 지표(CPI 예상치·FOMC 확률·VKOSPI·외국인 수급·시장 폭·무역수지·한미 금리차)는 여기서 다루지 않는다.

출력: changed=true|false, asof=MM.DD (GITHUB_OUTPUT 용)
stdlib 만 사용.
"""
import json
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from update_better7_prices import KST, UAS, http_get, log  # noqa: E402

OUT = os.environ.get("IND_OUT", "studio/indicators.js")


def clip(v, a=-1.0, b=1.0):
    return max(a, min(b, v))


def yahoo(sym, rng="1y"):
    last = None
    for ua in UAS:
        for host in ("query1.finance.yahoo.com", "query2.finance.yahoo.com"):
            try:
                url = f"https://{host}/v8/finance/chart/{sym}?range={rng}&interval=1d&includePrePost=false"
                res = json.loads(http_get(url, tries=1, ua=ua))["chart"]["result"][0]
                tz = res["meta"].get("exchangeTimezoneName")
                bars = []
                for t, c in zip(res["timestamp"], res["indicators"]["quote"][0]["close"]):
                    if c is None:
                        continue
                    d = datetime.fromtimestamp(t + res["meta"].get("gmtoffset", 0)).date()  # 거래소 현지 날짜
                    bars.append((d, float(c)))
                if len(bars) < 25:
                    raise RuntimeError("bars < 25")
                return bars
            except Exception as e:  # noqa: BLE001
                last = e
    raise RuntimeError(f"yahoo {sym}: {last}")


def fred(series):
    txt = http_get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}", tries=3, timeout=60)
    rows = []
    for line in txt.strip().splitlines()[1:]:
        d, v = line.split(",")[:2]
        try:
            rows.append((datetime.strptime(d, "%Y-%m-%d").date(), float(v)))
        except ValueError:
            continue
    if len(rows) < 25:
        raise RuntimeError("fred rows < 25")
    return rows


def md(d):
    return f"{d.month}/{d.day}"


def r2(x):
    return round(x, 2)


def sgn(x, nd=2, unit=""):
    s = f"{abs(x):,.{nd}f}{unit}"
    return ("+" if x > 0 else "−" if x < 0 else "") + s


def bp_item(bars, label_bp=40):
    c, p = bars[-1][1], bars[-21][1]
    bp = (c - p) * 100
    return {"value": f"{c:.2f}%", "chg": f"20일 {sgn(bp, 0, 'bp')}", "state": r2(clip(-bp / label_bp)),
            "date": md(bars[-1][0]), "_auto": f"20일 {sgn(bp, 0, 'bp')}"}


def pct20(bars, scale):
    c, p = bars[-1][1], bars[-21][1]
    ch = (c / p - 1) * 100
    return c, ch, clip(ch / scale)


def build():
    ind, failed = {}, []

    def put(key, fn):
        try:
            ind[key] = fn()
        except Exception as e:  # noqa: BLE001
            failed.append(key)
            log("FAIL", key, e)

    put("US2Y|美 2년물", lambda: bp_item(yahoo("2YY=F", "3mo")))
    put("US10Y|美 10년물", lambda: bp_item(yahoo("%5ETNX", "3mo")))
    put("US30Y|美 30년물", lambda: bp_item(yahoo("%5ETYX", "3mo")))

    def kospi():
        b = yahoo("%5EKS11", "3mo")
        c, ch, st = pct20(b, 10)
        d1 = (b[-1][1] / b[-2][1] - 1) * 100
        return {"value": f"{c:,.2f}", "chg": f"당일 {sgn(d1)}% · 20일 {sgn(ch, 1)}%", "state": r2(st), "date": md(b[-1][0])}
    put("KOSPI|코스피", kospi)

    def idx(sym, label):
        def f():
            b = yahoo(sym, "3mo")
            c, ch, st = pct20(b, 5)
            return {"value": f"{c:,.2f}", "chg": f"20일 {sgn(ch)}%", "state": r2(st), "date": md(b[-1][0])}
        return f
    put("S&P500|S&P 500", idx("%5EGSPC", "S&P 500"))
    put("NASDAQ|나스닥 종합", idx("%5EIXIC", "나스닥 종합"))

    vix = {}

    def vixf():
        b = yahoo("%5EVIX", "3mo")
        v = b[-1][1]
        vix["v"], vix["d"] = v, b[-1][0]
        return {"value": f"{v:.2f}", "chg": f"20일 전 {b[-21][1]:.2f}", "state": r2(clip((20 - v) / 5)), "date": md(b[-1][0])}
    put("VIX|VIX (미국 공포지수)", vixf)

    def vu():
        if "v" not in vix:
            raise RuntimeError("vix 없음")
        v = vix["v"]
        st = 0 if 15 <= v <= 25 else (0.4 if v > 25 else -0.4)
        lab = "프리미엄 보통" if st == 0 else ("프리미엄 높음" if st > 0 else "프리미엄 낮음")
        return {"value": f"VIX {v:.2f}", "chg": lab, "state": st, "date": md(vix["d"])}
    put("VIX|미국 옵션 프리미엄", vu)

    sox = {}

    def soxma():
        b = yahoo("%5ESOX", "3mo")
        sox["b"] = b
        ma = sum(x[1] for x in b[-20:]) / 20
        g = (b[-1][1] / ma - 1) * 100
        return {"value": f"{sgn(g, 1)}%", "chg": f"{b[-1][1]:,.1f}", "state": r2(clip(g / 5)), "date": md(b[-1][0])}
    put("SOX|반도체지수 20일선 대비", soxma)

    def soxtrend():
        b = sox.get("b") or yahoo("%5ESOX", "3mo")
        n, d = 0, 0
        for i in range(len(b) - 1, 0, -1):
            s = 1 if b[i][1] > b[i - 1][1] else -1 if b[i][1] < b[i - 1][1] else 0
            if s == 0 or (d and s != d):
                break
            d, n = s, n + 1
        cum = (b[-1][1] / b[-1 - n][1] - 1) * 100 if n else 0
        st = clip(d * n / 5) if n else 0
        word = "상승" if d > 0 else "하락"
        return {"value": f"{sgn(cum)}%", "chg": f"{n}거래일 연속 {word}" if n else "보합", "state": r2(st), "date": md(b[-1][0])}
    put("SOX|반도체지수 추세", soxtrend)

    def gold():
        b = yahoo("GC=F", "3mo")
        c, ch, st = pct20(b, 5)
        return {"value": f"${c:,.0f}", "chg": f"20일 {sgn(ch)}%", "state": r2(st), "date": md(b[-1][0])}
    put("GOLD|금 (COMEX 12월물)", gold)

    def oas():
        r = fred("BAMLC0A0CM")
        c, p = r[-1][1], r[-21][1]
        bp = (c - p) * 100
        return {"value": f"{c:.2f}%p", "chg": f"20일 {sgn(bp, 0, 'bp')}", "state": r2(clip(-bp / 30)), "date": md(r[-1][0])}
    put("IG OAS|美 우량 회사채 스프레드", oas)

    krw = {}

    def krwpos():
        b = yahoo("KRW=X", "1y")
        krw["b"] = b
        c = b[-1][1]
        lo, hi = min(x[1] for x in b), max(x[1] for x in b)
        pos = (c - lo) / (hi - lo) * 100 if hi > lo else 50
        return {"value": f"{c:,.1f}", "chg": f"52주 {lo:,.0f}~{hi:,.0f} · 하위 {pos:.0f}%",
                "state": r2(clip((50 - pos) / 25)), "date": md(b[-1][0])}
    put("USD/KRW|원/달러 52주 위치", krwpos)

    def krw20():
        b = krw.get("b") or yahoo("KRW=X", "3mo")
        c, p = b[-1][1], b[-21][1]
        ch = (c / p - 1) * 100
        st = 0 if abs(ch) <= 2 else clip(ch / 4)
        return {"value": f"{sgn(ch)}%", "chg": f"{md(b[-21][0])} {p:,.1f}", "state": r2(st), "date": md(b[-1][0])}
    put("USD/KRW|원/달러 20일 변화", krw20)

    def dxy():
        b = yahoo("DX-Y.NYB", "3mo")
        c, ch, st = pct20(b, 5)
        return {"value": f"{c:.2f}", "chg": f"20일 {sgn(ch)}%", "state": r2(st), "date": md(b[-1][0])}
    put("DXY|달러인덱스", dxy)

    try:
        from ind_extra import extra
        extra(put, yahoo, fred, datetime.now(KST).date())
    except Exception as e:  # noqa: BLE001
        log("ind_extra 실패", e)

    for v in ind.values():
        v.pop("_auto", None)
        v["conf"] = "자동"
    return ind, failed


def main():
    now = datetime.now(KST)
    ind, failed = build()
    if not ind:
        log("모든 지표 조회 실패 — 파일 유지")
        print("changed=false")
        return
    data = {"asof": now.strftime("%m.%d"), "updated": now.strftime("%Y-%m-%d %H:%M KST"),
            "ind": ind, "failed": failed}
    old = None
    if os.path.exists(OUT):
        try:
            txt = open(OUT, encoding="utf-8").read()
            old = json.loads(txt[txt.index("{"):txt.rindex("}") + 1])
        except Exception:  # noqa: BLE001
            old = None
    # 이번에 조회하지 못한 지표는 직전 값을 그대로 둔다(날짜도 직전 그대로). failed 에 남아 있으면 신호는 계산하지 않는다.
    if old:
        for k, v in (old.get("ind") or {}).items():
            if k in failed and k not in ind:
                ind[k] = v
    if old and old.get("ind") == ind and old.get("failed") == failed:
        print("changed=false")
        return
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("/* 자동 생성: scripts/update_indicators.py — 24개 지표 매일 갱신 */\n")
        f.write("window.LIVE=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print("changed=true")
    print(f"asof={data['asof']}")
    log(f"지표 {len(ind)}개 갱신, 실패 {failed}")


if __name__ == "__main__":
    main()
