#!/usr/bin/env python3
"""
베러 추천 매수 기록(Track record) 계산 — studio/track/signals.json → studio/track.json

규칙 (매달 같은 규칙, 사후 수정 없음)
- 매수: 신호일(start) 종가. 매도·평가: 다음 신호일(end) 종가, 진행 중이면 가장 최근 시세.
- 기간 중 배당락일(start < 배당락 <= end)이 있는 분배금은 현금으로 더한다(세전).
- 베러 추천 = 신호일에 100만원으로 실제 매수한 주수 기준 비중(매수 금액 / 총 매수 금액).
- 비교 기준 = Better.7 ver.2 비중 그대로 매수.
- 종목 수익률 r = (평가가격 + 분배금) / 신호일 종가 - 1, 포트폴리오 = Σ 비중 × r.

GitHub Actions(better7-prices.yml)에서 시세 갱신 뒤 함께 실행. stdlib 만 사용.
"""
import json
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from update_better7_prices import KST, from_yahoo, log  # noqa: E402

SIGNALS = os.environ.get("TRACK_SIGNALS", "studio/track/signals.json")
OUT = os.environ.get("TRACK_OUT", "studio/track.json")


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
        spent = sum(v["amt"] for v in s["rec"].values())
        rec_w = {c: v["amt"] / spent for c, v in s["rec"].items()}
        rec = sum(rec_w[c] * items[c]["r"] for c in items)
        bench = sum(s["bench"][c] * items[c]["r"] for c in items)
        ed = max(ends)
        live = end is None
        intraday = live and ed == now.date() and (9, 0) <= (now.hour, now.minute) < (15, 35)
        rows.append({
            "month": s["month"], "label": s["label"], "start": s["start"], "end": ed.isoformat(),
            "final": not live, "intraday": intraday,
            "rec": round(rec, 6), "bench": round(bench, 6), "diff": round(rec - bench, 6),
            "items": items,
        })

    out = {"rule": "신호일 종가 매수 → 다음 신호일 종가, 분배금 포함(세전)",
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
