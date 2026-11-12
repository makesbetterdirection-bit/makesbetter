#!/usr/bin/env python3
"""
월배당 안내(/monthly1·2) 카톡 썸네일·카드 문구를 이번 회차 달에 맞춘다.
- studio/dividends.json 에서 회차(중간/월말)별 '지급 전 가장 가까운 달'을 고른다 (페이지와 같은 규칙)
- monthly/index.html, end.html 의 카드 제목(og:title '○월 중간배당 안내')·설명만 고친다. 썸네일 이미지는 고정
출력: og_changed=true|false
"""
import json, os, re, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CODES = {"mid": ["498400", "480030", "441640"], "end": ["494300", "0022T0", "332610", "473330"]}
CONF = {"mid": ("중간배당", "og1.png", "index.html", [(239, 115, 54), (212, 86, 30)]),
        "end": ("월말배당", "og2.png", "end.html", [(31, 163, 160), (15, 111, 116)])}
DESC = "제2의 급여 확인하세요"
W, H, PAD = 1200, 630, 84


def cur_month(ev, cyc, today):
    mine = [e for e in ev if e["cyc"] == cyc and e["code"] in CODES[cyc]]
    yms = sorted({e["ym"] for e in mine})
    up = [ym for ym in yms if any(e["ym"] == ym and e["pay"] >= today for e in mine)]
    ym = up[0] if up else (yms[-1] if yms else None)
    return ym


def set_meta(html, prop, val):
    return re.sub(r'(<meta property="%s" content=")[^"]*(")' % re.escape(prop), lambda m: m.group(1) + val + m.group(2), html, count=1)


def main():
    today = os.environ.get("TODAY") or (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=9)).strftime("%Y-%m-%d")
    ev = json.load(open(os.path.join(ROOT, "studio/dividends.json"), encoding="utf-8"))["ev"]
    changed = False
    for cyc, (name, img, page, cols) in CONF.items():
        ym = cur_month(ev, cyc, today)
        if not ym:
            continue
        title = "%d월 %s 안내" % (int(ym[5:7]), name)
        p = os.path.join(ROOT, "monthly", page)
        html = open(p, encoding="utf-8").read()
        new = set_meta(html, "og:title", title)
        new = set_meta(new, "og:description", DESC)
        new = re.sub(r'(<meta name="description" content=")[^"]*(")', lambda m: m.group(1) + DESC + m.group(2), new, count=1)
        if new != html:
            open(p, "w", encoding="utf-8").write(new)
            changed = True
    print("og_changed=%s" % ("true" if changed else "false"))


if __name__ == "__main__":
    main()
