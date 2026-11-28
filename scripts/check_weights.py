#!/usr/bin/env python3
"""기본 비중 일치 점검 — studio/weights.json(유일한 원본)과 화면에 따로 적힌 값(studio/index.html V2W,
studio/board/index.html BENCH 기본값)이 다르면 실패(exit 1). GitHub Actions 마지막 단계에서 실행해,
다르면 실행이 '실패'로 표시되고 GitHub 알림 메일이 간다. stdlib 만 사용."""
import json
import re
import sys

W = json.load(open("studio/weights.json", encoding="utf-8"))["weights"]
bad = []
if abs(sum(W.values()) - 100) > 1e-9:
    bad.append(f"studio/weights.json 합계 {sum(W.values())} ≠ 100")
for path, var in (("studio/index.html", "V2W"), ("studio/board/index.html", "BENCH")):
    m = re.search(var + r"=(\{[^}]*\})", open(path, encoding="utf-8").read())
    if not m:
        bad.append(f"{path}: {var} 없음")
    elif json.loads(m.group(1)) != W:
        bad.append(f"{path}: {var} {m.group(1)} ≠ weights.json")
for b in bad:
    print("[weights] 불일치:", b)
print("[weights] 일치" if not bad else "[weights] 실패")
sys.exit(1 if bad else 0)
