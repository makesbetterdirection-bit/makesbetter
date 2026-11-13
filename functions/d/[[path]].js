// /d/<디렉터> — 디렉터 페이지. 페이지는 하나(/d/)이고 주소만 다름.
// ?by=이름 이 있으면 카카오톡 미리보기 카드 제목에 보낸 사람 이름을 넣는다.
const KEYS = new Set(["lee", "oh", "byun", "hong", "kang", "kimdh", "kimsy"]);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const m = /^\/d\/([a-z]+)\/?$/.exec(url.pathname);
  if (!m || !KEYS.has(m[1])) return next();
  const res = await env.ASSETS.fetch(new Request(new URL("/d/", url), request));
  const by = (url.searchParams.get("by") || "").replace(/\s+/g, "").slice(0, 10);
  if (!by) return res;
  const title = `${esc(by)} 님이 보낸 초대장`;
  return new HTMLRewriter()
    .on('meta[property="og:title"]', { element(e) { e.setAttribute("content", title); } })
    .on('meta[property="og:description"]', { element(e) { e.setAttribute("content", "메이크스베러 디렉터의 초대장"); } })
    .on("title", { element(e) { e.setInnerContent(title); } })
    .transform(res);
}
