// 웨이즈원 정책 레이더 — 회원 가입·승인·데이터 열람
// 데이터는 회원 서버(Supabase)에서 '승인된 회원'에게만 내려온다(서버의 행 단위 보안 규칙으로 막음).
const CFG = window.RADAR_CONFIG || {};
const LIBS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.1/+esm',
  'https://esm.sh/@supabase/supabase-js@2.110.1'
];
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const fmt = t => t ? new Date(t).toLocaleString('ko-KR', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'}) : '—';
const HERE = location.origin + location.pathname;

let sb = null, me = null, opened = false, users = [], aFilter = 'pending';

function gate(name, opts = {}) {
  $('#app').hidden = true; $('#gate').hidden = false;
  $$('#gate section[data-g]').forEach(s => s.hidden = s.dataset.g !== name);
  if (!opts.keepMsg) msg('');
}
function msg(text, kind = '') { const m = $('#gmsg'); m.textContent = text; m.className = 'gmsg ' + kind; }
function fail(e) { console.error(e); $('#gerr').textContent = humanErr(e); gate('error'); }
function humanErr(e) {
  const m = String(e?.message || e || '');
  if (/Invalid login credentials/i.test(m)) return '이메일 또는 비밀번호가 맞지 않습니다.';
  if (/already registered|already exists/i.test(m)) return '이미 가입된 이메일입니다. 로그인해 주세요.';
  if (/Email not confirmed/i.test(m)) return '이메일 인증이 끝나지 않았습니다. 받은편지함의 인증 메일을 확인해 주세요.';
  if (/Password should be|at least/i.test(m)) return '비밀번호가 너무 짧거나 단순합니다. 8자 이상으로 정해 주세요.';
  if (/rate limit|too many/i.test(m)) return '요청이 너무 잦습니다. 잠시 뒤에 다시 시도해 주세요.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return '서버에 연결하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.';
  return m || '알 수 없는 오류가 발생했습니다.';
}
async function loadLib() {
  for (const u of LIBS) { try { const m = await import(u); if (m.createClient) return m.createClient; } catch (e) { console.warn('lib', u, e); } }
  throw new Error('회원 서버 연결 모듈을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
}
const busy = (form, on) => $$('button', form).forEach(b => b.disabled = on);

async function init() {
  if (!CFG.supabaseUrl || !CFG.supabaseKey || /YOUR|여기에/.test(CFG.supabaseUrl + CFG.supabaseKey)) return gate('config');
  try {
    const createClient = await loadLib();
    sb = createClient(CFG.supabaseUrl, CFG.supabaseKey, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}});
  } catch (e) { return fail(e); }
  sb.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY') gate('recovery'); });
  const {data: {session}} = await sb.auth.getSession();
  if (location.hash.includes('type=recovery')) return gate('recovery');
  if (!session) return gate('auth');
  enter(session.user);
}

async function enter(user) {
  gate('loading', {keepMsg: true});
  const {data: p, error} = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) return fail(error);
  me = p || {id: user.id, email: user.email, name: user.user_metadata?.name || '', status: 'pending', role: 'member'};
  if (me.status === 'pending') {
    $('#pend-name').textContent = me.name || me.email;
    $('#pend-info').innerHTML = [['이메일', me.email], ['소속', [me.org, me.dept].filter(Boolean).join(' · ')], ['신청일', fmt(me.created_at)]]
      .filter(r => r[1]).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
    return gate('pending', {keepMsg: true});
  }
  if (me.status !== 'approved') return gate('rejected');
  sb.rpc('touch_last_seen').then(() => {}, () => {});
  const {data: r, error: e2} = await sb.from('radar').select('data, updated_at').eq('id', 1).maybeSingle();
  if (e2) return fail(e2);
  if (!r || !r.data) return fail(new Error('아직 레이더 데이터가 올라오지 않았습니다. 첫 자동 갱신이 끝난 뒤 다시 열어 주세요.'));
  openApp(r.data);
}

// 수행 실적 「직접 등록」 저장소: 회원 서버의 track_manual 표(승인된 회원만 읽고 쓴다 — supabase/track_manual.sql).
// 표가 아직 없으면(관리자가 SQL을 실행하기 전) {ok:false, why:'setup'}을 돌려 화면이 안내만 보여 준다.
async function trackStore() {
  const T = () => sb.from('track_manual');
  const probe = await T().select('id').limit(1);
  if (probe.error) {
    const m = String(probe.error.code || '') + ' ' + String(probe.error.message || '');
    return {ok: false, why: /42P01|PGRST205|PGRST106|does not exist|schema cache/i.test(m) ? 'setup' : 'error'};
  }
  const chk = r => { if (r.error) { const e = new Error(r.error.message); e.code = r.error.code; throw e; } return r.data; };
  return {
    ok: true, canWrite: me?.status === 'approved',
    list: async () => chk(await T().select('id, data, updated_at').order('updated_at', {ascending: false}).limit(200)),
    add: async data => chk(await T().insert({data})),
    set: async (id, data) => chk(await T().update({data, updated_at: new Date().toISOString()}).eq('id', id)),
    del: async id => chk(await T().delete().eq('id', id))
  };
}
window.W1STORE = {trackManual: trackStore};

function openApp(D) {
  $('#gate').hidden = true; $('#app').hidden = false;
  $('#who').textContent = `${me.name || me.email}${me.role === 'admin' ? ' · 관리자' : ''}`;
  if (!opened) { window.renderRadar(D); opened = true; }
  if (me.role === 'admin') { $('#b-admin').hidden = false; refreshPending(); }
  route();
}

function route() {
  const adm = location.hash === '#admin' && me?.role === 'admin';
  $('#admin').hidden = !adm; $('#radar').hidden = adm;
  if (adm) { window.scrollTo({top: 0}); loadUsers(); }
}
window.addEventListener('hashchange', () => { if (opened) route(); });

/* ── 로그인·가입·재설정 ── */
function authTab(t) {
  $$('.gtabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === t)));
  $$('#gate form[data-f]').forEach(f => f.hidden = f.dataset.f !== t);
  msg('');
  const first = $(`#gate form[data-f="${t}"] input`); if (first) first.focus();
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-t]'); if (t) { e.preventDefault(); authTab(t.dataset.t); }
  if (e.target.closest('[data-out]')) { e.preventDefault(); signOut(); }
  if (e.target.closest('[data-reload]')) { e.preventDefault(); location.reload(); }
});
async function signOut() { try { await sb?.auth.signOut(); } catch (e) {} location.hash = ''; location.reload(); }

$('#f-login').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target;
  const email = f.email.value.trim(), password = f.password.value;
  if (!email || !password) return msg('이메일과 비밀번호를 입력해 주세요.', 'err');
  busy(f, true); msg('로그인하는 중…');
  const {data, error} = await sb.auth.signInWithPassword({email, password});
  busy(f, false);
  if (error) return msg(humanErr(error), 'err');
  msg(''); enter(data.user);
});

$('#f-signup').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target;
  const v = k => f[k].value.trim();
  if (!v('name') || !v('org') || !v('email')) return msg('이름·소속·이메일을 입력해 주세요.', 'err');
  if (f.password.value.length < 8) return msg('비밀번호는 8자 이상이어야 합니다.', 'err');
  if (f.password.value !== f.password2.value) return msg('비밀번호 확인이 일치하지 않습니다.', 'err');
  if (!f.agree.checked) return msg('내부 자료 보안 서약에 동의해 주세요.', 'err');
  busy(f, true); msg('가입 신청을 보내는 중…');
  const {data, error} = await sb.auth.signUp({email: v('email'), password: f.password.value,
    options: {emailRedirectTo: HERE, data: {name: v('name'), org: v('org'), dept: v('dept'), purpose: v('purpose')}}});
  busy(f, false);
  if (error) return msg(humanErr(error), 'err');
  if (!data.session) { f.reset(); return msg('가입 신청이 접수됐습니다. 받은편지함의 인증 메일을 확인한 뒤 관리자 승인을 기다려 주세요.', 'ok'); }
  msg('가입 신청이 접수됐습니다.', 'ok'); enter(data.user);
});

$('#f-forgot').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target; const email = f.email.value.trim();
  if (!email) return msg('이메일을 입력해 주세요.', 'err');
  busy(f, true);
  const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: HERE});
  busy(f, false);
  if (error) return msg(humanErr(error), 'err');
  msg('재설정 메일을 보냈습니다. 메일이 오지 않으면 관리자에게 알려 주세요.', 'ok');
});

$('#f-newpw').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target;
  if (f.password.value.length < 8) return msg('비밀번호는 8자 이상이어야 합니다.', 'err');
  if (f.password.value !== f.password2.value) return msg('비밀번호 확인이 일치하지 않습니다.', 'err');
  busy(f, true);
  const {data, error} = await sb.auth.updateUser({password: f.password.value});
  busy(f, false);
  if (error) return msg(humanErr(error), 'err');
  history.replaceState(null, '', location.pathname);
  msg('비밀번호를 바꿨습니다.', 'ok'); enter(data.user);
});

/* ── 관리자: 회원 승인 ── */
$('#b-admin').addEventListener('click', () => { location.hash = 'admin'; });
$('#b-back').addEventListener('click', () => { location.hash = 'overview'; });

async function refreshPending() {
  const {count} = await sb.from('profiles').select('id', {count: 'exact', head: true}).eq('status', 'pending');
  const b = $('#pcount'); b.textContent = count || ''; b.hidden = !count;
}
async function loadUsers() {
  $('#ulist').innerHTML = '<div class="empty">회원 목록을 불러오는 중…</div>';
  const {data, error} = await sb.from('profiles').select('*').order('created_at', {ascending: false});
  if (error) { $('#ulist').innerHTML = `<div class="empty">${esc(humanErr(error))}</div>`; return; }
  users = data || []; renderUsers(); refreshPending();
}
const ST = {pending: '승인 대기', approved: '승인', rejected: '거절'};
function renderUsers() {
  const n = k => users.filter(u => u.status === k).length;
  $('#astats').innerHTML = [['pending', '승인 대기', 'hot'], ['approved', '승인 회원', ''], ['rejected', '거절', '']]
    .map(([k, l, c]) => `<div class="kpi ${c}"><b>${n(k)}</b><span>${l}</span></div>`).join('');
  const kinds = [['pending', '승인 대기'], ['approved', '승인 회원'], ['rejected', '거절'], ['', '전체']];
  $('#aseg').innerHTML = kinds.map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="${String(k === aFilter)}">${l} <span class="mono small">${k ? n(k) : users.length}</span></button>`).join('');
  $$('#aseg button').forEach(b => b.addEventListener('click', () => { aFilter = b.dataset.k; renderUsers(); }));
  const list = users.filter(u => !aFilter || u.status === aFilter);
  $('#ulist').innerHTML = list.length ? list.map(u => {
    const self = u.id === me.id, acts = [];
    if (u.status !== 'approved') acts.push(`<button class="pri" data-act="approved">승인</button>`);
    if (u.status === 'pending') acts.push(`<button data-act="rejected">거절</button>`);
    if (u.status === 'approved' && !self) acts.push(`<button data-act="rejected">승인 취소</button>`);
    if (u.status === 'approved' && u.role !== 'admin') acts.push(`<button data-role="admin">관리자로 지정</button>`);
    if (u.role === 'admin' && !self) acts.push(`<button data-role="member">관리자 해제</button>`);
    return `<div class="urow" data-id="${esc(u.id)}">
      <div><div class="nm">${esc(u.name || '(이름 없음)')} <span class="tag st-${esc(u.status)}">${ST[u.status] || esc(u.status)}</span>${u.role === 'admin' ? ' <span class="tag new">관리자</span>' : ''}</div>
        <div class="sub">${esc(u.email)}</div></div>
      <div><div class="pur">${esc([u.org, u.dept].filter(Boolean).join(' · ') || '소속 미기재')}</div><div class="sub">${esc(u.purpose || '')}</div></div>
      <div class="sub">신청 ${esc(fmt(u.created_at))}<br>최근 접속 ${esc(fmt(u.last_seen_at))}</div>
      <div class="acts">${self ? '<span class="sub">본인 계정</span>' : ''}${acts.join('')}</div></div>`;
  }).join('') : '<div class="empty">해당하는 회원이 없습니다.</div>';
}
$('#ulist').addEventListener('click', async e => {
  const b = e.target.closest('button[data-act],button[data-role]'); if (!b) return;
  const id = b.closest('.urow').dataset.id; const u = users.find(x => x.id === id);
  if (b.dataset.act === 'rejected' && u.status === 'approved' && !confirm(`${u.name || u.email}님의 이용 승인을 취소할까요? 바로 접근이 막힙니다.`)) return;
  b.disabled = true;
  const {error} = b.dataset.act
    ? await sb.rpc('admin_set_status', {target: id, new_status: b.dataset.act})
    : await sb.rpc('admin_set_role', {target: id, new_role: b.dataset.role});
  if (error) { alert(humanErr(error)); b.disabled = false; return; }
  loadUsers();
});

init().catch(fail);
