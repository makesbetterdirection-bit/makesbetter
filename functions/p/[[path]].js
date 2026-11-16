// /p/<플래너> — 플랫폼 유입 페이지. 페이지는 하나(/open/)이고 주소만 달라, 누구 링크로 들어왔는지 구분한다.
const KEYS = new Set(["lee", "oh", "byun", "hong", "kang", "kimdh", "kimsy", "sy"]);
export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const m = /^\/p\/([a-z]+)\/?$/.exec(url.pathname);
  if (!m || !KEYS.has(m[1])) return next();
  return env.ASSETS.fetch(new Request(new URL("/open/", url), request));
}
