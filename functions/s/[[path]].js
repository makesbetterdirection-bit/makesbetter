// /s/<디렉터> — 기계약자가 지인에게 초대장을 보내는 화면. 페이지는 /d/ 와 같고 주소로 보내기 화면을 연다.
const NAMES = { lee: "이종호", oh: "오수현", byun: "변보라", hong: "홍민아", kang: "강소리", kimdh: "김다희", kimsy: "김상윤" };
export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const m = /^\/s\/([a-z]+)\/?$/.exec(url.pathname);
  if (!m || !NAMES[m[1]]) return next();
  const res = await env.ASSETS.fetch(new Request(new URL("/d/", url), request));
  const title = "소중한 분께 초대장을 전해 주세요";
  return new HTMLRewriter()
    .on('meta[property="og:title"]', { element(e) { e.setAttribute("content", title); } })
    .on('meta[property="og:description"]', { element(e) { e.setAttribute("content", NAMES[m[1]] + " 디렉터 드림"); } })
    .on("title", { element(e) { e.setInnerContent(title); } })
    .transform(res);
}
