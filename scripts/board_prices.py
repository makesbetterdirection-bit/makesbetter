#!/usr/bin/env python3
"""
판단 기록 보드용 가격 이력 → studio/board/prices.json

- 11종 ETF: 야후파이낸스 일별 '수정종가(adjclose)'. 분배금이 반영된 값이라 커버드콜 ETF의 분배락 하락이 오차로 잡히지 않는다.
- 보드는 판단일 종가(판단일이 휴장이면 그다음 거래일 종가)를 기준으로 5·20거래일 뒤 수익률을 계산한다.
- 조회 실패 종목은 기존 이력을 유지한다(추정값으로 채우지 않음).
출력: changed=true|false
"""
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from update_better7_prices import KST, UAS, http_get, log  # noqa: E402

OUT = os.environ.get("BOARD_PRICES", "studio/board/prices.json")
CODES = json.load(open("better7_prices.json", encoding="utf-8"))["codes"]


def adj_history(code):
    last = None
    for ua in UAS:
        for host in ("query1.finance.yahoo.com", "query2.finance.yahoo.com"):
            try:
                url = f"https://{host}/v8/finance/chart/{code}.KS?range=1y&interval=1d&events=div"
                res = json.loads(http_get(url, tries=1, ua=ua))["chart"]["result"][0]
                off = res["meta"].get("gmtoffset", 32400)
                adj = res["indicators"]["adjclose"][0]["adjclose"]
                out = []
                for t, a in zip(res["timestamp"], adj):
                    if a is None:
                        continue
                    out.append([datetime.fromtimestamp(t + off, timezone.utc).strftime("%Y-%m-%d"), round(float(a), 2)])
                if len(out) < 20:
                    raise RuntimeError("bars < 20")
                return out
            except Exception as e:  # noqa: BLE001
                last = e
    raise RuntimeError(f"{code}: {last}")


def main():
    old = {}
    if os.path.exists(OUT):
        old = json.load(open(OUT, encoding="utf-8")).get("adj", {})
    adj, failed = {}, []
    for c in CODES:
        try:
            adj[c] = adj_history(c)
        except Exception as e:  # noqa: BLE001
            failed.append(c)
            log("FAIL", c, e)
            if c in old:
                adj[c] = old[c]
    if not adj or old == adj:
        print("changed=false")
        return
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"updated": datetime.now(KST).strftime("%Y-%m-%d %H:%M KST"), "source": "야후파이낸스 수정종가(분배금 반영)",
               "failed": failed, "adj": adj}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("changed=true")
    log(f"보드 가격 {len(adj)}종 저장, 실패 {failed}")


if __name__ == "__main__":
    main()
