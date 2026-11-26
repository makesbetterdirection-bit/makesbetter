// /h/<코드> — 현대자동차 DC 전환판(leejoin1) 지인 전달용 짧은 주소.
// 코드는 보낸 사람 이름(한글 음절마다 36진수 3자리). 저장소 없이 풀어서 /d/lee1?by=이름 으로 넘긴다.
const D = "0123456789abcdefghijklmnopqrstuvwxyz";
function decode(c) {
  if (!/^[0-9a-z]{3,30}$/.test(c) || c.length % 3) return "";
  let s = "";
  for (let i = 0; i < c.length; i += 3) {
    const v = D.indexOf(c[i]) * 1296 + D.indexOf(c[i + 1]) * 36 + D.indexOf(c[i + 2]);
    if (v < 0 || v > 11171) return "";
    s += String.fromCharCode(0xac00 + v);
  }
  return s;
}
export async function onRequest({ request }) {
  const url = new URL(request.url);
  const m = /^\/h\/([0-9a-z]+)\/?$/.exec(url.pathname);
  const name = m ? decode(m[1]) : "";
  const to = new URL("/d/lee1", url);
  if (name) to.searchParams.set("by", name);
  return Response.redirect(to.toString(), 302);
}
