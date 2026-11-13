(function(){

  /* ============== CONFIG: 여기만 바꾸면 됩니다 ============== */
  var CONFIG = {
    brandName: "MakesBetter Direction",
    // 디렉터 목록 - 예약 위젯과 동일한 목록입니다.
    directors: [
      { name: "이종호", email: "bd187@naver.com" },
      { name: "오수현", email: "u0112383@naver.com" },
      { name: "변보라", email: "wpqlrhc217@naver.com" },
      { name: "홍민아", email: "carrot8807@naver.com" },
      { name: "강소리", email: "kangpro1004@kakao.com" },
      { name: "김다희", email: "plandh@naver.com" },
      { name: "김상윤", email: "gnswnajr@naver.com" }
    ],
    incomeTypes: ["근로소득자","개인사업자","근로소득자+개인사업자","법인대표 & 임원","기타"],
    // EmailJS 설정 - 예약 위젯과 동일한 계정/템플릿을 재사용합니다.
    emailjsPublicKey: "37rMXVT1INDvECR8k",
    emailjsServiceId: "service_lehvmhu",
    emailjsTemplateId: "template_myptiih",
    // 모든 결과 메일의 참조(모니터링)로 항상 함께 받을 주소
    monitorEmail: "makesbetter.direction@gmail.com"
  };
  /* =========================================================== */

  if (window.emailjs) { emailjs.init({ publicKey: CONFIG.emailjsPublicKey }); }

  var STEPS = ["basic","income","asset","self","result","done"];
  var STEP_LABELS = { basic:"STEP 1", income:"STEP 2", asset:"STEP 3", self:"STEP 4", result:"STEP 5" };

  function initCashflow(root){
  if (root.__mbcInit) return;
  root.__mbcInit = true;

  var state = {
    step: "basic",
    name: "", phone: "", director: "", coupon: (function(){try{return (new URLSearchParams(window.location.search).get("serial")||"").replace(/\D/g,"").slice(0,12);}catch(e){return "";}})(),
    incomeType: "", lastYearIncome: "", monthlyIncome: "", monthlyFixed: "",
    bank: "", securities: "", insurance: "",
    totalFinancial: "", totalRealEstate: "", totalDebt: "",
    self: ""
  };
  try{ var __cp=new URLSearchParams(location.search); var __cv=__cp.get("coupon")||__cp.get("coupon_no")||__cp.get("couponNumber")||__cp.get("coupon_number"); if(__cv) state.coupon=__cv; var __ch=(__cp.get("ch")||__cp.get("from")||"").toLowerCase(); state.kakao = !!state.coupon || !!__cv || __ch==="kakao"; }catch(e){}

  function num(v){ var n = parseFloat(String(v).replace(/,/g,"")); return isNaN(n) ? 0 : n; }
  function fmt(n){ return Math.round(n).toLocaleString("ko-KR"); }
  function pad(n){ return n < 10 ? "0"+n : ""+n; }
  function todayStr(){ var d=new Date(); return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); }

  function progressHtml(){
    var idx = STEPS.indexOf(state.step);
    var total = 5; // basic~result
    var bars = "";
    for (var i=0;i<total;i++){ bars += '<i class="'+(i<=idx?'on':'')+'"></i>'; }
    return '<div class="mbc-progress">'+bars+'</div>';
  }

  function headerHtml(title){
    return '<div class="mbc-header">'+
        '<div class="mbc-logo">'+CONFIG.brandName+'</div>'+
        '<div class="mbc-flow-tag">CASH FLOW<small>(현금흐름 점검)</small></div>'+
      '</div>'+
      progressHtml()+
      '<div class="mbc-step-label">'+(STEP_LABELS[state.step]||'')+'</div>'+
      '<div class="mbc-step-title">'+title+'</div>';
  }

  function numberField(id, label, hint, val){
    return '<div class="mbc-field"><label>'+label+(hint?' <span class="mbc-hint">'+hint+'</span>':'')+'</label>'+
      '<div class="mbc-field-unit"><input inputmode="numeric" id="'+id+'" value="'+val+'" placeholder="0"><span>만원</span></div></div>';
  }

  function renderBasic(){
    var directorOptions = '<option value="" disabled'+(state.director?'':' selected')+'>선택해주세요</option>' +
      CONFIG.directors.map(function(d){return '<option value="'+d.name+'"'+(state.director===d.name?' selected':'')+'>'+d.name+'</option>';}).join('');
    root.innerHTML = '<div class="mbc-card">'+
      headerHtml("소득을 자산화하는 첫걸음,<br>현재 현금흐름부터 확인해요")+
      '<div class="mbc-field"><label>성함 *</label><input id="mbc-name" type="text" placeholder="홍길동" value="'+state.name+'"></div>'+
      (state.kakao?'<div class="mbc-field"><label>연락처 *</label><input id="mbc-phone" type="tel" inputmode="tel" placeholder="010-0000-0000" value="'+state.phone+'"></div>':'')+
      (state.kakao?'<div class="mbc-field"><label>쿠폰번호 <span style="font-weight:400;opacity:.6">(선택 · 카카오 쿠폰 12자리)</span></label><input id="mbc-coupon" type="text" inputmode="numeric" placeholder="카카오에서 받은 쿠폰번호" value="'+state.coupon+'"><a href="https://pf.kakao.com/_eETXxj/coupons" target="_blank" rel="noopener" style="display:inline-block;margin-top:10px;font-size:13px;font-weight:600;color:#2f6b62;text-decoration:none">카카오 채널에서 쿠폰 받기 →</a></div>':'')+
      '<div class="mbc-field"><label>담당 디렉터 *</label><select id="mbc-director">'+directorOptions+'</select></div>'+
      '<div class="mbc-btn-row"><button class="mbc-btn" id="mbc-next">다음</button></div>'+
    '</div>';

    root.querySelector("#mbc-next").onclick = function(){
      state.name = root.querySelector("#mbc-name").value.trim();
      var __pe = root.querySelector("#mbc-phone"); if(__pe) state.phone = (__pe.value||"").trim();
      var __ce=root.querySelector("#mbc-coupon"); if(__ce) state.coupon=(__ce.value||"").trim();
      state.director = root.querySelector("#mbc-director").value;
      if (!state.name){ alert("성함을 입력해 주세요."); return; }
      if (state.kakao && state.phone.replace(/\D/g,"").length < 10){ alert("연락처를 정확히 입력해 주세요."); return; }
      if (!state.director){ alert("담당 디렉터를 선택해 주세요."); return; }
      state.step = "income";
      render();
    };
  }

  function renderIncome(){
    var typeChoices = CONFIG.incomeTypes.map(function(t){
      return '<div class="mbc-choice'+(state.incomeType===t?' selected':'')+'" data-type="'+t+'">'+t+'</div>';
    }).join('');

    root.innerHTML = '<div class="mbc-card">'+
      headerHtml("현재의 소득과 지출을 알아야<br>현금흐름을 정확히 볼 수 있어요")+
      '<div class="mbc-field"><label>소득 구조 *</label><div class="mbc-choice-grid" id="mbc-income-type">'+typeChoices+'</div></div>'+
      numberField("mbc-last-income","작년 소득(세전)","· 홈텍스 원천징수영수증 기준", state.lastYearIncome)+
      numberField("mbc-monthly-income","체감 평균 소득(월)","· 최근 3~6개월 급여명세서 기준", state.monthlyIncome)+
      numberField("mbc-monthly-fixed","체감 평균 고정지출(월)","· 뱅크샐러드·토스 등 참고", state.monthlyFixed)+
      '<div class="mbc-btn-row"><button class="mbc-btn ghost" id="mbc-back">‹ 뒤로</button><button class="mbc-btn" id="mbc-next">다음</button></div>'+
    '</div>';

    root.querySelectorAll("#mbc-income-type .mbc-choice").forEach(function(el){
      el.onclick = function(){
        state.incomeType = el.getAttribute("data-type");
        root.querySelectorAll("#mbc-income-type .mbc-choice").forEach(function(c){ c.classList.remove("selected"); });
        el.classList.add("selected");
      };
    });
    root.querySelector("#mbc-back").onclick = function(){ state.step="basic"; render(); };
    root.querySelector("#mbc-next").onclick = function(){
      state.lastYearIncome = root.querySelector("#mbc-last-income").value.trim();
      state.monthlyIncome = root.querySelector("#mbc-monthly-income").value.trim();
      state.monthlyFixed = root.querySelector("#mbc-monthly-fixed").value.trim();
      if (!state.incomeType){ alert("소득 구조를 선택해 주세요."); return; }
      state.step = "asset";
      render();
    };
  }

  function renderAsset(){
    root.innerHTML = '<div class="mbc-card">'+
      headerHtml("보유 자산을 확인하면<br>자산 규모의 적정성을 함께 볼 수 있어요")+
      '<div class="mbc-field"><label>금융사 투입 금액 (월)</label>'+
        '<div class="mbc-row3">'+
          '<div class="mbc-row3-col"><label class="mbc-row3-label">은행</label><div class="mbc-field-unit"><input inputmode="numeric" id="mbc-bank" value="'+state.bank+'" placeholder="0"><span>만원</span></div></div>'+
          '<div class="mbc-row3-col"><label class="mbc-row3-label">증권사</label><div class="mbc-field-unit"><input inputmode="numeric" id="mbc-securities" value="'+state.securities+'" placeholder="0"><span>만원</span></div></div>'+
          '<div class="mbc-row3-col"><label class="mbc-row3-label">보험사</label><div class="mbc-field-unit"><input inputmode="numeric" id="mbc-insurance" value="'+state.insurance+'" placeholder="0"><span>만원</span></div></div>'+
        '</div>'+
      '</div>'+
      numberField("mbc-total-financial","총 금융자산","· 은행·증권사·보험사 기타 합계", state.totalFinancial)+
      numberField("mbc-total-realestate","총 부동산자산","· 보유주택·보증금·임대 기타", state.totalRealEstate)+
      numberField("mbc-total-debt","총 부채","· 담보·신용·캐피탈 기타", state.totalDebt)+
      '<div class="mbc-btn-row"><button class="mbc-btn ghost" id="mbc-back">‹ 뒤로</button><button class="mbc-btn" id="mbc-next">다음</button></div>'+
    '</div>';

    root.querySelector("#mbc-back").onclick = function(){ state.step="income"; render(); };
    root.querySelector("#mbc-next").onclick = function(){
      state.bank = root.querySelector("#mbc-bank").value.trim();
      state.securities = root.querySelector("#mbc-securities").value.trim();
      state.insurance = root.querySelector("#mbc-insurance").value.trim();
      state.totalFinancial = root.querySelector("#mbc-total-financial").value.trim();
      state.totalRealEstate = root.querySelector("#mbc-total-realestate").value.trim();
      state.totalDebt = root.querySelector("#mbc-total-debt").value.trim();
      state.step = "self";
      render();
    };
  }

  function renderSelf(){
    var opts = [
      {k:"A", v:5, t:"매우 정확"},
      {k:"B", v:4, t:"정확한 편"},
      {k:"C", v:3, t:"보통"},
      {k:"D", v:2, t:"부족한 편"},
      {k:"E", v:1, t:"매우 부족"}
    ];
    var cells = opts.map(function(o){
      return '<div class="mbc-self'+(state.self===o.k?' selected':'')+'" data-k="'+o.k+'" data-v="'+o.v+'"><b>'+o.k+'</b><span>'+o.t+'</span></div>';
    }).join('');

    root.innerHTML = '<div class="mbc-card">'+
      headerHtml("마지막으로, 본인의 현금흐름<br>'정확도'를 스스로 평가해 주세요")+
      '<div class="mbc-self-grid">'+cells+'</div>'+
      '<div class="mbc-btn-row"><button class="mbc-btn ghost" id="mbc-back">‹ 뒤로</button><button class="mbc-btn" id="mbc-next">결과 확인하기</button></div>'+
    '</div>';

    root.querySelectorAll(".mbc-self").forEach(function(el){
      el.onclick = function(){
        state.self = el.getAttribute("data-k");
        state.selfScore = el.getAttribute("data-v");
        root.querySelectorAll(".mbc-self").forEach(function(c){ c.classList.remove("selected"); });
        el.classList.add("selected");
      };
    });
    root.querySelector("#mbc-back").onclick = function(){ state.step="asset"; render(); };
    root.querySelector("#mbc-next").onclick = function(){
      if (!state.self){ alert("셀프 평가를 선택해 주세요."); return; }
      state.step = "result";
      render();
    };
  }

  function calc(){
    var income = num(state.monthlyIncome);
    var fixed = num(state.monthlyFixed);
    var invest = num(state.bank) + num(state.securities) + num(state.insurance);
    var financial = num(state.totalFinancial);
    var realestate = num(state.totalRealEstate);
    var debt = num(state.totalDebt);

    var savingsRate = income > 0 ? (invest / income * 100) : null;
    var surplus = income - fixed - invest;
    var netAssets = financial + realestate - debt;
    var debtRatio = (financial + realestate) > 0 ? (debt / (financial + realestate) * 100) : null;

    return { income:income, fixed:fixed, invest:invest, financial:financial, realestate:realestate, debt:debt,
             savingsRate:savingsRate, surplus:surplus, netAssets:netAssets, debtRatio:debtRatio };
  }

  function renderResult(){
    var r = calc();
    var savingsTxt = r.savingsRate===null ? "-" : r.savingsRate.toFixed(1)+"%";
    var debtTxt = r.debtRatio===null ? "-" : r.debtRatio.toFixed(1)+"%";
    var note;
    if (r.savingsRate===null){ note = "월 소득 정보가 없어 저축률을 계산할 수 없어요."; }
    else if (r.savingsRate < 10){ note = "월 저축·투자 비중이 낮은 편이에요. 고정지출 구조를 함께 점검해보면 좋아요."; }
    else if (r.savingsRate < 30){ note = "저축·투자 비중이 양호한 편이에요. 조금 더 끌어올릴 여지가 있어요."; }
    else { note = "저축·투자 비중이 우수한 편이에요. 지금의 흐름을 잘 유지해보세요."; }

    root.innerHTML = '<div class="mbc-card">'+
      headerHtml(state.name+"님의 현금흐름 요약이에요")+
      '<div class="mbc-result-grid">'+
        '<div class="mbc-result-card"><div class="lbl">월 저축·투자율</div><div class="val">'+savingsTxt+'</div></div>'+
        '<div class="mbc-result-card"><div class="lbl">월 여유자금</div><div class="val'+(r.surplus<0?' warn':'')+'">'+fmt(r.surplus)+'만원</div></div>'+
        '<div class="mbc-result-card"><div class="lbl">순자산</div><div class="val">'+fmt(r.netAssets)+'만원</div></div>'+
        '<div class="mbc-result-card"><div class="lbl">부채비율</div><div class="val">'+debtTxt+'</div></div>'+
      '</div>'+
      '<div class="mbc-result-note">'+note+'<br>담당 디렉터가 이 결과를 바탕으로 1:1 상세 리포트를 이어서 전해 드려요.</div>'+
      '<div class="mbc-btn-row"><button class="mbc-btn ghost" id="mbc-back">‹ 뒤로</button><button class="mbc-btn" id="mbc-submit">담당 디렉터에게 보내기</button></div>'+
    '</div>';

    root.querySelector("#mbc-back").onclick = function(){ state.step="self"; render(); };
    root.querySelector("#mbc-submit").onclick = onSubmit;
  }


  var MBR_RV = [{"dir": "홍민아 디렉터", "t": "홍민아 디렉터님과 첫번째 상담", "who": "김현**", "p": ["상담을 받으면서 그동안 무심하게 지나쳤던 <mark>고정지출과 변동지출을 돌아보게 됐다.</mark> 막연했던 목표를 숫자로 세워야 한다는 점을 다시 깨달은 게 가장 큰 수확이었다. 또한 월배당과 지수 투자에 대한 새로운 시각을 얻게 된 점도 의미 있었다."]}, {"dir": "변보라 디렉터", "t": "동기부여 메이커 변보라 멘토님과 함께한지 벌써 3년", "who": "이진**", "p": ["항상 감사한 멘토님께 오랜만에 과정관리 받으면서 <mark>현금흐름표도 정리하는 시간</mark>을 갖고 지금 처한 현재 상황을 되돌아볼 수 있는 시간이었습니다! 어제 미팅한 내용을 토대로 열심히 노력해 보려 합니다 :) 항상 많은 것들을 얻고 가는 시간이네요.", "문득 돌이켜보니 선생님과 함께한 지 벌써 3년 반째더라구요! 시간이 참 빠르다 싶고 앞으로도 7년 10년 쭉 롱런해 가고 싶어요 ㅎㅎ", "현재 내가 처한 상황을 알아야 한다. 달라진 시대에 처했단 건 알고 있었지만 이렇게 실제로 미팅에서 듣게 되는 거랑 또 체감이 달라요. 경제에 관해 3년 전에 아무것도 몰랐던 제가 지금은 아닙니다. 함께 걸어가면서 성장해 나가고 있는 저를 지켜봐 주세요! 열심히 해보겠습니다."]}, {"dir": "오수현 디렉터", "t": "♡친구같은 오수현 디렉터님♡", "who": "강정**", "p": ["직무상 기업의 재무와 자금담당을 하며 자금계획 및 현금까지 파악하며 업무의 자금관리는 잘하고 있으면서 어느 순간 <mark>정작 나의 자금관리는 안 되고 있음을 인지했다.</mark>", "이때 오수현 디렉터님이 생각났고 언제나 내가 손을 내밀면 자연스럽게 내 손을 잡아줄 사람이란 걸 오래전부터 알고 있었고, 마음을 열고 인생 이야기를 주고받을 수 있는 친구임을 다시 한번 깨닫게 되었다."]}, {"dir": "강소리 디렉터", "t": "현실적인 자산관리를 배우고 싶다면 강소리 멘토님께!", "who": "채다**", "p": ["저는 재무상담이 있다는 사실을 최근에 알게 되었답니다. 교육을 들으면서 가장 크게 달라진 점은 목표를 구체적으로 세우는 것이 자산관리의 시작이라는 것을 알게 된 것입니다. 처음에는 빨리 포트폴리오를 만들고 투자도 시작하고 싶어서 목표를 세우는 과정이 조금 답답하게 느껴졌어요. 하지만 강소리 멘토님께서 제 상황에 맞게 목표를 하나씩 구체화해 주시면서, 목표가 있어야 그에 맞는 계획을 세울 수 있고 꾸준히 실천할 수 있다는 걸 깨달았습니다. 이 부분이 저에게는 가장 큰 변화였습니다.", "또 좋았던 점은 현실적인 이야기를 많이 해주셨다는 것입니다. 요즘 인스타그램만 봐도 제 또래에 몇 억을 모았다는 사람, 큰돈을 벌었다는 사람들이 너무 많잖아요. 그런 글들을 보다 보면 괜히 조급해지고 ‘나만 늦은 건가’라는 생각이 들기도 했는데, 멘토님께서는 그런 것에 흔들리기보다 제 상황에 맞는 속도로 가는 것이 더 중요하다고 말씀해 주셨습니다. 그 이야기가 오히려 마음을 편하게 해주었어요.", "그리고 솔직히 가장 뜨끔했던 건 소비 습관이었습니다. 가계부를 보면서 불필요한 소비를 하나하나 짚어주셨고 ‘이 부분은 줄여볼 수 있겠다’고 현실적으로 이야기해 주셨어요. 듣고 싶지 않았던 이야기였지만 오히려 꼭 필요한 피드백이었고, 덕분에 <mark>소비를 바라보는 시각도 많이 달라졌습니다.</mark>", "무엇보다 경제에 대한 흥미가 생긴 것이 가장 큰 수확인 것 같아요. 예전에는 경제 공부를 해야겠다고 생각만 하고 어려워서 미뤘는데, 지금은 궁금한 것이 생기면 먼저 찾아보고 공부하게 되었습니다.", "월급은 꾸준히 들어오고 저축도 하고 있지만 ‘내가 잘하고 있는 걸까’라는 고민이 있는 분, 경제 공부를 시작하고 싶은데 어디서부터 해야 할지 막막한 분이라면 정말 추천드리고 싶습니다!"]}];
  var MBR_CSS = ".mbr{--paper:#F2F2F2;--card:#FFFFFF;--ink:#000000;--sub:#666666;--faint:#767676;--rule:#E2E2E2;--well:#F6F6F6;--accent:#E5322B;--accent-soft:#FDECEA;--mid:#BDBDBD;--display:\"Inter Tight\",\"Pretendard\",\"Noto Sans KR\",system-ui,sans-serif;--text:\"Pretendard\",\"Noto Sans KR\",\"Apple SD Gothic Neo\",\"Malgun Gothic\",system-ui,sans-serif;--mono:\"IBM Plex Mono\",ui-monospace,Menlo,monospace;color-scheme:light;background:linear-gradient(180deg,#E6E6E5 0,#ECECEB 260px,#F2F2F2 620px) #F2F2F2;color:#000;font-family:var(--text);-webkit-font-smoothing:antialiased;word-break:keep-all;overflow-wrap:break-word;padding:0 20px;margin:0 -0px;text-align:left;line-height:1.5;font-size:14px}\n.mbr *{box-sizing:border-box}\n.mbr h1,.mbr h2,.mbr h3,.mbr p,.mbr ol,.mbr figure{margin:0;padding:0}\n.mbr button{font-family:inherit;-webkit-appearance:none;appearance:none}\n.mbr mark{background:none}\n.mbr .app{max-width:470px;margin:0 auto;padding-bottom:168px}\n.mbr .rp-head{display:flex;flex-direction:column;gap:6px;margin-top:72px;padding-top:16px;border-top:1px solid var(--ink)}\n.mbr .rp-head span{font-family:var(--mono);font-size:10.5px;letter-spacing:.8px;text-transform:uppercase;color:var(--faint)}\n.mbr .rp-head b{font-size:15px;font-weight:700;letter-spacing:-.3px}\n.mbr .title{font-size:26px;font-weight:700;letter-spacing:-.7px;line-height:1.38;margin:28px 0 32px;text-wrap:balance}\n.mbr .stack{display:flex;flex-direction:column;gap:16px}\n.mbr .card{background:var(--card);border-radius:24px;padding:28px 22px 28px}\n.mbr .lbl{font-family:var(--display);font-size:12px;color:var(--sub);letter-spacing:0}\n.mbr .hd{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}\n.mbr .hd h2{margin:6px 0 0;font-size:17px;font-weight:700;letter-spacing:-.3px}\n.mbr .pill{font-size:11px;font-weight:500;color:var(--sub);background:var(--well);border-radius:99px;padding:4px 10px;white-space:nowrap}\n.mbr .pill.acc{color:var(--accent);background:var(--accent-soft)}\n.mbr .big{font-family:var(--display);font-weight:300;font-size:56px;letter-spacing:-2.2px;line-height:1;margin:28px 0 14px;font-variant-numeric:tabular-nums}\n.mbr .big small{font-family:var(--text);font-size:15px;font-weight:400;color:var(--sub);letter-spacing:0;margin-left:6px}\n.mbr .desc{font-size:13.5px;color:var(--sub);line-height:1.7;margin:0;max-width:30em}\n.mbr .flow{display:flex;height:6px;border-radius:3px;overflow:hidden;background:var(--well);margin-top:24px;gap:2px}\n.mbr .flow i{display:block;height:100%}\n.mbr .legend{display:flex;flex-wrap:wrap;gap:10px 18px;margin-top:14px;font-family:var(--mono);font-size:10.5px;color:var(--sub)}\n.mbr .legend span{display:inline-flex;align-items:center;gap:6px}\n.mbr .legend i{width:7px;height:7px;border-radius:50%;display:inline-block}\n.mbr .well{background:var(--well);border-radius:16px;padding:18px 16px;margin-top:24px;display:flex;flex-direction:column;gap:10px}\n.mbr .well .wh{display:flex;justify-content:space-between;font-family:var(--mono);font-size:10.5px;color:var(--sub);margin-bottom:2px}\n.mbr .well .wr{display:flex;justify-content:space-between;gap:12px;font-size:13.5px;font-variant-numeric:tabular-nums}\n.mbr .well .wr span:first-child{min-width:0}.mbr .well .wr span:last-child{white-space:nowrap;flex-shrink:0;text-align:right}.mbr .well .wsep{border-top:1px dashed #D6D6D6;margin:6px 0 4px}.mbr .well .wh.acc{color:var(--accent)}.mbr .well .wr.q span:first-child{color:var(--sub)}.mbr .well .wr.q span:last-child{color:var(--accent);font-weight:600}.mbr .well .wr.q small{font-size:11px;font-weight:400;margin-left:4px}\n.mbr .well .wr.acc{color:var(--accent);font-weight:500}\n.mbr .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}\n.mbr .meta div{background:var(--well);border-radius:16px;padding:16px 16px}\n.mbr .meta small{display:block;font-size:11.5px;color:var(--faint)}\n.mbr .meta b{display:block;font-size:15px;font-weight:500;margin-top:4px}\n.mbr .meta .acc b{color:var(--accent)}\n.mbr .meta b{white-space:nowrap}\n.mbr .rv-head .n{font-family:var(--display);font-weight:300;font-size:52px;letter-spacing:-2px;line-height:1}\n.mbr .quotes{display:flex;flex-direction:column;margin-top:8px}\n.mbr button.q{display:block;width:100%;text-align:left;border:0;background:none;font:inherit;cursor:pointer;text-decoration:none;color:inherit;-webkit-tap-highlight-color:transparent;transition:background .15s}\n.mbr button.q:focus-visible{outline:2px solid var(--ink);outline-offset:2px;border-radius:8px}\n.mbr .sheet{position:fixed;inset:0;z-index:50}\n.mbr .sheet .bd{position:absolute;inset:0;background:rgba(0,0,0,.42);opacity:0;transition:opacity .3s ease}\n.mbr .sheet .pn{position:absolute;left:0;right:0;bottom:0;max-width:520px;margin:0 auto;background:var(--card);border-radius:26px 26px 0 0;padding-top:12px;padding-bottom:calc(20px + env(safe-area-inset-bottom,0px));padding-left:max(28px,env(safe-area-inset-left,0px));padding-right:max(28px,env(safe-area-inset-right,0px));transform:translateY(100%);transition:transform .46s cubic-bezier(.16,1,.3,1);box-shadow:0 -8px 40px rgba(0,0,0,.12)}\n.mbr .sheet.on .bd{opacity:1}\n.mbr .sheet.on .pn{transform:none}\n.mbr .sheet .pn > *{opacity:0;transform:translateY(14px);transition:opacity .35s ease,transform .45s cubic-bezier(.16,1,.3,1)}\n.mbr .sheet.on .pn > *{opacity:1;transform:none}\n.mbr .sheet.on .pn > *:nth-child(2){transition-delay:.08s}\n.mbr .sheet.on .pn > *:nth-child(3){transition-delay:.13s}\n.mbr .sheet.on .pn > *:nth-child(4){transition-delay:.18s}\n.mbr .sheet.on .pn > *:nth-child(5){transition-delay:.22s}\n.mbr .sh-grab{width:40px;height:4px;border-radius:2px;background:var(--rule);margin:0 auto 22px}\n.mbr .sh-top{display:flex;justify-content:space-between;align-items:baseline;gap:12px}\n.mbr .sh-top span{font-family:var(--display);font-size:12px;font-weight:700;letter-spacing:.8px;color:var(--ink)}\n.mbr .sh-top b{font-size:13px;font-weight:500;color:var(--sub)}\n.mbr .sh-t{margin:14px 0 0;font-size:19px;font-weight:700;letter-spacing:-.4px;line-height:1.4}\n.mbr .sh-who{margin:6px 0 0;font-family:var(--mono);font-size:11px;color:var(--faint)}\n.mbr .sh-body{margin:18px 0 20px;max-height:min(52vh,460px);overflow-y:auto;-webkit-overflow-scrolling:touch;border-top:1px solid var(--rule);padding-top:16px}\n.mbr .sh-body p{margin:0 0 12px;font-size:15.5px;line-height:1.75;letter-spacing:-.2px;color:#1a1a1a}\n.mbr .sh-body mark{background:none;color:var(--ink);font-weight:700}\n.mbr .sh-go{display:flex;justify-content:center;align-items:center;width:100%;border:0;border-radius:16px;background:var(--ink);color:#fff;font:700 16px/1 var(--text);padding:18px;cursor:pointer}\n.mbr .sh-go:focus-visible{outline:2px solid var(--sub);outline-offset:2px}\n@media (prefers-reduced-motion: reduce){.mbr .sheet .bd,.mbr .sheet .pn,.mbr .sheet .pn > *{transition:none}}\n.mbr .m4{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:28px}\n.mbr .m4 .c{border-radius:16px;background:var(--well);padding:16px 16px 16px;min-height:116px;display:flex;flex-direction:column;justify-content:space-between}\n.mbr .m4 .c small{font-size:12px;color:var(--sub);display:flex;justify-content:space-between}\n.mbr .m4 .c small em{font-style:normal;font-family:var(--mono);font-size:10px;color:var(--faint)}\n.mbr .m4 .c b{font-family:var(--display);font-weight:300;font-size:34px;letter-spacing:-1.2px;line-height:1;font-variant-numeric:tabular-nums}\n.mbr .m4 .c b span{font-family:var(--text);font-size:12px;font-weight:400;color:var(--sub);letter-spacing:0;margin-left:3px}\n.mbr .m4 .c.gap{background:var(--card);border:1.5px dashed var(--accent);color:var(--accent)}\n.mbr .m4 .c.gap small{color:var(--accent);font-weight:500}\n.mbr .m4 .c.gap b{font-weight:300}\n.mbr .m4 .c.gap b span{color:var(--accent)}\n.mbr .m4 .o1{order:1}\n.mbr .m4 .o2{order:2}\n.mbr .m4 .o3{order:4}\n.mbr .m4 .o4{order:3}\n@keyframes mbBlink{0%,100%{border-color:var(--accent);background:var(--card)}50%{border-color:rgba(229,50,43,.12);background:#FFF7F6}}\n.mbr .m4 .c.gap.blink{animation:mbBlink 1.6s ease-in-out infinite}\n@media (prefers-reduced-motion: reduce){.mbr .m4 .c.gap.blink{animation:none}}\n.mbr .gapline{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-top:24px;padding-top:20px;border-top:1px solid var(--rule)}\n.mbr .gapline span{font-size:13.5px;color:var(--sub)}\n.mbr .gapline b{font-family:var(--display);font-weight:400;font-size:22px;color:var(--accent);font-variant-numeric:tabular-nums;white-space:nowrap}\n.mbr .gapline b small{font-family:var(--text);font-size:12px;margin-left:2px}\n.mbr .steps{display:flex;flex-direction:column;margin-top:20px;counter-reset:s}\n.mbr .step{display:grid;grid-template-columns:26px 1fr;gap:10px;padding-block:18px;border-top:1px solid var(--rule)}\n.mbr .step:first-child{border-top:0}\n.mbr .step i{font-style:normal;font-family:var(--mono);font-size:11px;color:var(--sub);padding-top:3px}\n.mbr .step b{display:block;font-size:15px;font-weight:700;letter-spacing:-.2px}\n.mbr .step span{display:block;font-size:13px;color:var(--sub);margin-top:5px;line-height:1.6}\n.mbr .step.now i,.mbr .step.now b{color:var(--accent)}\n.mbr .hero{padding-block:56px 0}\n.mbr .hero h1{margin:0;font-family:\"Inter Tight\",var(--display);font-weight:400;font-size:clamp(52px,14.2vw,96px);line-height:.94;letter-spacing:-.056em}\n.mbr .hero h1 > span{display:block;position:relative;padding-bottom:.05em}\n.mbr .hero h1 > span:last-child{font-weight:600;letter-spacing:-.058em}\n.mbr .hero h1 .gh{color:#F9F9F9;text-shadow:0 1px 0 #fff,0 2px 3px rgba(0,0,0,.07),0 -1px 0 rgba(0,0,0,.035)}\n.mbr .hero h1 .fl{position:absolute;left:0;top:0;white-space:nowrap;background:linear-gradient(180deg,#6b6b6b 0%,#1a1a1a 48%,#000 70%,#3d3d3d 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 1px 0 rgba(255,255,255,.9)) drop-shadow(0 7px 9px rgba(0,0,0,.2));clip-path:inset(-20% 100% -40% 0)}\n@keyframes mbPass{0%{clip-path:inset(-20% 100% -40% 0)}42%{clip-path:inset(-20% -10% -40% 0)}58%{clip-path:inset(-20% -10% -40% 0)}100%{clip-path:inset(-20% -10% -40% 100%)}}\n@keyframes mbFill{from{clip-path:inset(-20% 100% -40% 0)}to{clip-path:inset(-20% -10% -40% 0)}}\n.mbr .hero h1 > span.pass .fl{animation:mbPass 2.2s cubic-bezier(.65,0,.35,1) forwards}\n.mbr .hero h1 > span.fill .fl{animation:mbFill 1.8s cubic-bezier(.65,0,.35,1) forwards}\n@media (prefers-reduced-motion: reduce){.mbr .hero h1 > span.pass .fl{animation:none}.mbr .hero h1 > span.fill .fl{animation:none;clip-path:inset(-20% -10% -40% 0)}}\n.mbr .hero p{margin:40px 0 0;font-size:16px;font-weight:500;line-height:1.65;letter-spacing:-.35px;color:#222;text-wrap:balance;opacity:0;transform:translateY(8px);transition:opacity 1.2s ease,transform 1.2s cubic-bezier(.2,.7,.2,1)}\n.mbr .hero.go p{opacity:1;transform:none}\n.mbr .hero .sign{display:flex;justify-content:space-between;margin-top:32px;padding-top:14px;border-top:1px solid var(--rule);font-family:var(--mono);font-size:10.5px;letter-spacing:.6px;text-transform:uppercase;color:var(--faint)}\n@media (prefers-reduced-motion: reduce){.mbr .hero p{opacity:1;transform:none;transition:none}}\n.mbr .rv-band{margin:72px -20px;background:linear-gradient(180deg,#141414 0%,#0B0B0B 100%);color:#fff;padding:72px 20px 64px;overflow:hidden}\n.mbr .rv-in{max-width:470px;margin:0 auto}\n.mbr .rv-band .lbl{color:#7d7d7d}\n.mbr .rv-band .hd h2{color:#fff;font-size:20px;letter-spacing:-.4px}\n.mbr .rv-band .pill{background:transparent;border:1px solid rgba(255,255,255,.16);color:#bdbdbd}\n.mbr .rv-head{display:flex;align-items:baseline;gap:10px}\n.mbr .rv-band .rv-head{margin:36px 0 0;padding-bottom:28px;border-bottom:1px solid rgba(255,255,255,.1)}\n.mbr .rv-band .rv-head .n{color:#fff;font-size:64px;letter-spacing:-2.6px}\n.mbr .rv-band .rv-head span{color:#8a8a8a}\n.mbr .rv-band .quotes{gap:12px;margin-top:28px}\n.mbr .rv-band button.q{background:#171717;color:#fff;border:1px solid rgba(255,255,255,.07);border-radius:22px;padding:22px 20px 24px;transition:background .2s,border-color .2s}\n.mbr .rv-band button.q:active{background:#1F1F1F;border-color:rgba(255,255,255,.14)}\n.mbr .q-top{display:flex;align-items:center;gap:12px}\n.mbr .q-mono{flex:none;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(255,255,255,.2);font-size:14px;font-weight:600;color:#fff;letter-spacing:0}\n.mbr .q-who{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}\n.mbr .q-who b{font-size:13.5px;font-weight:600;color:#fff;letter-spacing:-.2px}\n.mbr .q-who small{font-family:var(--mono);font-size:10.5px;color:#7d7d7d}\n.mbr .q-go{flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(255,255,255,.2);font-family:var(--display);font-size:15px;color:#fff;transition:background .2s,color .2s}\n.mbr .rv-band button.q:active .q-go{background:#fff;color:#000}\n.mbr .rv-band .q p{margin:18px 0 0;font-size:15.5px;line-height:1.75;letter-spacing:-.25px;color:#9d9d9d}\n.mbr .rv-band .q p mark{color:#fff;font-weight:600}\n.mbr.js-rv .rv-band button.q{opacity:0;transform:translateX(-20%);transition:transform 1.5s cubic-bezier(.2,.7,.2,1),opacity 1.2s ease}\n.mbr.js-rv .rv-band button.q.in{opacity:1;transform:none}\n@media (prefers-reduced-motion: reduce){.mbr.js-rv .rv-band button.q{opacity:1;transform:none;transition:none}}\n.mbr .hd h2,.mbr .desc,.mbr .step b,.mbr .step span,.mbr .q p,.mbr .gapline span,.mbr .meta small{text-wrap:balance}\n.mbr .sh-body p,.mbr .foot{text-wrap:pretty}\n.mbr .legend span,.mbr .pill,.mbr .m4 small,.mbr .gapline b,.mbr .meta b,.mbr .rv-head span{white-space:nowrap}.mbr #mbr-done .pn{max-height:92vh;max-height:92dvh;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}.mbr .dn-sub{margin:8px 0 0;font-size:14px;line-height:1.6;color:var(--sub);text-wrap:pretty}.mbr .dn-guide{margin-top:20px;border:1px solid var(--rule);border-radius:18px;padding:20px 18px 18px;-webkit-user-select:text;user-select:text}.mbr .gd-h{display:flex;justify-content:space-between;align-items:center;gap:10px}.mbr .gd-h b{font-size:16px;font-weight:700;letter-spacing:-.3px}.mbr .gd-h span{flex-shrink:0;font-size:11px;font-weight:600;color:var(--accent);background:var(--accent-soft);padding:5px 9px;border-radius:999px}.mbr .gd-p{margin:12px 0 0;font-size:13.5px;line-height:1.65;color:#2a2a2a;text-wrap:pretty}.mbr .gd-fee{margin:8px 0 0;font-size:12.5px;line-height:1.6;color:var(--sub);text-wrap:pretty}.mbr .gd-s{margin-top:14px;padding-top:14px;border-top:1px solid var(--rule)}.mbr .gd-s h4{margin:0;display:flex;align-items:baseline;gap:8px;font-size:14.5px;font-weight:700;letter-spacing:-.2px}.mbr .gd-s h4 i{font-style:normal;font-family:var(--mono);font-size:11px;font-weight:400;color:var(--sub)}.mbr .gd-s ul{margin:8px 0 0;padding:0 0 0 27px;list-style:none;display:flex;flex-direction:column;gap:4px}.mbr .gd-s li{position:relative;font-size:13.5px;line-height:1.55;color:#2a2a2a}.mbr .gd-s li:before{content:\"\";position:absolute;left:-12px;top:.62em;width:4px;height:4px;border-radius:50%;background:var(--mid)}.mbr .gd-s li em{font-style:normal;margin-left:6px;font-size:11.5px;color:var(--faint)}.mbr .gd-sn{margin:6px 0 0 27px;font-size:12.5px;line-height:1.5;color:var(--sub)}.mbr .gd-n{margin-top:16px;padding-top:14px;border-top:1px solid var(--rule)}.mbr .gd-n h5{margin:0 0 6px;font-size:13.5px;font-weight:700;letter-spacing:-.2px}.mbr .gd-n p{margin:0 0 4px;font-size:13px;line-height:1.6;color:#2a2a2a;text-wrap:pretty}.mbr .gd-n.svc{border-top:0;background:var(--well);border-radius:12px;padding:14px}.mbr .gd-n.svc p{color:var(--sub)}.mbr .gd-end{margin:16px 0 0;padding-top:14px;border-top:1px solid var(--rule);font-size:13.5px;line-height:1.6;font-weight:600;color:var(--ink);text-wrap:pretty}.mbr .dn-copy,.mbr .dn-share{width:100%;cursor:pointer;border-radius:16px;font:700 15.5px/1 var(--text);padding:18px;display:flex;justify-content:center;align-items:center}.mbr .dn-copy{border:0;background:var(--ink);color:#fff}.mbr .dn-share{border:1px solid var(--ink);background:#fff;color:var(--ink);margin-top:4px}.mbr .dn-links{display:flex;justify-content:center;gap:2px;margin-top:4px}.mbr .dn-links .dn-kakao{width:auto;background:none;color:var(--sub);font:500 14px/1 var(--text);padding:14px;border-radius:0}.mbr #mbr-done.fail .dn-sub,.mbr #mbr-done.fail #mbr-gd,.mbr #mbr-done.fail #mbr-copy,.mbr #mbr-done.fail #mbr-share{display:none}.mbr #mbr-done.fail .dn-links{flex-direction:column}.mbr #mbr-done.fail .dn-links .dn-kakao{width:100%;background:var(--ink);color:#fff;font-weight:700;font-size:15.5px;padding:18px;border-radius:16px}.mbr .big{display:flex;align-items:baseline;flex-wrap:nowrap;white-space:nowrap}.mbr .big small{flex-shrink:0;white-space:nowrap}.mbr .rv-head{flex-wrap:nowrap}\n.mbr .foot{font-size:11.5px;color:var(--faint);line-height:1.75;margin:32px 4px 0;max-width:34em}\n.mbr .dock{position:fixed;left:0;right:0;bottom:0;background:linear-gradient(to top,var(--paper) 70%,rgba(242,242,242,0));padding-top:28px;padding-bottom:calc(18px + env(safe-area-inset-bottom,0px));padding-left:max(20px,env(safe-area-inset-left,0px));padding-right:max(20px,env(safe-area-inset-right,0px))}\n.mbr .dock-in{max-width:470px;margin:0 auto}\n.mbr .cta{display:flex;justify-content:space-between;align-items:center;width:100%;border:0;border-radius:18px;background:var(--ink);color:var(--card);font:500 16px/1 var(--text);padding:21px 24px;cursor:pointer}\n.mbr .cta span{font-family:var(--display);font-size:18px}\n.mbr .cta:focus-visible{outline:2px solid var(--accent);outline-offset:3px}\n.mbr .cta em{font-style:normal}\n.mbr .cta.done{background:#D9D9D9;color:#555;cursor:default}\n.mbr .dn-check{width:44px;height:44px;border-radius:50%;background:var(--ink);color:#fff;display:grid;place-items:center;font-size:20px;margin-top:4px}\n.mbr .dn-t{margin:16px 0 0;font-size:21px;font-weight:700;letter-spacing:-.5px;line-height:1.4;text-wrap:balance}\n.mbr .dn-info{margin-top:20px;background:var(--well);border-radius:16px;padding:16px 16px;display:flex;flex-direction:column;gap:9px}\n.mbr .dn-info div{display:flex;justify-content:space-between;gap:12px;font-size:13.5px}\n.mbr .dn-info span{color:var(--sub)}\n.mbr .dn-info b{font-weight:500;white-space:nowrap;font-variant-numeric:tabular-nums}\n.mbr .dn-steps{margin:20px 0 0;padding:0;list-style:none;display:flex;flex-direction:column}\n.mbr .dn-steps li{display:grid;grid-template-columns:26px 1fr;gap:8px;padding-block:11px;border-top:1px solid var(--rule);font-size:14px;line-height:1.55;text-wrap:balance}\n.mbr .dn-steps li:first-child{border-top:0}\n.mbr .dn-steps i{font-style:normal;font-family:var(--mono);font-size:11px;color:var(--sub);padding-top:2px}\n.mbr .dn-btns{display:flex;flex-direction:column;gap:4px;margin-top:20px}\n.mbr .dn-kakao{width:100%;border:0;cursor:pointer;display:flex;justify-content:center;align-items:center;border-radius:16px;background:var(--ink);color:#fff;text-decoration:none;font:700 15.5px/1 var(--text);padding:18px}\n.mbr .dn-back{border:0;background:none;font:500 14px/1 var(--text);color:var(--sub);padding:14px;cursor:pointer}\n.mbr .dock p{margin:10px 0 0;text-align:center;font-size:11.5px;color:var(--faint)}\n.mbr .app{padding-top:8px}\n.mbr .hero{padding-top:40px}";
  function mbrEsc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }
  function mbrNum(v){ return Math.round(v).toLocaleString("ko-KR"); }
  function mbrEok(v){ if (Math.abs(v) >= 10000){ var e=v/10000; return { n:(Math.round(e*10)/10).toLocaleString("ko-KR"), u:"억원" }; } return { n:mbrNum(v), u:"만원" }; }
  function mbrKw(v){ var s=v<0?"-":""; v=Math.abs(Math.round(v)); if (v>=10000){ var e=Math.floor(v/10000), r=v%10000; return s+e+"억"+(r?" "+r.toLocaleString("ko-KR")+"만원":"원"); } return s+v.toLocaleString("ko-KR")+"만원"; }
  function mbrPct(a,b){ return b>0 ? (Math.round(a/b*1000)/10) : 0; }
  var MBR_GD = {
    t: "머니4스퀘어 PRO",
    intro: "정확한 재무 진단과 실질적인 현금흐름 개선을 위해 아래 자료를 준비해 주세요.",
    sec: [
      ["소득자료", ["전년도 원천징수영수증", "최근 3개월 소득증명원", "임대소득 및 기타 추가 소득자료"]],
      ["지출자료", ["전체 카드 최근 3개월 사용내역"]],
      ["금융비용", ["금융사별 대출 및 금융상품 정보", "원금 상환액 및 이자 납부액", "적용 금리"]],
      ["투자 및 저축 현황", ["은행", "증권사", "보험사"], "월 기준 납입금액을 기재해 주세요."]
    ],
    notes: [
      ["▶︎", "자료 입력 시 유의사항", ["담당 디렉터가 보내 드리는 PRO 입력 화면에, 위 자료를 보면서 항목별로 정확하게 입력해 주세요.", "재무 분석의 정확도는 입력 데이터의 정확성에 따라 달라집니다.", "정확한 소득·지출·금융비용 자료를 바탕으로 현재의 현금흐름을 진단하고, 개선 방향과 투자·저축 포트폴리오를 구체적으로 설계해 드립니다."]],
      ["💡", "서비스 이용 안내", ["머니4스퀘어 PRO 분석은 최초 1회 무료로 제공됩니다.", "이후 추가 분석은 회당 5만 원의 비용이 발생할 수 있습니다.", "PRO 입력 화면은 받으신 날로부터 3일 이내에 작성해 주세요."]]
    ]
  };
  function mbrGuideHtml(){
    var h = '<div class="dn-guide" id="mbr-gd"><div class="gd-h"><b>' + MBR_GD.t + '</b><span>최초 1회 무료</span></div>';
    h += '<p class="gd-p">' + MBR_GD.intro + '</p>';
    MBR_GD.sec.forEach(function(sc, i){
      h += '<div class="gd-s"><h4><i>0' + (i+1) + '</i>' + sc[0] + '</h4>' + (sc[2] ? '<p class="gd-sn">' + sc[2] + '</p>' : '') + '<ul>' + sc[1].map(function(x){ return '<li>' + x + '</li>'; }).join("") + '</ul></div>';
    });
    MBR_GD.notes.forEach(function(n, i){
      h += '<div class="gd-n' + (i ? ' svc' : '') + '"><h5>' + n[1] + '</h5>' + n[2].map(function(p){ return '<p>' + p + '</p>'; }).join("") + '</div>';
    });
    return h + '</div>';
  }
  function mbrGuideText(name, dir){
    var L = ["⭕️ " + MBR_GD.t, "", MBR_GD.intro];
    MBR_GD.sec.forEach(function(sc, i){ L.push(""); L.push("📌 " + (i+1) + ". " + sc[0]); if (sc[2]) L.push(sc[2]); sc[1].forEach(function(x){ L.push("- " + x + (sc[2] ? " : " : "")); }); });
    MBR_GD.notes.forEach(function(n){ L.push(""); L.push(n[0] + " " + n[1]); n[2].forEach(function(p){ L.push(p); }); });
    L.push(""); L.push("MAKESBETTER 재정메타인지 PRO" + (dir ? " · 담당 " + dir + " 디렉터" : "") + (name ? " · " + name + " 님" : ""));
    return L.join("\n");
  }
  function mbrCopy(t, cb){
    function fb(){ var ta = document.createElement("textarea"); ta.value = t; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;"; document.body.appendChild(ta); ta.select(); try { ta.setSelectionRange(0, t.length); } catch(e){} var ok = false; try { ok = document.execCommand("copy"); } catch(e){} document.body.removeChild(ta); cb(ok); }
    if (navigator.clipboard && window.isSecureContext){ navigator.clipboard.writeText(t).then(function(){ cb(true); }, fb); } else { fb(); }
  }
  function mbrAssets(){
    if (!document.getElementById("mbr-style")){
      var st=document.createElement("style"); st.id="mbr-style"; st.textContent=MBR_CSS; document.head.appendChild(st);
    }
    if (!document.getElementById("mbr-font")){
      var lk=document.createElement("link"); lk.id="mbr-font"; lk.rel="stylesheet";
      lk.href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400;600;700&family=Noto+Sans+KR:wght@300;400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap";
      document.head.appendChild(lk);
    }
  }
  function renderReport(){
    mbrAssets();
    var r = calc();
    var name = mbrEsc(state.name || "고객");
    var dirName = mbrEsc(state.director || "");
    var inc = r.income, fix = r.fixed, inv = r.invest, gap = r.surplus;
    var fixP = mbrPct(fix,inc), invP = mbrPct(inv,inc), gapP = gap>0 ? mbrPct(gap,inc) : 0;
    var barGap = Math.max(0, 100 - Math.min(100,fixP) - Math.min(100,invP));
    var selfMap = {A:["A","매우 정확"],B:["B","정확한 편"],C:["C","보통"],D:["D","부족한 편"],E:["E","매우 부족"]};
    var sf = selfMap[state.self] || ["-","미입력"];
    var last = num(state.lastYearIncome), yearFeel = inc*12, diff = yearFeel - last;
    var showCross = inc>0 && last>0;
    var na = mbrEok(r.netAssets), assets = r.financial + r.realestate;
    var finP = mbrPct(r.financial, assets), reP = assets>0 ? Math.round((100-finP)*10)/10 : 0;
    var title = gap>0
      ? name+'님, 매달 <span style="color:var(--accent)">'+mbrNum(gap)+'만 원</span>의<br>길이 보이지 않습니다'
      : name+'님, 비어 있는 <span style="color:var(--accent)">변동지출</span>을<br>확인해야 합니다';
    var gapLines = gap>0
      ? '<div class="gapline"><span>매달 길을 모르는 돈</span><b>'+mbrNum(gap)+'<small>만원</small></b></div><div class="gapline" style="margin-top:0;border-top:0;padding-top:10px"><span>1년으로 환산하면</span><b>'+mbrNum(gap*12)+'<small>만원</small></b></div>'
      : '<div class="gapline"><span>소득 − 고정지출 − 저축·투자</span><b>'+mbrNum(gap)+'<small>만원</small></b></div>';
    var cross = '';
    if (showCross){
      var plus = diff > 0;
      cross = '<section class="card" aria-label="체감과 실제">'+
        '<div class="hd"><div><div class="lbl">Cross check</div><h2>체감 숫자 vs 실제 숫자</h2></div><span class="pill'+(plus?' acc':'')+'">'+(plus?'확인 필요':'참고')+'</span></div>'+
        '<div class="big">'+(diff>0?'+':'')+mbrNum(diff)+'<small>만원 / 년</small></div>'+
        '<p class="desc">'+(plus?'체감 월소득을 1년으로 환산하면 작년 세전 소득보다 많습니다. 세후 기준이면 차이는 더 커집니다.':'체감 월소득을 1년으로 환산한 값과 작년 세전 소득의 차이입니다. 세금과 연말정산을 거친 실제 소득은 아직 비어 있습니다.')+'</p>'+
        '<div class="well"><div class="wh"><span>연 환산</span><span>입력값 기준</span></div>'+
        '<div class="wr"><span>체감 월소득 × 12</span><span>'+mbrKw(yearFeel)+'</span></div>'+
        '<div class="wr"><span>작년 소득 (세전)</span><span>'+mbrKw(last)+'</span></div>'+
        '<div class="wr'+(plus?' acc':'')+'"><span>차이</span><span>'+(diff>0?'+':'')+mbrNum(diff)+'만원</span></div>'+
        '<div class="wsep"></div><div class="wh acc"><span>소득의 기준</span><span>미확인</span></div>'+
        '<div class="wr q"><span>− 세금·4대보험</span><span>?<small>미확인</small></span></div>'+
        '<div class="wr q"><span>+ 연말정산 결과</span><span>?<small>미확인</small></span></div>'+
        '<div class="wr q"><span>= 실제 손에 쥔 연소득</span><span>?<small>미확인</small></span></div></div>'+
        '<div class="meta"><div><small>내가 매긴 정확도</small><b>'+sf[0]+' · '+sf[1]+'</b></div><div class="acc"><small>실제 정확도</small><b>측정 전</b></div></div>'+
      '</section>';
    } else {
      cross = '<section class="card" aria-label="셀프 평가"><div class="hd"><div><div class="lbl">Self check</div><h2>스스로 매긴 정확도</h2></div></div>'+
        '<div class="meta" style="margin-top:20px"><div><small>내가 매긴 정확도</small><b>'+sf[0]+' · '+sf[1]+'</b></div><div class="acc"><small>실제 정확도</small><b>측정 전</b></div></div></section>';
    }
    var reviews = MBR_RV.map(function(rv,i){
      var mono = rv.dir.charAt(0);
      var short = ["그동안 무심하게 지나쳤던 <mark>고정지출과 변동지출을 돌아보게 됐다.</mark> 막연했던 목표를 숫자로 세워야 한다는 점을 다시 깨달은 게 가장 큰 수확이었다.",
                   "<mark>현금흐름표도 정리하는 시간</mark>을 갖고 지금 처한 현재 상황을 되돌아볼 수 있는 시간이었습니다!",
                   "직무상 기업의 재무와 자금 담당을 하며 … 업무의 자금관리는 잘하고 있으면서, 어느 순간 <mark>정작 나의 자금관리는 안 되고 있음을 인지했다.</mark>",
                   "가계부를 보면서 불필요한 소비를 하나하나 짚어주셨고 … 덕분에 <mark>소비를 바라보는 시각도 많이 달라졌습니다.</mark>"][i];
      return '<button class="q" type="button" data-rv="'+i+'" aria-label="'+rv.dir+' 후기 원문 보기"><span class="q-top"><span class="q-mono" aria-hidden="true">'+mono+'</span><span class="q-who"><b>'+rv.dir+'</b><small>'+rv.who+' 님의 후기</small></span><span class="q-go" aria-hidden="true">↗</span></span><p>'+short+'</p></button>';
    }).join('');

    root.innerHTML =
    '<div class="mbr">'+
     '<div class="app">'+
      '<section class="hero" id="mbr-hero" aria-label="Cash Flow, Meta, Portfolio">'+
        '<h1 id="mbr-fn"><span>Cash Flow</span><span>Meta</span><span>Portfolio</span></h1>'+
        '<p>재정메타인지가 되어야 비로소<br>흔들리지 않는 포트폴리오를 시작할 수 있습니다.</p>'+
        '<div class="sign"><span>From blank</span><span>To portfolio</span></div>'+
      '</section>'+
      '<div class="rp-head"><span>Basic Report</span><b>베이직 현금흐름 분석</b></div>'+
      '<h1 class="title">'+title+'</h1>'+
      '<div class="stack">'+
        '<section class="card" aria-label="머니4스퀘어 네 칸">'+
          '<div class="hd"><div><div class="lbl">Money 4 Square</div><h2>내 현금흐름 네 칸</h2></div><span class="pill acc">1칸 미측정</span></div>'+
          '<div class="m4" role="group" aria-label="소득, 고정지출, 변동지출, 저축·투자 네 칸">'+
            '<div class="c o1"><small>소득<em>01</em></small><b>'+mbrNum(inc)+'<span>만원</span></b></div>'+
            '<div class="c o2"><small>고정지출<em>02</em></small><b>'+mbrNum(fix)+'<span>만원</span></b></div>'+
            '<div class="c gap o3"><small>변동지출<em style="color:var(--accent)">03</em></small><b>?<span>미측정</span></b></div>'+
            '<div class="c o4"><small>저축·투자<em>04</em></small><b>'+mbrNum(inv)+'<span>만원</span></b></div>'+
          '</div>'+
          (inc>0 ? '<div class="flow" role="img" aria-label="고정지출 '+fixP+'%, 저축·투자 '+invP+'%, 확인 안 됨 '+gapP+'%"><i style="width:'+Math.min(100,fixP)+'%;background:var(--ink)"></i><i style="width:'+Math.min(100,invP)+'%;background:var(--mid)"></i><i style="width:'+barGap+'%;background:var(--accent)"></i></div>'+
          '<div class="legend"><span><i style="background:var(--ink)"></i>고정지출 '+fixP+'%</span><span><i style="background:var(--mid)"></i>저축·투자 '+invP+'%</span><span style="color:var(--accent)"><i style="background:var(--accent)"></i>확인 안 됨 '+gapP+'%</span></div>' : '')+
          gapLines+
        '</section>'+
        cross+
        '<section class="card" aria-label="자산과 부채">'+
          '<div class="hd"><div><div class="lbl">Balance sheet</div><h2>순자산</h2></div><span class="pill">부채비율 '+(r.debtRatio===null?'-':(Math.round(r.debtRatio*10)/10)+'%')+'</span></div>'+
          '<div class="big">'+na.n+'<small>'+na.u+'</small></div>'+
          (assets>0 ? '<div class="flow" role="img" aria-label="금융 '+finP+'%, 부동산 '+reP+'%"><i style="width:'+finP+'%;background:var(--ink)"></i><i style="width:'+reP+'%;background:var(--mid)"></i></div>' : '')+
          '<div class="legend"><span><i style="background:var(--ink)"></i>금융 '+mbrEok(r.financial).n+mbrEok(r.financial).u.replace("원","")+' · '+finP+'%</span><span><i style="background:var(--mid)"></i>부동산 '+mbrEok(r.realestate).n+mbrEok(r.realestate).u.replace("원","")+' · '+reP+'%</span><span><i style="background:var(--sub)"></i>부채 '+mbrEok(r.debt).n+mbrEok(r.debt).u.replace("원","")+'</span></div>'+
        '</section>'+
      '</div>'+
      '<section class="rv-band" id="mbr-rv" aria-label="코칭 후기"><div class="rv-in">'+
        '<div class="hd"><div><div class="lbl">Reviews</div><h2>먼저 지도를 그린 사람들</h2></div><span class="pill">실제 후기</span></div>'+
        '<div class="rv-head"><span class="n" id="mbr-cnt">1,347</span><span>명의 현금흐름 지도</span></div>'+
        '<div class="quotes">'+reviews+'</div>'+
      '</div></section>'+
      '<div class="stack"><section class="card" aria-label="다음 단계">'+
        '<div class="hd"><div><div class="lbl">Next · PRO</div><h2>재정메타인지 PRO 과정</h2></div><span class="pill">1:1 코칭</span></div>'+
        '<p class="desc" style="margin-top:12px">베이직은 체감 숫자로 본 1차 분석입니다. PRO 과정은 실제 데이터로 비어 있는 칸까지 채웁니다.</p>'+
        '<div class="steps">'+
          '<div class="step"><i>01</i><div><b>담당 디렉터 연락</b><span>입력하신 연락처로 진단 일정을 안내드립니다.</span></div></div>'+
          '<div class="step now"><i>02</i><div><b>PRO 과정 · 기준 확정</b><span>소득과 지출의 기준을 확정하고, 비어 있던 변동지출까지 실측 기반으로 정밀 진단합니다.</span></div></div>'+
          '<div class="step"><i>03</i><div><b>베러 AI 객관 분석</b><span>베러 AI가 실제 내역을 항목별로 분석해, 돈의 흐름을 객관적인 숫자로 보여줍니다.</span></div></div>'+
          '<div class="step"><i>04</i><div><b>전문가 검수 · 리포트 제공</b><span>담당 디렉터가 분석을 검수해 머니4스퀘어 리포트와 코칭 리포트를 전달드립니다.</span></div></div>'+
        '</div>'+
      '</section></div>'+
      '<p class="foot">입력하신 체감 수치로 계산한 결과입니다. 평가나 상품 제안이 아니며, 정확한 진단은 1:1 코칭에서 안내드립니다.</p>'+
     '</div>'+
     '<div class="dock"><div class="dock-in"><button class="cta" id="mbr-cta" type="button"><em id="mbr-cta-t">PRO 분석 의뢰하기</em><span id="mbr-cta-i">→</span></button><p id="mbr-cta-p">진단부터 리포트 전달까지 담당 디렉터가 안내드립니다</p></div></div>'+
     '<div class="sheet" id="mbr-done" hidden><div class="bd" data-close></div><div class="pn" role="dialog" aria-modal="true" aria-labelledby="mbr-dn-t">'+
       '<div class="sh-grab" aria-hidden="true"></div>'+
       '<div class="sh-top"><span>PRO REQUEST</span><b id="mbr-dn-st">접수 완료</b></div>'+
       '<div class="dn-check" id="mbr-dn-ic" aria-hidden="true">✓</div>'+
       '<h3 class="dn-t" id="mbr-dn-t">PRO 분석 의뢰가 접수되었습니다</h3>'+
       '<div class="dn-info"><div><span>고객</span><b>'+name+' 님</b></div><div><span>담당</span><b>'+dirName+' 디렉터</b></div><div><span>접수</span><b id="mbr-dn-time"></b></div></div>'+
       '<p class="dn-sub">담당 디렉터가 평일 10~17시 중 연락드립니다. 아래 안내에 맞춰 자료를 준비해 주세요.</p>'+
       mbrGuideHtml()+
       '<div class="dn-btns"><button class="dn-copy" id="mbr-copy" type="button">안내문 복사하기</button><button class="dn-share" id="mbr-share" type="button">카카오톡 · 메모로 보내기</button><div class="dn-links"><button class="dn-kakao" id="mbr-kakao" type="button">카카오톡 채널 문의</button><button class="dn-back" type="button" data-close>리포트 다시 보기</button></div></div>'+
     '</div></div>'+
     '<div class="sheet" id="mbr-sheet" hidden><div class="bd" data-close></div><div class="pn" role="dialog" aria-modal="true" aria-labelledby="mbr-sh-t">'+
       '<div class="sh-grab" aria-hidden="true"></div><div class="sh-top"><span>REAL REVIEW</span><b id="mbr-sh-dir"></b></div>'+
       '<h3 class="sh-t" id="mbr-sh-t"></h3><p class="sh-who" id="mbr-sh-who"></p><div class="sh-body" id="mbr-sh-body"></div>'+
       '<button class="sh-go" type="button" data-close>닫기</button>'+
     '</div></div>'+
    '</div>';

    var box = root.querySelector(".mbr");
    function mbrFit(){ [].forEach.call(box.querySelectorAll(".big, .rv-head"), function(el){ var t = el.classList.contains("rv-head") ? el.querySelector(".n") : el; if(!t) return; t.style.fontSize = ""; var fs = parseFloat(getComputedStyle(t).fontSize), i = 0; while (el.scrollWidth > el.clientWidth + 1 && fs > 22 && i < 30){ fs -= 2; t.style.fontSize = fs + "px"; i++; } }); }
    mbrFit(); window.addEventListener("resize", mbrFit);
    (function(){ var nEl = box.querySelector("#mbr-cnt"); if(!nEl) return; try { var x = new XMLHttpRequest(); x.open("GET", "https://abacus.jasoncameron.dev/" + (window.__mbrNoCount ? "get" : "hit") + "/mbkr.my/cashflow-basic"); x.timeout = 6000; x.onload = function(){ try { var v = JSON.parse(x.responseText).value; if (v >= 1347){ nEl.textContent = v.toLocaleString("ko-KR"); mbrFit(); } } catch(e){} }; x.send(); } catch(e){} })();
    try { var top = root.getBoundingClientRect().top + window.pageYOffset - 10; window.scrollTo(0, top < 0 ? 0 : top); } catch(e){}
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var hasIO = "IntersectionObserver" in window;

    function openSheet(sh){ sh.hidden=false; requestAnimationFrame(function(){ requestAnimationFrame(function(){ sh.classList.add("on"); }); }); }
    function closeSheet(sh){ sh.classList.remove("on"); setTimeout(function(){ sh.hidden=true; }, reduce?0:420); if (document.activeElement) document.activeElement.blur(); }
    box.querySelectorAll(".sheet [data-close]").forEach(function(el){ el.addEventListener("click", function(){ closeSheet(el.closest(".sheet")); }); });

    var sh = box.querySelector("#mbr-sheet");
    box.querySelectorAll("button.q").forEach(function(b){
      b.addEventListener("click", function(){
        var d = MBR_RV[+b.getAttribute("data-rv")];
        box.querySelector("#mbr-sh-dir").textContent = d.dir;
        box.querySelector("#mbr-sh-t").textContent = d.t;
        box.querySelector("#mbr-sh-who").textContent = d.who + " 님 · 메이크스베러 후기 게시판";
        var bd = box.querySelector("#mbr-sh-body"); bd.innerHTML = d.p.map(function(x){ return "<p>"+x+"</p>"; }).join(""); bd.scrollTop = 0;
        b.blur(); openSheet(sh);
      });
    });

    var gapCell = box.querySelector(".m4 .c.gap");
    if (hasIO && !reduce){ new IntersectionObserver(function(es,ob){ es.forEach(function(en){ if(en.isIntersecting){ setTimeout(function(){ gapCell.classList.add("blink"); },300); ob.disconnect(); } }); },{rootMargin:"0px 0px -35% 0px",threshold:0}).observe(gapCell); }

    var cards = [].slice.call(box.querySelectorAll(".rv-band button.q"));
    if (hasIO && !reduce){
      box.classList.add("js-rv");
      new IntersectionObserver(function(es,ob){ es.forEach(function(en){ if(en.isIntersecting){ cards.forEach(function(c,i){ setTimeout(function(){ c.classList.add("in"); }, 200+i*420); }); ob.disconnect(); } }); },{rootMargin:"0px 0px -30% 0px",threshold:0}).observe(box.querySelector("#mbr-rv .quotes"));
    }

    var fn = box.querySelector("#mbr-fn"), hero = box.querySelector("#mbr-hero"), lines = [].slice.call(fn.children);
    lines.forEach(function(line){
      var txt = line.textContent; line.textContent = "";
      var gh = document.createElement("span"); gh.className = "gh"; gh.textContent = txt;
      var fl = document.createElement("span"); fl.className = "fl"; fl.setAttribute("aria-hidden","true"); fl.textContent = txt;
      line.appendChild(gh); line.appendChild(fl);
    });
    var T0=700, PASS=1400, FILL=1800;
    hero.querySelector("p").style.transitionDelay = ((T0+PASS*2+FILL+200)/1000).toFixed(2)+"s";
    hero.classList.add("go");
    if (reduce){ lines[2].classList.add("fill"); }
    else {
      setTimeout(function(){ lines[0].classList.add("pass"); }, T0);
      setTimeout(function(){ lines[1].classList.add("pass"); }, T0+PASS);
      setTimeout(function(){ lines[2].classList.add("fill"); }, T0+PASS*2);
    }

    var cta = box.querySelector("#mbr-cta"), dn = box.querySelector("#mbr-done"), sending = false;
    box.querySelector("#mbr-kakao").addEventListener("click", function(){ var k = document.createElement("a"); k.href = "https://pf.kakao.com/_eETXxj/chat"; k.rel = "noreferrer"; k.setAttribute("referrerpolicy", "no-referrer"); document.body.appendChild(k); k.click(); k.parentNode.removeChild(k); });
    var gdText = mbrGuideText(state.name || "", state.director || "");
    function flash(btn, msg, orig){ btn.textContent = msg; clearTimeout(btn._t); btn._t = setTimeout(function(){ btn.textContent = orig; }, 2600); }
    box.querySelector("#mbr-copy").addEventListener("click", function(){ var b = this; mbrCopy(gdText, function(ok){ flash(b, ok ? "복사 완료 ✓ 메모·카톡에 붙여넣기" : "안내문을 길게 눌러 복사해 주세요", "안내문 복사하기"); }); });
    box.querySelector("#mbr-share").addEventListener("click", function(){ var b = this; if (navigator.share){ navigator.share({ title: "머니4스퀘어 PRO 분석 준비 안내", text: gdText }).catch(function(){}); } else { mbrCopy(gdText, function(ok){ flash(b, ok ? "복사 완료 ✓ 카카오톡에 붙여넣기" : "안내문을 길게 눌러 복사해 주세요", "카카오톡 · 메모로 보내기"); }); } });
    box.querySelector("#mbr-done .dn-back").addEventListener("click", function(){ setTimeout(function(){ try { window.scrollTo({ top: root.getBoundingClientRect().top + window.pageYOffset - 10, behavior: reduce?"auto":"smooth" }); } catch(e){} }, 380); });
    function stamp(){ var d=new Date(), z=function(n){return (n<10?"0":"")+n;}; return { s: z(d.getMonth()+1)+"."+z(d.getDate())+" "+z(d.getHours())+":"+z(d.getMinutes()), t: z(d.getHours())+":"+z(d.getMinutes()) }; }
    function done(ok){
      sending = false;
      var s = stamp();
      box.querySelector("#mbr-dn-time").textContent = s.s;
      if (ok){
        dn.classList.remove("fail");
        cta.classList.add("done");
        box.querySelector("#mbr-cta-t").textContent = "의뢰 접수 완료";
        box.querySelector("#mbr-cta-i").textContent = "✓";
        box.querySelector("#mbr-cta-p").textContent = "담당 디렉터가 평일 10~17시 중 연락드립니다";
      } else {
        dn.classList.add("fail");
        box.querySelector("#mbr-dn-st").textContent = "접수 지연";
        box.querySelector("#mbr-dn-ic").textContent = "!";
        box.querySelector("#mbr-dn-t").textContent = "접수가 지연되고 있습니다. 카카오톡 채널로 바로 문의해 주세요.";
        box.querySelector("#mbr-cta-t").textContent = "PRO 분석 의뢰하기";
        box.querySelector("#mbr-cta-i").textContent = "→";
      }
      openSheet(dn);
    }
    cta.addEventListener("click", function(){
      if (cta.classList.contains("done")){ openSheet(dn); return; }
      if (sending) return;
      sending = true;
      box.querySelector("#mbr-cta-t").textContent = "의뢰 접수 중...";
      if (!window.emailjs){ done(false); return; }
      var directorObj = CONFIG.directors.filter(function(d){ return d.name === state.director; })[0] || CONFIG.directors[0];
      var s = stamp();
      var head = [
        "[PRO 분석 의뢰] 베이직 리포트를 본 고객이 PRO 과정을 요청했습니다.",
        "확인 안 된 돈(월): " + mbrNum(gap) + "만원",
        (showCross ? "체감 연환산 - 작년 세전 소득: " + (diff>0?"+":"") + mbrNum(diff) + "만원" : "작년 소득 미입력"),
        "",
        ""
      ].join("\n");
      var params = {
        site_label: " · PRO 의뢰",
        consult_type: "PRO 분석 의뢰 (재정메타인지 PRO)",
        date: todayStr(),
        time: s.t,
        name: state.name,
        phone: state.phone || "-",
        email: "-",
        memo: head + buildMemo(),
        director: directorObj.name,
        to_email: directorObj.email + "," + CONFIG.monitorEmail
      };
      emailjs.send(CONFIG.emailjsServiceId, CONFIG.emailjsTemplateId, params)
        .then(function(){ done(true); })
        .catch(function(err){ try{ console.error("PRO 의뢰 전송 실패:", err); }catch(e){} done(false); });
    });
  }

  var DONE_ICON_SVG = '<svg width="46" height="46" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">'+
    '<rect x="4" y="3" width="16" height="19" rx="2.4" fill="#1B6B63"/>'+
    '<rect x="6" y="5" width="12" height="15" rx="1.2" fill="#fff"/>'+
    '<circle cx="12" cy="10.5" r="3.4" fill="#1B6B63"/>'+
    '<path d="M12 7.1V10.5H15.4" stroke="#fff" stroke-width="1"/>'+
    '<rect x="7.5" y="15.6" width="9" height="1.2" rx="0.6" fill="#1B6B63"/>'+
    '<rect x="7.5" y="17.8" width="6" height="1.2" rx="0.6" fill="#1B6B63"/>'+
  '</svg>';

  function renderDone(failed){
    if (!failed){ renderReport(); return; }
    var subMsg = failed
      ? '결과는 계산됐지만 디렉터에게 전송하는 데 실패했어요.<br>아래 버튼으로 다시 시도해 주세요.'
      : ''+(state.kakao?'입력하신 연락처로<br>담당 디렉터가 진단 일정을 안내드려요.':'담당 디렉터가 1차 코칭 때<br>중요한 데이터로 사용할 예정이에요.')+'';

    var roadmap = failed ? '' :
      '<div class="mbc-roadmap">'+
        '<div class="mbc-roadmap-title">다음 단계</div>'+
        '<div class="mbc-rm-step done"><div class="mbc-rm-dot">✓</div><div><b>재정 메타인지 체크</b><span>완료</span></div></div>'+
        '<div class="mbc-rm-step todo"><div class="mbc-rm-dot">2</div><div><b>1차 코칭</b><span>'+(state.kakao?'담당 디렉터가 연락드려 일정을 정해요':'예약하신 일정대로 진행돼요')+'</span></div></div>'+
        '<div class="mbc-rm-step todo"><div class="mbc-rm-dot">3</div><div><b style="color:#111;">MONEY 4 SQUARE 정밀분석</b><span>1차 코칭 후 본인 수준에 맞춰 진행돼요</span></div></div>'+
      '</div>'+
      '<div class="mbc-result-note">지금 하신 건 진짜 현금흐름 분석(MONEY 4 SQUARE)을 하기 전, 현재 본인의 현금흐름 인지 수준을 파악하는 과정이에요. 1차 코칭을 마치고 나면 그 결과를 바탕으로 본인 수준에 맞춰 정밀분석을 진행해 드려요.</div>';

    root.innerHTML = '<div class="mbc-card">'+
      '<div class="mbc-done">'+
        '<div class="mbc-check">'+(failed ? '⚠️' : DONE_ICON_SVG)+'</div>'+
        '<div class="mbc-step-title" style="margin-bottom:0;">현금흐름 체크가 완료됐어요</div>'+
        '<div class="mbc-sub" style="margin-top:8px;">'+subMsg+'</div>'+
        (failed ? '<div class="mbc-btn-row"><button class="mbc-btn" id="mbc-resend">다시 보내기</button></div>' : '')+
      '</div>'+
      roadmap+
    '</div>';
    if (failed){
      root.querySelector("#mbc-resend").onclick = function(){ sendMail(); };
    }
  }

  function buildMemo(){
    var r = calc();
    var savingsTxt = r.savingsRate===null ? "-" : r.savingsRate.toFixed(1)+"%";
    var debtTxt = r.debtRatio===null ? "-" : r.debtRatio.toFixed(1)+"%";
    var selfLabelMap = {A:"A (매우 정확·5점)",B:"B (정확한 편·4점)",C:"C (보통·3점)",D:"D (부족한 편·2점)",E:"E (매우 부족·1점)"};
    return [
      "유입: " + (state.kakao ? "카카오채널" : "디렉터 링크"),
      "쿠폰번호: " + (state.coupon || "없음"),
      "연락처: " + (state.phone || "-"),
      "[현금흐름 체크 결과 - MONEY 4 SQUARE]",
      "",
      "◆ 소득",
      "소득구조: " + (state.incomeType||"-"),
      "작년 소득(세전): " + fmt(num(state.lastYearIncome)) + "만원",
      "체감 평균 소득(월): " + fmt(num(state.monthlyIncome)) + "만원",
      "체감 평균 고정지출(월): " + fmt(num(state.monthlyFixed)) + "만원",
      "",
      "◆ 자산 · 부채",
      "금융사 투입금액(월): 은행 " + fmt(num(state.bank)) + "만원 / 증권사 " + fmt(num(state.securities)) + "만원 / 보험사 " + fmt(num(state.insurance)) + "만원",
      "총 금융자산: " + fmt(num(state.totalFinancial)) + "만원",
      "총 부동산자산: " + fmt(num(state.totalRealEstate)) + "만원",
      "총 부채: " + fmt(num(state.totalDebt)) + "만원",
      "",
      "◆ 셀프 평가",
      "현금흐름 정확도: " + (selfLabelMap[state.self] || "-"),
      "",
      "◆ 계산 결과",
      "월 저축·투자율: " + savingsTxt,
      "월 여유자금: " + fmt(r.surplus) + "만원",
      "순자산: " + fmt(r.netAssets) + "만원",
      "부채비율: " + debtTxt
    ].join("\n");
  }

  function sendMail(){
    var submitBtn = root.querySelector("#mbc-submit") || root.querySelector("#mbc-resend");
    if (submitBtn){ submitBtn.disabled = true; submitBtn.textContent = "전송 중..."; }

    if (!window.emailjs){
      state.step = "done";
      renderDone(true);
      return;
    }

    var directorObj = CONFIG.directors.filter(function(d){ return d.name === state.director; })[0] || CONFIG.directors[0];
    var params = {
      site_label: " · 현금흐름.베이직",
      consult_type: "현금흐름 체크 (CASH FLOW)",
      date: todayStr(),
      time: "-",
      name: state.name,
      phone: state.phone || "-",
      email: "-",
      memo: buildMemo(),
      director: directorObj.name,
      to_email: directorObj.email + "," + CONFIG.monitorEmail
    };
    emailjs.send(CONFIG.emailjsServiceId, CONFIG.emailjsTemplateId, params)
      .then(function(){ state.step = "done"; renderDone(false); })
      .catch(function(err){
        console.error("EmailJS 전송 실패:", err);
        state.step = "done";
        renderDone(true);
      });
  }

  function onSubmit(){ sendMail(); }

  function render(){
    if (state.step==="basic") renderBasic();
    else if (state.step==="income") renderIncome();
    else if (state.step==="asset") renderAsset();
    else if (state.step==="self") renderSelf();
    else if (state.step==="result") renderResult();
    else if (state.step==="done") renderDone(false);
  }

  render();
  } // initCashflow 끝

  document.querySelectorAll('[id="mb-cashflow-root"]').forEach(initCashflow);
})();