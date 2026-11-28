#!/usr/bin/env python3
"""판단 보드 학습 노트 생성.

studio/board/log.json(일일 판단)과 studio/board/prices.json(수정종가)을 읽어
채점이 끝난 판단을 근거·종목·확신도별로 집계하고 studio/board/lessons.json 을 쓴다.
채점 방식은 studio/board/index.html 과 같다(5거래일 뒤, 11종 평균 대비).

등급
  규칙(금지/유효): 채점된 확대·축소 판단 N_RULE개 이상이고 평균 우위가 ±EDGE_RULE %p 를 넘음
  관찰          : 그 밖. 평균 우위가 −이면 확신도만 낮춘다
같은 입력이면 같은 파일이 나온다(실행 시각을 쓰지 않음). 등급이 바뀐 항목만 history 에 쌓는다.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOARD = os.path.join(ROOT, "studio", "board")
H = 5            # 채점 기간(거래일)
MISS = 3.0       # 기본 판단의 놓친 기회 기준(%p)
N_RULE = 10      # 규칙으로 올리는 최소 판단 수
EDGE_RULE = 1.0  # 규칙으로 올리는 평균 우위 크기(%p)
N_MISS = 10      # 기본 판단 놓친 기회 규칙의 최소 판단 수
MISS_RATE = 40.0 # 놓친 기회 비율(%) 기준

# 기본 비중(%) — 유일한 원본 studio/weights.json (2026-11-06 정정값: 30년국채 5 · 금 5 · 머니마켓 20)
BENCH = json.load(open(os.environ.get("WEIGHTS", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "studio", "weights.json")),
                       encoding="utf-8"))["weights"]
N_DAYS = 10      # 수치 구간을 비교할 수 있는 최소 판단일 수
VIX_BANDS = [("20 미만", lambda v: v < 20), ("20~30", lambda v: 20 <= v < 30), ("30 이상", lambda v: v >= 30)]
FNG_BANDS = [("25 미만(극단 공포)", lambda v: v < 25), ("25~45(공포)", lambda v: 25 <= v < 45), ("45 이상", lambda v: v >= 45)]

NAME = {"488770": "머니마켓", "473330": "美30년국채CC", "332610": "美단기회사채", "480030": "美500CC",
        "441640": "美배당CC", "494300": "나스닥100CC", "498400": "200위클리CC", "0022T0": "국제금CC",
        "497570": "필라AI반도체", "485690": "AI밸류체인", "0036R0": "휴머노이드"}


def r1(x):
    return None if x is None else round(x + 0.0, 1)


def fwd(adj, code, d, h):
    s = adj.get(code)
    if not s:
        return None
    i = next((k for k, row in enumerate(s) if row[0] >= d), -1)
    if i < 0 or i + h >= len(s):
        return None
    return (s[i + h][1] / s[i][1] - 1) * 100, s[i + h][0]


def eval_entry(adj, e, h):
    rs, to = {}, None
    for c in e["etf"]:
        f = fwd(adj, c, e["date"], h)
        if f is None:
            return None
        rs[c], to = f
    avg = sum(rs.values()) / len(rs)
    calls = []
    for c, x in e["etf"].items():
        rel = rs[c] - avg
        s = 1 if x["call"] == "확대" else -1 if x["call"] == "축소" else 0
        calls.append({"date": e["date"], "code": c, "call": x["call"], "conf": x.get("conf"),
                      "drivers": x.get("drivers") or [], "rel": rel,
                      "edge": s * rel if s else None, "miss": (not s) and abs(rel) > MISS})
    wb = sum(BENCH[c] for c in rs)
    wr = sum(BENCH[c] * (e["etf"][c].get("tilt") or 1) for c in rs)
    base = sum(BENCH[c] * rs[c] for c in rs) / wb
    rec = sum(BENCH[c] * (e["etf"][c].get("tilt") or 1) * rs[c] for c in rs) / wr
    return {"calls": calls, "to": to, "base": base, "excess": rec - base}


def pick(inputs, want, skip=()):
    """판단 기록의 inputs 에서 이름에 want 가 들어가고 skip 은 안 들어간 첫 숫자."""
    for k, v in (inputs or {}).items():
        ku = k.upper()
        if want in ku and not any(x in ku for x in skip) and isinstance(v, (int, float)):
            return float(v)
    return None


def band_stats(days, key, bands):
    out = []
    for label, f in bands:
        d = [x for x in days if x[key] is not None and f(x[key])]
        n = len(d)
        out.append({"band": label, "days": n,
                    "base_ret": round(sum(x["base"] for x in d) / n, 2) if n else None,
                    "excess": round(sum(x["excess"] for x in d) / n, 2) if n else None,
                    "enough": n >= N_DAYS})
    return out


def agg(calls):
    d = [c for c in calls if c["edge"] is not None]
    n = len(d)
    hit = sum(1 for c in d if c["edge"] > 0)
    return {"n": n, "hit": hit, "rate": round(hit / n * 100) if n else None,
            "edge": r1(sum(c["edge"] for c in d) / n) if n else None}


def grade(g):
    if g["n"] >= N_RULE and g["edge"] <= -EDGE_RULE:
        return "금지"
    if g["n"] >= N_RULE and g["edge"] >= EDGE_RULE:
        return "유효"
    return "관찰"


def main():
    log = json.load(open(os.path.join(BOARD, "log.json"), encoding="utf-8"))
    px = json.load(open(os.path.join(BOARD, "prices.json"), encoding="utf-8"))
    ents = sorted((e for e in log["entries"] if str(e.get("by", "")).startswith("Claude")), key=lambda e: e["date"])
    done, calls, last_to, days = [], [], None, []
    for e in ents:
        r = eval_entry(px["adj"], e, H)
        if r:
            done.append(e["date"])
            calls += r["calls"]
            last_to = r["to"]
            days.append({"date": e["date"], "base": r["base"], "excess": r["excess"],
                         "regime": (e.get("regime") or {}).get("call"),
                         "vix": pick(e.get("inputs"), "VIX", skip=("VKOSPI", "등락")),
                         "fng": pick(e.get("inputs"), "공포", skip=("등락",))})

    for x in days:
        x["regime_i"] = {"적극": 0, "분할": 1, "대기": 2}.get(x["regime"])

    # 근거 × 방향
    by = {}
    for c in calls:
        if c["edge"] is None:
            continue
        for d in c["drivers"]:
            by.setdefault(d + "|" + c["call"], []).append(c)
    drivers = []
    for k in sorted(by):
        d, call = k.split("|")
        g = agg(by[k])
        g.update({"key": k, "driver": d, "call": call, "grade": grade(g)})
        drivers.append(g)
    drivers.sort(key=lambda g: (g["edge"], g["key"]))

    # 종목 × 방향, 기본 판단의 놓친 기회
    etfs, base = [], []
    for code in NAME:
        mine = [c for c in calls if c["code"] == code]
        for call in ("확대", "축소"):
            g = agg([c for c in mine if c["call"] == call])
            if g["n"]:
                g.update({"key": code + "|" + call, "code": code, "name": NAME[code], "call": call, "grade": grade(g)})
                etfs.append(g)
        b = [c for c in mine if c["call"] == "기본"]
        if b:
            m = [c for c in b if c["miss"]]
            rate = round(len(m) / len(b) * 100)
            rel = r1(sum(c["rel"] for c in b) / len(b))
            base.append({"key": code + "|기본", "code": code, "name": NAME[code], "n": len(b), "miss": len(m),
                         "miss_rate": rate, "rel": rel,
                         "grade": "기본 금지" if len(b) >= N_MISS and rate >= MISS_RATE else "관찰"})
    etfs.sort(key=lambda g: (g["edge"], g["key"]))
    base.sort(key=lambda g: (-g["miss_rate"], g["key"]))

    # 확신도 구간
    bands = [("0.5 미만", lambda v: v < 0.5), ("0.5~0.7", lambda v: 0.5 <= v < 0.7), ("0.7 이상", lambda v: v >= 0.7)]
    conf = []
    for label, f in bands:
        g = agg([c for c in calls if c["conf"] is not None and f(c["conf"])])
        g["band"] = label
        conf.append(g)

    # 적용 문장
    rules, watch = [], []
    for g in drivers:
        stat = "%d개 판단, 유효 %d%%, 평균 우위 %+.1f%%p" % (g["n"], g["rate"], g["edge"])
        if g["grade"] == "금지":
            rules.append({"key": g["key"], "do": "근거 '%s' 로는 %s 판단을 내지 않는다. 등급이 '유효'인 다른 근거가 함께 있을 때만 예외." % (g["driver"], g["call"]), "why": stat})
        elif g["grade"] == "유효":
            rules.append({"key": g["key"], "do": "근거 '%s' 의 %s 판단은 유지한다. 확신도 0.6 이상을 줄 수 있다." % (g["driver"], g["call"]), "why": stat})
        elif g["n"] >= 3 and g["edge"] < 0:
            watch.append({"key": g["key"], "do": "근거 '%s' 의 %s 판단은 확신도를 0.5 미만으로 둔다." % (g["driver"], g["call"]), "why": stat})
    for g in etfs:
        stat = "%d개 판단, 유효 %d%%, 평균 우위 %+.1f%%p" % (g["n"], g["rate"], g["edge"])
        if g["grade"] == "금지":
            rules.append({"key": g["key"], "do": "%s 의 %s 판단을 내지 않는다. 등급이 '유효'인 근거가 있을 때만 예외." % (g["name"], g["call"]), "why": stat})
        elif g["grade"] == "유효":
            rules.append({"key": g["key"], "do": "%s 의 %s 판단은 유지한다." % (g["name"], g["call"]), "why": stat})
        elif g["n"] >= 3 and g["edge"] < 0:
            watch.append({"key": g["key"], "do": "%s 의 %s 판단은 확신도를 0.5 미만으로 둔다." % (g["name"], g["call"]), "why": stat})
    for g in base:
        stat = "기본 %d개 중 놓친 기회 %d개(%d%%), 평균 대비 %+.1f%%p" % (g["n"], g["miss"], g["miss_rate"], g["rel"])
        side = "확대" if g["rel"] > 0 else "축소"
        if g["grade"] == "기본 금지":
            rules.append({"key": g["key"], "do": "%s 를 근거 없이 기본으로 두지 않는다. %s 근거를 먼저 확인하고, 근거가 없을 때만 기본." % (g["name"], side), "why": stat})
        elif g["miss"] >= 2:
            watch.append({"key": g["key"], "do": "%s 는 기본으로 두기 전에 %s 근거가 있는지 확인한다." % (g["name"], side), "why": stat})

    out = {
        "about": "판단 보드 학습 노트. scripts/board_lessons.py 가 log.json·prices.json 에서 계산한다. 손으로 고치지 않는다.",
        "asof": last_to, "horizon": H, "scored_days": len(done), "scored_calls": sum(1 for c in calls if c["edge"] is not None),
        "thresholds": {"rule_min_calls": N_RULE, "rule_edge_pp": EDGE_RULE, "miss_pp": MISS, "base_min_calls": N_MISS, "base_miss_rate": MISS_RATE},
        "rules": rules, "watch": watch,
        "stats": {"driver_call": drivers, "etf_call": etfs, "base": base, "conf": conf,
                  "regime": band_stats(days, "regime_i", [(k, (lambda v, i=i: v == i)) for i, k in enumerate(("적극", "분할", "대기"))]),
                  "vix": band_stats(days, "vix", VIX_BANDS), "fng": band_stats(days, "fng", FNG_BANDS),
                  "note": "base_ret = 판단일 뒤 %d거래일 Better.7 기본 비중 수익률(%%), excess = 초과 성과(%%p). enough 가 true 인 구간이 둘 이상일 때만 구간끼리 비교한다." % H},
    }

    path = os.path.join(BOARD, "lessons.json")
    old = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    hist = list(old.get("history", []))
    before = {r["key"]: r["do"] for r in old.get("rules", [])}
    after = {r["key"]: r["do"] for r in rules}
    if old.get("asof") != last_to or before != after:
        for k in sorted(set(before) | set(after)):
            if before.get(k) != after.get(k):
                hist.append({"asof": last_to, "key": k, "from": before.get(k), "to": after.get(k)})
    out["history"] = hist
    json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("lessons.json: 채점 %d일 · 규칙 %d개 · 관찰 %d개 · asof %s" % (len(done), len(rules), len(watch), last_to))
    for r in rules:
        print(" [규칙]", r["do"], "—", r["why"])
    for r in watch:
        print(" [관찰]", r["do"], "—", r["why"])


if __name__ == "__main__":
    sys.exit(main())
