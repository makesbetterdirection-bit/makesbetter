#!/usr/bin/env python3
"""
스튜디오 24개 지표 중 '조사형' 9개를 공식 자료로 자동 계산 (update_indicators.py 가 호출).

출처
- 한국거래소 Open API (KRX_API_KEY): 코스피 200 변동성지수(VKOSPI), 유가증권 전 종목 등락
- 한국은행 ECOS (ECOS_API_KEY): 외국인 순매수(유가증권시장, 일별), 통관 수출입(월), 한국은행 기준금리
- FRED: 연준 목표금리 상단·하단, 실효연방기금금리(EFFR)
- 야후파이낸스: 연방기금 금리선물(ZQ) → 다음 FOMC 인상 확률을 직접 계산
- 클리블랜드 연은 Inflation Nowcasting: CPI 발표 직전 예상치와 실제치

키가 없거나 조회에 실패한 지표는 추정하지 않고 빠진다(화면은 직전 값 유지).
stdlib 만 사용.
"""
import calendar
import json
import os
import time
import urllib.request
from datetime import date, datetime, timedelta

KRX = "https://data-dbg.krx.co.kr/svc/apis/"
ECOS = "https://ecos.bok.or.kr/api/"
NOWCAST = "https://www.clevelandfed.org/-/media/files/webcharts/inflationnowcasting/nowcast_year.json"
# 연준 공식 일정(federalreserve.gov/monetarypolicy/fomccalendars.htm) — 회의 둘째 날
FOMC = ["2026-12-09", "2027-01-27", "2027-03-17", "2027-04-28", "2027-06-09", "2027-07-28",
        "2027-09-15", "2027-10-27", "2027-12-08"]
MC = "FGHJKMNQUVXZ"


def clip(v, a=-1.0, b=1.0):
    return max(a, min(b, v))


def r2(x):
    return round(x, 2)


def sg(x, nd=2):
    return ("+" if x > 0 else "−" if x < 0 else "") + f"{abs(x):,.{nd}f}"


def md(d):
    return f"{d.month}/{d.day}"


BUDGET = 150          # 9개 지표 전체에 쓰는 최대 시간(초). 넘으면 남은 지표는 실패 처리
_T0 = [0.0]


def _get(url, headers=None, timeout=20):
    if _T0[0] and time.monotonic() - _T0[0] > BUDGET:
        raise RuntimeError("시간 초과")
    req = urllib.request.Request(url, headers=dict({"User-Agent": "Mozilla/5.0"}, **(headers or {})))
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "ignore")


def krx(path, today):
    key = os.environ.get("KRX_API_KEY")
    if not key:
        raise RuntimeError("KRX_API_KEY 없음")
    for back in range(0, 8):
        d = today - timedelta(days=back)
        if d.weekday() >= 5:
            continue
        rows = json.loads(_get(f"{KRX}{path}?basDd={d:%Y%m%d}", {"AUTH_KEY": key})).get("OutBlock_1") or []
        if rows:
            return d, rows
    raise RuntimeError(f"krx {path}: 최근 영업일 자료 없음")


def ecos(stat, cycle, start, end, item, n=400):
    key = os.environ.get("ECOS_API_KEY")
    if not key:
        raise RuntimeError("ECOS_API_KEY 없음")
    j = json.loads(_get(f"{ECOS}StatisticSearch/{key}/json/kr/1/{n}/{stat}/{cycle}/{start}/{end}/{item}"))
    rows = (j.get("StatisticSearch") or {}).get("row")
    if not rows:
        raise RuntimeError(f"ecos {stat}/{item}: {str(j)[:120]}")
    return [(r["TIME"], float(r["DATA_VALUE"])) for r in rows if r.get("DATA_VALUE") not in (None, "")]


def extra(put, yahoo, fred, today):  # noqa: ARG001 (fred 는 쓰지 않음)
    """put(key, fn) 으로 9개 지표를 등록. key = 'TAG|고정이름', 표시 이름이 바뀌는 지표는 name 을 함께 준다."""
    memo = {}
    _T0[0] = time.monotonic()

    def nyfed():   # 뉴욕 연은 공식 API: 실효연방기금금리와 목표금리 범위(일별)
        if "ny" not in memo:
            a, b = today - timedelta(days=200), today
            j = json.loads(_get(f"https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json?startDate={a:%Y-%m-%d}&endDate={b:%Y-%m-%d}"))
            rows = sorted((r["effectiveDate"], float(r["percentRate"]), float(r["targetRateFrom"]), float(r["targetRateTo"])) for r in j["refRates"])
            if len(rows) < 70:
                raise RuntimeError("뉴욕 연은 자료 부족")
            memo["ny"] = rows
        return memo["ny"]

    def vk():
        if "vk" not in memo:
            d, rows = krx("idx/drvprod_dd_trd", today)
            r = [x for x in rows if x["IDX_NM"].replace(" ", "") == "코스피200변동성지수"][0]
            memo["vk"] = (d, float(r["CLSPRC_IDX"]), float(r["CMPPREVDD_IDX"]))
        return memo["vk"]

    def vkospi():
        d, v, ch = vk()
        return {"value": f"{v:.2f}", "chg": f"전일 대비 {sg(ch)}", "state": r2(-clip((v - 20) / 20, 0, 1)), "date": md(d) + " 종가"}
    put("VKOSPI|VKOSPI (국내 공포지수)", vkospi)

    def vkprem():
        d, v, _ = vk()
        st = r2(clip((v - 20) / 40, 0, 0.5))
        lab = "콜옵션 매도 수익 증가" if st >= 0.25 else "프리미엄 보통"
        return {"value": f"VKOSPI {v:.2f}", "chg": lab, "state": st, "date": md(d) + " 종가"}
    put("VKOSPI|국내 옵션 프리미엄", vkprem)

    def breadth():
        d, rows = krx("sto/stk_bydd_trd", today)
        up = sum(1 for x in rows if float(x["FLUC_RT"] or 0) > 0)
        dn = sum(1 for x in rows if float(x["FLUC_RT"] or 0) < 0)
        if up + dn < 300:
            raise RuntimeError("종목 수 부족")
        return {"value": f"{up:,} / {dn:,}", "chg": f"유가증권 상승 {up / (up + dn) * 100:.0f}%",
                "state": r2(clip((up / (up + dn) - 0.5) / 0.2)), "date": md(d)}
    put("BREADTH|상승·하락 종목", breadth)

    def foreign():
        if "fg" not in memo:
            rows = ecos("802Y001", "D", f"{today - timedelta(days=40):%Y%m%d}", f"{today:%Y%m%d}", "0030000")
            if len(rows) < 6:
                raise RuntimeError("외국인 순매수 자료 부족")
            s5 = sum(v for _, v in rows[-5:]) / 10000.0   # 억원 → 조원
            n, sign = 0, 0
            for _, v in reversed(rows):
                s = 1 if v > 0 else -1 if v < 0 else 0
                if s == 0 or (sign and s != sign):
                    break
                sign, n = s, n + 1
            d0 = datetime.strptime(rows[-5][0], "%Y%m%d").date()
            d1 = datetime.strptime(rows[-1][0], "%Y%m%d").date()
            memo["fg"] = (s5, n, sign, d0, d1)
        return memo["fg"]

    def fg_sk():
        s5, n, sign, d0, d1 = foreign()
        return {"value": f"{sg(s5)}조", "chg": f"{n}거래일 연속 순{'매수' if sign > 0 else '매도'}",
                "state": r2(clip(s5 / 5)), "date": f"{md(d0)}~{d1.day}"}
    put("FOREIGN|외국인 순매수 5일", fg_sk)

    def fg_fx():
        s5, n, sign, d0, d1 = foreign()
        return {"value": f"{sg(s5, 1)}조", "chg": "5일 누적 순" + ("매도" if s5 < 0 else "매수"),
                "state": r2(clip(-s5 / 5) * 0.5), "date": f"{md(d0)}~{d1.day}"}
    put("FOREIGN|외국인 주식 매도 → 달러 수요", fg_fx)

    def trade():
        a = f"{today.year - 2}{today.month:02d}"
        b = f"{today:%Y%m}"
        ex, im = dict(ecos("901Y118", "M", a, b, "T002")), dict(ecos("901Y118", "M", a, b, "T004"))
        m = max(k for k in ex if k in im)
        bal = (ex[m] - im[m]) / 1e5                      # 천달러 → 억달러
        prev = f"{int(m[:4]) - 1}{m[4:]}"
        yoy = (ex[m] / ex[prev] - 1) * 100 if prev in ex else None
        chg = f"수출 {ex[m] / 1e5:,.0f}억$" + (f" · {sg(yoy, 1)}%" if yoy is not None else "")
        return {"name": f"무역수지 ({int(m[4:])}월)", "value": f"{sg(bal, 0)}억$", "chg": chg,
                "state": r2(-clip(bal / 100) * 0.5), "date": f"{int(m[4:])}월 통관"}
    put("TRADE|무역수지", trade)

    def krus():
        ny = nyfed()
        bok = ecos("722Y001", "D", f"{today - timedelta(days=150):%Y%m%d}", f"{today:%Y%m%d}", "0101000")
        if len(bok) < 61:
            raise RuntimeError("기준금리 자료 부족")
        g1, g0 = ny[-1][3] - bok[-1][1], ny[-61][3] - bok[-61][1]   # 60거래일(약 3개월) 전과 비교
        return {"value": f"{ny[-1][2] - bok[-1][1]:.2f}~{g1:.2f}%p",
                "chg": f"한은 {bok[-1][1]:.2f}% · 연준 {ny[-1][2]:.2f}~{ny[-1][3]:.2f}%",
                "state": r2(clip((g1 - g0) / 0.5)), "date": md(today)}
    put("KR-US|한미 기준금리차", krus)

    def fomc():
        nxt = [datetime.strptime(x, "%Y-%m-%d").date() for x in FOMC]
        nxt = [x for x in nxt if x >= today]
        if not nxt:
            raise RuntimeError("FOMC 일정 갱신 필요")
        m = nxt[0]
        ndays = calendar.monthrange(m.year, m.month)[1]
        effr = [(r[0], r[1]) for r in nyfed()]
        bars = yahoo(f"ZQ{MC[m.month - 1]}{m.year % 100:02d}.CBT", "3mo")
        if len(bars) < 6:
            raise RuntimeError("금리선물 자료 부족")

        def prob(px, pre):
            post = ((100 - px) * ndays - pre * m.day) / (ndays - m.day)   # 회의 다음 날부터 새 금리
            return (post - pre) / 0.25 * 100

        if ndays - m.day < 8:
            raise RuntimeError("월말 회의 — 계산 불안정")
        p1, p0 = prob(bars[-1][1], effr[-1][1]), prob(bars[-6][1], effr[-6][1])
        lab = lambda p: f"인상 {min(p, 100):.0f}%" if p >= 0 else f"인하 {min(-p, 100):.0f}%"  # noqa: E731
        return {"name": f"{m.month}/{m.day} FOMC 인상 확률", "value": lab(p1), "chg": f"1주 전 {lab(p0)}",
                "state": r2(-clip((min(p1, 100) - min(p0, 100)) / 10)), "date": md(bars[-1][0]),
                "note": "연방기금 금리선물로 계산"}
    put("FOMC|FOMC 인상 확률", fomc)

    def cpi():
        j = json.loads(_get(NOWCAST, timeout=40))
        for x in reversed(j):
            ds = {d.get("seriesname"): [p.get("value") for p in d["data"]] for d in x["dataset"]}
            act = [(i, float(v)) for i, v in enumerate(ds.get("Actual CPI Inflation", [])) if v not in ("", None)]
            if not act:
                continue
            i, a = act[0]
            now = [float(v) for v in ds["CPI Inflation"][:i] if v not in ("", None)]
            if not now:
                continue
            e = now[-1]
            y, mm = x["chart"]["subcaption"].split("-")
            lab = x["categories"][0]["category"][i]["label"]
            diff = round(a, 1) - round(e, 1)
            return {"name": f"美 {int(mm)}월 CPI", "value": f"{a:.1f}%",
                    "chg": f"예상 {e:.1f}% · {abs(diff):.1f}%p {'상회' if diff > 0 else '하회' if diff < 0 else '부합'}",
                    "state": r2(-clip((a - e) / 0.2)), "date": lab.replace("/0", "/").lstrip("0") + " 발표",
                    "note": "예상치는 클리블랜드 연은 발표 직전 값"}
        raise RuntimeError("CPI 실제치 없음")
    put("CPI|美 CPI", cpi)
