#!/usr/bin/env python3
"""
판단 보드 보조 지표 → studio/board/prices.json 의 "extra"

스튜디오 24개 지표(studio/indicators.js)와 자동 신호에는 넣지 않는다. 일일 판단이 참고하고 보드에서 검증하는 용도.
- trend      : 기초지수별 20일 이동평균 대비 격차(%), 5거래일 수익률(%) — 야후파이낸스 일별 종가
- real10y    : 美 10년물 실질금리(물가연동국채, FRED DFII10)와 20거래일 변화(bp)
- move       : 채권 변동성 지수 MOVE(야후 ^MOVE)와 20거래일 전 값
- curve      : 美 10년−2년 금리차(FRED T10Y2Y, %p)와 20거래일 변화(bp)
조회에 실패한 항목은 추정하지 않고 failed 에 남기며, 직전 값을 유지한다.
"""
SYM = {"KOSPI": "%5EKS11", "S&P500": "%5EGSPC", "NASDAQ100": "%5ENDX", "SOX": "%5ESOX", "GOLD": "GC=F"}


def _trend(bars):
    d, c = bars[-1]
    ma = sum(x[1] for x in bars[-20:]) / 20
    return {"date": d.isoformat(), "close": round(c, 2), "ma20_gap": round((c / ma - 1) * 100, 1),
            "ret5": round((c / bars[-6][1] - 1) * 100, 1), "above_ma20": c >= ma}


def build(yahoo, fred, old=None, log=print):
    old = old or {}
    out = {"trend": dict(old.get("trend") or {})}
    failed = []

    for k, sym in SYM.items():
        try:
            out["trend"][k] = _trend(yahoo(sym, "3mo"))
        except Exception as e:  # noqa: BLE001
            failed.append("trend:" + k)
            log("extra FAIL", k, e)

    def keep(name, fn):
        try:
            out[name] = fn()
        except Exception as e:  # noqa: BLE001
            failed.append(name)
            log("extra FAIL", name, e)
            if name in old:
                out[name] = old[name]

    def real():
        r = fred("DFII10")
        return {"date": r[-1][0].isoformat(), "value": r[-1][1], "chg20_bp": round((r[-1][1] - r[-21][1]) * 100)}

    def move():
        b = yahoo("%5EMOVE", "3mo")
        return {"date": b[-1][0].isoformat(), "value": round(b[-1][1], 1), "prev20": round(b[-21][1], 1),
                "chg20_pct": round((b[-1][1] / b[-21][1] - 1) * 100, 1)}

    def curve():
        r = fred("T10Y2Y")
        return {"date": r[-1][0].isoformat(), "value": r[-1][1], "chg20_bp": round((r[-1][1] - r[-21][1]) * 100)}

    keep("real10y", real)
    keep("move", move)
    keep("curve", curve)
    out["failed"] = failed
    return out
