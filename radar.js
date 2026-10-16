// 레이더 화면. 데이터(D)는 승인된 회원에게만 회원 서버에서 내려온다.
window.renderRadar = function (D) {
'use strict';


const GROUPS = [
  {id:'gov', name:'범정부·R&D', c:'var(--g-gov)'},
  {id:'mob', name:'모빌리티·자율주행', c:'var(--g-mob)'},
  {id:'its', name:'ITS·C-ITS', c:'var(--g-its)'},
  {id:'city', name:'스마트시티·AI시티', c:'var(--g-city)'},
  {id:'twin', name:'디지털트윈·공간정보', c:'var(--g-twin)'},
  {id:'air', name:'위성·우주', c:'var(--g-air)'},
  {id:'ai', name:'AI·데이터·로봇', c:'var(--g-ai)'},
  {id:'base', name:'국토·건설·재난', c:'var(--g-base)'}
];
const GC = Object.fromEntries(GROUPS.map(g=>[g.id,g]));
const LEVELS = ['최상위','부문기본계획','법·제도','분야전략·로드맵','예산·사업'];
const TIER = {'최상위':1,'부문기본계획':2,'법·제도':2,'분야전략·로드맵':3,'예산·사업':3};
const FITL = {core:'즉시 공략', adj:'보완 후 진입', new:'신규 역량 필요'};
const P = D.policies;
const byId = Object.fromEntries(P.map(p=>[p.id,p]));
const kids = {}; P.forEach(p=>(p.links||[]).forEach(l=>{(kids[l.id] ||= []).push({id:p.id, ex:l.ex});}));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const gcol = p => (GC[p.group]||GC.base).c;
const NUMRE = /(^|[^A-Za-z0-9.,])((?:약\s?)?\d[\d,.]*(?:\s?[~→]\s?\d[\d,.]*)?\s?(?:(?:조|억|만|천)\s?(?:원|장|명)?|원|장|곳|개\s?(?:도시|기관|지자체|권역)|km|㎢|%p|%|배|GW|평)(?:\s?이상|\s?이내)?)/g;
const VEHRE = /(^|[^A-Za-z0-9.,])((?:\d{1,3}(?:,\d{3})+|\d{3,})(?:\s?[~→]\s?(?:\d{1,3}(?:,\d{3})+|\d{3,}))?대(?:\s?이상)?)(?!\s?국정)/g;
const hl = s => esc(s).replace(NUMRE,'$1<b class="num">$2</b>').replace(VEHRE,'$1<b class="num">$2</b>');
const BASIS = {in:'사업 참여 확인', cand:'역량 기반 후보'};
const orgList = arr => `<ul class="orgs">${(arr||[]).map(g=>`<li><b>${esc(g.name)}</b> — ${esc(g.role)}<span class="bas ${g.basis}">${BASIS[g.basis]||''}</span></li>`).join('')}</ul>`;
const fitTag = f => f ? `<span class="fit ${f}">${FITL[f]}</span>` : '';
const lvTag = p => `<span class="tag lv">${esc(p.level)}</span>`;
const grpTag = p => `<span class="tag"><span class="dot" style="--c:${gcol(p)}"></span>${esc((GC[p.group]||GC.base).name)}</span>`;
const pref = id => byId[id] ? `<button type="button" class="linkish" data-goto="${esc(id)}">${esc(byId[id].short||byId[id].name)}</button>` : '';
function store(k,v){try{localStorage.setItem('w1radar.'+k,JSON.stringify(v))}catch(e){}}
function load(k,d){try{const v=localStorage.getItem('w1radar.'+k);return v?JSON.parse(v):d}catch(e){return d}}

/* header */
const CHK = D.meta.checkedAt || D.meta.asOf;
const YR = String(CHK).slice(0,4);
const recentDate = p => String(p.update?.date || p.announced || '');
const dayNum = s => { const m = String(s||'').match(/(\d{4})-(\d{2})-(\d{2})/); return m ? Date.UTC(+m[1],+m[2]-1,+m[3])/864e5 : NaN; };
const isNew = p => p.addedAt && (dayNum(CHK) - dayNum(p.addedAt)) <= 7;
const newTag = p => isNew(p) ? '<span class="tag new">신규</span>' : '';
const NOWK = new Date(Date.now() + 9*3600e3).toISOString().slice(0,16).replace('T',' ');
const dlk = s => !s ? '' : (String(s).length <= 10 ? s + ' 23:59' : String(s));
/* 나라장터 3단계: 발주계획(stage 'plan') → 사전규격('pre') → 입찰공고(본공고). 판정 기준은 자동 갱신 스크립트와 같다. */
const PRE_WAIT = 60, PLAN_WAIT = 90;
const addDays = (s, n) => new Date(Date.UTC(+s.slice(0,4), +s.slice(5,7)-1, +s.slice(8,10)) + n*864e5).toISOString().slice(0,10) + String(s).slice(10);
const monthEnd = ym => new Date(Date.UTC(+ym.slice(0,4), +ym.slice(5,7), 0)).toISOString().slice(0,10) + ' 23:59';
const isPre = x => x.stage === 'pre', isPlan = x => x.stage === 'plan', isBid = x => !isPre(x) && !isPlan(x);
function preState(x){
  if(!x.opinionDeadline) return 'stale';
  const od = dlk(x.opinionDeadline);
  if(od >= NOWK) return 'opinion';
  return addDays(od, PRE_WAIT) >= NOWK ? 'waiting' : 'stale';
}
const planLimit = x => x.planMonth ? addDays(monthEnd(x.planMonth), PLAN_WAIT) : (x.posted ? addDays(dlk(x.posted), 120) : '');
const itemOpen = x => isPlan(x) ? planLimit(x) >= NOWK : isPre(x) ? preState(x) !== 'stale' : (!!x.deadline && dlk(x.deadline) >= NOWK);
/* 참가자격 판정(elig.verdict): ok 참여 가능 · gap 보완 필요(부족 1~2개) · no 자격 미달(목록에서 제외) · unknown 확인 필요 */
const isOut = x => x.elig?.verdict === 'no';
const itemLive = x => !isOut(x) && !x.awarded && itemOpen(x);
const items = o => (o.notice?.items)||[];
const liveBids = o => items(o).filter(x => isBid(x) && itemLive(x)).sort((a,b)=>dlk(a.deadline).localeCompare(dlk(b.deadline)));
const livePres = o => items(o).filter(x => isPre(x) && itemLive(x)).sort((a,b)=>(preState(a)==='opinion'?0:1)-(preState(b)==='opinion'?0:1) || dlk(a.opinionDeadline).localeCompare(dlk(b.opinionDeadline)));
const livePlans = o => items(o).filter(x => isPlan(x) && itemLive(x)).sort((a,b)=>String(a.planMonth).localeCompare(String(b.planMonth)));
const ACTIVE_ENTRY = ['즉시 공략','사전규격 대응','발주계획 대응'];
function effEntry(o){
  const it = items(o);
  if(!it.length) return o.entry;
  if(it.some(x => isBid(x) && itemLive(x))) return '즉시 공략';
  if(it.some(x => isPre(x) && itemLive(x))) return '사전규격 대응';
  if(it.some(x => isPlan(x) && itemLive(x))) return '발주계획 대응';
  if(ACTIVE_ENTRY.includes(o.entry)) return o.baseEntry || '폐기';
  return o.entry;
}
const isDiscarded = o => effEntry(o) === '폐기';
const isUpcoming = o => !!o.notice && !items(o).length && o.notice.state === 'upcoming';
function discardReason(o){
  const op = items(o).filter(itemOpen);
  if(op.length && op.every(isOut)) return '참가자격 미달로 제외 — ' + (op[0].elig.gaps||[]).slice(0,2).join(', ');
  if(o.entry === '폐기' && o.discardReason) return o.discardReason;
  const b = items(o).filter(x => isBid(x) && x.deadline).map(x => dlk(x.deadline)).sort().pop();
  if(b) return '입찰 마감(' + b.slice(0,10) + ')으로 폐기';
  if(items(o).some(isPre)) return '사전규격 의견 마감 후 ' + PRE_WAIT + '일 안에 본공고가 없어 폐기';
  return '발주 예정월 후 ' + PLAN_WAIT + '일 안에 사전규격·공고가 없어 폐기';
}
const ddN = s => dayNum(dlk(s).slice(0,10)) - dayNum(NOWK.slice(0,10));
const ddTxt = s => { const n = ddN(s); return n === 0 ? 'D-day' : (n > 0 ? 'D-' + n : '마감'); };
const md = s => { const m = String(s||'').match(/\d{4}-(\d{2})-(\d{2})/); return m ? (+m[1]) + '/' + (+m[2]) : ''; };
const ym = s => { const m = String(s||'').match(/(\d{4})-(\d{2})/); return m ? m[1] + '.' + (+m[2]) : ''; };
const ENTRY_CLS = {'발주계획 대응':'plan','사전규격 대응':'pre','즉시 공략':'core','보완 후 진입':'adj','신규 진입 검토':'new','폐기':'new'};
function horizonTxt(o){
  const p = livePres(o).find(x => preState(x) === 'opinion'), b = liveBids(o)[0], pl = livePlans(o)[0];
  const parts = [];
  if(pl && !b && !p) parts.push(ym(pl.planMonth) + ' 발주 예정');
  if(p) parts.push('의견 마감 ' + md(p.opinionDeadline));
  if(b) parts.push('입찰 마감 ' + md(b.deadline));
  if(!parts.length && livePres(o).length) parts.push('본공고 대기');
  return parts.join(' · ') || o.horizon || '';
}
function noticeTag(o){
  const p = livePres(o), b = liveBids(o), pl = livePlans(o), t = [];
  if(pl.length) t.push(`<span class="tag plan">발주계획 ${pl.length}건 · ${esc(ym(pl[0].planMonth))} 발주 예정</span>`);
  const po = p.find(x => preState(x) === 'opinion');
  if(po) t.push(`<span class="tag pre">사전규격 · 의견 마감 ${esc(md(po.opinionDeadline))} ${ddTxt(po.opinionDeadline)}</span>`);
  else if(p.length) t.push('<span class="tag pre">사전규격 · 본공고 대기</span>');
  if(b.length) t.push(`<span class="tag ok">공고 중 · 마감 ${esc(b[0].deadline)} ${ddTxt(b[0].deadline)}</span>`);
  if(!t.length && isUpcoming(o)) t.push('<span class="tag">공고 예정</span>');
  return t.join('');
}
function eligLine(x){
  const e = x.elig;
  if(!e) return isPlan(x) ? '' : '<div class="elig"><span class="tag">참가자격 판정 전</span></div>';
  if(e.verdict === 'ok') return '<div class="elig"><span class="tag ok">참여 가능</span><span class="nmeta">보유 자격으로 참가자격 충족</span></div>';
  if(e.verdict === 'gap') return `<div class="elig"><span class="tag gap">보완 필요 ${(e.gaps||[]).length}</span><span class="nmeta gapl">부족: ${(e.gaps||[]).map(esc).join(' · ')}</span></div>`;
  if(e.verdict === 'no') return `<div class="elig"><span class="tag out">자격 미달</span><span class="nmeta">${(e.gaps||[]).map(esc).join(' · ')}</span></div>`;
  return `<div class="elig"><span class="tag">자격 확인 필요</span><span class="nmeta">${esc(e.note||'')}</span></div>`;
}
const VERD = {ok:'참여 가능', gap:'보완 필요', no:'자격 미달', unknown:'확인 필요'};
/* 평가 형태: 제안요청서에서 읽은 evalMode를 쓰고, 없으면 요약문(평가 방식·일정)에서 추정한다 */
const EVSHORT = {'대면 발표평가':'대면 발표', '온라인 화상 발표평가':'화상 발표', '온라인 평가(발표 없음)':'온라인·발표 없음', '온라인 평가':'온라인 평가', '서면평가':'서면 평가', '발표평가(방식 미기재)':'발표 있음', '평가 방식 미기재':'평가 방식 확인', '최저가·적격심사':'최저가·적격심사'};
const TALK = new Set(['대면 발표평가', '온라인 화상 발표평가', '발표평가(방식 미기재)']);
function evalOf(x){
  const r = x.rfp; if(!r) return null;
  let mode = r.evalMode, detail = r.evalDetail;
  if(!mode){ const s = [r.evaluation, r.schedule].join(' ');
    mode = /최저가|적격심사|수의견적/.test(s) ? '최저가·적격심사' : /서면/.test(s) ? '서면평가' : /화상|비대면/.test(s) ? '온라인 화상 발표평가' : /발표하지 않|발표 없|발표 생략/.test(s) ? '온라인 평가(발표 없음)' : /오프라인|대면/.test(s) ? '대면 발표평가' : /온라인/.test(s) ? '온라인 평가' : /발표|PT|제안설명회/.test(s) ? '발표평가(방식 미기재)' : '평가 방식 미기재'; }
  const m = String(r.evaluation||'').match(/기술(?:능력)?\s*(\d+)%?[^:：]{0,24}[:：]\s*(?:입찰)?가격\s*(\d+)/);
  return {mode, detail, ratio: m ? `기술 ${m[1]} : 가격 ${m[2]}` : '', nego: /협상/.test(r.evaluation||'')};
}
/* 발표평가 유무: 사업명 아래 기본 정보 줄(발주기관·예산과 같은 줄)에 보인다 */
const PTMAP = {'대면 발표평가':['yes','발표평가 있음(대면)'], '온라인 화상 발표평가':['yes','발표평가 있음(화상)'], '발표평가(방식 미기재)':['yes','발표평가 있음'], '온라인 평가(발표 없음)':['no','발표평가 없음'], '서면평가':['no','발표평가 없음(서면)'], '최저가·적격심사':['no','발표평가 없음']};
const ptOf = x => { const v = evalOf(x); return v ? (PTMAP[v.mode] || ['unk','발표 여부 확인 필요']) : null; };
const pt = x => { const p = ptOf(x); return p ? ` · <b class="pt ${p[0]}">${p[1]}</b>` : ''; };
const evTag = x => { const v = evalOf(x); return v ? `<span class="tag ev${TALK.has(v.mode)?' talk':''}" title="${esc(v.mode)}">${esc(EVSHORT[v.mode]||v.mode)}</span>` : ''; };
const evLine = x => { const v = evalOf(x); if(!v) return '';
  return `<div class="evl"><span class="kl">평가</span><span class="nmeta">${[v.mode, v.nego?'협상에 의한 계약':'', v.ratio, v.detail].filter(Boolean).map(esc).join(' · ')}</span></div>`; };
const eokT = v => { if(!v) return ''; const x = v/1e8; return x >= 1 ? (Math.round(x*100)/100) + '억원' : Math.round(v/1e4).toLocaleString() + '만원'; };
/* 전차(직전 회차) 수주사: 나라장터 계약현황·개찰결과에서 찾은 같은 사업의 지난 계약과 응찰 순위 */
function prevLine(x){
  const p = x.prev; if(!p) return '';
  if(!p.winner){ const rel = (p.rel||[]).map(r=>`<b>${esc(r.name)}</b>(${esc(r.what)})`).join(' · ');
    return `<div class="evl prv"><span class="kl">전차</span><span class="nmeta">${esc(p.note||'전차 계약 없음')}${rel?' · 관련 계약: '+rel:''}</span></div>`; }
  const r = (p.rounds||[]).find(r => (r.bidders||[]).length >= 2 && r.bidders.length <= 8);
  const rivals = r ? r.bidders.filter(b => b.name !== p.winner).slice(0,3).map(b => `${esc(b.name)}${b.rank?' '+b.rank+'위':''}`).join('·') : '';
  const prevs = (p.hist||[]).slice(1,4).filter(h=>h.w!==p.winner).map(h => `${h.y} ${esc(h.w)}`);
  return `<div class="evl prv"><span class="kl">전차</span><span class="nmeta"><b class="cw">${esc(p.winner)}</b> · ${p.year?esc(p.year)+'년 ':''}<b class="num">${eokT(p.amt)}</b>${p.streak>=2?` · <b class="streak">${p.streak}년 연속</b>`:''}${p.pattern?' · '+esc(p.pattern):''}${rivals?' · 경쟁 '+rivals:''}${prevs.length?' · 이전 '+prevs.join(', '):''}${p.note?' · '+esc(p.note):''}</span></div>`;
}
const docBtns = (x, label) => `<div class="docs">${(x.docs||[]).map(d=>`<a class="dbtn" href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.name)}</a>`).join('')}<a class="dbtn pg" href="${esc(x.url)}" target="_blank" rel="noopener">${label}</a></div>`;
const chain = x => { const s = []; if(x.planNo) s.push('발주계획 ' + x.planNo); if(x.preNo) s.push('사전규격 ' + x.preNo); return s.length ? `<div class="nmeta">이어진 단계 · ${esc(s.join(' → '))}</div>` : ''; };
function rfpBlock(x){
  const r = x.rfp; if(!r || r.error) return '';
  const li = a => (a||[]).filter(Boolean).map(v=>`<li>${hl(v)}</li>`).join('');
  const row = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : '';
  const e = x.elig;
  return `<details class="rfp"><summary>제안요청서 요약 — 사업내용·참가자격</summary><dl>
    ${e?row('참여 판정', `<b>${esc(VERD[e.verdict]||'')}</b>${(e.gaps||[]).length?' — 부족: '+e.gaps.map(esc).join(' · '):''}${e.note?'<br>'+esc(e.note):''}`):''}
    ${row('사업 개요', hl(r.overview||''))}${row('사업기간', esc(r.period||''))}${row('사업비', hl(r.budget||''))}
    ${(r.scope||[]).length?`<dt>주요 과업</dt><dd><ul>${li(r.scope)}</ul></dd>`:''}
    ${(r.qualification||[]).length?`<dt>참가자격</dt><dd><ul>${li(r.qualification)}</ul></dd>`:''}
    ${r.evalMode||r.evalDetail?row('평가 형태', `<b>${esc(r.evalMode||'')}</b>${r.evalDetail?' — '+esc(r.evalDetail):''}`):''}${row('평가 방식', hl(r.evaluation||''))}${row('일정', hl(r.schedule||''))}${row('웨이즈원 관점', hl(r.fit||''))}</dl>
    <span class="nmeta">${esc(r.source||'제안요청서')}를 읽고 정리${r.checkedAt?' · '+esc(r.checkedAt):''} — 응찰 전 원문을 꼭 확인하세요.</span></details>`;
}
function preMeta(x){
  const st = preState(x);
  return `${esc(x.org||'')}${x.posted?' · 공개 '+esc(x.posted):''} · ${st==='opinion'?`의견 마감 <b class="num">${esc(x.opinionDeadline)}</b><span class="dd pre">${ddTxt(x.opinionDeadline)}</span>`:`의견 마감 ${esc(md(x.opinionDeadline))} · <b>본공고 대기</b>`}${x.budget?` · <b class="num">${esc(x.budget)}</b>`:''}${pt(x)}`;
}
const planMeta = x => `${esc(x.org||'')}${x.posted?' · 등록 '+esc(x.posted):''} · <b>${esc(ym(x.planMonth))} 발주 예정</b>${x.budget?` · <b class="num">${esc(x.budget)}</b>`:''}${x.method?' · '+esc(x.method):''}`;
const bidMeta = x => `${esc(x.org||'')}${x.posted?' · 공고 '+esc(x.posted):''} · 제출 마감 <b class="num">${esc(x.deadline)}</b><span class="dd ${ddN(x.deadline)<=7?'hot':''}">${ddTxt(x.deadline)}</span>${x.budget?` · 사업비 <b class="num">${esc(x.budget)}</b>`:''}${pt(x)}`;
function noticeBlock(o){
  const n = o.notice; if(!n) return '';
  if(isUpcoming(o)) return `<div class="nwrap up"><div class="nhead"><span class="nst">공고 예정</span><span>${esc(n.expected||'공고 시기 미정')}</span></div>
    ${(n.refs||[]).length?`<div class="docs">${n.refs.map(r=>`<a class="dbtn pg" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a>`).join('')}</div>`:''}
    ${n.note?`<span class="nmeta">${esc(n.note)}</span>`:''}</div>`;
  const PL = livePlans(o), P0 = livePres(o), B0 = liveBids(o); let h = '';
  if(B0.length) h += `<div class="nwrap"><div class="nhead"><span class="nst">입찰공고 ${B0.length}건</span><span>지금 응찰할 수 있는 본공고입니다. 서류 버튼을 누르면 나라장터 원문 파일이 바로 내려받아집니다.</span></div>
    ${B0.map(x=>`<div class="ni"><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>
      <div class="nmeta">${bidMeta(x)}</div>
      ${x.lic?`<div class="nmeta">참가 업종 · ${esc(x.lic)}</div>`:''}${chain(x)}${x.note?`<div class="nmeta">${esc(x.note)}</div>`:''}
      ${eligLine(x)}${evLine(x)}${prevLine(x)}${rfpBlock(x)}${(x.docs||[]).length?docBtns(x,'나라장터 공고 페이지'):''}</div>`).join('')}</div>`;
  if(P0.length) h += `<div class="nwrap pre"><div class="nhead"><span class="nst pre">사전규격 ${P0.length}건</span><span>본공고 전에 공개된 제안요청서 초안입니다. 의견 마감 전에 과업 범위에 의견을 낼 수 있고, 마감 후에는 본공고가 이어집니다.</span></div>
    ${P0.map(x=>`<div class="ni"><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>
      <div class="nmeta">${preMeta(x)}</div>${chain(x)}${x.note?`<div class="nmeta">${esc(x.note)}</div>`:''}
      ${eligLine(x)}${evLine(x)}${prevLine(x)}${rfpBlock(x)}${docBtns(x,'나라장터에서 보기')}</div>`).join('')}</div>`;
  if(PL.length) h += `<div class="nwrap planw"><div class="nhead"><span class="nst plan">발주계획 ${PL.length}건</span><span>발주기관이 올해 발주하겠다고 등록한 계획입니다. 사전규격·본공고가 나오기 전 담당부서를 미리 만날 수 있는 단계입니다.</span></div>
    ${PL.map(x=>`<div class="ni"><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>
      <div class="nmeta">${planMeta(x)}</div>${x.note?`<div class="nmeta">${esc(x.note)}</div>`:''}${prevLine(x)}</div>`).join('')}</div>`;
  if(h && n.checkedAt) h += `<span class="nmeta" style="grid-column:1/-1">나라장터 확인 ${esc(n.checkedAt)} KST</span>`;
  return h;
}
function qualBox(){
  const Q = D.company?.quals; const out = [];
  (D.opportunities||[]).forEach(o => items(o).filter(x => isOut(x) && itemOpen(x)).forEach(x => out.push({o, x})));
  const ul = a => `<ul>${(a||[]).map(v=>`<li>${esc(v)}</li>`).join('')}</ul>`;
  return (out.length ? `<details class="qbox"><summary>참가자격이 많이 부족해 뺀 공고 ${out.length}건</summary><ul class="olist">${out.map(({o,x})=>`<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a><span class="nmeta">${esc(x.org||'')} · ${(x.elig.gaps||[]).map(esc).join(' · ')}</span></li>`).join('')}</ul></details>` : '')
    + (Q ? `<details class="qbox"><summary>판정 기준 — 웨이즈원 보유 참가자격(${esc(Q.asOf||'')})</summary><div class="qgrid">
      <div><span class="kl">업 등록·면허</span>${ul(Q.licenses)}</div><div><span class="kl">직접생산확인</span>${ul(Q.directProduction)}</div>
      <div><span class="kl">보유로 본 것</span>${ul(Q.assumed)}</div><div><span class="kl">보유하지 않은 것</span>${ul(Q.notHeld)}</div></div>
      <p class="nmeta">${esc(Q.rule||'')}</p></details>` : '');
}
let pipeTab = load('pipe', 'pre');
function renderPipe(){
  const OPPS = (D.opportunities||[]).filter(o => !isDiscarded(o));
  const rows = {plan: [], pre: [], bid: []};
  OPPS.forEach(o => { livePlans(o).forEach(x => rows.plan.push({o, x})); livePres(o).forEach(x => rows.pre.push({o, x, st: preState(x)})); liveBids(o).forEach(x => rows.bid.push({o, x})); });
  rows.plan.sort((a,b)=>String(a.x.planMonth).localeCompare(String(b.x.planMonth)) || String(b.x.posted).localeCompare(String(a.x.posted)));
  rows.pre.sort((a,b)=>(a.st==='opinion'?0:1)-(b.st==='opinion'?0:1) || (a.st==='opinion' ? dlk(a.x.opinionDeadline).localeCompare(dlk(b.x.opinionDeadline)) : String(b.x.posted).localeCompare(String(a.x.posted))));
  rows.bid.sort((a,b)=>dlk(a.x.deadline).localeCompare(dlk(b.x.deadline)));
  const opp = o => `<button type="button" class="linkish" data-opp="${esc(o.id)}">${esc(o.title)}</button>`;
  const li = {
    plan: ({o,x}) => `<li><div class="st"><span class="tag plan">발주계획</span><span><b>${esc(ym(x.planMonth))}</b> 발주 예정</span></div>
      <div class="bd"><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>
      <span class="nmeta">${esc(x.org||'')}${x.budget?` · <b class="num">${esc(x.budget)}</b>`:''}${x.method?' · '+esc(x.method):''} · ${opp(o)}</span>${prevLine(x)}</div></li>`,
    pre: ({o,x,st}) => `<li><div class="st">${st==='opinion'?`<span class="tag pre">의견 접수 중</span><span>마감 <b>${esc(md(x.opinionDeadline))}</b> <span class="dd pre">${ddTxt(x.opinionDeadline)}</span></span>`:`<span class="tag">본공고 대기</span><span>의견 마감 ${esc(md(x.opinionDeadline))}</span>`}</div>
      <div class="bd"><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>
      <span class="nmeta">${esc(x.org||'')}${x.budget?` · <b class="num">${esc(x.budget)}</b>`:''}${pt(x)} · ${opp(o)}</span>
      ${eligLine(x)}${evLine(x)}${prevLine(x)}${rfpBlock(x)}${docBtns(x,'나라장터에서 보기')}</div></li>`,
    bid: ({o,x}) => `<li><div class="st"><span class="tag ok">입찰공고</span><span>마감 <b>${esc(md(x.deadline))}</b> <span class="dd ${ddN(x.deadline)<=7?'hot':''}">${ddTxt(x.deadline)}</span></span></div>
      <div class="bd"><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>
      <span class="nmeta">${esc(x.org||'')}${x.budget?` · <b class="num">${esc(x.budget)}</b>`:''}${pt(x)}${x.lic?' · '+esc(x.lic):''} · ${opp(o)}</span>
      ${eligLine(x)}${evLine(x)}${prevLine(x)}${rfpBlock(x)}${(x.docs||[]).length?docBtns(x,'나라장터 공고 페이지'):''}</div></li>`
  };
  const TAB = [['plan','발주계획','발주기관이 올해 발주하겠다고 등록한 계획. 담당부서를 미리 만나 사업 범위를 파악하는 단계'],['pre','사전규격','본공고 전에 제안요청서 초안을 공개하고 의견을 받는 단계. 과업 범위에 의견을 내고 협력사를 정하는 단계'],['bid','입찰공고','제안서·입찰서를 내는 본공고. 제출 마감 전에 응찰 여부를 정하는 단계']];
  if(!rows[pipeTab]) pipeTab = 'pre';
  const cur = TAB.find(t => t[0] === pipeTab);
  const list = rows[pipeTab];
  let body;
  if(pipeTab === 'pre'){
    const op = list.filter(r => r.st === 'opinion'), wt = list.filter(r => r.st !== 'opinion');
    body = (op.length?`<ul class="prl">${op.map(li.pre).join('')}</ul>`:'<p class="muted small">의견 접수 중인 사전규격이 없습니다.</p>')
      + (wt.length?`<details class="prl"><summary>의견 마감 후 본공고를 기다리는 사전규격 ${wt.length}건</summary><ul class="prl">${wt.map(li.pre).join('')}</ul></details>`:'');
  } else body = list.length ? `<ul class="prl">${list.map(li[pipeTab]).join('')}</ul>` : '<p class="muted small">해당 단계의 사업이 없습니다.</p>';
  $('#prepanel').innerHTML = `<div class="sec-head"><h2>나라장터에서 잡을 사업 <em>${rows.plan.length + rows.pre.length + rows.bid.length}</em>건</h2>
    <p class="muted">웨이즈원 제품과 맞는 나라장터 사업을 발주계획 → 사전규격 → 입찰공고 단계별로 모았습니다. 사전규격·입찰공고는 제안요청서를 직접 읽어 사업내용과 참가자격을 정리하고, 보유 자격으로 참여 가능 여부를 판정했습니다.</p></div>
    <div class="pipe" role="tablist">${TAB.map(([k,l])=>`<button type="button" role="tab" data-pipe="${k}" aria-selected="${String(k===pipeTab)}" class="${k}"><span>${l}</span><b>${rows[k].length}</b></button>`).join('<i aria-hidden="true">→</i>')}</div>
    <p class="small muted">${esc(cur[2])}</p>${body}${qualBox()}`;
  $$('#prepanel [data-pipe]').forEach(b => b.addEventListener('click', () => { pipeTab = b.dataset.pipe; store('pipe', pipeTab); renderPipe(); }));
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-tabgo]'); if(b){e.preventDefault(); if(b.dataset.pipego){ pipeTab = b.dataset.pipego; store('pipe', pipeTab); renderPipe(); } show(b.dataset.tabgo);}});
$('#asof').textContent = '마지막 확인 ' + CHK + ' KST';
const n26 = P.filter(p=>recentDate(p).startsWith(YR)).length;
const LIVE_OPPS = (D.opportunities||[]).filter(o=>!isDiscarded(o));
const nPlanItems = LIVE_OPPS.reduce((s,o)=>s+livePlans(o).length,0);
const nPreItems = LIVE_OPPS.reduce((s,o)=>s+livePres(o).length,0);
const nBidItems = LIVE_OPPS.reduce((s,o)=>s+liveBids(o).length,0);
/* 연구개발·기업지원: 마감일(close)이 지나면 목록에서 빠진다. 상시·예산 소진 시까지는 close 없음 */
const PG = D.programs || {items: []};
const prgOpen = x => !x.close || dlk(x.close) >= NOWK;
const PRG = (PG.items||[]).filter(prgOpen);
$('#kpis').innerHTML = [
  [nBidItems,'입찰공고', 'hot', 'g2b', 'bid'],
  [nPreItems,'사전규격', 'pre', 'g2b', 'pre'],
  [nPlanItems,'발주계획', 'plan', 'g2b', 'plan'],
  [PRG.length,'R&D·기업지원', 'rnd', 'rnd'],
  [P.length,'정책·계획', '', 'catalog']
].map(([v,l,c,t,pp])=>`<button type="button" class="kpi ${c||''}" data-tabgo="${t}"${pp?` data-pipego="${pp}"`:''}><b>${v}</b><span><i class="dot" style="--c:${({hot:'var(--ok)',pre:'var(--pre)',plan:'var(--plan)',rnd:'var(--rnd)'})[c]||'var(--ink3)'}"></i>${l}</span></button>`).join('');
[['g2b', nPlanItems + nPreItems + nBidItems], ['rnd', PRG.length], ['catalog', P.length]].forEach(([t, n]) => { const b = document.getElementById('t-' + t); if(b) b.insertAdjacentHTML('beforeend', `<span class="n">${n}</span>`); });

/* tabs */
const TABS = ['overview','g2b','rnd','ways1','catalog','links','timeline','sources'];
let cur = 'overview';
function show(t, opt={}){
  if(!TABS.includes(t)) t='overview';
  cur = t;
  $$('.view').forEach(v=>v.hidden = v.dataset.view!==t);
  $$('.tab').forEach(b=>b.setAttribute('aria-selected', b.dataset.tab===t ? 'true':'false'));
  if(t==='links') requestAnimationFrame(drawEdges);
  if(!opt.keepScroll) window.scrollTo({top:0});
  try{ if(location.hash !== '#'+t) history.replaceState(null,'','#'+t) }catch(e){}
  store('tab',t);
}
$$('.tab').forEach(b=>b.addEventListener('click',()=>show(b.dataset.tab)));
window.addEventListener('hashchange',()=>{const h=location.hash.slice(1); if(TABS.includes(h)&&h!==cur) show(h)});

/* overview */
// 인사이트 카드 속 사업마다 나라장터 발주계획 → 사전규격 → 입찰공고를 단계별로 보여 준다
function bizNotice(o){
  const PL = livePlans(o), P0 = livePres(o), B0 = liveBids(o);
  if(!(PL.length + P0.length + B0.length)) return '';
  const a = x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>`;
  // 제안요청서 요약과 서류 버튼을 접힌 상자 하나에 담아 카드 길이를 줄인다
  const more = x => { const d = (x.docs||[]).length ? docBtns(x, isBid(x)?'나라장터 공고 페이지':'나라장터에서 보기') : ''; const r = rfpBlock(x);
    if(!r) return d ? `<details class="rfp"><summary>서류 ${(x.docs||[]).length}건</summary>${d}</details>` : '';
    return r.replace('<summary>제안요청서 요약 — 사업내용·참가자격</summary>', `<summary>제안요청서 요약(사업내용·참가자격)${d?' · 서류 '+(x.docs||[]).length+'건':''}</summary>`).replace(/<\/details>$/, d + '</details>'); };
  const row = {
    plan: x => `<li><span class="bw"><b>${esc(ym(x.planMonth))}</b> 발주 예정</span><div class="bb">${a(x)}<span class="nmeta">${esc(x.org||'')}${x.budget?` · <b class="num">${esc(x.budget)}</b>`:''}${x.method?' · '+esc(x.method):''}</span></div></li>`,
    pre: x => `<li><span class="bw">${preState(x)==='opinion'?`의견 마감 <b>${esc(md(x.opinionDeadline))}</b> <span class="dd pre">${ddTxt(x.opinionDeadline)}</span>`:`본공고 대기`}</span><div class="bb">${a(x)}<span class="nmeta">${esc(x.org||'')}${x.budget?` · <b class="num">${esc(x.budget)}</b>`:''}${pt(x)}</span>${eligLine(x)}${evLine(x)}${prevLine(x)}${more(x)}</div></li>`,
    bid: x => `<li><span class="bw">제출 마감 <b>${esc(md(x.deadline))}</b> <span class="dd ${ddN(x.deadline)<=7?'hot':''}">${ddTxt(x.deadline)}</span></span><div class="bb">${a(x)}<span class="nmeta">${esc(x.org||'')}${x.budget?` · <b class="num">${esc(x.budget)}</b>`:''}${pt(x)}${x.lic?' · '+esc(x.lic):''}</span>${eligLine(x)}${evLine(x)}${prevLine(x)}${more(x)}</div></li>`
  };
  const SHOW = 2;
  const sec = (k, cls, label, arr) => !arr.length ? '' : `<div class="bstage ${k}"><span class="tag ${cls}">${label} ${arr.length}건</span>
    <ul class="brow">${arr.slice(0, SHOW).map(row[k]).join('')}</ul>
    ${arr.length > SHOW ? `<details class="bmore"><summary>${label} ${arr.length - SHOW}건 더 보기</summary><ul class="brow">${arr.slice(SHOW).map(row[k]).join('')}</ul></details>` : ''}</div>`;
  const none = [['발주계획',PL],['사전규격',P0],['입찰공고',B0]].filter(([,a]) => !a.length).map(([l]) => l);
  return `<div class="bnara"><span class="kl">나라장터 발주계획 → 사전규격 → 입찰공고</span>
    ${sec('plan','plan','발주계획',PL)}${sec('pre','pre','사전규격',P0)}${sec('bid','ok','입찰공고',B0)}
    ${none.length ? `<span class="nmeta bnone">아직 없음 · ${none.join(' · ')}</span>` : ''}</div>`;
}
function renderInsights(){
  const OPP = Object.fromEntries([...(D.opportunities||[]), ...(D.customBiz||[])].map(o=>[o.id,o]));
  const ecls = ENTRY_CLS;
  // 나라장터 단계가 살아 있는데 어느 카드에도 없는 사업은 근거 정책·제품이 가장 많이 겹치는 카드에 붙인다
  const ALL = (D.insights||[]).map(i => ({...i, biz: [...(i.biz||[])]}));
  const INS = ALL.filter(i => i.sec !== 'market'), MKI = ALL.filter(i => i.sec === 'market');
  const covered = new Set(INS.flatMap(i => i.biz));
  (D.opportunities||[]).filter(o => !covered.has(o.id) && !isDiscarded(o) && items(o).some(itemLive)).forEach(o => {
    let best = 0, score = -1;
    INS.forEach((i, k) => { const s = (o.policies||[]).filter(p => (i.refs||[]).includes(p)).length * 2 + (o.products||[]).filter(p => (i.products||[]).some(q => p.includes(q) || q.includes(p))).length; if(s > score){ score = s; best = k; } });
    if(INS[best]) INS[best].biz.push(o.id);
  });
  // 카드에는 판단·시사점·사업 목록(한 줄씩)만 보이고, 협력 기업·나라장터 단계는 접어 둔다
  const entryTag = o => o.entry ? `<span class="fit ${ecls[effEntry(o)]}">${esc(effEntry(o))}</span>` : '<span class="fit adj">정책 제안</span>';
  const bizWhen = o => { const n = items(o).length ? [livePlans(o).length && `발주계획 ${livePlans(o).length}`, livePres(o).length && `사전규격 ${livePres(o).length}`, liveBids(o).length && `입찰공고 ${liveBids(o).length}`].filter(Boolean).join(' · ') : '';
    const h = horizonTxt(o) || (isUpcoming(o) ? '공고 예정' : '');
    return [h, n].filter(Boolean).join(' — '); };
  const card = i=>{
    const B = (i.biz||[]).map(id=>OPP[id]).filter(o=>o && !isDiscarded(o));
    const g = GC[i.group];
    return `<article class="ins${i.sec==='market'?' mk':''}">
    <span class="k">${g?`<span class="dot" style="--c:${g.c}"></span>`:''}${esc(i.tag)}</span><h3>${esc(i.title)}</h3><p>${hl(i.body)}</p>
    <div class="w1box"><span class="w1h">웨이즈원 시사점</span><p>${hl(i.w1)}</p>
      ${i.products?.length?`<div class="pchips">${i.products.map(x=>`<span class="pc">${esc(x)}</span>`).join('')}</div>`:''}</div>
    ${B.length?`<div class="bizsum"><span class="kl">추진할 사업 ${B.length}건</span><ul>${B.map(o=>`<li>${entryTag(o)}
      ${o.entry?`<button type="button" class="linkish" data-opp="${esc(o.id)}">${esc(o.title)}</button>`:`<span style="font-weight:600">${esc(o.title)}</span>`}
      ${bizWhen(o)?`<span class="when">${esc(bizWhen(o))}</span>`:''}</li>`).join('')}</ul></div>`:''}
    ${B.length||i.tech?.length?`<details class="insmore"><summary>사업별 협력 대상·나라장터 단계</summary>
      ${i.tech?.length?`<div class="kv" style="margin-bottom:12px"><span class="kl">핵심 기술</span><div class="pchips">${i.tech.map(x=>`<span class="tc">${esc(x)}</span>`).join('')}</div></div>`:''}
      <div class="bizl">${B.map(o=>`<div class="biz">
        <div class="bh">${entryTag(o)}${noticeTag(o) || (o.horizon?`<span class="tag">${esc(o.horizon)}</span>`:'')}</div>
        ${o.entry?`<button type="button" class="linkish bt" data-opp="${esc(o.id)}">${esc(o.title)}</button>`:`<span class="bt">${esc(o.title)}</span>`}
        ${o.entry?'':`<span class="small muted">${esc(o.why)}</span>`}
        <div class="kv"><span class="kl">협력 기술</span><div class="pchips">${(o.partners?.tech||[]).map(x=>`<span class="tc">${esc(x)}</span>`).join('')}</div></div>
        ${(o.partners?.orgs||[]).length?`<div class="kv"><span class="kl">협력 기업</span>${orgList(o.partners.orgs)}</div>`:''}
        ${bizNotice(o)}</div>`).join('')}</div></details>`:''}
    ${i.basis?`<div class="refs"><span class="conf">근거</span><span>${esc(i.basis)}</span></div>`:`<div class="refs"><span class="conf">근거 정책</span>${(i.refs||[]).map(pref).join('')}</div>`}
    </article>`; };
  $('#insights').innerHTML = INS.map(card).join('');
  $('#mkins').innerHTML = MKI.map(card).join('');
  $('#mkins').previousElementSibling.hidden = !MKI.length; $('#mkins').hidden = !MKI.length;
}
/* 한눈에 보기 맨 위: 마감이 가까운 일 */
function renderBoard(){
  const bids = [], pres = [];
  LIVE_OPPS.forEach(o => { liveBids(o).forEach(x => bids.push(x)); livePres(o).filter(x => preState(x) === 'opinion').forEach(x => pres.push(x)); });
  const uniq = a => { const s = new Set(); return a.filter(x => { const k = x.no || x.url || x.title; if(s.has(k)) return false; s.add(k); return true; }); };
  const B = uniq(bids).sort((a,b)=>dlk(a.deadline).localeCompare(dlk(b.deadline)));
  const PR = uniq(pres).sort((a,b)=>dlk(a.opinionDeadline).localeCompare(dlk(b.opinionDeadline)));
  const RG = PRG.filter(x => x.close).sort((a,b)=>dlk(a.close).localeCompare(dlk(b.close)));
  const RS = PRG.filter(x => !x.close);
  const N = 4;
  const ev = x => { const e = x.elig?.verdict; return e === 'ok' ? '<span class="tag ok">참여 가능</span>' : e === 'gap' ? `<span class="tag gap">보완 ${(x.elig.gaps||[]).length}</span>` : e === 'unknown' ? '<span class="tag">자격 확인</span>' : ''; };
  const dd = s => { const n = ddN(s); return `<span class="dday ${n<=3?'hot':''}">${ddTxt(s)}<small>${esc(md(s))}</small></span>`; };
  const li = (d, url, title, meta) => `<li>${d}<div><a href="${esc(url)}" target="_blank" rel="noopener">${esc(title)}</a><div class="bm">${meta}</div></div></li>`;
  const col = (c, title, n, list, go, pipe, empty) => `<div class="bcol" style="--c:${c}"><h3><i class="dot" style="--c:${c}"></i>${title}<b>${n}건</b></h3>
    ${list.length ? `<ul>${list.join('')}</ul>` : `<p class="empty">${empty}</p>`}
    <button type="button" class="btn go" data-tabgo="${go}"${pipe?` data-pipego="${pipe}"`:''}>전체 보기 →</button></div>`;
  $('#board').innerHTML =
    col('var(--ok)', '입찰 마감', B.length, B.slice(0,N).map(x => li(dd(x.deadline), x.url, x.title, `${ev(x)}${esc(x.org||'')}${x.budget?` · <b class="num">${esc(x.budget)}</b>`:''}${pt(x)}`)), 'g2b', 'bid', '응찰할 수 있는 입찰공고가 없습니다.')
  + col('var(--pre)', '사전규격 의견 마감', PR.length, PR.slice(0,N).map(x => li(dd(x.opinionDeadline), x.url, x.title, `${ev(x)}${esc(x.org||'')}${x.budget?` · <b class="num">${esc(x.budget)}</b>`:''}${pt(x)}`)), 'g2b', 'pre', '의견 접수 중인 사전규격이 없습니다.')
  + col('var(--rnd)', 'R&D·기업지원 신청', PRG.length, [...RG.slice(0,N).map(x => li(dd(x.close), x.url || (x.links||[])[0]?.url, x.title, `${x.qual?.verdict==='ok'?'<span class="tag ok">신청 가능</span>':x.qual?.verdict==='gap'?'<span class="tag gap">보완 필요</span>':'<span class="tag">자격 확인</span>'}<span class="tag ${x.kind==='rnd'?'rnd':'bizs'}">${x.kind==='rnd'?'연구개발':'기업지원'}</span>${esc(x.agency||x.ministry||'')}${x.open && dlk(x.open) > NOWK ? ' · <b>' + esc(md(x.open)) + ' 접수 시작</b>' : ''}`)),
      ...(RG.length < N ? RS.slice(0, N - RG.length).map(x => li(`<span class="dday">상시<small>${esc(x.closeNote||'')}</small></span>`, x.url || (x.links||[])[0]?.url, x.title, `<span class="tag bizs">기업지원</span>${esc(x.agency||'')}`)) : [])], 'rnd', '', '신청할 수 있는 공고가 없습니다.');
}
/* 연구개발·기업지원 */
let rndKind = load('rndk', '');
function renderPrograms(){
  const FIT = {high: '적합도 높음', mid: '검토'};
  const KIND = {rnd: '연구개발', biz: '기업지원'};
  const QV = {ok: '<span class="tag ok">신청 가능</span>', gap: '<span class="tag gap">보완 필요</span>', unknown: '<span class="tag">자격 확인 필요</span>'};
  const src = (PG.sources||[]).map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join(' · ');
  $('#rndintro').innerHTML = `${src}에서 웨이즈원 제품과 맞는 연구개발(R&amp;D)·기업지원 공고를 골랐습니다. 공고마다 신청 자격을 웨이즈원 보유 현황과 맞춰 판정했고, 웨이즈원이 신청할 수 없는 공고와 인력지원·컨설팅 단독 지원은 넣지 않습니다. 신청 마감이 지나면 자동으로 빠집니다.<br><span class="nmeta">${PG.checkedAt?`확인 ${esc(PG.checkedAt)} KST · `:''}${esc(PG.note||'')}</span>`;
  const ord = x => x.close ? dlk(x.close) : '9999';
  const list = PRG.filter(x => !rndKind || x.kind === rndKind).sort((a,b)=>(a.fit==='high'?0:1)-(b.fit==='high'?0:1) || ord(a).localeCompare(ord(b)));
  $('#rndseg').innerHTML = [['','전체'],['rnd','연구개발'],['biz','기업지원']].map(([k,l]) => `<button type="button" data-k="${k}" aria-pressed="${String(k===rndKind)}">${l} <span class="mono small">${k?PRG.filter(x=>x.kind===k).length:PRG.length}</span></button>`).join('');
  $$('#rndseg button').forEach(b => b.addEventListener('click', () => { rndKind = b.dataset.k; store('rndk', rndKind); renderPrograms(); }));
  $('#rndcount').textContent = `${list.length}건 · 적합도 높은 것부터, 마감이 가까운 순`;
  const period = x => x.close ? `${x.open?esc(x.open)+' ~ ':''}${esc(x.close)}` : esc(x.closeNote || '상시');
  const state = x => { if(!x.close) return '<span class="tag ing">상시 접수</span>';
    if(x.open && dlk(x.open) > NOWK) return `<span class="tag">접수 예정 · ${esc(md(x.open))} 시작</span>`;
    return `<span class="tag ing">접수 중</span><span class="dd ${ddN(x.close)<=7?'hot':'soon'}">${ddTxt(x.close)}</span>`; };
  $('#rndlist').innerHTML = list.length ? list.map(x => `<article class="prg">
    <div class="ph"><div class="top"><span class="tag ${x.kind==='rnd'?'rnd':'bizs'}">${KIND[x.kind]||''}</span>${x.fit==='high'?'<span class="tag hi">적합도 높음</span>':'<span class="tag">검토</span>'}${QV[x.qual?.verdict]||''}${state(x)}${isNew(x)?'<span class="tag new">신규</span>':''}</div>
      <h3><a href="${esc(x.url || (x.links||[])[0]?.url || '#')}" target="_blank" rel="noopener">${esc(x.title)}</a></h3>
      <span class="org">${esc(x.ministry||'')}${x.agency?' · '+esc(x.agency):''}${x.evalm?(/발표/.test(x.evalm.mode+x.evalm.detail.replace(/발표 절차는 공고에 없음|공고문에 발표 절차는 없음/,''))?' · <b class="pt yes">발표평가 있음</b>':' · <b class="pt no">발표평가 없음</b>'):' · <b class="pt unk">발표 여부 확인 필요</b>'}</span>
      ${x.use?`<p class="use"><b>웨이즈원 활용</b> — ${hl(x.use)}</p>`:''}
      ${(x.products||[]).length?`<div class="pchips">${x.products.map(p=>`<span class="pc">${esc(p)}</span>`).join('')}</div>`:''}</div>
    <dl><dt>신청 자격</dt><dd class="${x.qual?.verdict==='ok'?'qok':'chk'}">${x.qual?`<b>${esc(({ok:'신청 가능',gap:'보완 필요',unknown:'자격 확인 필요'})[x.qual.verdict]||'')}</b> — ${esc(x.qual.note||'')}`:'자격 판정 전 — 공고 원문으로 확인하세요'}</dd><dt>신청 기간</dt><dd><b class="num">${period(x)}</b></dd>
      <dt>선정 방식</dt><dd>${x.evalm?`<b>${esc(x.evalm.mode)}</b> — ${esc(x.evalm.detail||'')}`:'공고문 확인'}</dd>
      ${x.support?`<dt>지원 내용</dt><dd>${hl(x.support)}</dd>`:''}
      ${x.target?`<dt>신청 대상</dt><dd>${hl(x.target)}</dd>`:''}
      ${x.check?`<dt>확인할 점</dt><dd class="chk">${hl(x.check)}</dd>`:''}
      <dt>원문</dt><dd><div class="docs">${(x.links||[]).map(l=>`<a class="dbtn pg" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)}</a>`).join('')}</div></dd></dl>
    </article>`).join('') : '<p class="muted">조건에 맞는 공고가 없습니다.</p>';
  const OUT = (PG.excluded||[]);
  $('#rndout').innerHTML = OUT.length ? `<details class="panel discard"><summary>살펴봤지만 맞지 않아 뺀 공고 ${OUT.length}건</summary><ul>${OUT.map(x=>`<li><b>${x.url?`<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>`:esc(x.title)}</b> — ${esc(x.reason)}</li>`).join('')}</ul></details>` : '';
}
function renderHeat(){
  const cnt = {}; let max=1;
  P.forEach(p=>{const k=p.group+'|'+p.level; cnt[k]=(cnt[k]||0)+1; max=Math.max(max,cnt[k]);});
  let h = '<thead><tr><th></th>'+LEVELS.map(l=>`<th>${esc(l)}</th>`).join('')+'</tr></thead><tbody>';
  GROUPS.forEach(g=>{
    h += `<tr><th><span class="tag" style="border:0;padding:0"><span class="dot" style="--c:${g.c}"></span>${esc(g.name)}</span></th>`;
    LEVELS.forEach(l=>{const v=cnt[g.id+'|'+l]||0; const pct = v? Math.round(18+ (v/max)*72):0;
      h += `<td><button type="button" ${v?'':'disabled'} class="${pct>55?'hi':''}" style="--c:${g.c};--v:${pct}" data-g="${g.id}" data-l="${esc(l)}" aria-label="${esc(g.name)} ${esc(l)} ${v}건">${v||'·'}</button></td>`;});
    h += '</tr>';
  });
  $('#heat').innerHTML = h + '</tbody>';
  $$('#heat button[data-g]').forEach(b=>b.addEventListener('click',()=>{ F.groups=new Set([b.dataset.g]); F.level=b.dataset.l; F.q=''; F.min=''; F.fit=''; syncFilters(); renderCatalog(); show('catalog'); }));
}
function renderNews(){
  const items = [...P].sort((a,b)=>recentDate(b).localeCompare(recentDate(a))).slice(0,10);
  $('#news').innerHTML = items.map(p=>`<li><span class="d">${esc(recentDate(p))}</span>
    <div><div class="t"><button type="button" class="linkish" data-goto="${esc(p.id)}">${esc(p.short||p.name)}</button> ${newTag(p)}</div>
    <div class="s">${hl(p.update?.text||p.status)}</div></div></li>`).join('');
}

/* catalog */
const F = {q:'', groups:new Set(), level:'', min:'', fit:'', sort:'date'};
function docBody(p){
  const li = arr => (arr||[]).map(x=>`<li><span>${hl(x)}</span></li>`).join('');
  const parents = (p.links||[]).filter(l=>byId[l.id]).map(l=>`<li><span>${pref(l.id)} <span class="conf">${l.ex?'명시':'내용상 연계'}</span></span></li>`).join('');
  const ch = (kids[p.id]||[]).filter(k=>byId[k.id]).map(k=>`<li><span>${pref(k.id)}</span></li>`).join('');
  const w = p.w1||{};
  return `<div class="doc">
    <div class="sq"><i>□</i><div><b>비전·목표</b><span class="muted">${hl(p.vision)}</span>${p.targets?.length?`<ul>${li(p.targets)}</ul>`:''}</div></div>
    ${p.keyTasks?.length?`<div class="sq"><i>□</i><div><b>주요 추진과제</b><ul>${li(p.keyTasks)}</ul></div></div>`:''}
    ${p.budget?`<div class="sq"><i>□</i><div><b>투자·예산</b><span class="muted">${hl(p.budget)}</span></div></div>`:''}
    ${p.spatialHooks?.length?`<div class="sq"><i>□</i><div><b>공간정보 결합 지점</b><ul>${li(p.spatialHooks)}</ul></div></div>`:''}
    ${(parents||ch)?`<div class="sq"><i>□</i><div><b>정책 연계</b>${parents?`<span class="small muted">상위 근거</span><ul>${parents}</ul>`:''}${ch?`<span class="small muted">하위 실행계획·사업</span><ul>${ch}</ul>`:''}${p.parentEvidence?`<span class="small muted">${esc(p.parentEvidence)}</span>`:''}</div></div>`:''}
    ${w.fit?`<div class="sq"><i>□</i><div><b>웨이즈원 연계 ${fitTag(w.fit)}</b><span class="muted">${esc(w.note||'')}</span>${w.products?.length?`<span class="small muted">관련 제품·역량: ${esc(w.products.join(', '))}</span>`:''}</div></div>`:''}
    <div class="sq"><i>□</i><div><b>현재 상태</b><span class="muted">${hl(p.status)}</span></div></div>
  </div>
  <div class="srcs"><span class="conf">출처 · 확인 수준 ${esc(p.confidence||'')}</span>${(p.sources||[]).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}${s.publisher?' — '+esc(s.publisher):''}${s.date?' ('+esc(s.date)+')':''}</a>`).join('')}</div>`;
}
function matches(p){
  if(F.groups.size && !F.groups.has(p.group) && !(p.groups||[]).some(g=>F.groups.has(g))) return false;
  if(F.level && p.level!==F.level) return false;
  if(F.min && !(p.ministry||'').includes(F.min)) return false;
  if(F.fit && (p.w1?.fit||'')!==F.fit) return false;
  if(F.q){ const hay = [p.name,p.short,p.ministry,p.vision,...(p.targets||[]),...(p.keyTasks||[]),...(p.spatialHooks||[]),p.status,...(p.sectors||[])].join(' ').toLowerCase();
    if(!F.q.toLowerCase().split(/\s+/).filter(Boolean).every(w=>hay.includes(w))) return false; }
  return true;
}
function renderCatalog(){
  let list = P.filter(matches);
  if(F.sort==='date') list.sort((a,b)=>recentDate(b).localeCompare(recentDate(a)));
  else if(F.sort==='tier') list.sort((a,b)=>a.tier-b.tier || String(b.announced||'').localeCompare(String(a.announced||'')));
  else list.sort((a,b)=>(a.short||a.name).localeCompare(b.short||b.name,'ko'));
  $('#ccount').textContent = `${list.length}건 / 전체 ${P.length}건`;
  $('#plist').innerHTML = list.length ? list.map(p=>`<details class="pol" id="p-${esc(p.id)}" style="--c:${gcol(p)}">
    <summary><div class="top">${newTag(p)}${grpTag(p)}${lvTag(p)}<span class="tag">${esc(p.ministry)}</span>${fitTag(p.w1?.fit)}<span class="when">${esc(p.announced||'')}${p.period?' · 계획기간 '+esc(p.period):''}</span></div>
    <div class="nm">${esc(p.name)}</div><div class="vs">${hl(p.vision)}</div><span class="more">펼쳐서 세부 내용 보기</span></summary>
    <div class="body">${docBody(p)}</div></details>`).join('') : '<p class="muted">조건에 맞는 정책이 없습니다. 조건을 줄이거나 초기화해 보세요.</p>';
}
function syncFilters(){
  $('#q').value = F.q; $('#flevel').value = F.level; $('#fmin').value = F.min; $('#ffit').value = F.fit; $('#fsort').value = F.sort;
  $$('#cchips .chip').forEach(c=>c.setAttribute('aria-pressed', c.dataset.g ? String(F.groups.has(c.dataset.g)) : String(F.groups.size===0)));
}
function initCatalog(){
  $('#cchips').innerHTML = `<button type="button" class="chip" data-all="1">전체 분야</button>` + GROUPS.map(g=>`<button type="button" class="chip" data-g="${g.id}"><span class="dot" style="--c:${g.c}"></span>${esc(g.name)}</button>`).join('');
  $$('#cchips .chip').forEach(c=>c.addEventListener('click',()=>{ if(c.dataset.all) F.groups.clear(); else { F.groups.has(c.dataset.g)?F.groups.delete(c.dataset.g):F.groups.add(c.dataset.g);} syncFilters(); renderCatalog(); }));
  $('#flevel').innerHTML = '<option value="">전체</option>'+LEVELS.map(l=>`<option>${esc(l)}</option>`).join('');
  const mins = [...new Set(P.flatMap(p=>String(p.ministry||'').split(/[·,、/]\s*|\s*\+\s*|\s+및\s+/)).map(s=>s.trim()).filter(s=>s && s.length<14))].sort((a,b)=>a.localeCompare(b,'ko'));
  $('#fmin').innerHTML = '<option value="">전체</option>'+mins.map(m=>`<option>${esc(m)}</option>`).join('');
  $('#q').addEventListener('input',e=>{F.q=e.target.value; renderCatalog();});
  $('#flevel').addEventListener('change',e=>{F.level=e.target.value; renderCatalog();});
  $('#fmin').addEventListener('change',e=>{F.min=e.target.value; renderCatalog();});
  $('#ffit').addEventListener('change',e=>{F.fit=e.target.value; renderCatalog();});
  $('#fsort').addEventListener('change',e=>{F.sort=e.target.value; renderCatalog();});
  $('#freset').addEventListener('click',()=>{F.q='';F.groups.clear();F.level='';F.min='';F.fit='';F.sort='date';syncFilters();renderCatalog();});
  syncFilters(); renderCatalog();
}
function gotoPolicy(id){
  if(!byId[id]) return;
  F.q=''; F.groups.clear(); F.level=''; F.min=''; F.fit=''; syncFilters(); renderCatalog();
  show('catalog',{keepScroll:true});
  const el = document.getElementById('p-'+id);
  if(el){ el.open = true; el.scrollIntoView({block:'start',behavior:'smooth'}); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-goto]'); if(b){e.preventDefault(); gotoPolicy(b.dataset.goto);}});
function gotoOpp(id){
  oppFilter=''; renderWays1(); show('ways1',{keepScroll:true});
  const el=document.getElementById('o-'+id);
  if(el){ el.scrollIntoView({block:'start',behavior:'smooth'}); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-opp]'); if(b){e.preventDefault(); gotoOpp(b.dataset.opp);}});

/* link map */
let lsel = null, lgroup = '';
function initLinks(){
  const cols = {1:$('#col1'),2:$('#col2'),3:$('#col3')};
  const order = [...P].sort((a,b)=> GROUPS.findIndex(g=>g.id===a.group)-GROUPS.findIndex(g=>g.id===b.group) || String(a.announced||'').localeCompare(String(b.announced||'')));
  order.forEach(p=>{
    const b = document.createElement('button'); b.type='button'; b.className='node'+(p.w1?.fit==='core'?' w1':''); b.dataset.id=p.id; b.style.setProperty('--c',gcol(p));
    b.innerHTML = `<b>${esc(p.short||p.name)}</b><span>${esc(p.ministry)}${p.period?' · '+esc(p.period):''}</span>`;
    b.addEventListener('click',()=>selectNode(lsel===p.id?null:p.id));
    cols[p.tier||3].appendChild(b);
  });
  $('#lchips').innerHTML = `<button type="button" class="chip" data-g="" aria-pressed="true">전체 분야</button>`+GROUPS.map(g=>`<button type="button" class="chip" data-g="${g.id}" aria-pressed="false"><span class="dot" style="--c:${g.c}"></span>${esc(g.name)}</button>`).join('');
  $$('#lchips .chip').forEach(c=>c.addEventListener('click',()=>{ lgroup=c.dataset.g; $$('#lchips .chip').forEach(x=>x.setAttribute('aria-pressed',String(x===c))); applyGroup(); }));
  if('ResizeObserver' in window){ new ResizeObserver(()=>{ if(cur==='links') drawEdges(); }).observe($('#lmap')); }
  window.addEventListener('resize',()=>{ if(cur==='links') drawEdges(); });
}
function inGroup(p){ return !lgroup || p.group===lgroup || (p.groups||[]).includes(lgroup) || p.tier===1; }
function applyGroup(){ $$('#lmap .node').forEach(n=>{ n.hidden = !inGroup(byId[n.dataset.id]); }); if(lsel && !inGroup(byId[lsel])) lsel=null; selectNode(lsel); }
function lineage(id){
  const up = new Set(), down = new Set();
  (function u(x){ (byId[x]?.links||[]).forEach(l=>{ if(byId[l.id] && !up.has(l.id)){ up.add(l.id); u(l.id);} }); })(id);
  (function d(x){ (kids[x]||[]).forEach(k=>{ if(!down.has(k.id)){ down.add(k.id); d(k.id);} }); })(id);
  return {up, down};
}
function selectNode(id){
  lsel = id; const map = $('#lmap');
  $$('#lmap .node').forEach(n=>n.classList.remove('on','cur'));
  if(!id){ map.classList.remove('sel'); $('#ldetail').innerHTML = '<p class="empty">왼쪽에서 정책을 선택하면 상위 근거, 하위 실행계획, 공간정보 결합 지점, 웨이즈원 연계가 여기에 표시됩니다.</p>'; drawEdges(); return; }
  const {up,down} = lineage(id); const on = new Set([id,...up,...down]);
  map.classList.add('sel');
  $$('#lmap .node').forEach(n=>{ if(on.has(n.dataset.id)) n.classList.add('on'); if(n.dataset.id===id) n.classList.add('cur'); });
  const p = byId[id];
  const ups = (p.links||[]).filter(l=>byId[l.id]);
  const dn = (kids[id]||[]);
  $('#ldetail').innerHTML = `<div class="top" style="display:flex;flex-wrap:wrap;gap:6px">${grpTag(p)}${lvTag(p)}${fitTag(p.w1?.fit)}</div>
    <h3>${esc(p.name)}</h3><p class="small muted">${esc(p.ministry)}${p.period?' · '+esc(p.period):''}${p.announced?' · '+esc(p.announced):''}</p>
    <p class="small">${hl(p.vision)}</p>
    <div class="doc">
      <div class="sq"><i>□</i><div><b>상위 근거 ${ups.length}</b>${ups.length?`<ul>${ups.map(l=>`<li><span>${pref(l.id)} <span class="conf">${l.ex?'명시':'추정'}</span></span></li>`).join('')}</ul>`:'<span class="small muted">최상위 계획</span>'}</div></div>
      <div class="sq"><i>□</i><div><b>하위 실행 ${dn.length}</b>${dn.length?`<ul>${dn.map(k=>`<li><span>${pref(k.id)}</span></li>`).join('')}</ul>`:'<span class="small muted">하위 연계 없음</span>'}</div></div>
      ${p.spatialHooks?.length?`<div class="sq"><i>□</i><div><b>공간정보 결합 지점</b><ul>${p.spatialHooks.slice(0,4).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></div>`:''}
      ${p.w1?.note?`<div class="sq"><i>□</i><div><b>웨이즈원</b><span class="small muted">${esc(p.w1.note)}</span></div></div>`:''}
    </div>
    <button type="button" class="btn" data-goto="${esc(id)}">카탈로그에서 전체 보기</button>`;
  drawEdges();
}
function drawEdges(){
  const map = $('#lmap'), svg = $('#edges');
  if(!map || map.offsetParent===null) return;
  const mr = map.getBoundingClientRect();
  svg.setAttribute('viewBox',`0 0 ${mr.width} ${mr.height}`);
  const pos = {};
  $$('#lmap .node').forEach(n=>{ if(n.hidden) return; const r=n.getBoundingClientRect(); pos[n.dataset.id]={l:r.left-mr.left,r:r.right-mr.left,y:r.top-mr.top+r.height/2,t:byId[n.dataset.id].tier}; });
  const on = lsel ? (()=>{const {up,down}=lineage(lsel); return new Set([lsel,...up,...down]);})() : null;
  let h = '';
  P.forEach(c=>(c.links||[]).forEach(l=>{
    const a=pos[l.id], b=pos[c.id]; if(!a||!b) return;
    let d;
    if(a.t<b.t){ const x1=a.r, x2=b.l, dx=(x2-x1)*.5; d=`M${x1},${a.y} C${x1+dx},${a.y} ${x2-dx},${b.y} ${x2},${b.y}`; }
    else if(a.t>b.t){ const x1=a.l, x2=b.r, dx=(x1-x2)*.5; d=`M${x1},${a.y} C${x1-dx},${a.y} ${x2+dx},${b.y} ${x2},${b.y}`; }
    else { const x=a.l, k=Math.min(46, 14+Math.abs(b.y-a.y)*.15); d=`M${x},${a.y} C${x-k},${a.y} ${x-k},${b.y} ${x},${b.y}`; }
    const hot = on && on.has(l.id) && on.has(c.id);
    h += `<path d="${d}" class="${l.ex?'ex':'es'}${hot?' on':''}"/>`;
  }));
  svg.innerHTML = h;
}

/* timeline */
function parsePeriod(s){ const m = String(s||'').match(/(20\d\d)\D+(20\d\d)/); if(m) return [ +m[1], +m[2] ]; const one = String(s||'').match(/(20\d\d)/); return one?[+one[1],+one[1]]:null; }
function renderTimeline(){
  const Y0=2020, Y1=2036, span=Y1-Y0;
  const x = y => ((Math.min(Math.max(y,Y0),Y1)-Y0)/span*100);
  const now = 2026 + 9.5/12;
  let h = `<div class="row axis"><div></div><div class="track">${Array.from({length:span/2+1},(_,i)=>Y0+i*2).map(y=>`<span style="left:${x(y)}%">${y}</span>`).join('')}</div></div>`;
  const rows = P.map(p=>({p, r:parsePeriod(p.period)})).filter(o=>o.r && o.r[1]>=2019);
  GROUPS.forEach(g=>{
    const gr = rows.filter(o=>o.p.group===g.id).sort((a,b)=>a.r[0]-b.r[0]||a.r[1]-b.r[1]);
    if(!gr.length) return;
    h += `<div class="gh"><span class="dot" style="--c:${g.c}"></span>${esc(g.name)}</div>`;
    gr.forEach(({p,r})=>{
      const s=x(r[0]), e=x(r[1]+1), open = r[1]+1>Y1;
      h += `<div class="row"><div class="lab"><button type="button" class="linkish" data-goto="${esc(p.id)}" title="${esc(p.name)}">${esc(p.short||p.name)}</button></div>
        <div class="track"><div class="now" style="left:${x(now)}%"></div><div class="bar ${open?'open':''}" style="--c:${g.c};left:${s}%;width:${Math.max(e-s,1.2)}%" title="${esc(p.period)}"></div></div></div>`;
    });
  });
  const ms = (D.milestones||[]).filter(m=>m.year>=Y0 && m.year<=Y1);
  h += `<div class="gh">주요 이정표</div><div class="row ms-row"><div class="lab">목표 연도</div><div class="track"><div class="now" style="left:${x(now)}%"></div>${ms.map(m=>`<span class="ms" style="left:${x(m.year+.5)}%" title="${esc(m.year+' '+m.text)}"></span>`).join('')}</div></div>`;
  $('#tl').innerHTML = h;
  $('#mslist').innerHTML = [...(D.milestones||[])].sort((a,b)=>a.year-b.year).map(m=>`<div><span class="y">${esc(m.year)}</span><span>${hl(m.text)}${m.ref?' · '+pref(m.ref):''}</span></div>`).join('');
}

/* ways1 */
const BMC = D.bmc || {};
const BMCP = Object.fromEntries((BMC.products||[]).map(p=>[p.name,p]));
const tierPill = p => `${p.tier?`<span class="tier t-${esc(p.tier)}">${esc(p.tier)}</span>`:''}${p.pri?`<span class="tag">${esc(p.pri)}</span>`:''}${p.star?'<span class="star" title="BMC 우선 제품">★</span>':''}`;
function bmcRow(o){ const ps = (o.products||[]).map(n=>BMCP[n]).filter(Boolean); if(!ps.length) return '';
  return `<dt>BMC 전략</dt><dd><ul class="bmcl">${ps.slice(0,3).map(p=>`<li><span class="bmn"><b>${esc(p.name)}</b>${tierPill(p)}</span><span class="nmeta">${esc(p.note||p.next||'')}</span></li>`).join('')}</ul></dd>`; }
function compRow(o){ const c = o.competitors; if(!c) return ''; let h = '';
  if((c.list||[]).length) h += `<ul class="cmpl">${c.list.map(a=>`<li><b>${esc(a.name)}</b>${a.amtTxt?`<span class="num">${esc(a.amtTxt)}</span>`:''}<span class="nmeta">${esc(a.note)}</span></li>`).join('')}</ul>`;
  if(c.market) h += `<details class="mkt"${(c.list||[]).length?'':' open'}><summary>${esc(c.market.title)}</summary><ul class="cmpl">${c.market.list.map(a=>`<li><b>${esc(a.name)}</b><span class="num">${esc(a.n)}건</span><span class="nmeta">${esc(a.what)}</span></li>`).join('')}</ul></details>`;
  if((c.bmc||[]).length) h += `<p class="nmeta bmcm"><span class="kl">BMC 경쟁 메모</span> ${c.bmc.map(m=>`<b>${esc(m.product)}</b> — ${esc(m.text)}`).join(' / ')}</p>`;
  return h ? `<dt>유력 경쟁자</dt><dd>${h}</dd>` : ''; }
function bmcBoard(){
  const P = BMC.products||[]; if(!P.length) return '';
  const segs = BMC.segments||[...new Set(P.map(p=>p.seg))];
  const n = P.length, st = P.filter(p=>p.star).length, kw = (BMC.search||[]).length;
  const row = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : '';
  const card = p => `<details class="bp${p.star?' st':''}"><summary><span class="bt"><b>${esc(p.name)}</b>${tierPill(p)}</span><span class="bty">${esc([p.type, p.grp].filter(Boolean).join(' · '))}</span><span class="bcn">${esc(p.concept||p.note||'')}</span></summary>
    <dl>${row('현황', esc(p.note||''))}${row('고객', esc(p.customer||''))}${(p.value||[]).length?row('가치', `<ul>${p.value.map(v=>`<li>${esc(v)}</li>`).join('')}</ul>`):''}
    ${row('레퍼런스', hl(p.ref||''))}${row('다음 행동', esc(p.next||''))}${(p.keywords||[]).length?row('나라장터 키워드', `<span class="pchips">${p.keywords.map(k=>`<span class="tc">${esc(k)}</span>`).join('')}</span>`):''}
    ${row('경쟁', esc(p.competitors||''))}${(p.risks||[]).length?row('진입 리스크', `<ul>${p.risks.map(v=>`<li>${esc(v)}</li>`).join('')}</ul>`):''}</dl></details>`;
  const mvp = (BMC.mvp||[]).length ? `<div class="mvp">${BMC.mvp.map(m=>`<div><span class="eyebrow">${esc(m.phase)} · ${esc(m.when)}</span><ul>${(m.items||[]).map(i=>`<li><b>${esc(i.name)}</b><span class="nmeta">${esc(i.mvp||'')}</span>${i.kpi?`<span class="nmeta">KPI · ${esc(i.kpi)}</span>`:''}</li>`).join('')}</ul></div>`).join('')}</div>` : '';
  return `<div class="bmch"><span class="bmc-badge">WAYS1 BMC</span><span>BMC 수정 <b>${esc(String(BMC.updatedAt||'').slice(0,10))}</b> · 레이더 반영 ${esc(BMC.fetchedAt||'')} · 제품 <b class="num">${n}개</b> · ★ 우선 <b class="num">${st}개</b> · <span title="${esc((BMC.search||[]).join(', '))}">나라장터 검색어 <b class="num">+${kw}개</b>(BMC 키워드)</span></span>${BMC.url?`<a class="dbtn pg" href="${esc(BMC.url)}" target="_blank" rel="noopener">BMC 열기(비밀번호)</a>`:''}</div>
    ${segs.map(sg=>`<section class="bseg"><h3>${esc(sg)}</h3><div class="bgrid">${P.filter(p=>p.seg===sg).sort((a,b)=>(b.star-a.star)).map(card).join('')}</div></section>`).join('')}
    ${mvp?`<div class="panel" style="display:grid;gap:10px"><h3>BMC MVP 로드맵</h3>${mvp}</div>`:''}`;
}
let oppFilter = load('opp','');
const MG = GROUPS.filter(g=>g.id!=='gov');
function renderWays1(){
  $('#w1intro').textContent = D.company.intro;
  $('#prods').innerHTML = bmcBoard() || D.products.map(p=>`<article class="prod"><span class="ly">${esc(p.layer||p.seg||'')}</span><h3>${esc(p.name)}</h3><p>${hl(p.desc||'')}</p></article>`).join('');
  let m = '<thead><tr><th>제품·역량</th>'+MG.map(g=>`<th><span class="dot" style="--c:${g.c};display:inline-block;margin-right:4px"></span>${esc(g.name)}</th>`).join('')+'</tr></thead><tbody>';
  let lastSeg = null;
  D.products.forEach(p=>{ if(p.seg && p.seg !== lastSeg){ lastSeg = p.seg; m += `<tr class="sg"><td colspan="${MG.length+1}">${esc(p.seg)}</td></tr>`; } m += `<tr><td>${esc(p.name)}${BMCP[p.name]?.star?' <span class="star">★</span>':''}</td>`+MG.map(g=>{const v=(p.fit||{})[g.id]||0; return `<td class="${v?'f'+v:''}" aria-label="${v===3?'바로 대응':v===2?'보완 후 진입':v===1?'신규 역량':'해당 없음'}"></td>`;}).join('')+'</tr>'; });
  $('#matrix').innerHTML = m+'</tbody>';
  const kinds = ['','발주계획 대응','사전규격 대응','즉시 공략','보완 후 진입','신규 진입 검토'];
  if(!kinds.includes(oppFilter)) oppFilter = '';
  const ORD = k => Math.max(kinds.indexOf(k), 0);
  const ACT = D.opportunities.filter(o=>!isDiscarded(o)).map((o,i)=>({o,i})).sort((a,b)=>ORD(effEntry(a.o))-ORD(effEntry(b.o)) || a.i-b.i).map(r=>r.o);
  const DIS = D.opportunities.filter(isDiscarded);
  $('#oppseg').innerHTML = kinds.map(k=>`<button type="button" data-k="${esc(k)}" aria-pressed="${String(k===oppFilter)}">${k||'전체'} <span class="mono small">${k?ACT.filter(o=>effEntry(o)===k).length:ACT.length}</span></button>`).join('');
  $$('#oppseg button').forEach(b=>b.addEventListener('click',()=>{oppFilter=b.dataset.k; store('opp',oppFilter); renderWays1();}));
  const cls = ENTRY_CLS;
  // 공고 상세는 「나라장터 사업」 화면과 같으므로 카드에서는 접어 둔다
  const nsum = o => { const a = [livePlans(o).length && `발주계획 ${livePlans(o).length}건`, livePres(o).length && `사전규격 ${livePres(o).length}건`, liveBids(o).length && `입찰공고 ${liveBids(o).length}건`].filter(Boolean);
    return a.length ? `<details class="nbox"><summary>나라장터 ${a.join(' · ')}${horizonTxt(o)?` <span class="nmeta">${esc(horizonTxt(o))}</span>`:''}</summary>${noticeBlock(o)}</details>` : noticeBlock(o); };
  $('#opps').innerHTML = ACT.filter(o=>!oppFilter||effEntry(o)===oppFilter).map(o=>`<article class="opp" id="o-${esc(o.id)}">
    ${nsum(o)}
    <div class="h"><div class="top"><span class="fit ${cls[effEntry(o)]}">${esc(effEntry(o))}</span>${horizonTxt(o)?`<span class="tag">${esc(horizonTxt(o))}</span>`:''}</div>
      <h3>${esc(o.title)}</h3><p class="small muted">${hl(o.why)}</p>
      <div class="small">정책 근거 · ${(o.policies||[]).map(pref).join(' · ')}</div></div>
    <dl><dt>연계 제품</dt><dd>${esc((o.products||[]).join(', '))}</dd>
      <dt>발주처</dt><dd>${esc(o.buyer||'')}</dd>
      <dt>보완할 점</dt><dd>${hl(o.gap||'')}</dd>
      <dt>다음 행동</dt><dd>${hl(o.action||'')}</dd>
      <dt>협력 기술</dt><dd><div class="pchips">${(o.partners?.tech||[]).map(x=>`<span class="tc">${esc(x)}</span>`).join('')}</div></dd>
      ${(o.partners?.orgs||[]).length?`<dt>협력 기업</dt><dd>${orgList(o.partners.orgs)}</dd>`:''}${bmcRow(o)}${compRow(o)}</dl></article>`).join('')
    + (DIS.length ? `<details class="panel discard"><summary>공고 마감·미공고로 폐기한 사업 ${DIS.length}건 (로드맵에서 제외)</summary><ul>${DIS.map(o=>`<li><b>${esc(o.title)}</b> — ${esc(discardReason(o))}${(o.notice?.items||[])[0]?.url?` · <a href="${esc(o.notice.items[0].url)}" target="_blank" rel="noopener">근거</a>`:''}</li>`).join('')}</ul></details>` : '');
  /* 로드맵은 진행 중인 기회만으로 만든다: 폐기한 사업은 들어가지 않는다 */
  const near = ACT.filter(o=>ACTIVE_ENTRY.includes(effEntry(o)) || isUpcoming(o));
  const COLS = [
    {when:'단기 · 지금 ~ 6개월', title:'발주계획·사전규격·입찰공고 대응', list: near},
    {when:'중기 · 2027 ~ 2030', title:'보완 후 진입', list: ACT.filter(o=>effEntry(o)==='보완 후 진입' && !near.includes(o))},
    {when:'장기 · 2029 ~', title:'신규 역량으로 진입', list: ACT.filter(o=>effEntry(o)==='신규 진입 검토' && !near.includes(o))}
  ];
  const roadTag = o => { const e = effEntry(o);
    if(ACTIVE_ENTRY.includes(e)) return `<span class="small"><span class="fit ${ENTRY_CLS[e]}">${esc(e)}</span> ${esc(horizonTxt(o))}</span>`;
    if(isUpcoming(o)) return `<span class="small muted">공고 예정 · ${esc(o.notice.expected || o.horizon || '')}</span>`;
    return o.horizon ? `<span class="small muted">${esc(o.horizon)}</span>` : ''; };
  $('#road').innerHTML = COLS.map(c=>`<div><span class="eyebrow">${esc(c.when)}</span><h3>${esc(c.title)}</h3>${c.list.length?`<ul>${c.list.map(o=>`<li><button type="button" class="linkish" data-opp="${esc(o.id)}">${esc(o.title)}</button>${roadTag(o)}</li>`).join('')}</ul>`:'<p class="small muted">해당 사업 없음</p>'}</div>`).join('');
}

/* sources */
function renderSources(){
  $('#method').innerHTML = D.method.map(x=>`<p>${esc(x)}</p>`).join('');
  const rows = [];
  P.forEach(p=>(p.sources||[]).forEach(s=>rows.push({p,s})));
  const seen = new Set();
  const uniq = rows.filter(({s})=>{ if(seen.has(s.url)) return false; seen.add(s.url); return true; })
    .sort((a,b)=>String(b.s.date||'').localeCompare(String(a.s.date||'')));
  $('#stable').innerHTML = `<thead><tr><th>날짜</th><th>출처</th><th>기관·매체</th><th>관련 정책</th></tr></thead><tbody>`+
    uniq.map(({p,s})=>`<tr><td class="mono">${esc(s.date||'')}</td><td><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></td><td>${esc(s.publisher||'')}</td><td>${pref(p.id)}</td></tr>`).join('')+'</tbody>';
  $('#usched').textContent = D.meta.schedule || '';
  $('#ulog').innerHTML = (D.meta.updates||[]).slice(0,40).map(u=>`<li><span class="at">${esc(u.at)} KST</span><div style="display:grid;gap:4px"><span>${esc(u.note||'')}</span>
    ${(u.added||[]).length?`<div class="refs"><span class="conf">추가</span>${u.added.map(pref).join('')}</div>`:''}
    ${(u.updated||[]).length?`<div class="refs"><span class="conf">갱신</span>${u.updated.map(pref).join('')}</div>`:''}
    ${(u.opps||[]).length?`<div class="refs"><span class="conf">공고</span>${u.opps.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:''}</div></li>`).join('') || '<li><span class="muted">기록 없음</span></li>';
  $('#foot').innerHTML = `${esc(D.meta.footer)}`;
}

renderPipe(); renderBoard(); renderPrograms(); renderInsights(); renderHeat(); renderNews(); initCatalog(); initLinks(); renderTimeline(); renderWays1(); renderSources();
const h0 = location.hash.slice(1);
show(TABS.includes(h0)?h0:load('tab','overview'),{keepScroll:true});

};
