// 초대 이벤트 (mbkr.my/go) — Cloudflare Pages Functions 판
// netlify/functions/go.mjs 와 같은 동작. 저장소만 Netlify Blobs → Cloudflare D1(바인딩 이름 DB)
//   go_state: k='state' 한 줄 (참여자 명단 · 기간 설정) + ver 로 동시 저장 충돌 방지
//   go_regs : 휴대폰 번호별 등록 한 줄 (같은 번호는 한 번만 — PRIMARY KEY)
// 개인정보(이름·번호)는 D1 에만 있고 저장소(GitHub)에는 올리지 않는다.

const ADMIN_HASH = "4fac70b63fc7034f6813f1bfbc68d93c8bac5a1b18523993f471a4f37cc24bc9";
const EMPTY = { participants: [], meta: { start: null, end: null, threeLimit: 10 } };

async function sha(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

let ready = false;
async function init(db) {
  if (ready) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS go_state (k TEXT PRIMARY KEY, v TEXT NOT NULL, ver INTEGER NOT NULL DEFAULT 0)"),
    db.prepare("CREATE TABLE IF NOT EXISTS go_regs (phone TEXT PRIMARY KEY, v TEXT NOT NULL, at INTEGER NOT NULL)"),
  ]);
  ready = true;
}

let cache = null;
async function loadRegs(db, fresh) {
  if (!fresh && cache && Date.now() - cache.t < 4000) return cache.regs;
  const { results } = await db.prepare("SELECT v FROM go_regs").all();
  const regs = results.map((r) => { try { return JSON.parse(r.v); } catch (e) { return null; } }).filter(Boolean);
  cache = { t: Date.now(), regs };
  return regs;
}

async function loadState(db) {
  const r = await db.prepare("SELECT v, ver FROM go_state WHERE k='state'").first();
  const data = r ? { ...EMPTY, ...JSON.parse(r.v) } : structuredClone(EMPTY);
  delete data.regs;
  return { data, ver: r ? r.ver : null };
}
async function load(db, fresh) {
  const [{ data }, regs] = await Promise.all([loadState(db), loadRegs(db, fresh)]);
  return { data: { ...data, regs } };
}
async function update(db, fn) {
  for (let i = 0; i < 6; i++) {
    const { data, ver } = await loadState(db);
    const out = await fn(data);
    const v = JSON.stringify(data);
    const res = ver === null
      ? await db.prepare("INSERT OR IGNORE INTO go_state (k, v, ver) VALUES ('state', ?, 1)").bind(v).run()
      : await db.prepare("UPDATE go_state SET v=?, ver=ver+1 WHERE k='state' AND ver=?").bind(v, ver).run();
    if (!res.meta || res.meta.changes !== 1) { await new Promise((r) => setTimeout(r, 80 + Math.random() * 200)); continue; }
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

const json = (d, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" },
  });

function compute(d) {
  const per = new Map(d.participants.map((p) => [p.id, { p, list: [] }]));
  const valid = d.regs.filter((r) => r.ok && r.ref && per.has(r.ref)).sort((a, b) => a.at - b.at);
  for (const r of valid) per.get(r.ref).list.push(r);
  const all = [...per.values()]
    .map(({ p, list }) => ({
      id: p.id, name: p.name, team: p.team === "w" ? "w" : "b", count: list.length,
      t1: list[0]?.at || null, t3: list[2]?.at || null, tN: list.at(-1)?.at || null,
    }))
    .filter((x) => x.count > 0);
  // 흑백 팀전: 백 = 디렉터(개인 경품 제외), 흑 = 퀴즈 참여자. 승부는 팀 등록 인원 합계
  const teams = { b: 0, w: 0, bPlayers: 0, wPlayers: 0 };
  for (const x of all) { teams[x.team] += x.count; teams[x.team + "Players"]++; }
  teams.bSize = d.participants.filter((p) => p.team !== "w").length;
  teams.wSize = d.participants.filter((p) => p.team === "w").length;
  const rows = all.filter((x) => x.team === "b").sort((a, b) => b.count - a.count || a.tN - b.tN);
  rows.forEach((x, i) => (x.rank = i + 1));
  const limit = d.meta.threeLimit || 10;
  const three = rows.filter((x) => x.count >= 3).sort((a, b) => a.t3 - b.t3).slice(0, limit).map((x) => x.id);
  return { rows, all, teams, three, limit, valid: valid.length };
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
  const any = c.all.find((x) => x.id === id);
  const count = any ? any.count : 0;
  const team = p.team === "w" ? "w" : "b";
  const got3 = c.three.includes(id);
  const recent = d.regs
    .filter((r) => r.ref === id)
    .sort((a, b) => b.at - a.at)
    .slice(0, 20)
    .map((r) => ({ name: mask(r.name), at: r.at, ok: r.ok, why: r.ok ? "" : r.why }));
  return {
    id, name: p.name, count, rank: row ? row.rank : null, players: c.rows.length,
    coffee: team === "b" && count >= 1, three: got3, threeLeft: Math.max(0, c.limit - c.three.length),
    recent, end: d.meta.end, team, teams: { b: c.teams.b, w: c.teams.w },
  };
}

// 공유 링크 /g/<id>: 카카오 미리보기에 초대한 사람 이름을 넣고 바로 초대장 페이지로 이동
export async function share(req, env) {
  const url = new URL(req.url);
  const id = url.pathname.slice(3).replace(/[^a-z0-9]/gi, "").slice(0, 12);
  let name = null;
  try { await init(env.DB); const { data } = await loadState(env.DB); const p = data.participants.find((x) => x.id === id); name = p ? p.name : null; } catch (e) {}
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

export async function api(req, env) {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST" } });
  const db = env.DB;
  if (!db) return json({ ok: false, msg: "잠시 후 다시 시도해 주세요.", err: "no DB binding" }, 500);
  const url = new URL(req.url);
  const op = url.pathname.replace(/^\/api\/go\/?/, "").split("/")[0];
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

  try {
    await init(db);

    // 초대한 사람 이름 (받는 사람 화면 상단)
    if (op === "who") {
      const { data } = await load(db);
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
      const ip = req.headers.get("cf-connecting-ip") || "";
      const dev = (await sha(ip + "|" + (req.headers.get("user-agent") || ""))).slice(0, 10);
      const { data: d } = await load(db, true);
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
      const rec = { name, phone, ref, refName, at: now, dev, ok: !why, why, mk: !!body.mk };
      const res = await db.prepare("INSERT OR IGNORE INTO go_regs (phone, v, at) VALUES (?, ?, ?)").bind(phone, JSON.stringify(rec), now).run();
      if (!res.meta || res.meta.changes !== 1) return json({ ok: false, code: "dup", msg: "이미 등록된 번호예요. 아래에서 바로 받아 보세요." });
      cache = null;
      return json({ ok: true, inviter: inviter ? inviter.name : null });
    }

    // 참여자 확인 (이름 + 휴대폰 뒤 4자리) / 내 기록
    if (op === "me") {
      const { data } = await load(db);
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
      const { data } = await load(db);
      const c = compute(data);
      const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
      const today = data.regs.filter((r) => r.ok && new Date(r.at + 9 * 3600e3).toISOString().slice(0, 10) === day).length;
      return json({
        total: c.valid, today, coffee: c.rows.length, threeGiven: c.three.length, threeLimit: c.limit,
        top: c.rows.slice(0, 10).map((x) => ({ name: mask(x.name), count: x.count, rank: x.rank })),
        start: data.meta.start, end: data.meta.end,
        teams: c.teams,
      });
    }

    // 관리자
    if (op === "admin") {
      const key = req.method === "POST" ? body.key : url.searchParams.get("key");
      if ((await sha(key || "")) !== ADMIN_HASH) return json({ ok: false, msg: "관리자 키가 맞지 않아요." }, 401);
      if (req.method === "GET") {
        const { data } = await load(db, true);
        return json({ ok: true, ...data, computed: compute(data) });
      }
      if (body.op === "set") {
        const k = digits(body.phone);
        const row = await db.prepare("SELECT v FROM go_regs WHERE phone=?").bind(k).first();
        if (!row) return json({ ok: false, msg: "등록 기록 없음" });
        const r = JSON.parse(row.v);
        if ("ok" in body) { r.ok = !!body.ok; r.why = body.ok ? "" : body.why || "admin"; }
        if ("ref" in body) r.ref = body.ref || null;
        await db.prepare("UPDATE go_regs SET v=? WHERE phone=?").bind(JSON.stringify(r), k).run();
        cache = null;
        return json({ ok: true, reg: r });
      }
      if (body.op === "delete") {
        let removed = 0;
        for (const p of body.phones || []) { const r = await db.prepare("DELETE FROM go_regs WHERE phone=?").bind(digits(p)).run(); removed += r.meta ? r.meta.changes : 0; }
        cache = null;
        return json({ ok: true, removed });
      }
      // 이전용: Netlify 에서 내려받은 기록을 그대로 옮겨 넣음 (참여자 id 유지)
      if (body.op === "restore") {
        const st = { participants: body.participants || [], meta: body.meta || EMPTY.meta };
        const stmts = [db.prepare("DELETE FROM go_state"), db.prepare("DELETE FROM go_regs"),
          db.prepare("INSERT INTO go_state (k, v, ver) VALUES ('state', ?, 1)").bind(JSON.stringify(st))];
        for (const r of body.regs || []) stmts.push(db.prepare("INSERT OR IGNORE INTO go_regs (phone, v, at) VALUES (?, ?, ?)").bind(digits(r.phone), JSON.stringify(r), Number(r.at) || 0));
        await db.batch(stmts);
        cache = null;
        return json({ ok: true, participants: st.participants.length, regs: (body.regs || []).length });
      }
      const out = await update(db, (d) => {
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
            list.push({ id: old.get(k) || newId(), name, phone, last4: phone.slice(-4), ...(x.team === "w" ? { team: "w" } : {}) });
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
}
