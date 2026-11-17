// /d/<디렉터> — 디렉터 페이지. 페이지는 하나(/d/)이고 주소만 다름.
// 카카오톡 미리보기 카드: 디렉터 이름 · 썸네일(남/여)을 주소에 맞게 넣는다.
// ?by=이름 이 있으면 카드 제목에 보낸 사람 이름을 넣는다.
const NAMES = { lee: "이종호", oh: "오수현", byun: "변보라", hong: "홍민아", kang: "강소리", kimdh: "김다희", kimsy: "김상윤", sy: "김소연", jo: "조숙원", kimhh: "김현희", leejh: "이지훈" };
const MALE = new Set(["lee", "kimsy", "leejh"]);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const m = /^\/d\/([a-z]+)\/?$/.exec(url.pathname);
  if (!m || !NAMES[m[1]]) return next();
  const k = m[1];
  const res = await env.ASSETS.fetch(new Request(new URL("/d/", url), request));
  const by = (url.searchParams.get("by") || "").replace(/\s+/g, "").slice(0, 10);
  const img = `${url.origin}/d/og/${MALE.has(k) ? "m" : "f"}-1117.jpg`;
  const title = by ? `${esc(by)} 님이 보낸 초대장` : `${NAMES[k]} 디렉터의 초대장`;
  const desc = by ? `${NAMES[k]} 디렉터 · 메이크스베러` : "돈의 흐름을 설계합니다. ETF로 제2의 급여 만들기";
  return new HTMLRewriter()
    .on('meta[property="og:title"]', { element(e) { e.setAttribute("content", title); } })
    .on('meta[property="og:description"]', { element(e) { e.setAttribute("content", desc); } })
    .on('meta[property="og:image"]', { element(e) { e.setAttribute("content", img); } })
    .on("title", { element(e) { e.setInnerContent(title); } })
    .transform(res);
}
