#!/usr/bin/env python3
"""
베러 추천 매수 기록(Track record) 계산 — studio/track/signals.json → studio/track.json

규칙 (매달 같은 규칙, 사후 수정 없음)
- 매수: 신호일(start) 종가. 매도·평가: 다음 신호일(end) 종가, 진행 중이면 가장 최근 시세.
- 기간 중 배당락일(start < 배당락 <= end)이 있는 분배금은 현금으로 더한다(세전).
- 베러 추천 = 신호가 정한 목표 비중(1주 단위 반올림 제외 — 100만원 예시의 반올림 잡음이 성과에 섞이지 않게).
    · base "ver2"(2026-11 신호부터): ver.2 비중 × 신호 배수(강 2 · 중립 1 · 보류 0.5)를 합 100%로 정규화
    · base 없음(2026-10, 기준 변경 전 기록): 균등 비중 × 신호 배수
    · 스냅샷에 "target"(목표 비중)이 있으면 그 값을 그대로 쓴다.
- 비교 기준 = Better.7 ver.2 비중 그대로 매수. → base "ver2" 부터는 차이 = 신호 효과만 남는다.
- 종목 수익률 r = (평가가격 + 분배금) / 신호일 종가 - 1, 포트폴리오 = Σ 비중 × r.

신호 검증(eval) — studio/track/context/<month>.json(신호 발표 당시 판단 근거)이 있으면 함께 계산
- 상대수익 rel = 종목 수익률 − 그 달 기본 비중(ver.2) 포트폴리오 수익률
- 신호별 평균 rel(강·중립·보류), 적중(강은 rel>0, 보류는 rel<0; 중립은 판정 제외)
- 환경 점수와 rel 의 순위상관(스피어만), 바닥권 판정 종목의 평균 rel
- 축별 일치: 축 기여(parts)가 0이 아닌 종목에서 기여 부호와 rel 부호가 같은 비율

GitHub Actions(better7-prices.yml)에서 시세 갱신 뒤 함께 실행. stdlib 만 사용.
"""
import json
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from update_better7_prices import KST, from_yahoo, log  # noqa: E402

MULT = {"강": 2.0, "중립": 1.0, "보류": 0.5}
SIGNALS = os.environ.get("TRACK_SIGNALS", "studio/track/signals.json")
OUT = os.environ.get("TRACK_OUT", "studio/track.json")


CONTEXT_DIR = os.environ.get("TRACK_CONTEXT", "studio/track/context")


def rank(xs):
    o = sorted(range(len(xs)), key=lambda i: xs[i])
    r = [0.0] * len(xs)
    i = 0
    while i < len(o):
        j = i
        while j + 1 < len(o) and xs[o[j + 1]] == xs[o[i]]:
            j += 1
        for k in range(i, j + 1):
            r[o[k]] = (i + j) / 2
        i = j + 1
    return r


def spearman(a, b):
    if len(a) < 3:
        return None
    ra, rb = rank(a), rank(b)
    ma, mb = sum(ra) / len(ra), sum(rb) / len(rb)
    cov = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    va = sum((x - ma) ** 2 for x in ra) ** 0.5
    vb = sum((y - mb) ** 2 for y in rb) ** 0.5
    return round(cov / (va * vb), 3) if va and vb else None


def evaluate(month, items, bench):
    path = os.path.join(CONTEXT_DIR, f"{month}.json")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        ctx = json.load(f)
    E = ctx["etfs"]
    rel = {c: items[c]["r"] - bench for c in items if c in E}
    groups = {}
    for g in ("강", "중립", "보류"):
        xs = [rel[c] for c in rel if E[c]["sig"] == g]
        groups[g] = {"n": len(xs), "avg": round(sum(xs) / len(xs), 6) if xs else None}
    hit_n = hit = 0
    for c in rel:
        if E[c]["sig"] == "강":
            hit_n += 1; hit += rel[c] > 0
        elif E[c]["sig"] == "보류":
            hit_n += 1; hit += rel[c] < 0
    codes = sorted(rel)
    ic = spearman([E[c]["score"] for c in codes], [rel[c] for c in codes])
    zs = [rel[c] for c in rel if E[c]["stage"] == "바닥권"]
    axes = {}
    for c in rel:
        for k, v in E[c]["parts"].items():
            if not v or rel[c] == 0:
                continue
            a = axes.setdefault(k, {"n": 0, "agree": 0})
            a["n"] += 1
            a["agree"] += (v > 0) == (rel[c] > 0)
    return {"rel": {c: round(v, 6) for c, v in rel.items()},
            "sig": {c: E[c]["sig"] for c in rel}, "score": {c: E[c]["score"] for c in rel},
            "stage": {c: E[c]["stage"] for c in rel},
            "groups": groups, "hits": {"n": hit_n, "hit": hit}, "ic": ic,
            "zone": {"n": len(zs), "avg": round(sum(zs) / len(zs), 6) if zs else None},
            "axes": axes, "axisScores": ctx.get("axes", {})}


def d(s):
    return datetime.strptime(s, "%Y-%m-%d").date()


def main():
    with open(SIGNALS, encoding="utf-8") as f:
        signals = json.load(f)
    now = datetime.now(KST)
    codes = sorted({c for s in signals for c in s["prices"]})
    data = {}
    for c in codes:
        try:
            data[c] = from_yahoo(c)
        except Exception as e:  # noqa: BLE001
            log(f"[error] {c}: {e}")
            print("changed=false")
            return 0  # 한 종목이라도 없으면 기록을 건드리지 않는다(부분 계산 금지)

    rows = []
    for s in signals:
        start = d(s["start"])
        end = d(s["end"]) if s.get("end") else None
        items, ends = {}, []
        for c, p0 in s["prices"].items():
            bars = data[c]["bars"]
            b0 = [b for b in bars if b[0] == start]
            if b0 and abs(b0[0][1] / p0 - 1) > 0.002:
                log(f"[warn] {c}: start close {b0[0][1]} != recorded {p0} (recorded price kept)")
            cands = [b for b in bars if b[0] <= end] if end else bars
            if not cands:
                log(f"[error] {c}: no bar up to end"); print("changed=false"); return 0
            ed, p1 = cands[-1]
            if not end and ed == now.date() and data[c].get("last_price"):
                p1 = data[c]["last_price"]
            ends.append(ed)
            div = sum(a for (x, a) in (data[c]["divs"] or []) if start < x <= (end or ed))
            items[c] = {"p0": p0, "p1": round(p1, 2), "div": div, "r": round((p1 + div) / p0 - 1, 6)}
        base = s.get("base", "equal")
        if s.get("target"):
            rec_w = s["target"]
        else:
            raw = {c: (s["bench"][c] if base == "ver2" else 1.0) * MULT[v["sig"]] for c, v in s["rec"].items()}
            tot = sum(raw.values())
            rec_w = {c: x / tot for c, x in raw.items()}
        rec = sum(rec_w[c] * items[c]["r"] for c in items)
        bench = sum(s["bench"][c] * items[c]["r"] for c in items)
        ed = max(ends)
        live = end is None
        intraday = live and ed == now.date() and (9, 0) <= (now.hour, now.minute) < (15, 35)
        rows.append({
            "month": s["month"], "label": s["label"], "start": s["start"], "end": ed.isoformat(),
            "final": not live, "intraday": intraday,
            "base": "ver.2 비중 × 신호" if base == "ver2" else "균등 비중 × 신호 · 기준 변경 전 기록",
            "scored": base == "ver2",  # 월간 승패 집계 대상(10월은 출발 비중이 달라 참고용)
            "rec": round(rec, 6), "bench": round(bench, 6), "diff": round(rec - bench, 6),
            "items": items,
        })
        ev = evaluate(s["month"], items, bench)
        if ev:
            rows[-1]["eval"] = ev

    out = {"rule": "신호일 종가 매수 → 다음 신호일 종가, 분배금 포함(세전), 목표 비중 기준",
           "bench": "Better.7 ver.2 비중", "rows": rows}
    try:
        with open(OUT, encoding="utf-8") as f:
            prev = json.load(f)
        if prev.get("rows") == rows:
            print("changed=false")
            return 0
    except Exception:  # noqa: BLE001
        pass
    out["updated"] = f"{now:%Y-%m-%d %H:%M} KST"
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")
    log(json.dumps({k: v for k, v in out.items() if k != "rows"}, ensure_ascii=False))
    for r in rows:
        log(f"{r['label']} {r['start']}→{r['end']} rec {r['rec']:+.4%} bench {r['bench']:+.4%} diff {r['diff']:+.4%}")
    print("changed=true")
    return 0


if __name__ == "__main__":
    sys.exit(main())
