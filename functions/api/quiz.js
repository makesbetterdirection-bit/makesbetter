// /api/quiz — 퀴즈 참여 등록 (Netlify Forms 대신). 저장: D1(DB) quiz_entries
// GET /api/quiz?key=관리자키 → 전체 목록(JSON). 관리자 키는 초대 이벤트와 같음.
const ADMIN_HASH = "4fac70b63fc7034f6813f1bfbc68d93c8bac5a1b18523993f471a4f37cc24bc9";
async function sha(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
export async function onRequest({ request, env }) {
  const db = env.DB;
  if (!db) return json({ ok: false, err: "no DB binding" }, 500);
  await db.prepare("CREATE TABLE IF NOT EXISTS quiz_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, form TEXT, at INTEGER, data TEXT)").run();
  if (request.method === "POST") {
    const ct = request.headers.get("content-type") || "";
    let o = {};
    if (ct.includes("json")) o = await request.json().catch(() => ({}));
    else { const f = new URLSearchParams(await request.text()); for (const [k, v] of f) o[k] = String(v).slice(0, 200); }
    if (o["bot-field"]) return json({ ok: true });
    const form = String(o["form-name"] || "quiz").slice(0, 40);
    delete o["bot-field"];
    await db.prepare("INSERT INTO quiz_entries (form, at, data) VALUES (?, ?, ?)").bind(form, Date.now(), JSON.stringify(o)).run();
    return json({ ok: true });
  }
  const url = new URL(request.url);
  if ((await sha(url.searchParams.get("key") || "")) !== ADMIN_HASH) return json({ ok: false, msg: "관리자 키가 맞지 않아요." }, 401);
  const { results } = await db.prepare("SELECT id, form, at, data FROM quiz_entries ORDER BY id").all();
  return json({ ok: true, entries: results.map((r) => ({ ...r, data: JSON.parse(r.data) })) });
}
