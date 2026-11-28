#!/usr/bin/env python3
"""
월간 추천 신호 기록 — 매달 신호일 장마감 기준 스냅샷을 studio/track/signals.json 에 한 번만 추가한다.

- 신호일 = 매달 SIG_DAY(15)일 이후, 그 날짜의 종가와 자동 신호(studio/signal.json)가 함께 확정된 첫 거래일.
  (GitHub Actions 예약 실행이 밤늦게·다음 날로 밀려도 '데이터 날짜' 기준이라 신호일이 바뀌지 않는다.
   그날 종가 갱신이 아예 실패하면 다음 거래일 종가로 기록된다. 지난 날짜로 거슬러 기록하지 않는다.)
- 조건: signal.json asof == better7_prices.json date, 시세가 "야후파이낸스 종가"(장중 아님)·pending 없음,
  24개 지표 failed 없음, 이번 달 기록이 아직 없음. 하나라도 어긋나면 아무것도 쓰지 않는다.
- 기록: 직전 달 기록의 end 를 신호일로 닫고, 새 달 기록(시작가·신호·100만원 예시 주수·ver.2 비교 기준)과
  판단 근거(studio/track/context/YYYY-MM.json)를 쓴다. 기록은 사후 수정하지 않는다.
- 추천 비중 = ver.2 비중(studio/weights.json, 화면 V2W 와 같아야 함) × 신호 배수(강 2 · 중립 1 · 보류 0.5) — 화면 allocate() 와 같은 방식.

GitHub Actions(better7-prices.yml)에서 자동 신호 계산 뒤 실행. stdlib 만 사용.
"""
import json
import os
import re
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import update_signal as us  # noqa: E402  (AXIS, ETFS — 자동 신호와 같은 축 정의)

SIG_DAY = 15
AMOUNT = 1000000
MULT = {"강": 2.0, "중립": 1.0, "보류": 0.5}
SIGNALS = os.environ.get("TRACK_SIGNALS", "studio/track/signals.json")
CONTEXT_DIR = os.environ.get("TRACK_CONTEXT", "studio/track/context")
SIGNAL = os.environ.get("SIG_OUT", "studio/signal.json")
IND = os.environ.get("IND_OUT", "studio/indicators.js")
PRICES = os.environ.get("BETTER7_OUT", "better7_prices.json")
STUDIO = os.environ.get("STUDIO_HTML", "studio/index.html")
WEIGHTS = os.environ.get("WEIGHTS", "studio/weights.json")


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def skip(why):
    log("[month-signal] 건너뜀:", why)
    print("month_recorded=false")
    return 0


def allocate(codes, sig, px, w):
    """studio/index.html allocate(rows, amount, false) 와 같은 계산(100만원 예시 주수)."""
    tot = sum(w[c] * MULT[sig[c]] for c in codes)
    rows = {c: {"target": AMOUNT * w[c] * MULT[sig[c]] / tot, "price": px[c]} for c in codes}
    for r in rows.values():
        r["qty"] = int(r["target"] // r["price"])
        r["amt"] = r["qty"] * r["price"]
    left = AMOUNT - sum(r["amt"] for r in rows.values())
    for _ in range(200):
        cs = [(c, r) for c, r in rows.items()
              if r["price"] <= left and abs(r["target"] - (r["amt"] + r["price"])) < abs(r["target"] - r["amt"])]
        if not cs:
            break
        c, r = sorted(cs, key=lambda x: -(x[1]["target"] - x[1]["amt"]))[0]
        r["qty"] += 1
        r["amt"] += r["price"]
        left -= r["price"]
    return rows, left


def main():
    S = json.load(open(SIGNAL, encoding="utf-8"))
    P = json.load(open(PRICES, encoding="utf-8"))
    t = open(IND, encoding="utf-8").read()
    live = json.loads(t[t.index("{"):t.rindex("}") + 1])
    sigs = json.load(open(SIGNALS, encoding="utf-8"))

    d = S.get("asof", "")
    if not d or P.get("date") != d:
        return skip(f"자동 신호 기준일 {d} ≠ 시세 기준일 {P.get('date')}")
    if not str(P.get("source", "")).startswith("야후파이낸스 종가") or P.get("pending"):
        return skip(f"종가 확정 전 시세 ({P.get('source')}, pending {P.get('pending')})")
    if live.get("failed"):
        return skip(f"지표 갱신 실패 {live['failed']}")
    day = date.fromisoformat(d)
    month = d[:7]
    if day.day < SIG_DAY:
        return skip(f"{d}: 신호일({SIG_DAY}일) 전")
    if any(s["month"] == month for s in sigs):
        return skip(f"{month} 기록 있음")
    if sigs and d <= sigs[-1]["start"]:
        return skip(f"{d} ≤ 직전 기록 시작일 {sigs[-1]['start']}")

    v2w = json.load(open(WEIGHTS, encoding="utf-8"))["weights"]
    m = re.search(r"V2W=(\{[^}]*\})", open(STUDIO, encoding="utf-8").read())
    if not m or json.loads(m.group(1)) != v2w:
        return skip("studio/index.html 의 V2W 가 studio/weights.json 과 다름(scripts/check_weights.py 확인)")
    sig = S["sig"]
    codes = list(sigs[-1]["prices"]) if sigs else list(sig)
    px = {c: int(p) for c, p in zip(P.get("codes") or [], P["prices"])}
    miss = [c for c in codes if c not in sig or c not in px or c not in v2w or not px[c] > 0]
    if miss or abs(sum(v2w[c] for c in codes) - 100) > 1e-9:
        return skip(f"종목 불일치 {miss} 또는 ver.2 비중 합계 ≠ 100")

    rows, left = allocate(codes, sig, px, v2w)
    entry = {"month": month, "label": f"{int(month[5:])}월", "start": d, "end": None, "base": "ver2",
             "amount": AMOUNT, "left": left,
             "prices": {c: px[c] for c in codes},
             "rec": {c: {"sig": sig[c], "qty": rows[c]["qty"], "amt": rows[c]["amt"]} for c in codes},
             "bench": {c: v2w[c] / 100 for c in codes},
             "note": f"{d} 장마감 기준 Better.7 Signal v2(자동 신호 studio/signal.json, {S.get('updated', '')} 계산). "
                     f"GitHub Actions 자동 기록. 이 파일은 신호 발표 시점의 기록이며 수정하지 않는다."}

    ax = S["axis"]
    exp = {code: e for code, rule, name, e in us.ETFS}
    etfs = {}
    for c in codes:
        dt = S["detail"][c]
        parts = {k: round(w * ax[k], 2) for k, w in exp[c].items()}
        if round(sum(parts.values()), 2) != dt["score"]:
            return skip(f"{c}: 축 기여 합 {sum(parts.values()):.2f} ≠ 점수 {dt['score']}")
        etfs[c] = {"score": dt["score"], "parts": parts, "wind": dt["wind"], "stage": dt["stage"], "sig": sig[c]}
    try:
        inds = [{"tag": k.split("|")[0], "axis": a, "state": live["ind"][k]["state"]} for a, ks in us.AXIS.items() for k in ks]
    except KeyError as e:
        return skip(f"지표 누락 {e}")
    ctx = {"month": month, "asof": d.replace("-", ".") + " 장마감",
           "engine": f"Signal v2 자동 신호 · {d[5:].replace('-', '.')} 장마감 계산값(signal.json)",
           "axes": ax, "indicators": inds, "etfs": etfs, "note": "신호 발표 시점의 판단 근거. 사후 수정하지 않는다."}

    if sigs and sigs[-1].get("end") is None:
        sigs[-1]["end"] = d
    sigs.append(entry)
    os.makedirs(CONTEXT_DIR, exist_ok=True)
    with open(os.path.join(CONTEXT_DIR, f"{month}.json"), "w", encoding="utf-8") as f:
        f.write(json.dumps(ctx, ensure_ascii=False, indent=1) + "\n")
    with open(SIGNALS, "w", encoding="utf-8") as f:
        f.write(json.dumps(sigs, ensure_ascii=False, indent=1) + "\n")
    log(f"[month-signal] {month} 기록: 신호일 {d}, 남는 돈 {left}원, 신호 {sig}")
    print("month_recorded=true")
    print(f"month={month}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
