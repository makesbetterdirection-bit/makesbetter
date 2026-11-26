// /s/<디렉터> — 기계약자가 지인에게 초대장을 보내는 화면. 페이지는 /d/ 와 같고 주소로 보내기 화면을 연다.
const NAMES = { lee: "이종호", lee1: "이종호", oh: "오수현", byun: "변보라", hong: "홍민아", kang: "강소리", kimdh: "김다희", kimsy: "김상윤", sy: "김소연", jo: "조숙원", kimhh: "김현희", leejh: "이지훈" };
// 같은 보내기 화면, 카톡 카드만 다른 주소. lee1 = mbkr.my/leejoin1 (현대자동차 퇴직연금 DC 유치용). \u2028 = 카톡 줄바꿈
const CARD = { lee1: { img: "/d/og/m-1117.jpg", title: "한국투자증권", desc: "이종호 디렉터\u2028현대자동차 퇴직연금 DC 신청" } };
export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const m = /^\/s\/([a-z0-9]+)\/?$/.exec(url.pathname);
  if (!m || !NAMES[m[1]]) return next();
  const res = await env.ASSETS.fetch(new Request(new URL("/d/", url), request));
  const c = CARD[m[1]];
  const title = c ? c.title : "소중한 분께 초대장을 전해 주세요";
  return new HTMLRewriter()
    .on('meta[property="og:title"]', { element(e) { e.setAttribute("content", title); } })
    .on('meta[property="og:description"]', { element(e) { e.setAttribute("content", c ? c.desc : NAMES[m[1]] + " 디렉터 드림"); } })
    .on('meta[property="og:image"]', { element(e) { if (c) e.setAttribute("content", url.origin + c.img); } })
    .on("title", { element(e) { e.setInnerContent(title); } })
    .transform(res);
}
