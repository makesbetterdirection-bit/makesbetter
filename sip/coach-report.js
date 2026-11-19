/* MAKESBETTER 코칭 사전 리포트 — 고객이 고른 답만 정리 (분석·판정 문장 없음, 11/18)
   쓰는 곳: /sip/ (The Opening Sip 신청), /coaching/ (쿠폰 1:1 코칭 신청)
   MBCoachReport.build(data) → Promise<"data:application/pdf;base64,...">
   MBCoachReport.analyze(data) → { rows:[{k,t,b,a,c}], summary }   (c: ok 일치 · ref 참고 · chk 점검 필요 · sug 제안)
   data: { date, director, name, phone, referrer, route, coupon, drink,
           worry:[], method:[], goal:[], income:"", accounts:[], need:[], rate:"", mgoal:"", hasAccountsQ:true } */
(function () {
  var C = { bg: "#F6F3EE", ink: "#1A1A1A", accent: "#A30E14", mute: "#6A635C", rule: "#DDD5CB", line: "#CFC7BD", card: "#E2DBD2" };
  var SERIF = "'Noto Serif KR', 'Nanum Myeongjo', serif", SANS = "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function has(a, v) { return (a || []).indexOf(v) > -1; }
  function arr(v) { return Array.isArray(v) ? v.filter(Boolean) : (v ? [v] : []); }
  function batchim(w) { var c = String(w).trim().slice(-1).charCodeAt(0); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 !== 0; }

  var INVEST = ["국내 주식 투자", "해외 주식 투자", "펀드 중심의 간접투자"];
  var SAFE = "예·적금 중심의 운용", NOPLAN = "아직 명확한 계획 없음";
  var LONG = ["은퇴자금 만들기", "주택마련 & 대출상환", "교육자금 & 창업자금"];
  var N_DIV = "월배당으로 제2의 월급 만들기";
  var SHORT_M = { "예·적금 중심의 운용": "예·적금 중심", "펀드 중심의 간접투자": "펀드", "부동산 중심의 운용(임대,투자)": "부동산 중심", "아직 명확한 계획 없음": "계획 없음" };
  var SHORT_G = { "은퇴자금 만들기": "은퇴자금", "주택마련 & 대출상환": "주택마련", "교육자금 & 창업자금": "교육·창업자금", "종자돈 만들기": "종자돈" };
  var SHORT_N = { "퇴직연금(DC) 투자 설정과 노하우": "퇴직연금 DC", "월배당으로 제2의 월급 만들기": "월배당", "연금(IRP·연금저축) 제대로 굴리기": "연금", "달러·환율, 언제 어떻게 담을지": "달러", "대출 상환 vs 투자, 무엇부터 할지": "대출 vs 투자", "세금 덜 내는 계좌(ISA·비과세) 활용": "절세 계좌", "지금 가진 금융상품 점검": "상품 점검" };
  var TOPIC = { "퇴직연금(DC) 투자 설정과 노하우": "퇴직연금 DC 투자", "월배당으로 제2의 월급 만들기": "월배당", "연금(IRP·연금저축) 제대로 굴리기": "연금", "달러·환율, 언제 어떻게 담을지": "달러 투자", "대출 상환 vs 투자, 무엇부터 할지": "대출 상환 순서", "세금 덜 내는 계좌(ISA·비과세) 활용": "절세 계좌", "지금 가진 금융상품 점검": "상품 점검" };
  /* 고민 → 이 고민을 다루는 '받고 싶은 정보'. 빈 배열 = 받고 싶은 정보 선택지에 없는 현금흐름 고민, "*" = 어떤 정보든 해당 */
  var WMAP = {
    "늘어나는 고정지출": [], "소득 대비 낮은 저축": [],
    "대출 상환 부담": ["대출 상환 vs 투자, 무엇부터 할지"],
    "교육비 & 노후준비": ["퇴직연금(DC) 투자 설정과 노하우", "연금(IRP·연금저축) 제대로 굴리기"],
    "자산 성장의 정체": ["퇴직연금(DC) 투자 설정과 노하우", "월배당으로 제2의 월급 만들기", "연금(IRP·연금저축) 제대로 굴리기", "달러·환율, 언제 어떻게 담을지", "세금 덜 내는 계좌(ISA·비과세) 활용", "지금 가진 금융상품 점검"],
    "낮은 금융 지식": "*"
  };
  var WACT = {
    "늘어나는 고정지출": "코칭 앞부분에 머니4스퀘어로 현금흐름부터 같이 보기",
    "소득 대비 낮은 저축": "코칭 앞부분에 머니4스퀘어로 현금흐름부터 같이 보기",
    "대출 상환 부담": "대출 상환과 투자, 무엇부터 할지 먼저 정리하기",
    "교육비 & 노후준비": "노후 준비 현황(연금)부터 확인하기",
    "자산 성장의 정체": "지금 가진 상품의 수익률부터 점검하기",
    "낮은 금융 지식": "용어부터 쉽게, 한 가지 주제씩 설명하기"
  };
  function norm(d) {
    var o = {}; for (var k in d) o[k] = d[k];
    ["worry", "method", "goal", "accounts", "need"].forEach(function (k) { o[k] = arr(d[k]).map(function (x) { return x === "구체적이 목적 없음" ? "구체적인 목적 없음" : x; }); });
    o.income = d.income || ""; o.hasAccountsQ = d.hasAccountsQ !== false;
    return o;
  }

  function analyze(raw) {
    var d = norm(raw), rows = [], m = d.method, g = d.goal, a = d.accounts, n = d.need;
    var inv = m.some(function (x) { return INVEST.indexOf(x) > -1; }), safe = has(m, SAFE), re = m.some(function (x) { return /^부동산/.test(x); });

    /* 1. 운용 성향 */
    if (m.length) {
      var t1, a1;
      if (has(m, NOPLAN) && !inv && !safe && !re) { t1 = "아직 운용 계획을 세우기 전입니다"; a1 = "목표부터 함께 정하고, 첫 운용 방법을 하나만 제안하기"; }
      else if (safe && !inv) { t1 = "원금 보전 중심"; a1 = "ETF가 무엇인지 기초부터 쉽게 설명하기"; }
      else if (safe && inv) { t1 = "안정 중심, 일부 투자"; a1 = "투자 경험이 있어 ETF 설명은 기초부터 하지 않아도 됩니다"; }
      else if (inv) { t1 = "투자 중심"; a1 = "지금 투자 상품의 수익률과 위험부터 함께 점검하기"; }
      else if (re) { t1 = "부동산 중심"; a1 = "부동산 밖 금융자산 비중과 현금흐름 확인하기"; }
      else { t1 = "기타 방식으로 운용"; a1 = "코칭 때 운용 방법을 직접 묻기"; }
      if (re && (safe || inv)) t1 += " · 부동산 포함";
      rows.push({ k: "운용 성향", t: t1, b: "근거 · " + m.join(" + "), a: a1, c: "ref" });
    }

    /* 2. 목표와 수단 */
    if (g.length && m.length) {
      var gl = g.filter(function (x) { return !/구체적/.test(x); }), longs = gl.filter(function (x) { return LONG.indexOf(x) > -1; });
      var b2 = "근거 · 목적 " + (gl.length ? gl.map(function (x) { return SHORT_G[x] || x; }).join("·") : "구체적인 목적 없음") + " / 운용 " + m.map(function (x) { return SHORT_M[x] || x; }).join("·");
      if (!gl.length) rows.push({ k: "목표와 수단", t: "모으는 목적이 아직 없습니다", b: b2, a: "코칭 첫 질문으로 목표 금액과 시기를 함께 정하기", c: "sug" });
      else if (longs.length && safe && !inv) rows.push({ k: "목표와 수단", t: "장기 목표를 예·적금만으로 준비하고 있습니다", b: b2, a: "지금 금리가 물가를 이기는지, 실질 수익률부터 보여 주기", c: "chk" });
      else if (longs.length && safe) rows.push({ k: "목표와 수단", t: "장기 목표에 비해 예·적금 비중이 큽니다", b: b2, a: "지금 금리가 물가를 이기는지, 실질 수익률부터 보여 주기", c: "chk" });
      else if (longs.length && has(m, NOPLAN)) rows.push({ k: "목표와 수단", t: "장기 목표는 있는데 운용 계획이 없습니다", b: b2, a: "목표별 필요 금액과 기간부터 계산해 보여 주기", c: "chk" });
      else if (!longs.length && safe) rows.push({ k: "목표와 수단", t: "종자돈 목표에 맞게 안정적으로 모으고 있습니다", b: b2, a: "종자돈 목표 금액과 시기 확인하기", c: "ok" });
      else rows.push({ k: "목표와 수단", t: "목표와 운용 방향이 맞습니다", b: b2, a: "목표별 필요 금액과 기간 점검하기", c: "ok" });
    }

    /* 3. 절세 계좌 (세액공제 한도: 연금저축+IRP 합산 900만 원 · 연금저축 600만 원) */
    if (d.hasAccountsQ && (m.length || g.length || a.length)) {
      if (!a.length) rows.push({ k: "절세 계좌", t: "점검받을 계좌를 고르지 않았습니다", b: "근거 · 점검받을 계좌 없음", a: "가진 계좌를 코칭 때 화면으로 함께 확인하기", c: "ref" });
      else {
        var ps = has(a, "연금저축계좌(세액공제)"), irp = has(a, "개인형 IRP(세액공제)"), isa = has(a, "중개형 ISA"), nt = has(a, "비과세 계좌");
        var cnt = [ps, irp, isa, nt].filter(Boolean).length, miss = [];
        if (!irp) miss.push("IRP"); if (!isa) miss.push("ISA");
        var b3 = "근거 · 점검받을 계좌 " + a.length + "개 중 세액공제·비과세 계좌 " + cnt + "개";
        if (!cnt) rows.push({ k: "절세 계좌", t: "세액공제·비과세 계좌를 고르지 않았습니다", b: b3, a: "연금저축·IRP·ISA의 혜택과 한도부터 안내하기", c: "chk" });
        else if (ps && !irp) rows.push({ k: "절세 계좌", t: "연금저축은 있고, " + miss.join("·") + " 계좌는 고르지 않았습니다", b: b3, a: "세액공제 한도 900만 원 중 연금저축 600만 원까지만 쓰는지 확인하기", c: "chk" });
        else if (irp && !ps) rows.push({ k: "절세 계좌", t: "IRP는 있고, 연금저축은 고르지 않았습니다", b: b3, a: "IRP 납입액이 세액공제 한도 900만 원을 채우는지 확인하기", c: "ref" });
        else if (ps && irp) rows.push({ k: "절세 계좌", t: "연금저축과 IRP를 함께 갖고 있습니다", b: b3, a: "두 계좌 합산 세액공제 한도 900만 원을 채우는지 확인하기", c: "ok" });
        else rows.push({ k: "절세 계좌", t: "ISA·비과세 계좌는 있고, 연금 세액공제 계좌는 고르지 않았습니다", b: b3, a: "연금저축·IRP 세액공제 혜택 안내하기", c: "chk" });
      }
    }

    /* 4. 고민과 요청 */
    var w = d.worry.filter(function (x) { return x !== "기타"; }), cash = false;
    if (w.length) {
      if (n.length) {
        var un = w.filter(function (x) { var t = WMAP[x]; return t === "*" ? false : !(t || []).some(function (y) { return has(n, y); }); });
        var b4 = "근거 · 고민 " + w.join("·") + " / 요청 " + n.map(function (x) { return SHORT_N[x] || x; }).join("·");
        if (!un.length) rows.push({ k: "고민과 요청", t: "고민과 받고 싶은 정보가 이어집니다", b: b4, a: "고른 순서대로 준비해 가기", c: "ok" });
        else { cash = /머니4스퀘어/.test(WACT[un[0]] || ""); rows.push({ k: "고민과 요청", t: "‘" + un[0] + "’ 고민이 받고 싶은 정보에는 없습니다", b: b4, a: WACT[un[0]] || "코칭 때 고민을 먼저 묻기", c: "sug" }); }
      } else { cash = /머니4스퀘어/.test(WACT[w[0]] || ""); rows.push({ k: "가장 큰 고민", t: "‘" + w[0] + "’" + (batchim(w[0]) ? "이" : "가") + " 가장 불편하다고 했습니다", b: "근거 · 고민 " + w.join("·"), a: WACT[w[0]] || "코칭 때 고민을 먼저 묻기", c: "sug" }); }
    }

    /* 5. 소득 목표 */
    if (d.income) {
      var i = d.income, b5 = "근거 · 더 만들 소득 " + i + (n.length ? " / 요청 " + n.map(function (x) { return SHORT_N[x] || x; }).join("·") : "");
      if (i === "월배당 소득" && has(n, N_DIV)) rows.push({ k: "소득 목표", t: "월배당이 이번 코칭의 핵심 주제입니다", b: b5, a: "목표 월배당 금액을 먼저 묻고 필요한 투자금으로 바꿔 보여 주기", c: "ok" });
      else if (i === "월배당 소득") rows.push({ k: "소득 목표", t: "월배당을 원하지만 받고 싶은 정보에는 없습니다", b: b5, a: "월배당 ETF로 만드는 제2의 월급을 짧게 소개하기", c: "sug" });
      else if (i === "임대 소득") rows.push({ k: "소득 목표", t: "임대 소득을 원합니다", b: b5, a: "부동산과 월배당 ETF의 현금흐름을 나란히 비교해 보여 주기", c: "ref" });
      else if (i === "N JOB" || i === "디지털 콘텐츠 수익") rows.push({ k: "소득 목표", t: "일해서 버는 소득을 더 늘리고 싶어 합니다", b: b5, a: "늘어날 소득을 저축과 투자에 어떻게 나눌지 함께 정하기", c: "ref" });
      else rows.push({ k: "소득 목표", t: "원하는 소득 형태를 기타로 골랐습니다", b: b5, a: "코칭 때 원하는 소득 형태를 직접 묻기", c: "ref" });
    } else if (d.mgoal) {
      rows.push({ k: "소득 목표", t: "월배당 목표는 " + d.mgoal + "입니다", b: "근거 · 월배당 목표 " + d.mgoal + (d.rate ? " / 희망 수익률 " + d.rate : ""), a: "목표 월배당에 필요한 투자금을 계산해 보여 주기", c: "ref" });
    }

    /* 종합 */
    var tp = n.map(function (x) { return TOPIC[x] || x; }), s1;
    if (tp.length >= 2) s1 = "핵심 주제는 " + tp[0] + (batchim(tp[0]) ? "과 " : "와 ") + tp[1] + "입니다.";
    else if (tp.length === 1) s1 = "핵심 주제는 " + tp[0] + "입니다.";
    else s1 = "핵심 주제는 코칭 첫머리에 함께 정합니다.";
    var r3 = rows.filter(function (r) { return r.k === "절세 계좌"; })[0], r2 = rows.filter(function (r) { return r.k === "목표와 수단"; })[0], s2;
    if (cash) s2 = "그 전에 저축률을 먼저 확인하면 목표 금액을 현실에 맞게 잡을 수 있습니다.";
    else if (r3 && r3.c === "chk") s2 = "절세 계좌를 얼마나 쓰고 있는지도 함께 점검하면 좋습니다.";
    else if (r2 && r2.c === "chk") s2 = "목표에 맞게 운용 방법을 바꿀 여지가 있습니다.";
    else s2 = "고객이 고른 순서대로 준비해 가면 됩니다.";
    return { rows: rows, summary: s1 + " " + s2 };
  }

  var CHIP = {
    ok: "border:1px solid " + C.ink + ";color:" + C.ink, ref: "border:1px solid #A8A097;color:#4F4943",
    chk: "background:#F3D9A4;color:#6B4A00", sug: "background:" + C.accent + ";color:#FFFFFF"
  };
  var CHIP_L = { ok: "일치", ref: "참고", chk: "점검 필요", sug: "제안" };

  /* 리포트는 고객이 직접 고른 답만 보여 준다 — 추정·판정 문장은 넣지 않는다 (11/18 대표 요청) */
  var R = { bg: "#FFFFFF", ink: "#141414", sub: "#6B6B6B", rule: "#E4E4E4", accent: "#A30E14" };
  function vals(list, empty) {
    list = arr(list);
    if (!list.length) return '<p style="margin:0;font-size:15px;color:' + R.sub + '">' + esc(empty || "고르지 않음") + "</p>";
    return list.map(function (x) { return '<p style="margin:0;font-size:15px;line-height:1.6;font-weight:500">' + esc(x) + "</p>"; }).join("");
  }
  function row(label, body) {
    return '<div style="display:grid;grid-template-columns:168px minmax(0,1fr);gap:0 24px;padding:16px 0;border-bottom:1px solid ' + R.rule + '">' +
      '<p style="margin:2px 0 0;font-size:13px;font-weight:700;color:' + R.sub + '">' + esc(label) + "</p><div>" + body + "</div></div>";
  }
  function info(label, v) {
    return '<div><p style="margin:0;font-size:12px;color:' + R.sub + '">' + esc(label) + '</p><p style="margin:5px 0 0;font-size:15px;font-weight:700">' + esc(v || "-") + "</p></div>";
  }

  function html(raw) {
    var d = norm(raw);
    var rows = row("가장 불편한 재정 고민", vals(d.worry)) +
      row("현재 자산 운용 방법", vals(d.method)) +
      row("자산 운용 목적", vals(d.goal));
    if (d.income) rows += row("더 만들고 싶은 소득", vals([d.income]));
    if (d.rate) rows += row("희망 수익률", vals([d.rate]));
    if (d.mgoal) rows += row("월배당 목표", vals([d.mgoal]));
    if (d.hasAccountsQ) rows += row("점검받을 계좌", vals(d.accounts, "없음"));
    rows += row("코칭 때 받고 싶은 정보", vals(d.need, "코칭 때 직접 묻기"));
    var route = d.coupon ? "쿠폰 " + d.coupon : (d.route || "-");
    return '<div style="width:794px;min-height:1123px;box-sizing:border-box;padding:56px 64px 36px;display:flex;flex-direction:column;background:' + R.bg + ";color:" + R.ink + ";font-family:" + SANS + ';word-break:keep-all">' +
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<div style="display:flex;align-items:center;gap:12px"><img src="/sip/mb-mark.png" width="40" height="40" alt="" style="display:block;width:40px;height:40px">' +
        '<p style="margin:0;font-size:14px;font-weight:700;letter-spacing:2px">MAKESBETTER</p></div>' +
        '<p style="margin:0;font-size:13px;color:' + R.sub + '">신청일 ' + esc(d.date || "") + "</p></div>" +
      '<h1 style="margin:56px 0 0;font-family:' + SERIF + ';font-size:34px;font-weight:900;letter-spacing:-0.8px">코칭 사전 리포트</h1>' +
      '<p style="margin:12px 0 0;font-size:17px">' + esc(d.name || "고객") + ' 님 <span style="color:' + R.sub + '">·</span> 담당 ' + esc(d.director || "-") + " 디렉터</p>" +
      '<div style="margin-top:32px;padding:20px 0;border-top:2px solid ' + R.ink + ";border-bottom:1px solid " + R.rule + ';display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px">' +
        info("연락처", d.phone) + info("추천인", d.referrer || "없음") + info("신청 경로", route) + info("웰컴 드링크", d.drink || "-") + "</div>" +
      '<p style="margin:36px 0 0;font-size:13px;font-weight:700;color:' + R.accent + '">고객이 고른 답</p>' +
      '<div style="margin-top:6px;border-top:1px solid ' + R.ink + '">' + rows + "</div>" +
      '<div style="flex:1 1 auto;min-height:120px;margin-top:32px"><p style="margin:0;font-size:13px;font-weight:700;color:' + R.sub + '">디렉터 메모</p>' +
        '<div style="margin-top:30px;height:1px;background:' + R.rule + '"></div><div style="margin-top:30px;height:1px;background:' + R.rule + '"></div></div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:24px;padding-top:12px;border-top:1px solid ' + R.rule + '">' +
        '<p style="margin:0;font-family:' + SERIF + ';font-size:13px;font-weight:700">No Magic. Just Common Sense.</p>' +
        '<p style="margin:0;font-size:12px;color:' + R.sub + '">모든 답은 고객이 신청서에서 직접 고른 내용입니다</p></div></div>';
  }

  function loadScript(src, test) {
    if (test()) return Promise.resolve();
    return new Promise(function (ok, no) { var s = document.createElement("script"); s.src = src; s.onload = function () { test() ? ok() : no(new Error(src)); }; s.onerror = no; document.head.appendChild(s); });
  }
  function loadFonts(text) {
    if (!document.querySelector("link[data-mb-report-font]")) {
      var l = document.createElement("link"); l.rel = "stylesheet"; l.setAttribute("data-mb-report-font", "1");
      l.href = "https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@700;900&family=Noto+Sans+KR:wght@400;500;700&display=swap";
      document.head.appendChild(l);
    }
    if (!document.fonts || !document.fonts.load) return new Promise(function (ok) { setTimeout(ok, 1200); });
    var p = Promise.all(["900 30px 'Noto Serif KR'", "700 17px 'Noto Serif KR'", "400 13px 'Noto Sans KR'", "500 13px 'Noto Sans KR'", "700 15px 'Noto Sans KR'"].map(function (f) { return document.fonts.load(f, text).catch(function () {}); }));
    return Promise.race([p, new Promise(function (ok) { setTimeout(ok, 6000); })]);
  }

  function build(data) {
    var box = document.createElement("div");
    box.setAttribute("aria-hidden", "true");
    box.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;z-index:-1;pointer-events:none";
    box.innerHTML = html(data);
    document.body.appendChild(box);
    var el = box.firstChild;
    return Promise.all([
      loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js", function () { return !!window.html2canvas; }),
      loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js", function () { return !!(window.jspdf && window.jspdf.jsPDF); }),
      loadFonts(el.textContent)
    ]).then(function () {
      return window.html2canvas(el, { scale: 2, backgroundColor: R.bg, logging: false, useCORS: true, windowWidth: 794 });
    }).then(function (cv) {
      window.__coachReportCanvas = cv;
      var pw = 595.28, ph = pw * cv.height / cv.width, out = "", qs = [0.86, 0.74, 0.62, 0.5, 0.4];
      for (var i = 0; i < qs.length; i++) {
        var doc = new window.jspdf.jsPDF({ unit: "pt", format: [pw, ph], orientation: "portrait", compress: true });
        doc.addImage(cv.toDataURL("image/jpeg", qs[i]), "JPEG", 0, 0, pw, ph, "p1", "NONE");
        out = "data:application/pdf;base64," + btoa(doc.output());
        if (out.length <= 450000) break;
      }
      box.remove();
      return out;
    }, function (e) { box.remove(); throw e; });
  }

  window.MBCoachReport = { build: build, analyze: analyze, html: html };
})();
