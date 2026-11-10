// 초대 이벤트 (mbkr.my/go) — 등록 · 참여자 기록 · 실시간 순위 · 관리자
// 저장: Netlify Blobs "go-event" / 키 "state" 한 개 (etag로 동시 저장 충돌 방지)
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

export const config = { path: "/api/go/*" };

const ADMIN_HASH = "4fac70b63fc7034f6813f1bfbc68d93c8bac5a1b18523993f471a4f37cc24bc9";
const sha = (s) => createHash("sha256").update(String(s)).digest("hex");
const store = () => getStore({ name: "go-event", consistency: "strong" });
const EMPTY = { participants: [], regs: [], meta: { start: null, end: null, threeLimit: 10 } };

const json = (d, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" },
  });

async function load() {
  const r = await store().getWithMetadata("state", { type: "json" });
  return r ? { data: { ...EMPTY, ...r.data }, etag: r.etag } : { data: structuredClone(EMPTY), etag: null };
}
async function update(fn) {
  for (let i = 0; i < 6; i++) {
    const { data, etag } = await load();
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
      const ip = req.headers.get("x-nf-client-connection-ip") || "";
      const dev = sha(ip + "|" + (req.headers.get("user-agent") || "")).slice(0, 10);
      const out = await update((d) => {
        const now = Date.now();
        if (d.regs.some((r) => r.phone === phone)) return { ok: false, code: "dup", msg: "이미 등록된 번호예요. 아래에서 바로 받아 보세요." };
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
        d.regs.push({ name, phone, ref, refName, at: now, dev, ok: !why, why });
        return { ok: true, inviter: inviter ? inviter.name : null };
      });
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
        const { data } = await load();
        return json({ ok: true, ...data, computed: compute(data) });
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
        if (body.op === "set") {
          const r = d.regs.find((x) => x.phone === digits(body.phone));
          if (!r) return { ok: false, msg: "등록 기록 없음" };
          if ("ok" in body) { r.ok = !!body.ok; r.why = body.ok ? "" : body.why || "admin"; }
          if ("ref" in body) r.ref = body.ref || null;
          return { ok: true, reg: r };
        }
        if (body.op === "delete") {
          const before = d.regs.length;
          const set = new Set((body.phones || []).map(digits));
          d.regs = d.regs.filter((r) => !set.has(r.phone));
          return { ok: true, removed: before - d.regs.length };
        }
        return { ok: false, msg: "unknown op" };
      });
      return json(out);
    }

    return json({ ok: false, msg: "not found" }, 404);
  } catch (e) {
    return json({ ok: false, msg: "잠시 후 다시 시도해 주세요.", err: String(e && e.message) }, 500);
  }
};
