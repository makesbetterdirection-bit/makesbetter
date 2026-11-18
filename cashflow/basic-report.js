/* MAKESBETTER 현금흐름 베이직 리포트 (담당 디렉터용 A4 1장) — 11/18 시안
   쓰는 곳: /cashflow/ (/cash코드 · 공용 · 청주) 접수 메일 첨부
   MBBasicReport.build(data) → Promise<"data:application/pdf;base64,...">
   MBBasicReport.html(data)  → A4(794×1123) HTML 문자열
   data: { date, director, name, phone, route, coupon, incomeType, self,
           lastYearIncome, monthlyIncome, monthlyFixed, bank, securities, insurance,
           totalFinancial, totalRealEstate, totalDebt }   (금액 단위: 만원)
   디자인: M4S PRO 리포트 기준(바탕 #F3F3F3 · 글자 #111 · 데이터 파랑 · 차이 주황/파랑 · 빨강 없음 · IBM Plex Sans KR + Onest) */
(function () {
  var C = { bg: "#F3F3F3", ink: "#111111", sub: "#5F5F5F", rule: "#DADADA", card: "#FFFFFF",
            navy: "#0A1A4A", blue: "#2C62E8", blue2: "#4D7BFF", blue3: "#1D3FA8", band: "#B9C6EE",
            up: "#B4541A", down: "#1D4FBF", amberBg: "#F6E3B4", amberInk: "#6B4A00" };
  var KR = "'IBM Plex Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif", NUM = KR; /* Onest는 html2canvas에서 숫자 간격이 벌어져 한글 글꼴로 통일 */

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(v) { var n = parseFloat(String(v == null ? "" : v).replace(/,/g, "")); return isNaN(n) ? 0 : n; }
  function n0(v) { return Math.round(v).toLocaleString("ko-KR"); }
  function signed(v) { v = Math.round(v); return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toLocaleString("ko-KR"); }
  function pct(a, b) { return b > 0 ? Math.round(a / b * 1000) / 10 : 0; }
  function money(v, unitSize) { return '<span style="white-space:nowrap">' + signed(v).replace(/^\+/, "") + '<span style="font-size:' + (unitSize || 13) + 'px;font-weight:500;margin-left:2px">만원</span></span>'; }

  function calc(d) {
    var income = num(d.monthlyIncome), fixed = num(d.monthlyFixed);
    var bank = num(d.bank), sec = num(d.securities), ins = num(d.insurance), invest = bank + sec + ins;
    var fin = num(d.totalFinancial), re = num(d.totalRealEstate), debt = num(d.totalDebt), last = num(d.lastYearIncome);
    return { income: income, fixed: fixed, invest: invest, bank: bank, sec: sec, ins: ins, fin: fin, re: re, debt: debt, last: last,
      surplus: income - fixed - invest, savingsRate: income > 0 ? invest / income * 100 : null,
      netAssets: fin + re - debt, debtRatio: (fin + re) > 0 ? debt / (fin + re) * 100 : null,
      yearFeel: income * 12, diff: income * 12 - last, cross: income > 0 && last > 0 };
  }

  function chip(text, kind) {
    var st = kind === "good" ? "background:" + C.blue + ";color:#fff"
      : kind === "warn" ? "background:" + C.amberBg + ";color:" + C.amberInk
      : kind === "mid" ? "border:1px solid #9A9A9A;color:#4A4A4A"
      : "border:1px solid " + C.rule + ";color:" + C.sub;
    return '<span style="display:inline-block;align-self:flex-start;padding:2px 8px;font-size:12px;font-weight:600;line-height:1.5;' + st + '">' + esc(text) + "</span>";
  }

  var SELF = { A: ["A", "매우 정확", 5], B: ["B", "정확한 편", 4], C: ["C", "보통", 3], D: ["D", "부족한 편", 2], E: ["E", "매우 부족", 1] };

  function points(d, r) {
    var out = ["변동지출 실측 — 카드 3개월 명세서로 비어 있는 칸 채우기"];
    if (r.surplus < 0) out.push("체감 소득 " + n0(r.income) + "만원이 세후 실수령액인지 확인 (고정지출 + 저축·투자 " + n0(r.fixed + r.invest) + "만원)");
    else if (r.surplus > 0) out.push("매달 쓰임이 확인되지 않은 " + n0(r.surplus) + "만원 (1년 " + n0(r.surplus * 12) + "만원) 찾기");
    if (r.cross && r.last > 0 && Math.abs(r.diff) / r.last >= 0.2) out.push(r.diff < 0
      ? "작년 세전 소득과 체감 연소득 차이 " + n0(Math.abs(r.diff)) + "만원 — 원천징수영수증으로 실소득 확인"
      : "체감 연소득이 작년 세전 소득보다 " + n0(r.diff) + "만원 많음 — 다른 소득원 확인");
    var s = SELF[d.self];
    if (s && s[2] >= 4 && out.length > 1) out.push("스스로 매긴 정확도 " + s[0] + "(" + s[1] + ") — 위 차이를 숫자로 함께 보기");
    if (r.debtRatio !== null && r.debtRatio > 30) out.push("부채비율 " + (Math.round(r.debtRatio * 10) / 10) + "% — 대출 구조 점검");
    return out.slice(0, 3);
  }

  function html(d) {
    var r = calc(d), s = SELF[d.self] || ["-", "미입력", 0];
    var name = esc(d.name || "고객"), dir = esc(d.director || "-");
    var over = r.income > 0 ? pct(r.fixed + r.invest, r.income) : 0;
    var fixP = pct(r.fixed, r.income), invP = pct(r.invest, r.income);

    /* 결론 띠 */
    var head, sub;
    if (r.surplus < 0) { head = "체감 소득보다 고정지출과 저축·투자가<br>매달 " + n0(-r.surplus) + "만 원 더 많습니다."; sub = "소득 기준이나 지출 금액을 다시 확인해야 합니다. 변동지출은 아직 측정 전입니다."; }
    else if (r.surplus > 0) { head = "매달 " + n0(r.surplus) + "만 원이 어디로 가는지<br>확인되지 않았습니다."; sub = "1년이면 " + n0(r.surplus * 12) + "만 원입니다. 변동지출을 실측하면 이 칸이 채워집니다."; }
    else { head = "소득이 고정지출과 저축·투자로<br>정확히 나뉘어 있습니다."; sub = "변동지출이 들어갈 자리가 없습니다. 실제 카드 지출을 확인해야 합니다."; }

    /* 네 칸 */
    function cell(label, no, val, note, opt) {
      opt = opt || {};
      return '<div style="padding:12px 16px 11px;background:' + (opt.empty ? "#EEF2FD" : C.card) + ";" + (opt.empty ? "border:1.5px dashed " + C.blue + ";" : "") + 'display:flex;flex-direction:column;gap:3px">' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:14px;font-weight:600">' + label + '</span><span style="font-family:' + NUM + ';font-size:12px;font-weight:700;color:' + (opt.empty ? C.blue : C.sub) + '">' + no + "</span></div>" +
        '<div style="font-family:' + NUM + ';font-size:24px;font-weight:700;color:' + (opt.empty ? C.blue : C.ink) + '">' + val + "</div>" +
        '<div style="font-size:12px;color:' + C.sub + ';line-height:1.5">' + note + "</div></div>";
    }
    var grid = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:' + C.rule + ";border:1px solid " + C.rule + '">' +
      cell("소득", "01", money(r.income, 14), esc(d.incomeType || "소득구조 미입력") + " · 체감 월평균") +
      cell("고정지출", "02", money(r.fixed, 14), "소득의 " + fixP + "%") +
      cell("변동지출", "03", '?<span style="font-size:14px;font-weight:600;margin-left:6px">미측정</span>', "PRO 과정에서 카드 3개월로 실측", { empty: true }) +
      cell("저축·투자", "04", money(r.invest, 14), "은행 " + n0(r.bank) + " · 증권사 " + n0(r.sec) + " · 보험사 " + n0(r.ins) + " (만원) · 소득의 " + invP + "%") +
      "</div>";

    /* 소득 100% 막대 */
    var bar = "";
    if (r.income > 0) {
      var tot = Math.max(100, over), wF = r.fixed / r.income * 100 / tot * 100, wI = r.invest / r.income * 100 / tot * 100;
      var wG = r.surplus > 0 ? r.surplus / r.income * 100 / tot * 100 : 0;
      bar = '<div style="margin-top:12px">' +
        '<div style="position:relative;display:flex;height:12px;background:#E6E6E6">' +
          '<i style="width:' + wF + '%;background:' + C.navy + '"></i><i style="width:' + wI + '%;background:' + C.blue2 + '"></i>' +
          (wG ? '<i style="width:' + wG + '%;background:' + C.up + '"></i>' : "") +
          (over > 100 ? '<span style="position:absolute;top:-4px;bottom:-4px;left:' + (100 / tot * 100) + '%;width:2px;background:' + C.ink + '"></span>' : "") +
        "</div>" +
        '<div style="display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:8px;font-size:12px;color:' + C.sub + '">' +
          '<span><i style="display:inline-block;width:9px;height:9px;background:' + C.navy + ';margin-right:5px"></i>고정지출 ' + fixP + "%</span>" +
          '<span><i style="display:inline-block;width:9px;height:9px;background:' + C.blue2 + ';margin-right:5px"></i>저축·투자 ' + invP + "%</span>" +
          (r.surplus > 0 ? '<span style="color:' + C.up + '"><i style="display:inline-block;width:9px;height:9px;background:' + C.up + ';margin-right:5px"></i>확인 안 됨 ' + pct(r.surplus, r.income) + "%</span>" : "") +
          (over > 100 ? '<span style="color:' + C.ink + ';font-weight:600">세로선 = 체감 소득 100% · ' + Math.round((over - 100) * 10) / 10 + "% 초과</span>" : "") +
        "</div></div>";
    }

    /* 주요 숫자 */
    var drTxt = r.debtRatio === null ? "-" : (Math.round(r.debtRatio * 10) / 10) + "%";
    var drChip = r.debtRatio === null ? chip("부채 없음", "ref") : r.debtRatio <= 30 ? chip("양호", "good") : r.debtRatio <= 50 ? chip("보통", "mid") : chip("점검 필요", "warn");
    var sfChip = r.surplus < 0 ? chip("점검 필요", "warn") : r.surplus > 0 ? chip("쓰임 확인", "warn") : chip("참고", "ref");
    function kpi(label, val, c) {
      return '<div style="padding:10px 14px;background:' + C.card + ';display:flex;flex-direction:column;gap:4px">' +
        '<span style="font-size:12px;color:' + C.sub + '">' + label + "</span>" +
        '<span style="font-family:' + NUM + ';font-size:21px;font-weight:700">' + val + "</span>" + c + "</div>";
    }
    var kpis = '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:' + C.rule + ";border:1px solid " + C.rule + '">' +
      kpi("월 저축·투자율", r.savingsRate === null ? "-" : (Math.round(r.savingsRate * 10) / 10) + "%", '<span style="font-size:12px;color:' + C.sub + '">기준 미혼 60% · 기혼 40%</span>') +
      kpi("월 여유자금", money(r.surplus, 12), sfChip) +
      kpi("순자산", money(r.netAssets, 12), '<span style="font-size:12px;color:' + C.sub + '">금융 + 부동산 − 부채</span>') +
      kpi("부채비율", drTxt, drChip) + "</div>";

    /* 체감 vs 작년 소득 */
    var crossCol = r.diff < 0 ? C.up : C.down;
    var cross = r.cross
      ? '<div style="display:flex;flex-direction:column;gap:5px;font-size:14px">' +
          '<div style="display:flex;justify-content:space-between"><span>체감 월소득 × 12</span><b style="font-family:' + NUM + '">' + n0(r.yearFeel) + "만원</b></div>" +
          '<div style="display:flex;justify-content:space-between"><span>작년 세전 소득</span><b style="font-family:' + NUM + '">' + n0(r.last) + "만원</b></div>" +
          '<div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid ' + C.rule + '"><span>차이</span><b style="font-family:' + NUM + ";color:" + crossCol + '">' + signed(r.diff) + "만원</b></div>" +
          '<p style="margin:2px 0 0;font-size:12px;line-height:1.55;color:' + C.sub + '">세후 실소득(세금·4대보험 차감)은 PRO 과정에서 원천징수영수증으로 확인합니다.</p></div>'
      : '<p style="margin:0;font-size:14px;color:' + C.sub + '">작년 소득이 입력되지 않아 비교하지 않았습니다.</p>';

    /* 자산 · 부채 */
        var bs = '<div style="display:flex;flex-direction:column;gap:5px;font-size:14px">' +
      '<div style="display:flex;justify-content:space-between"><span>총 금융자산</span><b style="font-family:' + NUM + '">' + n0(r.fin) + "만원</b></div>" +
      '<div style="display:flex;justify-content:space-between"><span>총 부동산자산</span><b style="font-family:' + NUM + '">' + n0(r.re) + "만원</b></div>" +
      '<div style="display:flex;justify-content:space-between"><span>총 부채</span><b style="font-family:' + NUM + '">' + n0(r.debt) + "만원</b></div>" +
      '<div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid ' + C.rule + '"><span>순자산</span><b style="font-family:' + NUM + '">' + signed(r.netAssets).replace(/^\+/, "") + "만원</b></div>" +
      "</div>";

    var pts = points(d, r).map(function (t, i) {
      return '<div style="display:grid;grid-template-columns:26px minmax(0,1fr);gap:10px;padding:7px 0;border-top:1px solid ' + C.rule + '"><span style="font-family:' + NUM + ';font-size:13px;font-weight:700;color:' + C.blue + '">0' + (i + 1) + '</span><span style="font-size:14px;line-height:1.5">' + esc(t) + "</span></div>";
    }).join("");

    function info_unused(k, v) { return '<div style="padding:10px 12px;background:' + C.card + '"><p style="margin:0;font-size:12px;color:' + C.sub + '">' + k + '</p><p style="margin:3px 0 0;font-size:14px;font-weight:600">' + v + "</p></div>"; }

    return '<div style="width:794px;height:1123px;box-sizing:border-box;overflow:hidden;padding:30px 46px 20px;display:flex;flex-direction:column;gap:12px;background:' + C.bg + ";color:" + C.ink + ";font-family:" + KR + ';word-break:keep-all">' +
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<div style="display:flex;align-items:center;gap:10px"><span style="padding:4px 10px;background:' + C.ink + ";color:#fff;font-family:" + NUM + ';font-size:12px;font-weight:700;letter-spacing:1px">BASIC</span><span style="font-size:13px;font-weight:600">현금흐름 베이직 리포트</span></div>' +
        '<span style="font-size:12px;color:' + C.sub + '"><span style="font-family:' + NUM + '">' + esc(d.date || "") + "</span> · 담당 " + dir + " 디렉터</span></div>" +
      '<div><h1 style="margin:0;font-size:32px;font-weight:700;letter-spacing:-0.6px">' + name + " 님의 현금흐름 네 칸</h1>" +
        '<p style="margin:6px 0 0;font-size:13px;color:' + C.sub + '">연락처 ' + esc(d.phone || "-") + " · 유입 " + esc(d.route || "-") + (d.coupon ? " (쿠폰 " + esc(d.coupon) + ")" : "") + " · 셀프 평가 " + s[0] + "(" + s[1] + ")</p></div>" +
      '<div style="display:grid;grid-template-columns:minmax(0,1fr) 170px;gap:24px;align-items:center;padding:16px 22px;background:' + C.navy + ';color:#fff">' +
        '<div><p style="margin:0;font-size:22px;font-weight:600;line-height:1.42">' + head + '</p><p style="margin:8px 0 0;font-size:13px;line-height:1.55;color:' + C.band + '">' + sub + "</p></div>" +
        '<div style="text-align:right"><p style="margin:0;font-size:12px;color:' + C.band + '">월 여유자금</p><p style="margin:4px 0 0;font-family:' + NUM + ';font-size:38px;font-weight:700;line-height:1.1">' + signed(r.surplus) + '<span style="font-size:15px;font-weight:500;margin-left:3px;color:' + C.band + '">만원</span></p></div></div>' +
      '<section><div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px"><h2 style="margin:0;font-size:22px;font-weight:700;letter-spacing:-0.3px">Money 4 Square · 체감 네 칸</h2><span style="font-size:12px;color:' + C.sub + '">고객이 적은 월 금액</span></div>' + grid + bar + "</section>" +
      kpis +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">' +
        '<section style="padding:12px 16px;background:' + C.card + '"><h3 style="margin:0 0 8px;font-size:15px;font-weight:700">체감 vs 작년 소득</h3>' + cross + "</section>" +
        '<section style="padding:12px 16px;background:' + C.card + '"><h3 style="margin:0 0 8px;font-size:15px;font-weight:700">자산 · 부채</h3>' + bs + "</section></div>" +
      '<section><h2 style="margin:0 0 4px;font-size:18px;font-weight:700">다음 상담에서 확인할 것</h2>' + pts + "</section>" +
      '<div style="flex:1 1 auto"></div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:2px solid ' + C.rule + '"><span style="font-family:' + NUM + ';font-size:12px;font-weight:700;letter-spacing:0.5px">NO MAGIC, JUST COMMON SENSE</span><span style="font-size:12px;color:' + C.sub + '">고객이 직접 입력한 체감 수치로 계산했습니다. 평가나 상품 제안이 아닙니다.</span></div>' +
    "</div>";
  }

  function loadScript(src, test) {
    if (test()) return Promise.resolve();
    return new Promise(function (ok, no) { var s = document.createElement("script"); s.src = src; s.onload = function () { test() ? ok() : no(new Error(src)); }; s.onerror = no; document.head.appendChild(s); });
  }
  function loadFonts(text) {
    if (!document.querySelector("link[data-mb-basic-font]")) {
      var l = document.createElement("link"); l.rel = "stylesheet"; l.setAttribute("data-mb-basic-font", "1");
      l.href = "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=Onest:wght@500;700;800&display=swap";
      document.head.appendChild(l);
    }
    if (!document.fonts || !document.fonts.load) return new Promise(function (ok) { setTimeout(ok, 1200); });
    var p = Promise.all(["400 14px 'IBM Plex Sans KR'", "600 14px 'IBM Plex Sans KR'", "700 32px 'IBM Plex Sans KR'", "700 28px 'Onest'", "500 13px 'Onest'"].map(function (f) { return document.fonts.load(f, text).catch(function () {}); }));
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
      return window.html2canvas(el, { scale: 2, backgroundColor: C.bg, logging: false, useCORS: true, windowWidth: 794 });
    }).then(function (cv) {
      window.__basicReportCanvas = cv;
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

  window.MBBasicReport = { build: build, html: html, calc: calc };
})();
