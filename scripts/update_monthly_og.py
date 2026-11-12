#!/usr/bin/env python3
"""
월배당 안내(/monthly1·2) 카톡 썸네일·카드 문구를 이번 회차 달에 맞춘다.
- studio/dividends.json 에서 회차(중간/월말)별 '지급 전 가장 가까운 달'을 고른다 (페이지와 같은 규칙)
- monthly/og1.png(중간·주황), og2.png(월말·청록) 를 그리고 monthly/index.html, end.html 의 og 태그를 고친다
출력: og_changed=true|false
"""
import json, os, re, sys, datetime
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FB = os.path.join(ROOT, "scripts/fonts/og-bold.otf")
FR = os.path.join(ROOT, "scripts/fonts/og-regular.otf")
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


def draw(path, line2, cols):
    im = Image.new("RGB", (W, H))
    px = im.load()
    a, b = cols
    for y in range(H):
        for x in range(W):
            t = min(1.0, max(0.0, (y / H) * 0.85 + (x / W) * 0.15))
            px[x, y] = tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
    d = ImageDraw.Draw(im)
    f1, f2 = ImageFont.truetype(FB, 118), ImageFont.truetype(FR, 58)
    b1, b2 = d.textbbox((0, 0), "MAKESBETTER", font=f1), d.textbbox((0, 0), line2, font=f2)
    h1, h2, gap = b1[3] - b1[1], b2[3] - b2[1], 46
    top = (H - (h1 + gap + h2)) // 2 - 16
    # 두 줄의 왼쪽 '잉크' 끝을 정확히 같은 x(PAD)에 맞춘다
    d.text((PAD - b1[0], top - b1[1]), "MAKESBETTER", font=f1, fill="white")
    d.text((PAD - b2[0], top + h1 + gap - b2[1]), line2, font=f2, fill="white")
    # 화살표: 오른쪽·아래 여백을 글자 왼쪽 여백과 같게
    s, lw = 96, 11
    x1, y1 = W - PAD, H - PAD
    x0, y0 = x1 - s, y1 - s
    d.line([(x0, y0), (x1 - lw // 2, y1 - lw // 2)], fill="white", width=lw)
    d.line([(x1 - lw // 2, y0 + 30), (x1 - lw // 2, y1)], fill="white", width=lw)
    d.line([(x0 + 30, y1 - lw // 2), (x1, y1 - lw // 2)], fill="white", width=lw)
    im.save(path, optimize=True)


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
        new = set_meta(new, "og:image", "https://calc.makesbetter.co.kr/monthly/%s?v=%s" % (img, ym.replace("-", "")[2:]))
        new = re.sub(r'(<meta name="description" content=")[^"]*(")', lambda m: m.group(1) + DESC + m.group(2), new, count=1)
        if new != html or not os.path.exists(os.path.join(ROOT, "monthly", img)) or "--force" in sys.argv:
            draw(os.path.join(ROOT, "monthly", img), title, cols)
            open(p, "w", encoding="utf-8").write(new)
            changed = True
    print("og_changed=%s" % ("true" if changed else "false"))


if __name__ == "__main__":
    main()
