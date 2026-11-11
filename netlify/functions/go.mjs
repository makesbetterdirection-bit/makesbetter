// 초대 이벤트 (mbkr.my/go) — 등록 · 참여자 기록 · 실시간 순위 · 관리자
// 저장: Netlify Blobs "go-event" / 키 "state" 한 개 (etag로 동시 저장 충돌 방지)
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

export const config = { path: ["/api/go/*", "/g/*"] };

const ADMIN_HASH = "4fac70b63fc7034f6813f1bfbc68d93c8bac5a1b18523993f471a4f37cc24bc9";
const sha = (s) => createHash("sha256").update(String(s)).digest("hex");
const store = () => getStore({ name: "go-event", consistency: "strong" });
const EMPTY = { participants: [], meta: { start: null, end: null, threeLimit: 10 } };
// 등록은 번호별 키(r/01012345678)로 따로 저장 → 동시 등록이 서로 덮어쓰지 않고, 같은 번호는 한 번만 저장됨
let cache = null;
async function loadRegs(fresh) {
  if (!fresh && cache && Date.now() - cache.t < 4000) return cache.regs;
  const s = store();
  const { blobs } = await s.list({ prefix: "r/" });
  const regs = (await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })))).filter(Boolean);
  cache = { t: Date.now(), regs };
  return regs;
}

const json = (d, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" },
  });

async function loadState() {
  const r = await store().getWithMetadata("state", { type: "json" });
  const data = r ? { ...EMPTY, ...r.data } : structuredClone(EMPTY);
  delete data.regs;
  return { data, etag: r ? r.etag : null };
}
async function load(fresh) {
  const [{ data, etag }, regs] = await Promise.all([loadState(), loadRegs(fresh)]);
  return { data: { ...data, regs }, etag };
}
async function update(fn) {
  for (let i = 0; i < 6; i++) {
    const { data, etag } = await loadState();
    const out = await fn(data);
    const opt = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };
    const res = await store().setJSON("state", data, opt);
    if (res && res.modified === false) { await new Promise((r) => setTimeout(r, 80 + Math.random() * 200)); continue; }
    return out;
  }
  throw new Error("busy");
}

const digits = (s) => String(s || "").replace(/\D/g, "");
const cleanName = (s) => String(s || "").replace(/\s+/g, "").slice(0, 10);
const mask = (n) => {
  n = String(n || "");
  if (n.length <= 1) return n;
  if (n.length === 2) return n[0] + "*";
  return n[0] + "*".repeat(n.length - 2) + n[n.length - 1];
};
const newId = () => Math.random().toString(36).slice(2, 8);

function compute(d) {
  const per = new Map(d.participants.map((p) => [p.id, { p, list: [] }]));
  const valid = d.regs.filter((r) => r.ok && r.ref && per.has(r.ref)).sort((a, b) => a.at - b.at);
  for (const r of valid) per.get(r.ref).list.push(r);
  const rows = [...per.values()]
    .map(({ p, list }) => ({
      id: p.id, name: p.name, count: list.length,
      t1: list[0]?.at || null, t3: list[2]?.at || null, tN: list.at(-1)?.at || null,
    }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count || a.tN - b.tN);
  rows.forEach((x, i) => (x.rank = i + 1));
  const limit = d.meta.threeLimit || 10;
  const three = rows.filter((x) => x.count >= 3).sort((a, b) => a.t3 - b.t3).slice(0, limit).map((x) => x.id);
  return { rows, three, limit, valid: valid.length };
}

function inPeriod(meta, t) {
  if (meta.start && t < Date.parse(meta.start)) return false;
  if (meta.end && t > Date.parse(meta.end)) return false;
  return true;
}

function meView(d, id) {
  const p = d.participants.find((x) => x.id === id);
  if (!p) return null;
  const c = compute(d);
  const row = c.rows.find((x) => x.id === id);
  const count = row ? row.count : 0;
  const got3 = c.three.includes(id);
  const recent = d.regs
    .filter((r) => r.ref === id)
    .sort((a, b) => b.at - a.at)
    .slice(0, 20)
    .map((r) => ({ name: mask(r.name), at: r.at, ok: r.ok, why: r.ok ? "" : r.why }));
  return {
    id, name: p.name, count, rank: row ? row.rank : null, players: c.rows.length,
    coffee: count >= 1, three: got3, threeLeft: Math.max(0, c.limit - c.three.length),
    recent, end: d.meta.end,
  };
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST" } });
  const url = new URL(req.url);
  // 공유 링크 /g/<id>: 카카오 미리보기에 초대한 사람 이름을 넣고 바로 초대장 페이지로 이동
  if (url.pathname.startsWith("/g/")) {
    const id = url.pathname.slice(3).replace(/[^a-z0-9]/gi, "").slice(0, 12);
    let name = null;
    try { const { data } = await loadState(); const p = data.participants.find((x) => x.id === id); name = p ? p.name : null; } catch (e) {}
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const title = name ? `${esc(name)} 님이 보낸 초대장` : "당신에게만 온 초대장";
    const to = "/go/" + (name ? "?r=" + id : "");
    const img = url.searchParams.get("t") === "gif" ? "og-anim.gif" : "invite-card.jpg";
    return new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><meta property="og:type" content="website"><meta property="og:title" content="${title}"><meta property="og:description" content="당신의 삶이 개선되는 시간">
<meta property="og:image" content="https://calc.makesbetter.co.kr/go/${img}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="600">
<meta property="og:url" content="https://calc.makesbetter.co.kr/g/${id}"><meta http-equiv="refresh" content="0;url=${to}"></head>
<body><script>location.replace(${JSON.stringify(to)})</script><a href="${to}">초대장 열기</a></body></html>`,
      { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
  }
  const op = url.pathname.replace(/^\/api\/go\/?/, "").split("/")[0];
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

  try {
    // 초대한 사람 이름 (받는 사람 화면 상단)
    if (op === "who") {
      const { data } = await load();
      const p = data.participants.find((x) => x.id === url.searchParams.get("r"));
      return json({ name: p ? p.name : null });
    }

    // 받는 사람 등록
    if (op === "reg" && req.method === "POST") {
      const name = cleanName(body.name), phone = digits(body.phone);
      if (name.length < 2) return json({ ok: false, code: "name", msg: "이름을 확인해 주세요." }, 400);
      if (!/^01[016789]\d{7,8}$/.test(phone)) return json({ ok: false, code: "phone", msg: "휴대폰 번호를 확인해 주세요." }, 400);
      if (!body.agree) return json({ ok: false, code: "agree", msg: "개인정보 수집·이용에 동의해 주세요." }, 400);
      // 초대장은 처음 연 순간부터 24시간 (10분 여유)
      const t0 = Number(body.t);
      if (t0 && t0 < Date.now() && Date.now() - t0 > 864e5 + 6e5) return json({ ok: false, code: "expired", msg: "초대장 등록 시간이 지났어요." }, 410);
      const ip = req.headers.get("x-nf-client-connection-ip") || "";
      const dev = sha(ip + "|" + (req.headers.get("user-agent") || "")).slice(0, 10);
      const { data: d } = await load(true);
      const now = Date.now();
      if (d.regs.some((r) => r.phone === phone)) return json({ ok: false, code: "dup", msg: "이미 등록된 번호예요. 아래에서 바로 받아 보세요." });
      let ref = d.participants.find((x) => x.id === body.r) ? body.r : null;
      const refName = cleanName(body.refName);
      if (!ref && refName) {
        const m = d.participants.filter((x) => x.name === refName);
        if (m.length === 1) ref = m[0].id;
      }
      const inviter = d.participants.find((x) => x.id === ref);
      let why = "";
      if (d.participants.some((x) => x.phone && x.phone === phone)) why = inviter && inviter.phone === phone ? "self" : "participant";
      else if (!inPeriod(d.meta, now)) why = "period";
      else if (!ref) why = "noref";
      const res = await store().setJSON("r/" + phone, { name, phone, ref, refName, at: now, dev, ok: !why, why, mk: !!body.mk }, { onlyIfNew: true });
      if (res && res.modified === false) return json({ ok: false, code: "dup", msg: "이미 등록된 번호예요. 아래에서 바로 받아 보세요." });
      cache = null;
      const out = { ok: true, inviter: inviter ? inviter.name : null };
      return json(out);
    }

    // 참여자 확인 (이름 + 휴대폰 뒤 4자리) / 내 기록
    if (op === "me") {
      const { data } = await load();
      let id = url.searchParams.get("id");
      if (req.method === "POST") {
        const name = cleanName(body.name), l4 = digits(body.last4).slice(-4);
        const p = data.participants.find((x) => x.name === name && x.last4 === l4);
        if (!p) return json({ ok: false, msg: "퀴즈 참여 명단에서 찾지 못했어요. 이름과 뒤 4자리를 확인해 주세요." }, 404);
        id = p.id;
      }
      const v = meView(data, id);
      return v ? json({ ok: true, ...v }) : json({ ok: false, msg: "참여자 정보를 찾지 못했어요." }, 404);
    }

    // 실시간 순위판
    if (op === "board") {
      const { data } = await load();
      const c = compute(data);
      const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
      const today = data.regs.filter((r) => r.ok && new Date(r.at + 9 * 3600e3).toISOString().slice(0, 10) === day).length;
      return json({
        total: c.valid, today, coffee: c.rows.length, threeGiven: c.three.length, threeLimit: c.limit,
        top: c.rows.slice(0, 10).map((x) => ({ name: mask(x.name), count: x.count, rank: x.rank })),
        start: data.meta.start, end: data.meta.end,
      });
    }

    // 관리자
    if (op === "admin") {
      const key = req.method === "POST" ? body.key : url.searchParams.get("key");
      if (sha(key || "") !== ADMIN_HASH) return json({ ok: false, msg: "관리자 키가 맞지 않아요." }, 401);
      if (req.method === "GET") {
        const { data } = await load(true);
        return json({ ok: true, ...data, computed: compute(data) });
      }
      if (body.op === "set") {
        const k = "r/" + digits(body.phone), r = await store().get(k, { type: "json" });
        if (!r) return json({ ok: false, msg: "등록 기록 없음" });
        if ("ok" in body) { r.ok = !!body.ok; r.why = body.ok ? "" : body.why || "admin"; }
        if ("ref" in body) r.ref = body.ref || null;
        await store().setJSON(k, r); cache = null;
        return json({ ok: true, reg: r });
      }
      if (body.op === "delete") {
        let removed = 0;
        for (const p of body.phones || []) { await store().delete("r/" + digits(p)); removed++; }
        cache = null;
        return json({ ok: true, removed });
      }
      const out = await update((d) => {
        if (body.op === "participants") {
          // [{name, phone}] — 기존 id는 이름+번호가 같으면 유지
          const old = new Map(d.participants.map((p) => [p.name + "|" + p.phone, p.id]));
          const seen = new Set(), list = [];
          for (const x of body.list || []) {
            const name = cleanName(x.name), phone = digits(x.phone);
            if (!name || phone.length < 4) continue;
            const k = name + "|" + phone;
            if (seen.has(k)) continue;
            seen.add(k);
            list.push({ id: old.get(k) || newId(), name, phone, last4: phone.slice(-4) });
          }
          d.participants = list;
          return { ok: true, participants: list.length };
        }
        if (body.op === "meta") { d.meta = { ...d.meta, ...body.meta }; return { ok: true, meta: d.meta }; }
        return { ok: false, msg: "unknown op" };
      });
      return json(out);
    }

    return json({ ok: false, msg: "not found" }, 404);
  } catch (e) {
    return json({ ok: false, msg: "잠시 후 다시 시도해 주세요.", err: String(e && e.message) }, 500);
  }
};
