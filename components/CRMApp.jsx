'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { can } from '@/lib/permissions';
import { OB, AIDS, SCRIPT_BEFORE, VIDEO_BEFORE, WARN_DAYS, sectionDeadline } from '@/lib/constants';
import { ALL_PERMS, ROLE_PRESETS } from '@/lib/permissions';

// ─── helpers ───
const PALS = ['rgba(124,58,237,.18)#A78BFA','rgba(0,180,200,.13)#00B8CC','rgba(245,158,11,.14)#F59E0B','rgba(239,68,68,.14)#EF4444','rgba(16,185,129,.14)#10B981','rgba(168,85,247,.14)#A855F7'];
const pav = id => { const p = PALS[(id - 1) % PALS.length].split('#'); return { background: p[0], color: '#' + p[1] }; };
const ini = n => n.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
const pct = (v, t) => t ? Math.round(Math.min(v / t, 1) * 100) : 0;
const pcol = p => p < 30 ? 'var(--rd)' : p < 65 ? 'var(--am)' : 'var(--gr)';
const cvr = c => c.videos?.filter(v => v.status === 'done').length || 0;
const cvi = c => c.videos?.filter(v => v.status === 'progress').length || 0;
const csr = c => c.scripts?.filter(s => s.status === 'done' || s.status === 'approved').length || 0;
const csi = c => c.scripts?.filter(s => s.status === 'progress').length || 0;
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const diffDays = (a, b) => Math.round((a - b) / 86400000);
const fmtD = s => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}.${m}`; };
const fmtDF = s => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}.${m}.${y}`; };
const iso = d => d.toISOString().split('T')[0];
const scl = s => s === 'Производство' ? 's-pr' : s === 'Онбординг' ? 's-ob' : 's-pa';
const ccl = s => s === 'Производство' ? 'prod' : s === 'Онбординг' ? 'onb' : 'pause';

function getContentAlerts(c) {
  if (!c.pubDate) return [];
  const al = [], t = new Date(); t.setHours(0, 0, 0, 0);
  const pub = new Date(c.pubDate);
  const sDL = addDays(pub, -SCRIPT_BEFORE), vDL = addDays(pub, -VIDEO_BEFORE);
  if (csr(c) === 0) { const d = diffDays(sDL, t); if (d < 0) al.push({ type: 'scripts', level: 'critical', msg: `Сценарии не начаты! Просрочен на ${Math.abs(d)} дн.`, days: d, dl: iso(sDL) }); else if (d <= WARN_DAYS) al.push({ type: 'scripts', level: 'warning', msg: `Сценарии не начаты, до дедлайна ${d} дн.`, days: d, dl: iso(sDL) }); }
  if (cvr(c) === 0) { const d = diffDays(vDL, t); if (d < 0) al.push({ type: 'videos', level: 'critical', msg: `Ролики не готовы! Просрочен на ${Math.abs(d)} дн.`, days: d, dl: iso(vDL) }); else if (d <= WARN_DAYS) al.push({ type: 'videos', level: 'warning', msg: `Ролики не готовы, до дедлайна ${d} дн.`, days: d, dl: iso(vDL) }); }
  return al;
}

function getClAlerts(c) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return OB.flatMap(sec => {
    const dl = sectionDeadline(sec, c.start, c.pubDate); if (!dl) return [];
    return sec.i.filter(it => !c.done?.includes(it.id)).flatMap(it => {
      const d = diffDays(dl, t);
      if (d < 0) return [{ client: c, sec: sec.s, secColor: sec.c, item: it.t, id: it.id, dl: iso(dl), days: d, level: 'critical' }];
      if (d <= WARN_DAYS) return [{ client: c, sec: sec.s, secColor: sec.c, item: it.t, id: it.id, dl: iso(dl), days: d, level: 'warning' }];
      return [];
    });
  });
}

// API helpers
async function apiCall(url, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

export default function CRMApp({ initialClients, initialStaff, profile }) {
  const router = useRouter();
  const sb = createClient();

  // ─── state ───
  const [clients, setClients] = useState(initialClients || []);
  const [staff, setStaff] = useState(initialStaff || { editors: [], teamleads: [] });
  const [view, setView] = useState('dash');
  const [subView, setSubView] = useState(null);
  const [cid, setCid] = useState(null);
  const [tab, setTab] = useState('videos');
  const [filt, setFilt] = useState('all');
  const [q, setQ] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [openScript, setOpenScript] = useState(null);
  const [syncStatus, setSyncStatus] = useState('synced');
  const [theme, setTheme] = useState('dark');

  // modal states
  const [showAdd, setShowAdd] = useState(false);
  const [showStaff, setShowStaff] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [showLnk, setShowLnk] = useState(false);
  const [lnkTarget, setLnkTarget] = useState({ cid: null, type: null });
  const [lnkVal, setLnkVal] = useState('');
  const [users, setUsers] = useState([]);
  const [editUid, setEditUid] = useState(null);
  const [userForm, setUserForm] = useState({ name: '', email: '', pass: '', role: 'viewer', perms: [], staffName: '' });

  // add client form
  const [addForm, setAddForm] = useState({ name: '', niche: '', role: '', phone: '', ig: '', vt: 30, editor: '', teamLead: '', pkg: '', stage: 'Онбординг', priority: 'mid', pubDate: '' });

  // save debounce
  const saveTimer = useRef(null);

  // ─── theme ───
  useEffect(() => {
    const t = localStorage.getItem('ela_theme') || 'dark';
    setTheme(t);
    document.documentElement.dataset.theme = t;
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem('ela_theme', next);
  }

  // ─── realtime sync ───
  useEffect(() => {
    const channel = sb
      .channel('crm-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, payload => {
        setClients(prev => {
          if (payload.eventType === 'DELETE') return prev.filter(c => c.id !== payload.old.id);
          const nc = { ...payload.new.data, id: payload.new.id, _updatedAt: payload.new.updated_at };
          if (payload.eventType === 'INSERT') return [...prev.filter(c => c.id !== nc.id), nc].sort((a, b) => a.id - b.id);
          return prev.map(c => c.id === nc.id ? nc : c);
        });
        setSyncStatus('synced');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, async () => {
        const data = await apiCall('/api/staff');
        setStaff(data);
      })
      .subscribe();
    return () => sb.removeChannel(channel);
  }, []);

  // ─── save client (debounced) ───
  const saveClient = useCallback((client) => {
    setSyncStatus('saving');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await apiCall(`/api/clients/${client.id}`, 'PATCH', client);
        setSyncStatus('synced');
      } catch (e) {
        setSyncStatus('error');
        console.error('Save error:', e);
      }
    }, 400);
  }, []);

  function updateClient(cid, updater) {
    setClients(prev => {
      const next = prev.map(c => c.id === cid ? updater(c) : c);
      const updated = next.find(c => c.id === cid);
      if (updated) saveClient(updated);
      return next;
    });
  }

  // ─── navigation ───
  function nav(v, id, t, sub) {
    setView(v);
    if (id !== undefined) setCid(id);
    if (t) setTab(t);
    if (sub !== undefined) setSubView(sub);
    else setSubView(null);
    setEditMode(false);
    setOpenScript(null);
  }

  async function doLogout() {
    if (!confirm('Выйти из системы?')) return;
    await sb.auth.signOut();
    router.push('/login');
  }

  // ─── add client ───
  async function doAddClient() {
    if (!addForm.name) { alert('Введите имя клиента'); return; }
    const vt = parseInt(addForm.vt) || 30;
    const blank = n => Array.from({ length: n }, (_, i) => ({ id: i + 1, title: `Ролик #${i + 1}`, date: '', status: 'idle', pubUrl: '' }));
    const blankS = n => Array.from({ length: n }, (_, i) => ({ id: i + 1, title: `Сценарий #${i + 1}`, date: '', status: 'idle', ref: '', transcript: '', hook: '', body: '', cta: '', descText: '' }));
    const clientData = { ...addForm, vt, done: [], notes: '', ig: '', tiktok: '', youtube: '', start: new Date().toISOString().split('T')[0], videos: blank(vt), scripts: blankS(vt) };
    try {
      const { id } = await apiCall('/api/clients', 'POST', clientData);
      setClients(prev => [...prev, { ...clientData, id }].sort((a, b) => a.id - b.id));
      setShowAdd(false);
      setAddForm({ name: '', niche: '', role: '', phone: '', ig: '', vt: 30, editor: '', teamLead: '', pkg: '', stage: 'Онбординг', priority: 'mid', pubDate: '' });
    } catch (e) { alert('Ошибка: ' + e.message); }
  }

  async function doDeleteClient(id) {
    if (!confirm('Удалить клиента?')) return;
    try {
      await apiCall(`/api/clients/${id}`, 'DELETE');
      setClients(prev => prev.filter(c => c.id !== id));
      nav('dash');
    } catch (e) { alert('Ошибка: ' + e.message); }
  }

  // ─── staff ───
  async function doAddStaff(type) {
    const inp = document.getElementById(`new-${type === 'editor' ? 'ed' : 'tl'}`);
    const name = inp?.value?.trim();
    if (!name) return;
    try {
      await apiCall('/api/staff', 'POST', { type, name });
      setStaff(prev => ({
        ...prev,
        [type === 'editor' ? 'editors' : 'teamleads']: [...prev[type === 'editor' ? 'editors' : 'teamleads'], name],
      }));
      if (inp) inp.value = '';
    } catch (e) { alert('Ошибка: ' + e.message); }
  }

  async function doDelStaff(type, name) {
    try {
      await apiCall('/api/staff', 'DELETE', { type, name });
      setStaff(prev => ({
        ...prev,
        [type === 'editor' ? 'editors' : 'teamleads']: prev[type === 'editor' ? 'editors' : 'teamleads'].filter(n => n !== name),
      }));
    } catch (e) { alert('Ошибка: ' + e.message); }
  }

  // ─── users ───
  async function loadUsers() {
    try { const d = await apiCall('/api/users'); setUsers(d.users || []); } catch (e) { console.error(e); }
  }

  async function doSaveUser() {
    const { name, email, pass, role, perms, staffName } = userForm;
    if (!name || !email) { alert('Введите имя и email'); return; }
    try {
      if (editUid) {
        await apiCall('/api/users', 'PATCH', { userId: editUid, name, role, perms, staffName, password: pass || undefined });
      } else {
        if (!pass || pass.length < 6) { alert('Пароль минимум 6 символов'); return; }
        await apiCall('/api/users', 'POST', { name, email, password: pass, role, perms, staffName });
      }
      await loadUsers();
      setEditUid(null);
      setUserForm({ name: '', email: '', pass: '', role: 'viewer', perms: [], staffName: '' });
    } catch (e) { alert('Ошибка: ' + e.message); }
  }

  async function doDeleteUser(id) {
    if (!confirm('Удалить пользователя?')) return;
    try { await apiCall('/api/users', 'DELETE', { userId: id }); await loadUsers(); } catch (e) { alert('Ошибка: ' + e.message); }
  }

  function applyRolePreset(role) {
    const perms = ROLE_PRESETS[role]?.perms || [];
    setUserForm(f => ({ ...f, role, perms }));
  }

  // ─── link ───
  function openLnk(clientId, type) {
    const c = clients.find(x => x.id === clientId);
    const cur = { ig: c?.ig, tiktok: c?.tiktok, youtube: c?.youtube }[type] || '';
    setLnkTarget({ cid: clientId, type });
    setLnkVal(cur);
    setShowLnk(true);
  }

  function saveLnk() {
    const { cid: lc, type: lt } = lnkTarget;
    const clean = v => v.replace('@', '').replace('https://instagram.com/', '').replace('https://www.instagram.com/', '').replace('https://tiktok.com/@', '').replace('https://www.tiktok.com/@', '').replace('https://youtube.com/@', '').replace('https://www.youtube.com/@', '').replace(/\/$/, '');
    updateClient(lc, c => ({ ...c, [lt]: clean(lnkVal) }));
    setShowLnk(false);
  }

  // ─── computed values ───
  const filteredClients = clients.filter(c => {
    if (filt !== 'all' && c.editor !== filt) return false;
    if (q && !c.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const allContentAlerts = clients.flatMap(c => getContentAlerts(c).map(a => ({ ...a, client: c })));
  const allClAlerts = clients.flatMap(c => getClAlerts(c));
  const tvr = clients.reduce((a, c) => a + cvr(c), 0);
  const tVT = clients.reduce((a, c) => a + c.vt, 0);
  const tvi = clients.reduce((a, c) => a + cvi(c), 0);
  const tsr = clients.reduce((a, c) => a + csr(c), 0);

  const currentClient = clients.find(x => x.id === cid);

  // ─── render helpers ───
  function ecol(name) {
    const cols = ['#A78BFA', '#00B8CC', '#F59E0B', '#EF4444', '#10B981', '#A855F7'];
    const all = [...staff.editors, ...staff.teamleads];
    return cols[all.indexOf(name) % cols.length] || '#888';
  }
  function etag(name) {
    if (!name) return null;
    const c = ecol(name);
    return <span className="tag-ed" style={{ background: `${c}22`, color: c }}>{name}</span>;
  }

  const syncColors = { saving: '#F59E0B', synced: '#10B981', error: '#EF4444', loading: '#60A5FA' };
  const syncText = { saving: '● Сохранение...', synced: '● Синхронизировано', error: '● Ошибка связи', loading: '● Загрузка...' };

  const prioMap = { high: '🔴', mid: '🟡', low: '🟢' };

  // ─── view renderer ───
  function renderContent() {
    if (view === 'client' && currentClient) return <ClientView />;
    if (view === 'dash' && subView) return <SubView />;
    return <Dashboard />;
  }

  // ─── Dashboard ───
  function Dashboard() {
    return (
      <div className="fu">
        {/* Hero */}
        <div className="hero">
          <div>
            <div className="hero-title">Easy<span className="grad">Life AI</span> — CRM</div>
            <div className="hero-sub">Управление клиентами, сроками и контентом</div>
          </div>
          <img className="hero-robot" src="https://static.tildacdn.one/tild3462-3366-4365-a563-343532633561/Robot10_3D-min.png" onError={e => e.target.style.display = 'none'} alt="" />
        </div>

        {/* Stat cards */}
        <div className="sgrid">
          <div className="sc a" onClick={() => nav('dash', undefined, undefined, 'all-clients')}>
            <div className="sc-lbl">Клиентов в работе</div><div className="sc-v">{clients.length}</div>
            <div className="sc-s">{clients.filter(c => c.stage === 'Производство').length} акт. · {clients.filter(c => c.stage === 'Онбординг').length} онб.</div>
            <span className="sc-hint">нажмите →</span>
          </div>
          <div className="sc b" onClick={() => nav('dash', undefined, undefined, 'videos-done')}>
            <div className="sc-lbl">Роликов готово</div><div className="sc-v">{tvr}</div>
            <div className="sc-s">из {tVT} · {pct(tvr, tVT)}%</div><span className="sc-hint">нажмите →</span>
          </div>
          <div className="sc c" onClick={() => nav('dash', undefined, undefined, 'videos-progress')}>
            <div className="sc-lbl">В монтаже</div><div className="sc-v">{tvi}</div>
            <div className="sc-s">роликов в работе</div><span className="sc-hint">нажмите →</span>
          </div>
          <div className="sc d" onClick={() => nav('dash', undefined, undefined, 'scripts-done')}>
            <div className="sc-lbl">Сценариев готово</div><div className="sc-v">{tsr}</div>
            <div className="sc-s">по всем клиентам</div><span className="sc-hint">нажмите →</span>
          </div>
        </div>

        {/* Content alerts */}
        {allContentAlerts.length > 0 && (
          <div className={`abar ${allContentAlerts.some(a => a.level === 'critical') ? 'crit' : 'warn'}`} onClick={() => nav('dash', undefined, undefined, 'content-alerts')}>
            <div className="abar-header">
              <div className="abar-t" style={{ color: allContentAlerts.some(a => a.level === 'critical') ? 'var(--rd)' : 'var(--am)' }}>
                {allContentAlerts.some(a => a.level === 'critical') ? '🔴' : '🟡'} НАРУШЕНИЕ СРОКОВ ({allContentAlerts.length})
              </div>
              <span className="abar-link">Смотреть все →</span>
            </div>
            {allContentAlerts.slice(0, 3).map((a, i) => (
              <div key={i} className="aitm">
                <div className={`adot ${a.level === 'critical' ? 'adot-r' : 'adot-a'}`} />
                <div style={{ flex: 1 }}>
                  <span className="aname" onClick={e => { e.stopPropagation(); nav('client', a.client.id, a.type === 'scripts' ? 'scripts' : 'videos'); }}>{a.client.name}</span>
                  {' — '}<span style={{ color: 'var(--t2)', fontSize: '12px' }}>{a.msg}</span>
                </div>
              </div>
            ))}
            {allContentAlerts.length > 3 && <div style={{ fontSize: '10px', color: 'var(--t2)', marginTop: '5px' }}>...ещё {allContentAlerts.length - 3} нарушений</div>}
          </div>
        )}

        {/* Checklist alerts */}
        {allClAlerts.length > 0 && (
          <div className="tasks-bar" onClick={() => nav('dash', undefined, undefined, 'checklist-alerts')}>
            <div className="tasks-title"><span>📋 ЗАДАЧИ ЧЕКЛИСТА — ГОРЯЩИЕ СРОКИ ({allClAlerts.length})</span><span className="abar-link">Все задачи →</span></div>
            <div className="task-grid">
              {allClAlerts.slice(0, 6).map((a, i) => (
                <div key={i} className={`task-item t-${a.level === 'critical' ? 'rd' : 'am'}`} onClick={e => { e.stopPropagation(); nav('client', a.client.id, 'checklist'); }}>
                  <div className={`task-dot td-${a.level === 'critical' ? 'rd' : 'am'}`} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="task-name">{a.client.name}</div>
                    <div className="task-sub">{a.item}</div>
                  </div>
                  <span className={`task-days ${a.days < 0 ? 'tdays-r' : 'tdays-a'}`}>
                    {a.days < 0 ? `−${Math.abs(a.days)}д` : a.days === 0 ? 'сег' : `${a.days}д`}
                  </span>
                </div>
              ))}
              {allClAlerts.length > 6 && <div style={{ fontSize: '10px', color: 'var(--t2)', gridColumn: '1/-1', textAlign: 'center', padding: '4px 0' }}>...ещё {allClAlerts.length - 6} задач</div>}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="fbar">
          <button className={`ftag ${filt === 'all' ? 'on' : ''}`} onClick={() => setFilt('all')}>Все ({clients.length})</button>
          {staff.editors.map(e => (
            <button key={e} className={`ftag ${filt === e ? 'on' : ''}`} onClick={() => setFilt(e)}>
              <span style={{ display: 'inline-block', width: '5px', height: '5px', borderRadius: '50%', background: ecol(e), marginRight: '4px', verticalAlign: 'middle' }} />
              {e}
            </button>
          ))}
          <input className="fsrch" placeholder="Поиск..." value={q} onChange={e => setQ(e.target.value)} style={{ marginLeft: 'auto' }} />
        </div>

        {/* Client cards */}
        <div className="cgrid">
          {filteredClients.map(c => <ClientCard key={c.id} c={c} />)}
          {can(profile, 'create_client') && (
            <div className="add-c" onClick={() => setShowAdd(true)}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', border: '1.5px dashed rgba(0,155,185,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', color: 'rgba(0,155,185,.5)' }}>+</div>
              <span style={{ fontSize: '11px', color: 'var(--t3)' }}>Новый клиент</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  function ClientCard({ c }) {
    const vr = cvr(c), vi = cvi(c), sr = csr(c), vp = pct(vr, c.vt), sp = pct(sr, c.vt), cp = pct(c.done?.length || 0, AIDS.length);
    const al = getContentAlerts(c), ca = getClAlerts(c);
    const crit = al.some(a => a.level === 'critical') || ca.some(a => a.level === 'critical');
    const warn = al.some(a => a.level === 'warning') || ca.some(a => a.level === 'warning');
    return (
      <div className={`ccard ${ccl(c.stage)} ${crit ? 'has-alert' : warn ? 'has-warn' : ''}`} onClick={() => nav('client', c.id, 'videos')}>
        <div className="cc-t">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="cc-av" style={pav(c.id)}>{ini(c.name)}</div>
            <div><div className="cc-name">{prioMap[c.priority] || ''} {c.name}</div><div className="cc-ni">{c.role || c.niche}</div></div>
          </div>
          <span className={`sb ${scl(c.stage)}`}>{c.stage}</span>
        </div>
        {c.pubDate && <div className="pdrow">📅 <b style={{ color: 'var(--t1)' }}>{fmtDF(c.pubDate)}</b></div>}
        {al.map((a, i) => <span key={i} className={`abadge ${a.level === 'critical' ? 'ab-r' : 'ab-a'}`}>● {a.type === 'scripts' ? 'Сцен.' : 'Ролики'}: {a.days < 0 ? `−${Math.abs(a.days)}д` : `${a.days}д`}</span>)}
        {ca.length > 0 && <span className="abadge ab-a">● Чеклист: {ca.length}</span>}
        <div className="prow"><span>Ролики <b>{vr}</b>/{c.vt}</span><span style={{ color: pcol(vp), fontWeight: 600 }}>{vp}%</span></div>
        <div className="pb"><div className="pf" style={{ width: `${vp}%`, background: pcol(vp) }} /></div>
        <div className="prow" style={{ marginTop: '5px' }}><span>Сценарии <b>{sr}</b>/{c.vt}</span><span style={{ color: 'var(--pu2)', fontWeight: 600 }}>{sp}%</span></div>
        <div className="pb"><div className="pf" style={{ width: `${sp}%`, background: 'var(--pu2)' }} /></div>
        <div className="cc-f">
          <div className="ms"><div className="ms-v" style={{ color: 'var(--am)' }}>{vi}</div><div className="ms-l">Монтаж</div></div>
          <div className="ms"><div className="ms-v" style={{ color: 'var(--cy)' }}>{cp}%</div><div className="ms-l">Чеклист</div></div>
          <div className="ms">{etag(c.editor)}<div className="ms-l" style={{ marginTop: '3px' }}>Монтажёр</div></div>
        </div>
      </div>
    );
  }

  // ─── SubView ───
  function SubView() {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    let title = '', meta = '', content = null;

    if (subView === 'all-clients') {
      title = 'Все клиенты'; meta = `${clients.length} клиентов`;
      content = <div className="cgrid">{clients.map(c => <ClientCard key={c.id} c={c} />)}</div>;
    } else if (subView === 'videos-done') {
      const items = clients.flatMap(c => c.videos?.filter(v => v.status === 'done').map(v => ({ client: c, v })) || []);
      title = 'Готовые ролики'; meta = `${items.length} роликов`;
      content = <TableView cols={['Клиент', 'Ролик', 'Дата', 'Этап']} rows={items.map(({ client: c, v }) => [
        <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }} onClick={() => nav('client', c.id, 'videos')}><span className="cc-av" style={{ ...pav(c.id), width: '28px', height: '28px', fontSize: '10px', borderRadius: '7px' }}>{ini(c.name)}</span><b>{c.name}</b></span>,
        v.title, fmtDF(v.date) || '—', <span className={`sb ${scl(c.stage)}`}>{c.stage}</span>,
      ])} onRowClick={(_, i) => nav('client', items[i].client.id, 'videos')} />;
    } else if (subView === 'videos-progress') {
      const items = clients.flatMap(c => c.videos?.filter(v => v.status === 'progress').map(v => ({ client: c, v })) || []);
      title = 'Ролики в монтаже'; meta = `${items.length} роликов`;
      content = <TableView cols={['Клиент', 'Ролик', 'Дата', 'Монтажёр']} rows={items.map(({ client: c, v }) => [
        <b>{c.name}</b>, v.title, fmtDF(v.date) || '—', etag(c.editor),
      ])} onRowClick={(_, i) => nav('client', items[i].client.id, 'videos')} />;
    } else if (subView === 'scripts-done') {
      const items = clients.flatMap(c => c.scripts?.filter(s => s.status === 'done' || s.status === 'approved').map(s => ({ client: c, s })) || []);
      title = 'Готовые сценарии'; meta = `${items.length} сценариев`;
      content = <TableView cols={['Клиент', 'Сценарий', 'Дата', 'Статус']} rows={items.map(({ client: c, s }) => [
        <b>{c.name}</b>, s.title, fmtDF(s.date) || '—',
        <span className={`ssel ${s.status === 'approved' ? 's3' : 's2'}`} style={{ pointerEvents: 'none' }}>{s.status === 'approved' ? 'Согласован' : 'Готово'}</span>,
      ])} onRowClick={(_, i) => nav('client', items[i].client.id, 'scripts')} />;
    } else if (subView === 'content-alerts') {
      title = 'Нарушения сроков'; meta = `${allContentAlerts.length} нарушений`;
      content = (
        <div className="sec-list">
          {allContentAlerts.map((a, i) => (
            <div key={i} className={`sec-row ${a.level === 'critical' ? 'rd' : 'am'}`} onClick={() => nav('client', a.client.id, a.type === 'scripts' ? 'scripts' : 'videos')}>
              <div className={`task-dot td-${a.level === 'critical' ? 'rd' : 'am'}`} />
              <div className="sec-body">
                <div className="sec-client">{a.client.name} <span style={{ fontSize: '10px', color: 'var(--t3)' }}>— {a.client.role || a.client.niche}</span></div>
                <div className="sec-task">{a.msg}</div>
                <div className="sec-meta">Дедлайн: {fmtDF(a.dl)} · Монтажёр: {a.client.editor} · TL: {a.client.teamLead}</div>
              </div>
              <span className={`dtag ${a.days < 0 ? 'dtag-r' : 'dtag-a'}`}>{a.days < 0 ? `+${Math.abs(a.days)} дн.` : `${a.days} дн.`}</span>
            </div>
          ))}
          {allContentAlerts.length === 0 && <div className="sec-row gr"><div className="task-dot td-gr" /><div className="sec-body"><div className="sec-task" style={{ color: 'var(--gr)' }}>🎉 Все сроки в норме!</div></div></div>}
        </div>
      );
    } else if (subView === 'checklist-alerts') {
      const crit = allClAlerts.filter(a => a.level === 'critical'), warn = allClAlerts.filter(a => a.level === 'warning');
      title = 'Задачи чеклиста — горящие сроки'; meta = `${crit.length} критично · ${warn.length} предупреждений`;
      const renderAlertRows = arr => arr.map((a, i) => (
        <div key={i} className={`sec-row ${a.level === 'critical' ? 'rd' : 'am'}`} onClick={() => nav('client', a.client.id, 'checklist')}>
          <div className={`task-dot td-${a.level === 'critical' ? 'rd' : 'am'}`} />
          <div className="sec-body">
            <div className="sec-client">{a.client.name}</div>
            <div className="sec-task">{a.item}</div>
            <div className="sec-meta"><span style={{ background: `${a.secColor}22`, color: a.secColor, padding: '1px 6px', borderRadius: '10px', fontSize: '9px', fontWeight: 700 }}>{a.sec}</span> · Дедлайн: {fmtDF(a.dl)}</div>
          </div>
          <span className={`dtag ${a.days < 0 ? 'dtag-r' : 'dtag-a'}`}>{a.days < 0 ? `−${Math.abs(a.days)} дн.` : a.days === 0 ? 'СЕГОДНЯ' : `${a.days} дн.`}</span>
        </div>
      ));
      content = (
        <>
          {crit.length > 0 && <><div style={{ fontSize: '10px', fontWeight: 700, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '.9px', marginBottom: '8px' }}>🔴 Критично ({crit.length})</div><div className="sec-list">{renderAlertRows(crit)}</div></>}
          {warn.length > 0 && <><div style={{ fontSize: '10px', fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '.9px', marginBottom: '8px', marginTop: '8px' }}>🟡 Предупреждения ({warn.length})</div><div className="sec-list">{renderAlertRows(warn)}</div></>}
          {allClAlerts.length === 0 && <div className="sec-list"><div className="sec-row gr"><div className="task-dot td-gr" /><div className="sec-body"><div className="sec-task" style={{ color: 'var(--gr)' }}>🎉 Все задачи чеклиста в норме!</div></div></div></div>}
        </>
      );
    }

    return (
      <div className="fu">
        <div className="page-hdr">
          <button className="back" onClick={() => nav('dash')}>← Назад</button>
          <div><div className="page-title">{title}</div><div className="page-meta">{meta}</div></div>
        </div>
        {content}
      </div>
    );
  }

  function TableView({ cols, rows, onRowClick }) {
    return (
      <div className="tw">
        <div className="tscroll">
          <table>
            <thead><tr>{cols.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
            <tbody>{rows.map((row, i) => <tr key={i} style={{ cursor: 'pointer' }} onClick={() => onRowClick(row, i)}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>
    );
  }

  // ─── Client Detail View ───
  function ClientView() {
    if (!currentClient) return null;
    const c = currentClient;
    const vr = cvr(c), vi = cvi(c), sr = csr(c), si = csi(c);
    const cp = pct(c.done?.length || 0, AIDS.length);
    const al = getContentAlerts(c);

    function updField(key, val) {
      if (!can(profile, 'edit_client') && key !== 'notes') return;
      if (key === 'notes' && !can(profile, 'add_notes') && !can(profile, 'edit_client')) return;
      updateClient(c.id, prev => ({ ...prev, [key]: val }));
    }
    function updVideo(vid, key, val) {
      if (!can(profile, 'update_videos')) return;
      updateClient(c.id, prev => ({ ...prev, videos: prev.videos.map(v => v.id === vid ? { ...v, [key]: val } : v) }));
    }
    function updScript(sid, key, val) {
      if (!can(profile, 'update_scripts')) return;
      updateClient(c.id, prev => ({ ...prev, scripts: prev.scripts.map(s => s.id === sid ? { ...s, [key]: val } : s) }));
    }
    function togCheck(itemId) {
      if (!can(profile, 'update_checklist')) return;
      updateClient(c.id, prev => {
        const done = prev.done?.includes(itemId) ? prev.done.filter(x => x !== itemId) : [...(prev.done || []), itemId];
        return { ...prev, done };
      });
    }
    function togVideo(vid) {
      if (!can(profile, 'update_videos')) return;
      updateClient(c.id, prev => ({ ...prev, videos: prev.videos.map(v => v.id === vid ? { ...v, status: v.status === 'done' ? 'idle' : 'done' } : v) }));
    }
    function togScript(sid) {
      if (!can(profile, 'update_scripts')) return;
      updateClient(c.id, prev => ({ ...prev, scripts: prev.scripts.map(s => s.id === sid ? { ...s, status: s.status === 'approved' ? 'idle' : 'approved' } : s) }));
    }

    const t = new Date(); t.setHours(0, 0, 0, 0);
    let pubHtml = null;
    if (c.pubDate) {
      const pub = new Date(c.pubDate), sDL = addDays(pub, -SCRIPT_BEFORE), vDL = addDays(pub, -VIDEO_BEFORE);
      const dPub = diffDays(pub, t), dS = diffDays(sDL, t), dV = diffDays(vDL, t);
      pubHtml = (
        <div className="pdc">
          <div className="pdc-s"><div className="pdc-l">Первая публикация</div><div className="pdc-v">{fmtDF(c.pubDate)}</div><div className="pdc-sub">{dPub > 0 ? `через ${dPub} дн.` : dPub === 0 ? 'СЕГОДНЯ' : `уже ${Math.abs(dPub)} дн. назад`}</div></div>
          <div className="dv" />
          <div className="pdc-s"><div className="pdc-l">Дедлайн сценариев</div><div className="pdc-v" style={{ color: dS < 0 && csr(c) === 0 ? 'var(--rd)' : dS <= WARN_DAYS && csr(c) === 0 ? 'var(--am)' : 'var(--pu2)' }}>{fmtDF(iso(sDL))}</div><div className="pdc-sub">за {SCRIPT_BEFORE} дн.{csr(c) > 0 ? ' ✓' : ''}</div></div>
          <div className="dv" />
          <div className="pdc-s"><div className="pdc-l">Дедлайн роликов</div><div className="pdc-v" style={{ color: dV < 0 && vr === 0 ? 'var(--rd)' : dV <= WARN_DAYS && vr === 0 ? 'var(--am)' : 'var(--gr)' }}>{fmtDF(iso(vDL))}</div><div className="pdc-sub">за {VIDEO_BEFORE} дн.{vr > 0 ? ' ✓' : ''}</div></div>
        </div>
      );
    }

    function SocBtn({ platform, handle, field }) {
      const cfgs = {
        ig: { cls: 'ig', label: 'Instagram', base: 'https://instagram.com/', icon: <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.3"/><circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3"/><circle cx="11.5" cy="4.5" r=".8" fill="currentColor"/></svg> },
        tt: { cls: 'tt', label: 'TikTok', base: 'https://tiktok.com/@', icon: <svg width="11" height="11" viewBox="0 0 11 12" fill="none"><path d="M8 1c.2 1.3 1 2 2.5 2.1v1.8C9.4 4.8 8.5 4.4 8 3.8V8a3 3 0 1 1-2-2.8V7a1.2 1.2 0 1 0 .8 1.1V1H8z" fill="currentColor"/></svg> },
        yt: { cls: 'yt', label: 'YouTube', base: 'https://youtube.com/@', icon: <svg width="11" height="11" viewBox="0 0 16 12" fill="none"><rect x=".5" y=".5" width="15" height="11" rx="3" stroke="currentColor" strokeWidth="1"/><path d="M6.5 3.5L10.5 6 6.5 8.5V3.5Z" fill="currentColor"/></svg> },
      };
      const cfg = cfgs[platform];
      if (handle) {
        return (
          <>
            <a className={`soc-btn ${cfg.cls}`} href={cfg.base + handle.replace('@', '').replace(/\/$/, '')} target="_blank" rel="noopener">
              {cfg.icon} {cfg.label}<span style={{ opacity: .4, marginLeft: '3px', fontSize: '9px' }}>↗</span>
            </a>
            <button className="soc-edit" onClick={() => openLnk(c.id, field)}>✎</button>
          </>
        );
      }
      return <button className={`soc-btn ${cfg.cls}`} onClick={() => openLnk(c.id, field)}>{cfg.icon} {cfg.label} <span style={{ fontSize: '9px', opacity: .7 }}>+ добавить</span></button>;
    }

    const stCls = { idle: 's0', progress: 's1', done: 's2', approved: 's3' };
    const stLabel = { idle: 'Не начато', progress: 'В работе', done: 'Готово', approved: 'Согласован' };

    function VideosTab() {
      const vDL = c.pubDate ? addDays(new Date(c.pubDate), -VIDEO_BEFORE) : null;
      return (
        <div className="tw">
          <div className="th2"><span className="tt">Ролики</span><span className="tm">{cvr(c)} готово · {cvi(c)} в работе · {c.vt - cvr(c) - cvi(c)} не начато</span></div>
          <div className="tscroll">
            <table>
              <thead><tr><th style={{ width: '30px' }}>#</th><th>Название</th><th style={{ width: '118px' }}>Дата публикации</th><th style={{ width: '100px' }}>Статус</th><th style={{ width: '130px' }}>Ссылка на ролик</th><th style={{ width: '34px' }}>✓</th></tr></thead>
              <tbody>
                {c.videos.map(v => {
                  const late = vDL && v.date && v.status !== 'done' && new Date(v.date) > vDL;
                  return (
                    <tr key={v.id} className={late ? 'tr-late' : ''}>
                      <td><span className="rn">{v.id}</span></td>
                      <td><div className="ri2"><input defaultValue={v.title} onBlur={e => updVideo(v.id, 'title', e.target.value)} /></div></td>
                      <td><input type="date" className="di" defaultValue={v.date} onBlur={e => updVideo(v.id, 'date', e.target.value)} /></td>
                      <td>
                        <select className={`ssel ${stCls[v.status] || 's0'}`} value={v.status} onChange={e => updVideo(v.id, 'status', e.target.value)}>
                          {['idle', 'progress', 'done'].map(s => <option key={s} value={s}>{stLabel[s]}</option>)}
                        </select>
                      </td>
                      <td className="vid-url-cell">
                        {v.pubUrl
                          ? <><a href={v.pubUrl} target="_blank" rel="noopener" style={{ fontSize: '11px', color: 'var(--cy)' }}>▶ Смотреть ↗</a><br /><input style={{ width: '100%', fontSize: '10px', marginTop: '2px' }} defaultValue={v.pubUrl} onBlur={e => updVideo(v.id, 'pubUrl', e.target.value)} /></>
                          : <input style={{ width: '100%', fontSize: '10px', color: 'var(--t2)' }} placeholder="+ ссылка на ролик" defaultValue="" onBlur={e => updVideo(v.id, 'pubUrl', e.target.value)} />
                        }
                      </td>
                      <td>
                        <div className="cb-w">
                          <div className={`cb ${v.status === 'done' ? 'on' : v.status === 'progress' ? 'pg' : ''}`} onClick={() => togVideo(v.id)}>
                            {v.status === 'done' && <svg width="9" height="9" viewBox="0 0 11 11" fill="none"><path d="M1.5 5.5L4.5 8.5L9.5 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    function ScriptsTab() {
      return (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
            <span className="tt">Сценарии</span>
            <span className="tm">{csr(c)} готово/согл. · {csi(c)} в работе · {c.vt - csr(c) - csi(c)} не начато</span>
          </div>
          <div className="sc-cards">
            {c.scripts.map(s => {
              const isOpen = openScript === s.id;
              return (
                <div key={s.id} className={`sc-card ${isOpen ? 'open' : ''}`} id={`sc-${c.id}-${s.id}`}>
                  <div className="sc-card-head" onClick={() => setOpenScript(isOpen ? null : s.id)}>
                    <span className="sc-num">{s.id}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span className="sc-card-title">{s.title}</span>
                        <span className={`ssel ${stCls[s.status] || 's0'}`} style={{ pointerEvents: 'none' }}>{stLabel[s.status]}</span>
                        {s.date && <span style={{ fontSize: '10px', color: 'var(--t3)' }}>{fmtDF(s.date)}</span>}
                      </div>
                      {s.hook && !isOpen && <div style={{ fontSize: '11px', color: 'var(--t2)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.hook.substring(0, 60)}{s.hook.length > 60 ? '…' : ''}</div>}
                    </div>
                    <div className={`cb ${s.status === 'done' || s.status === 'approved' ? 'on' : s.status === 'progress' ? 'pg' : ''}`}
                      onClick={e => { e.stopPropagation(); togScript(s.id); }}
                      style={{ flexShrink: 0, marginRight: '6px' }}>
                      {(s.status === 'done' || s.status === 'approved') && <svg width="9" height="9" viewBox="0 0 11 11" fill="none"><path d="M1.5 5.5L4.5 8.5L9.5 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </div>
                    <span className="sc-chevron">▼</span>
                  </div>
                  {isOpen && (
                    <div className="sc-card-body">
                      <div className="sc-field-grid">
                        <div className="sc-field full">
                          <div className="sc-flbl">🎬 Референс (ссылка на видео)</div>
                          <input className="sc-finput" defaultValue={s.ref || ''} placeholder="https://instagram.com/reel/..." onBlur={e => updScript(s.id, 'ref', e.target.value)} />
                          {s.ref && <a className="sc-ref-btn" href={s.ref} target="_blank" rel="noopener">▶ Референс ↗</a>}
                        </div>
                        <div className="sc-field full">
                          <div className="sc-flbl">📝 Транскрибация</div>
                          <textarea className="sc-ftarea" defaultValue={s.transcript || ''} placeholder="Вставьте транскрибацию..." onBlur={e => updScript(s.id, 'transcript', e.target.value)} />
                        </div>
                        <div className="sc-field">
                          <div className="sc-flbl">🪝 Хук</div>
                          <textarea className="sc-ftarea" style={{ minHeight: '80px' }} defaultValue={s.hook || ''} placeholder="Зацепляющее начало..." onBlur={e => updScript(s.id, 'hook', e.target.value)} />
                        </div>
                        <div className="sc-field">
                          <div className="sc-flbl">📄 Основной текст</div>
                          <textarea className="sc-ftarea" style={{ minHeight: '80px' }} defaultValue={s.body || ''} placeholder="Основной контент..." onBlur={e => updScript(s.id, 'body', e.target.value)} />
                        </div>
                        <div className="sc-field">
                          <div className="sc-flbl">📢 Призыв (CTA)</div>
                          <textarea className="sc-ftarea" style={{ minHeight: '60px' }} defaultValue={s.cta || ''} placeholder="Призыв к действию..." onBlur={e => updScript(s.id, 'cta', e.target.value)} />
                        </div>
                        <div className="sc-field">
                          <div className="sc-flbl">✏️ Текст для описания</div>
                          <textarea className="sc-ftarea" style={{ minHeight: '60px' }} defaultValue={s.descText || ''} placeholder="Описание к публикации..." onBlur={e => updScript(s.id, 'descText', e.target.value)} />
                        </div>
                      </div>
                      <div className="sc-foot">
                        <div><div className="sc-flbl" style={{ marginBottom: '4px' }}>Название</div><input className="sc-finput" style={{ width: '180px' }} defaultValue={s.title} onBlur={e => updScript(s.id, 'title', e.target.value)} /></div>
                        <div><div className="sc-flbl" style={{ marginBottom: '4px' }}>Статус</div>
                          <select className={`ssel ${stCls[s.status] || 's0'}`} value={s.status} onChange={e => updScript(s.id, 'status', e.target.value)}>
                            {['idle', 'progress', 'done', 'approved'].map(st => <option key={st} value={st}>{stLabel[st]}</option>)}
                          </select>
                        </div>
                        <div className="sc-date-wrap"><div><div className="sc-flbl" style={{ marginBottom: '4px' }}>Дата</div><input type="date" className="di" defaultValue={s.date} onBlur={e => updScript(s.id, 'date', e.target.value)} /></div></div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    function ChecklistTab() {
      const cp = pct(c.done?.length || 0, AIDS.length);
      const t = new Date(); t.setHours(0, 0, 0, 0);
      const dlMap = {};
      OB.forEach(sec => { const dl = sectionDeadline(sec, c.start, c.pubDate); sec.i.forEach(it => { dlMap[it.id] = dl; }); });
      const urg = OB.flatMap(sec => { const dl = sectionDeadline(sec, c.start, c.pubDate); if (!dl) return []; return sec.i.filter(it => !(c.done?.includes(it.id))).filter(it => diffDays(dl, t) <= WARN_DAYS).map(it => ({ it, d: diffDays(dl, t), sec })); });
      return (
        <div className="cl-wrap">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '9px', flexWrap: 'wrap', gap: '5px' }}>
            <span style={{ fontFamily: "'Exo 2', sans-serif", fontSize: '12px', fontWeight: 700 }}>Чеклист запуска</span>
            <span style={{ fontSize: '10px', color: 'var(--t2)' }}>{c.done?.length || 0}/{AIDS.length} · <b style={{ color: 'var(--cy)' }}>{cp}%</b></span>
          </div>
          <div className="pb" style={{ height: '4px', marginBottom: '11px' }}><div className="pf" style={{ width: `${cp}%`, background: 'linear-gradient(90deg,var(--cy),var(--pu2))' }} /></div>
          {urg.length > 0 && (
            <div className={`al-panel ${urg.some(x => x.d <= 0) ? 'crit' : 'warn'}`} style={{ marginBottom: '12px' }}>
              <div className="al-t" style={{ color: urg.some(x => x.d <= 0) ? 'var(--rd)' : 'var(--am)' }}>{urg.some(x => x.d <= 0) ? '🔴' : '🟡'} Срочные задачи ({urg.length})</div>
              {urg.map(({ it, d, sec }, i) => (
                <div key={i} className="al-row"><div className={`al-ico ${d <= 0 ? 'r' : 'a'}`}>{d <= 0 ? '🚨' : '⏰'}</div><div style={{ flex: 1, fontSize: '11px' }}>{it.id}. {it.t} <span style={{ color: 'var(--t2)', fontSize: '10px' }}>({sec.s})</span></div><span className={`dtag ${d < 0 ? 'dtag-r' : d === 0 ? 'dtag-r' : 'dtag-a'}`}>{d < 0 ? `−${Math.abs(d)}д` : d === 0 ? 'сегодня' : `${d}д`}</span></div>
              ))}
            </div>
          )}
          {OB.map(sec => {
            const dl = sectionDeadline(sec, c.start, c.pubDate), dlStr = dl ? iso(dl) : null;
            const dDiff = dl ? diffDays(dl, t) : null;
            const dlC = dDiff === null ? 'n' : dDiff < 0 ? 'r' : dDiff === 0 ? 'r' : dDiff <= WARN_DAYS ? 'a' : 'g';
            const dlLbl = dlStr ? (dDiff < 0 ? `просрочен ${fmtD(dlStr)}` : dDiff === 0 ? 'сегодня!' : fmtD(dlStr)) : '—';
            const sDone = sec.i.every(it => c.done?.includes(it.id));
            return (
              <div key={sec.s} className="cl-sec">
                <div className="cl-sec-h" style={{ '--sc': sec.c }}>
                  <span style={{ color: sec.c }}>{sec.s}</span>
                  {dlStr && <span className={`cl-d ${dlC}`}>{sDone ? '✓' : dlLbl}</span>}
                </div>
                <div className="clg">
                  {sec.i.map(it => {
                    const on = c.done?.includes(it.id), dl2 = dlMap[it.id], d = dl2 ? diffDays(dl2, t) : null;
                    const cls = on ? 'on' : d !== null && d <= 0 ? 'ov' : d !== null && d <= WARN_DAYS ? 'wn' : '';
                    const dc = d === null ? 'n' : d <= 0 ? 'r' : d <= WARN_DAYS ? 'a' : 'g';
                    return (
                      <div key={it.id} className={`cli ${cls}`} onClick={() => togCheck(it.id)}>
                        <div className="clb">{on && <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}</div>
                        <div className="clt">{it.id}. {it.t}</div>
                        {dl2 && !on && <span className={`cl-d ${dc}`}>{d < 0 ? `−${Math.abs(d)}д` : d === 0 ? '❗' : d <= WARN_DAYS ? `${d}д` : fmtD(iso(dl2))}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    const infoFields = [
      { label: 'Имя клиента', key: 'name' }, { label: 'Роль / профессия', key: 'role' }, { label: 'Ниша', key: 'niche' },
      { label: 'Телефон', key: 'phone', type: 'tel' }, { label: 'Пакет / тариф', key: 'pkg' },
      { label: 'Приоритет', key: 'priority', type: 'select', opts: [['high', '🔴 Высокий'], ['mid', '🟡 Средний'], ['low', '🟢 Низкий']] },
      { label: 'Монтажёр', key: 'editor', type: 'select', opts: staff.editors.map(n => [n, n]) },
      { label: 'Team Lead', key: 'teamLead', type: 'select', opts: staff.teamleads.map(n => [n, n]) },
      { label: 'Этап', key: 'stage', type: 'select', opts: [['Онбординг', 'Онбординг'], ['Производство', 'Производство'], ['Пауза', 'Пауза']] },
      { label: 'Дата старта', key: 'start', type: 'date' }, { label: 'Дата публикации', key: 'pubDate', type: 'date' },
    ];

    return (
      <div className="fu">
        <div className="dhdr">
          <button className="back" onClick={() => nav('dash')}>← Назад</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="cc-av" style={{ ...pav(c.id), width: '40px', height: '40px', fontSize: '13px', flexShrink: 0 }}>{ini(c.name)}</div>
              <div style={{ minWidth: 0 }}>
                <div className="dtitle"><span className="grad">{c.name}</span></div>
                <div className="dmeta">
                  <span>{c.role || c.niche}</span><span>·</span><span className={`sb ${scl(c.stage)}`}>{c.stage}</span><span>·</span>
                  {etag(c.editor)}<span style={{ fontSize: '9px', color: 'var(--t3)' }}>монт.</span>
                  {c.teamLead && <><span>·</span>{etag(c.teamLead)}<span style={{ fontSize: '9px', color: 'var(--t3)' }}>tl</span></>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Info card */}
        <div className="info-card">
          <div className="ic-header">
            <span className="ic-title">Карточка клиента</span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {can(profile, 'edit_client') && <button className={`edit-btn ${editMode ? 'active' : ''}`} onClick={() => setEditMode(v => !v)}>{editMode ? '✓ Сохранить' : '✎ Редактировать'}</button>}
              {can(profile, 'delete_client') && <button className="bd" onClick={() => doDeleteClient(c.id)} style={{ padding: '4px 10px', fontSize: '11px' }}>Удалить</button>}
            </div>
          </div>
          <div className="ic-grid">
            {infoFields.map(f => (
              <div key={f.key} className="ic-field">
                <div className="ic-label">{f.label}</div>
                {!editMode
                  ? <div className="ic-val">{f.key === 'priority' ? { high: '🔴 Высокий', mid: '🟡 Средний', low: '🟢 Низкий' }[c[f.key]] : c[f.key] || <span style={{ color: 'var(--t3)', fontStyle: 'italic' }}>—</span>}</div>
                  : f.type === 'select'
                    ? <select className="ic-select" value={c[f.key] || ''} onChange={e => updField(f.key, e.target.value)}>{(f.opts || []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    : <input className="ic-input" type={f.type || 'text'} defaultValue={c[f.key] || ''} onBlur={e => updField(f.key, e.target.value)} />
                }
              </div>
            ))}
          </div>
          {editMode && (
            <div className="fg" style={{ marginTop: '10px' }}>
              <div className="ic-label" style={{ marginBottom: '4px' }}>Заметки</div>
              <textarea className="ic-textarea" defaultValue={c.notes} onBlur={e => updField('notes', e.target.value)} />
            </div>
          )}
        </div>

        {pubHtml}

        {al.length > 0 && (
          <div className={`al-panel ${al.some(a => a.level === 'critical') ? 'crit' : 'warn'}`}>
            <div className="al-t" style={{ color: al.some(a => a.level === 'critical') ? 'var(--rd)' : 'var(--am)' }}>{al.some(a => a.level === 'critical') ? '🔴 КРИТИЧНО' : '🟡 ВНИМАНИЕ'}</div>
            {al.map((a, i) => <div key={i} className="al-row"><div className={`al-ico ${a.level === 'critical' ? 'r' : 'a'}`}>{a.level === 'critical' ? '🚨' : '⏰'}</div><div style={{ flex: 1, fontSize: '12px' }}>{a.msg}</div><span className={`dtag ${a.days < 0 ? 'dtag-r' : 'dtag-a'}`}>{a.days < 0 ? `+${Math.abs(a.days)}д` : `${a.days}д`}</span></div>)}
          </div>
        )}

        {/* Stats */}
        <div className="dsg">
          <div className="ds"><div className="ds-l">Роликов</div><div className="ds-v" style={{ color: 'var(--gr)' }}>{vr}</div><div className="ds-s">из {c.vt} · {pct(vr, c.vt)}%</div></div>
          <div className="ds"><div className="ds-l">В монтаже</div><div className="ds-v" style={{ color: 'var(--am)' }}>{vi}</div><div className="ds-s">в работе</div></div>
          <div className="ds"><div className="ds-l">Сценариев</div><div className="ds-v" style={{ color: 'var(--pu2)' }}>{sr}</div><div className="ds-s">из {c.vt} · {pct(sr, c.vt)}%</div></div>
          <div className="ds"><div className="ds-l">Чеклист</div><div className="ds-v" style={{ color: 'var(--cy)' }}>{cp}%</div><div className="ds-s">{c.done?.length || 0}/{AIDS.length}</div></div>
        </div>

        {/* Social links */}
        <div className="lrow">
          <SocBtn platform="ig" handle={c.ig} field="ig" />
          <SocBtn platform="tt" handle={c.tiktok} field="tiktok" />
          <SocBtn platform="yt" handle={c.youtube} field="youtube" />
        </div>

        {/* Tabs */}
        <div className="tabs">
          {[['videos', `Ролики (${vr}/${c.vt})`], ['scripts', `Сценарии (${sr}/${c.vt})`], ['checklist', `Чеклист (${cp}%)`], ['notes', 'Заметки']].map(([t, label]) => (
            <div key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => { setTab(t); setOpenScript(null); }}>{label}</div>
          ))}
        </div>

        {tab === 'videos' && <VideosTab />}
        {tab === 'scripts' && <ScriptsTab />}
        {tab === 'checklist' && <ChecklistTab />}
        {tab === 'notes' && (
          <div className="nw"><div className="nl">Заметки</div>
            <textarea className="nta" defaultValue={c.notes} onBlur={e => updField('notes', e.target.value)} placeholder="Важные детали, ссылки, особенности..." />
          </div>
        )}
      </div>
    );
  }

  // ─── render ───
  return (
    <>
      {/* Styles */}
      <style>{crm_css}</style>

      {/* Header */}
      <header className="hdr">
        <div className="logo" onClick={() => nav('dash')} style={{ cursor: 'pointer' }}>
          <div className="logo-mark"><svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="white" strokeWidth="1.4" /><path d="M5 8.5L7 10.5L11 6" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
          Easy<span className="grad">Life AI</span>
        </div>
        <div className="hdr-r">
          <span className="pill" id="pdate">{['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'][new Date().getMonth()]} {new Date().getFullYear()}</span>
          <span style={{ fontSize: '10px', color: syncColors[syncStatus] }}>{syncText[syncStatus]}</span>
          <button className="theme-btn" onClick={toggleTheme} title="Сменить тему">{theme === 'dark' ? '🌙' : '☀️'}</button>
          <div className="user-chip">
            <div className="user-dot" style={{ background: 'rgba(0,180,200,.2)', color: '#00B8CC' }}>{ini(profile?.name || 'A')}</div>
            <div><div className="user-name">{profile?.name}</div><div className="user-role">{ROLE_PRESETS[profile?.role]?.name || profile?.role}</div></div>
          </div>
          {can(profile, 'manage_staff') && <button className="btn-s" onClick={() => setShowStaff(true)}>👥</button>}
          {can(profile, 'manage_users') && <button className="btn-s" onClick={() => { loadUsers(); setShowUsers(true); }}>🔐</button>}
          <button className="btn-s" onClick={doLogout}>Выйти</button>
          {can(profile, 'create_client') && <button className="btn-p" onClick={() => setShowAdd(true)}>+ Клиент</button>}
        </div>
      </header>

      <main className="main" id="pg">
        {renderContent()}
      </main>

      {/* Add Client Modal */}
      {showAdd && (
        <div className="mb" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="mo">
            <div className="mo-t grad">Новый клиент</div>
            <div className="fr">
              <div className="fg"><label className="fl">Имя *</label><input className="fi" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="Иван Иванов" /></div>
              <div className="fg"><label className="fl">Ниша</label><input className="fi" value={addForm.niche} onChange={e => setAddForm(f => ({ ...f, niche: e.target.value }))} placeholder="Коучинг / AI" /></div>
            </div>
            <div className="fr">
              <div className="fg"><label className="fl">Роль / кто он</label><input className="fi" value={addForm.role} onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))} placeholder="Пластический хирург" /></div>
              <div className="fg"><label className="fl">Телефон</label><input className="fi" value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} placeholder="+380..." /></div>
            </div>
            <div className="fr">
              <div className="fg"><label className="fl">Роликов / мес.</label><input className="fi" type="number" value={addForm.vt} onChange={e => setAddForm(f => ({ ...f, vt: e.target.value }))} placeholder="30" /></div>
              <div className="fg"><label className="fl">Пакет / тариф</label><input className="fi" value={addForm.pkg} onChange={e => setAddForm(f => ({ ...f, pkg: e.target.value }))} placeholder="30 роликов / $2500" /></div>
            </div>
            <div className="fr">
              <div className="fg"><label className="fl">Монтажёр</label><select className="fsl" value={addForm.editor} onChange={e => setAddForm(f => ({ ...f, editor: e.target.value }))}><option value="">— выберите —</option>{staff.editors.map(n => <option key={n}>{n}</option>)}</select></div>
              <div className="fg"><label className="fl">Team Lead</label><select className="fsl" value={addForm.teamLead} onChange={e => setAddForm(f => ({ ...f, teamLead: e.target.value }))}><option value="">— выберите —</option>{staff.teamleads.map(n => <option key={n}>{n}</option>)}</select></div>
            </div>
            <div className="fr">
              <div className="fg"><label className="fl">Этап</label><select className="fsl" value={addForm.stage} onChange={e => setAddForm(f => ({ ...f, stage: e.target.value }))}><option>Онбординг</option><option>Производство</option><option>Пауза</option></select></div>
              <div className="fg"><label className="fl">Дата публикации</label><input type="date" className="fi" value={addForm.pubDate} onChange={e => setAddForm(f => ({ ...f, pubDate: e.target.value }))} /></div>
            </div>
            <div className="mf"><button className="bs" onClick={() => setShowAdd(false)}>Отмена</button><button className="btn-p" onClick={doAddClient}>Создать</button></div>
          </div>
        </div>
      )}

      {/* Staff Modal */}
      {showStaff && (
        <div className="mb" onClick={e => e.target === e.currentTarget && setShowStaff(false)}>
          <div className="mo" style={{ maxWidth: '400px' }}>
            <div className="mo-t grad">Команда</div>
            {[['editor', 'МОНТАЖЁРЫ', staff.editors, 'new-ed'], ['teamlead', 'TEAM LEADS', staff.teamleads, 'new-tl']].map(([type, title, list, inputId]) => (
              <div key={type} className="fg">
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--t2)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '.8px' }}>{title}</div>
                <div className="staff-list">{list.map(n => <div key={n} className="sti"><span className="tag-ed" style={{ background: `${ecol(n)}22`, color: ecol(n) }}>{n}</span><button className="st-del" onClick={() => doDelStaff(type, n)}>×</button></div>)}</div>
                <div className="sta-row"><input className="fi" id={inputId} placeholder={`Имя ${type === 'editor' ? 'монтажёра' : 'team lead'}`} onKeyDown={e => e.key === 'Enter' && doAddStaff(type)} /><button className="btn-p" onClick={() => doAddStaff(type)}>+</button></div>
              </div>
            ))}
            <div className="mf"><button className="bs" onClick={() => setShowStaff(false)}>Закрыть</button></div>
          </div>
        </div>
      )}

      {/* Users Modal */}
      {showUsers && (
        <div className="mb" onClick={e => e.target === e.currentTarget && setShowUsers(false)}>
          <div className="mo" style={{ maxWidth: '560px' }}>
            <div className="mo-t grad">Управление пользователями</div>
            <div style={{ marginBottom: '14px' }}>
              {users.map(u => (
                <div key={u.id} className="user-list-item">
                  <div className="uli-av" style={{ background: 'rgba(0,180,200,.2)', color: '#00B8CC' }}>{(u.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}><div className="uli-name">{u.name}</div><div className="uli-email">{u.email}</div></div>
                  <span className={`uli-role ${u.role === 'admin' ? 'role-admin' : u.role === 'teamlead' ? 'role-teamlead' : u.role === 'editor' ? 'role-editor' : 'role-viewer'}`}>{ROLE_PRESETS[u.role]?.name || u.role}</span>
                  <div className="uli-btns">
                    <button className="uli-btn" onClick={() => { setEditUid(u.id); setUserForm({ name: u.name, email: u.email || '', pass: '', role: u.role, perms: u.perms || [], staffName: u.staff_name || '' }); }}>✎</button>
                    {u.id !== profile.id && <button className="uli-btn danger" onClick={() => doDeleteUser(u.id)}>×</button>}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ background: 'var(--card2)', border: '1px solid var(--bdr)', borderRadius: '11px', padding: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--t2)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '.8px' }}>{editUid ? `Редактировать: ${userForm.name}` : 'Новый пользователь'}</div>
              <div className="fr">
                <div className="fg"><label className="fl">Имя</label><input className="fi" value={userForm.name} onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))} placeholder="Имя" /></div>
                <div className="fg"><label className="fl">Email</label><input className="fi" type="email" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} placeholder="email@..." disabled={!!editUid} /></div>
              </div>
              <div className="fr">
                <div className="fg"><label className="fl">Пароль {editUid ? '(пусто = без изм.)' : '*'}</label><input className="fi" type="password" value={userForm.pass} onChange={e => setUserForm(f => ({ ...f, pass: e.target.value }))} placeholder="••••••••" /></div>
                <div className="fg"><label className="fl">Сотрудник</label><select className="fsl" value={userForm.staffName} onChange={e => setUserForm(f => ({ ...f, staffName: e.target.value }))}><option value="">— не выбран —</option>{[...staff.editors, ...staff.teamleads].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
              </div>
              <div className="fg"><label className="fl">Быстрый пресет</label>
                <div className="role-presets">
                  {Object.entries(ROLE_PRESETS).map(([r, v]) => <button key={r} className="rp-btn" onClick={() => applyRolePreset(r)}>{r === 'admin' ? '👑' : r === 'teamlead' ? '⭐' : r === 'editor' ? '🎬' : r === 'scriptwriter' ? '✍️' : '👁'} {v.name}</button>)}
                </div>
              </div>
              <div className="fg"><label className="fl">Права доступа</label>
                <div className="perm-grid">
                  {Object.entries(ALL_PERMS).map(([k, v]) => {
                    const on = userForm.perms.includes(k);
                    return (
                      <div key={k} className={`perm-cb ${on ? 'on' : ''}`} onClick={() => setUserForm(f => ({ ...f, perms: on ? f.perms.filter(p => p !== k) : [...f.perms, k] }))}>
                        <div className="perm-box">{on && <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}</div>
                        <div className="perm-label">{v}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mf">
                <button className="bs" onClick={() => { setEditUid(null); setUserForm({ name: '', email: '', pass: '', role: 'viewer', perms: [], staffName: '' }); }}>Отмена</button>
                <button className="btn-p" onClick={doSaveUser}>Сохранить</button>
              </div>
            </div>
            <div className="mf" style={{ marginTop: '4px' }}><button className="bs" onClick={() => setShowUsers(false)}>Закрыть</button></div>
          </div>
        </div>
      )}

      {/* Link Modal */}
      {showLnk && (
        <div className="mb" onClick={e => e.target === e.currentTarget && setShowLnk(false)}>
          <div className="mo" style={{ maxWidth: '400px' }}>
            <div className="mo-t">{{ ig: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube' }[lnkTarget.type] || 'Ссылка'}</div>
            <div className="fg"><label className="fl">@username или URL</label><input className="fi" value={lnkVal} onChange={e => setLnkVal(e.target.value)} placeholder="https://..." autoFocus onKeyDown={e => e.key === 'Enter' && saveLnk()} /></div>
            <div className="mf"><button className="bs" onClick={() => setShowLnk(false)}>Отмена</button><button className="btn-p" onClick={saveLnk}>Сохранить</button></div>
          </div>
        </div>
      )}
    </>
  );
}

// Inline CSS for CRM-specific classes not in globals
const crm_css = `
.grad{background:linear-gradient(90deg,var(--cy),var(--pu2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.hdr{position:sticky;top:0;z-index:200;background:var(--hbg);backdrop-filter:blur(20px);border-bottom:1px solid var(--bdr);height:52px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;gap:8px}
.logo{display:flex;align-items:center;gap:8px;color:var(--t1);font-family:'Exo 2',sans-serif;font-weight:900;font-size:15px;white-space:nowrap}
.logo-mark{width:28px;height:28px;border-radius:7px;background:linear-gradient(135deg,var(--cy),var(--pu));display:flex;align-items:center;justify-content:center;flex-shrink:0}
.hdr-r{display:flex;align-items:center;gap:6px;flex-shrink:0}
.pill{background:var(--card2);border:1px solid var(--bdr);border-radius:20px;padding:3px 10px;font-size:11px;color:var(--t2)}
.btn-p{background:linear-gradient(135deg,var(--cy2),#007A8A);color:#021218;border:none;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer;transition:opacity .15s;font-family:'DM Sans',sans-serif}
.btn-s{background:var(--card);border:1px solid var(--bdr);border-radius:8px;padding:7px 10px;font-size:12px;color:var(--t2);cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .15s}
.btn-s:hover{border-color:rgba(0,155,185,.35);color:var(--cy)}
.theme-btn{background:var(--card);border:1px solid var(--bdr);border-radius:8px;padding:6px 9px;font-size:14px;cursor:pointer;line-height:1}
.user-chip{display:flex;align-items:center;gap:6px;background:var(--card);border:1px solid var(--bdr);border-radius:20px;padding:3px 10px 3px 4px}
.user-dot{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Exo 2',sans-serif;font-weight:800;font-size:10px;flex-shrink:0}
.user-name{font-size:11px;color:var(--t1);font-weight:500;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.user-role{font-size:9px;color:var(--t2)}
.main{position:relative;z-index:1;padding:16px 20px;max-width:1440px;margin:0 auto}
.hero{position:relative;overflow:hidden;background:linear-gradient(135deg,rgba(0,180,200,.04),rgba(124,58,237,.06));border:1px solid var(--bdr);border-radius:16px;padding:20px 24px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between}
.hero-robot{position:absolute;right:14px;bottom:0;height:120px;opacity:.13;pointer-events:none}
.hero-title{font-family:'Exo 2',sans-serif;font-size:19px;font-weight:900;margin-bottom:4px;position:relative;z-index:1;color:var(--t1)}
.hero-sub{font-size:11px;color:var(--t2);position:relative;z-index:1}
.sgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
.sc{background:var(--card);border:1px solid var(--bdr);border-radius:13px;padding:15px 17px;position:relative;overflow:hidden;cursor:pointer;transition:all .18s}
.sc::after{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--acc,var(--cy)),transparent)}
.sc:hover{border-color:var(--bdr2);transform:translateY(-2px);box-shadow:var(--shadow)}
.sc.a{--acc:var(--cy)}.sc.b{--acc:var(--gr)}.sc.c{--acc:var(--am)}.sc.d{--acc:var(--pu2)}
.sc-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.1px;color:var(--t2);margin-bottom:6px}
.sc-v{font-family:'Exo 2',sans-serif;font-size:34px;font-weight:800;line-height:1;margin-bottom:2px}
.sc.a .sc-v{color:var(--cy)}.sc.b .sc-v{color:var(--gr)}.sc.c .sc-v{color:var(--am)}.sc.d .sc-v{color:var(--pu2)}
.sc-s{font-size:10px;color:var(--t3)}
.sc-hint{position:absolute;bottom:8px;right:10px;font-size:9px;color:var(--t3);opacity:.6}
.abar{border-radius:11px;padding:11px 14px;margin-bottom:12px;cursor:pointer;transition:opacity .15s}
.abar:hover{opacity:.88}
.abar.crit{background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.18)}
.abar.warn{background:rgba(245,158,11,.04);border:1px solid rgba(245,158,11,.16)}
.abar-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.abar-t{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.9px;display:flex;align-items:center;gap:6px}
.abar-link{font-size:11px;color:var(--cy);font-weight:600}
.aitm{display:flex;align-items:flex-start;gap:8px;font-size:12px;padding:3px 0;border-bottom:1px solid var(--bdr)}
.aitm:last-child{border-bottom:none}
.adot{width:6px;height:6px;border-radius:50%;flex-shrink:0;margin-top:4px}
.adot-r{background:var(--rd)}.adot-a{background:var(--am)}
.aname{font-weight:700;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
.tasks-bar{background:var(--card);border:1px solid var(--bdr);border-radius:13px;padding:13px 15px;margin-bottom:14px;cursor:pointer;transition:all .15s}
.tasks-bar:hover{border-color:var(--bdr2)}
.tasks-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.9px;color:var(--t2);margin-bottom:9px;display:flex;align-items:center;justify-content:space-between}
.task-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:6px}
.task-item{display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-radius:8px;border:1px solid;transition:all .15s;cursor:pointer}
.task-item:hover{transform:translateY(-1px)}
.task-item.t-rd{background:rgba(239,68,68,.05);border-color:rgba(239,68,68,.18)}
.task-item.t-am{background:rgba(245,158,11,.04);border-color:rgba(245,158,11,.15)}
.task-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:3px}
.td-rd{background:var(--rd)}.td-am{background:var(--am)}.td-gr{background:var(--gr)}
.task-name{font-size:12px;font-weight:600;color:var(--t1);margin-bottom:1px}
.task-sub{font-size:10px;color:var(--t2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px}
.task-days{font-size:10px;font-weight:700;margin-left:auto;flex-shrink:0;padding:2px 6px;border-radius:10px;white-space:nowrap}
.tdays-r{background:rgba(239,68,68,.15);color:#F87171}.tdays-a{background:rgba(245,158,11,.12);color:#FCD34D}
.fbar{display:flex;align-items:center;gap:6px;margin-bottom:12px;flex-wrap:wrap}
.ftag{background:var(--card);border:1px solid var(--bdr);border-radius:20px;padding:4px 12px;font-size:12px;color:var(--t2);cursor:pointer;transition:all .15s;font-family:'DM Sans',sans-serif;white-space:nowrap;border:none}
.ftag:hover,.ftag.on{background:rgba(0,155,185,.1);border:1px solid rgba(0,155,185,.35)!important;color:var(--cy)}
.fsrch{background:var(--card);border:1px solid var(--bdr);border-radius:8px;padding:5px 10px;color:var(--t1);font-family:'DM Sans',sans-serif;font-size:12px;width:170px;outline:none;transition:border-color .15s}
.fsrch:focus{border-color:var(--bdr2)}
.fsrch::placeholder{color:var(--t3)}
.cgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.ccard{background:var(--card);border:1px solid var(--bdr);border-radius:14px;padding:17px;cursor:pointer;transition:all .2s;position:relative;overflow:hidden}
.ccard::before{content:'';position:absolute;top:0;left:0;bottom:0;width:3px;border-radius:3px 0 0 3px}
.ccard.prod::before{background:var(--gr)}.ccard.onb::before{background:var(--pu2)}.ccard.pause::before{background:var(--am)}
.ccard:hover{border-color:var(--bdr2);transform:translateY(-2px);box-shadow:var(--shadow)}
.ccard.has-alert{border-color:rgba(239,68,68,.25)!important}.ccard.has-warn{border-color:rgba(245,158,11,.2)!important}
.cc-t{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:9px}
.cc-av{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-family:'Exo 2',sans-serif;font-weight:800;font-size:12px;flex-shrink:0}
.cc-name{font-family:'Exo 2',sans-serif;font-weight:700;font-size:13px;margin-bottom:1px;line-height:1.2}
.cc-ni{font-size:10px;color:var(--t2)}
.sb{font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;letter-spacing:.2px;white-space:nowrap}
.s-pr{background:rgba(16,185,129,.1);color:#34D399}.s-ob{background:rgba(168,85,247,.1);color:#C084FC}.s-pa{background:rgba(245,158,11,.1);color:#FCD34D}
.pb{height:4px;background:rgba(0,0,0,.07);border-radius:2px;overflow:hidden;margin-top:3px}
.pf{height:100%;border-radius:2px;transition:width .4s}
.prow{display:flex;justify-content:space-between;font-size:11px;color:var(--t2);margin-top:7px}
.prow b{color:var(--t1);font-weight:600}
.cc-f{display:flex;margin-top:10px;padding-top:10px;border-top:1px solid var(--bdr)}
.ms{flex:1;text-align:center}
.ms-v{font-family:'Exo 2',sans-serif;font-size:14px;font-weight:700}
.ms-l{font-size:9px;color:var(--t2);margin-top:1px;letter-spacing:.2px;text-transform:uppercase}
.abadge{display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:700;padding:1px 6px;border-radius:20px;margin-top:5px;margin-right:3px}
.ab-r{background:rgba(239,68,68,.12);color:#F87171;border:1px solid rgba(239,68,68,.2)}.ab-a{background:rgba(245,158,11,.1);color:#FCD34D;border:1px solid rgba(245,158,11,.18)}
.pdrow{font-size:10px;color:var(--t2);margin-top:4px;display:flex;align-items:center;gap:4px}
.add-c{background:transparent;border:1.5px dashed rgba(0,155,185,.12);border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:150px;cursor:pointer;transition:all .2s}
.add-c:hover{border-color:rgba(0,155,185,.35);background:rgba(0,155,185,.02)}
.page-hdr{display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--bdr)}
.page-title{font-family:'Exo 2',sans-serif;font-size:20px;font-weight:800;color:var(--t1)}
.page-meta{font-size:12px;color:var(--t2);margin-top:3px}
.back{background:var(--card);border:1px solid var(--bdr);border-radius:8px;padding:6px 12px;font-size:12px;color:var(--t2);cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .15s;white-space:nowrap}
.back:hover{color:var(--cy);border-color:var(--bdr2)}
.dhdr{display:flex;align-items:flex-start;gap:12px;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--bdr);flex-wrap:wrap}
.dtitle{font-family:'Exo 2',sans-serif;font-size:22px;font-weight:800;line-height:1.1;margin-bottom:3px}
.dmeta{font-size:11px;color:var(--t2);display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.info-card{background:var(--card);border:1px solid var(--bdr);border-radius:13px;padding:15px 17px;margin-bottom:13px}
.ic-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:13px}
.ic-title{font-family:'Exo 2',sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--t2)}
.edit-btn{background:rgba(0,155,185,.08);border:1px solid rgba(0,155,185,.2);border-radius:7px;padding:4px 12px;font-size:11px;color:var(--cy);cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .15s}
.edit-btn.active{background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.25);color:var(--gr)}
.ic-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.ic-field{display:flex;flex-direction:column;gap:3px}
.ic-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--t3)}
.ic-val{font-size:13px;color:var(--t1);padding:4px 0}
.ic-input,.ic-select{background:var(--card2);border:1px solid var(--bdr);border-radius:7px;padding:6px 9px;color:var(--t1);font-family:'DM Sans',sans-serif;font-size:12px;outline:none;width:100%;transition:border-color .15s}
.ic-input:focus,.ic-select:focus{border-color:var(--bdr2)}
.ic-textarea{background:var(--card2);border:1px solid var(--bdr);border-radius:7px;padding:8px 10px;color:var(--t1);font-family:'DM Sans',sans-serif;font-size:12px;outline:none;width:100%;resize:vertical;min-height:64px;line-height:1.5}
.dsg{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:13px}
.ds{background:var(--card);border:1px solid var(--bdr);border-radius:12px;padding:13px;text-align:center}
.ds-v{font-family:'Exo 2',sans-serif;font-size:28px;font-weight:800;line-height:1;margin-bottom:2px}
.ds-l{font-size:9px;color:var(--t2);text-transform:uppercase;letter-spacing:.8px;font-weight:600;margin-bottom:6px}
.ds-s{font-size:10px;color:var(--t3)}
.pdc{background:var(--card);border:1px solid var(--bdr);border-radius:12px;padding:13px 16px;margin-bottom:12px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.pdc-s{display:flex;flex-direction:column;gap:2px}
.pdc-l{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.9px;color:var(--t2)}
.pdc-v{font-family:'Exo 2',sans-serif;font-size:15px;font-weight:700;color:var(--cy)}
.pdc-sub{font-size:10px;color:var(--t3)}
.dv{width:1px;height:32px;background:var(--bdr);flex-shrink:0}
.al-panel{border-radius:11px;padding:12px 14px;margin-bottom:12px}
.al-panel.crit{background:rgba(239,68,68,.04);border:1px solid rgba(239,68,68,.16)}
.al-panel.warn{background:rgba(245,158,11,.04);border:1px solid rgba(245,158,11,.16)}
.al-t{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.9px;margin-bottom:8px;display:flex;align-items:center;gap:5px}
.al-row{display:flex;align-items:center;gap:8px;font-size:12px;margin-bottom:5px}
.al-ico{width:20px;height:20px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0}
.al-ico.r{background:rgba(239,68,68,.15)}.al-ico.a{background:rgba(245,158,11,.12)}.al-ico.g{background:rgba(16,185,129,.12)}
.dtag{font-weight:700;font-size:10px;padding:2px 7px;border-radius:20px;white-space:nowrap;margin-left:auto}
.dtag-r{background:rgba(239,68,68,.15);color:#F87171}.dtag-a{background:rgba(245,158,11,.12);color:#FCD34D}.dtag-g{background:rgba(16,185,129,.12);color:var(--gr)}
.lrow{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
.soc-btn{display:inline-flex;align-items:center;gap:5px;border-radius:7px;padding:6px 11px;font-size:11px;font-weight:600;cursor:pointer;transition:all .15s;font-family:'DM Sans',sans-serif;text-decoration:none;border:1px solid;white-space:nowrap}
.soc-btn.ig{background:rgba(168,85,247,.08);border-color:rgba(168,85,247,.22);color:#A855F7}
.soc-btn.tt{background:rgba(0,0,0,.06);border-color:rgba(100,100,100,.2);color:var(--t1)}
.soc-btn.yt{background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.22);color:#EF4444}
.soc-edit{background:none;border:1px solid var(--bdr);border-radius:6px;padding:3px 6px;font-size:10px;cursor:pointer;color:var(--t2);font-family:'DM Sans',sans-serif}
.tabs{display:flex;gap:3px;margin-bottom:12px;background:var(--card);border:1px solid var(--bdr);border-radius:9px;padding:3px;overflow-x:auto;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tab{padding:5px 13px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;color:var(--t2);transition:all .15s;font-family:'DM Sans',sans-serif;border:1px solid transparent;white-space:nowrap}
.tab.on{background:rgba(0,155,185,.1);color:var(--cy);border-color:rgba(0,155,185,.22)}
.tw{background:var(--card);border:1px solid var(--bdr);border-radius:12px;overflow:hidden;margin-bottom:13px}
.th2{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-bottom:1px solid var(--bdr);flex-wrap:wrap;gap:5px}
.tt{font-family:'Exo 2',sans-serif;font-size:12px;font-weight:700;color:var(--t1)}
.tm{font-size:10px;color:var(--t2)}
.tscroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
table{width:100%;border-collapse:collapse;min-width:420px}
th{padding:7px 11px;font-size:9px;color:var(--t2);text-transform:uppercase;letter-spacing:.9px;font-weight:700;background:var(--card3);text-align:left;border-bottom:1px solid var(--bdr);white-space:nowrap}
td{padding:8px 11px;border-bottom:1px solid var(--bdr);vertical-align:middle;color:var(--t1)}
tr:last-child td{border-bottom:none}
tr:hover td{background:rgba(0,155,185,.03)}
tr.tr-late td{background:rgba(239,68,68,.04)!important}
.rn{font-family:'Exo 2',sans-serif;font-size:10px;color:var(--t3);font-weight:600}
.ri2 input{background:transparent;border:none;color:var(--t1);font-family:'DM Sans',sans-serif;font-size:12px;width:100%;outline:none;padding:2px 3px;border-radius:3px;min-width:80px}
.ri2 input:hover{background:var(--card2)}
.ri2 input:focus{background:rgba(0,155,185,.07);border-bottom:1px solid var(--bdr2)}
.ssel{background:transparent;border:none;font-size:11px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;outline:none;border-radius:20px;padding:2px 7px;-webkit-appearance:none;text-align:center}
.s0{background:rgba(255,255,255,.07);color:var(--t2)}.s1{background:rgba(245,158,11,.12);color:#FCD34D}.s2{background:rgba(16,185,129,.12);color:#34D399}.s3{background:rgba(0,155,185,.1);color:var(--cy)}
.cb-w{display:flex;align-items:center;justify-content:center}
.cb{width:17px;height:17px;border-radius:4px;border:1.5px solid var(--bdr2);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0}
.cb.on{background:var(--gr);border-color:var(--gr)}.cb.pg{background:rgba(245,158,11,.2);border-color:var(--am)}
.vid-url-cell{max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vid-url-cell input{background:transparent;border:none;color:var(--cy);font-family:'DM Sans',sans-serif;font-size:11px;width:100%;outline:none;min-width:80px}
.di{background:var(--card2);border:1px solid var(--bdr);border-radius:6px;padding:4px 8px;color:var(--t1);font-family:'DM Sans',sans-serif;font-size:12px;outline:none;transition:border-color .15s;cursor:pointer}
.di:focus{border-color:var(--bdr2)}
.sc-cards{display:flex;flex-direction:column;gap:10px}
.sc-card{background:var(--card);border:1px solid var(--bdr);border-radius:12px;overflow:hidden;transition:border-color .15s}
.sc-card-head{display:flex;align-items:center;gap:10px;padding:11px 14px;cursor:pointer;user-select:none}
.sc-card-head:hover{background:var(--card2)}
.sc-num{font-family:'Exo 2',sans-serif;font-size:11px;color:var(--t3);font-weight:700;min-width:20px}
.sc-card-title{flex:1;font-size:13px;color:var(--t1);font-weight:500}
.sc-chevron{font-size:11px;color:var(--t3);transition:transform .2s;flex-shrink:0}
.sc-card.open .sc-chevron{transform:rotate(180deg)}
.sc-card-body{padding:0 14px 14px;border-top:1px solid var(--bdr)}
.sc-field-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
.sc-field{display:flex;flex-direction:column;gap:3px}
.sc-field.full{grid-column:1/-1}
.sc-flbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);margin-bottom:3px}
.sc-finput{width:100%;background:var(--card2);border:1px solid var(--bdr);border-radius:7px;padding:7px 9px;color:var(--t1);font-family:'DM Sans',sans-serif;font-size:12px;outline:none;transition:border-color .15s}
.sc-ftarea{width:100%;background:var(--card2);border:1px solid var(--bdr);border-radius:7px;padding:7px 9px;color:var(--t1);font-family:'DM Sans',sans-serif;font-size:12px;outline:none;resize:vertical;min-height:72px;line-height:1.5;transition:border-color .15s}
.sc-ref-btn{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;background:rgba(0,155,185,.08);border:1px solid rgba(0,155,185,.18);border-radius:20px;font-size:10px;color:var(--cy);text-decoration:none;margin-top:4px}
.sc-foot{display:flex;align-items:center;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid var(--bdr);flex-wrap:wrap}
.sc-date-wrap{display:flex;align-items:center;gap:5px;margin-left:auto;flex-shrink:0}
.cl-wrap{background:var(--card);border:1px solid var(--bdr);border-radius:13px;padding:15px;margin-bottom:13px}
.cl-sec{margin-bottom:12px}
.cl-sec-h{display:flex;align-items:center;justify-content:space-between;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:5px 0 5px 8px;border-bottom:1px solid var(--bdr);margin-bottom:7px;border-left:3px solid var(--sc,var(--cy))}
.clg{display:grid;grid-template-columns:1fr 1fr;gap:4px}
.cli{display:flex;align-items:flex-start;gap:7px;padding:7px 9px;border-radius:7px;cursor:pointer;transition:all .15s;border:1px solid transparent}
.cli:hover{background:var(--card2);border-color:var(--bdr)}
.cli.on{background:rgba(16,185,129,.06);border-color:rgba(16,185,129,.14)}
.cli.ov{border-color:rgba(239,68,68,.22)!important;background:rgba(239,68,68,.04)!important}
.cli.wn{border-color:rgba(245,158,11,.18)!important;background:rgba(245,158,11,.03)!important}
.clb{width:16px;height:16px;min-width:16px;border-radius:4px;border:1.5px solid var(--bdr2);display:flex;align-items:center;justify-content:center;margin-top:1px;transition:all .15s}
.cli.on .clb{background:var(--gr);border-color:var(--gr)}
.clt{font-size:11px;color:var(--t2);line-height:1.35;flex:1}
.cli.on .clt{color:var(--gr);opacity:.55;text-decoration:line-through}
.cl-d{font-size:9px;white-space:nowrap;padding:1px 5px;border-radius:9px;flex-shrink:0;margin-top:1px;font-weight:700}
.cl-d.r{background:rgba(239,68,68,.14);color:#F87171}.cl-d.a{background:rgba(245,158,11,.1);color:#FCD34D}.cl-d.g{background:rgba(16,185,129,.09);color:var(--gr)}.cl-d.n{color:var(--t3)}
.nw{background:var(--card);border:1px solid var(--bdr);border-radius:12px;padding:14px;margin-bottom:13px}
.nl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--t3);margin-bottom:8px}
.nta{width:100%;background:var(--card2);border:1px solid var(--bdr);border-radius:7px;padding:9px 11px;color:var(--t1);font-family:'DM Sans',sans-serif;font-size:13px;line-height:1.6;resize:vertical;min-height:80px;outline:none;transition:border-color .15s}
.nta:focus{border-color:var(--bdr2)}
.mb{position:fixed;inset:0;background:rgba(0,0,0,.83);display:flex;align-items:center;justify-content:center;z-index:500;backdrop-filter:blur(6px);padding:12px}
.mo{background:var(--bg2);border:1px solid var(--bdr2);border-radius:16px;padding:22px 24px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto}
.mo-t{font-family:'Exo 2',sans-serif;font-size:16px;font-weight:800;margin-bottom:14px;color:var(--t1)}
.fr{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.fg{margin-bottom:9px}
.fl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--t2);display:block;margin-bottom:3px}
.fi,.fsl{width:100%;background:var(--card);border:1px solid var(--bdr);border-radius:7px;padding:7px 10px;color:var(--t1);font-family:'DM Sans',sans-serif;font-size:13px;outline:none;transition:border-color .15s}
.fi:focus,.fsl:focus{border-color:var(--bdr2)}
.fsl option{background:var(--card)}
.mf{display:flex;justify-content:flex-end;gap:7px;margin-top:8px}
.bs{background:transparent;border:1px solid var(--bdr);border-radius:7px;padding:6px 13px;font-size:12px;color:var(--t2);cursor:pointer;font-family:'DM Sans',sans-serif}
.bd{background:rgba(239,68,68,.1);color:#F87171;border:1px solid rgba(239,68,68,.2);border-radius:7px;padding:6px 13px;font-size:12px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer}
.sep{height:1px;background:var(--bdr);margin:11px 0}
.staff-list{display:flex;flex-direction:column;gap:5px;margin-bottom:9px;max-height:140px;overflow-y:auto}
.sti{display:flex;align-items:center;justify-content:space-between;background:var(--card);border:1px solid var(--bdr);border-radius:7px;padding:6px 10px;font-size:12px}
.st-del{background:none;border:none;color:var(--t3);cursor:pointer;font-size:14px;line-height:1;transition:color .15s}
.st-del:hover{color:var(--rd)}
.sta-row{display:flex;gap:6px}
.tag-ed{display:inline-flex;align-items:center;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.2px}
.user-list-item{display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--bdr);border-radius:9px;padding:10px 13px;margin-bottom:6px}
.uli-av{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-family:'Exo 2',sans-serif;font-weight:800;font-size:11px;flex-shrink:0}
.uli-name{font-size:13px;font-weight:600;color:var(--t1)}
.uli-email{font-size:10px;color:var(--t2)}
.uli-role{font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;margin-left:auto;white-space:nowrap}
.role-admin{background:rgba(239,68,68,.1);color:#EF4444}.role-teamlead{background:rgba(168,85,247,.1);color:var(--pu2)}.role-editor{background:rgba(0,155,185,.1);color:var(--cy)}.role-viewer{background:rgba(100,100,100,.1);color:var(--t2)}
.uli-btns{display:flex;gap:4px;margin-left:8px}
.uli-btn{background:none;border:1px solid var(--bdr);border-radius:6px;padding:3px 7px;font-size:11px;cursor:pointer;color:var(--t2);font-family:'DM Sans',sans-serif;transition:all .15s}
.uli-btn:hover{border-color:var(--bdr2);color:var(--cy)}.uli-btn.danger:hover{border-color:rgba(239,68,68,.3);color:var(--rd)}
.perm-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px}
.perm-cb{display:flex;align-items:center;gap:7px;padding:6px 9px;background:var(--card);border:1px solid var(--bdr);border-radius:7px;cursor:pointer;transition:all .15s}
.perm-cb:hover{border-color:var(--bdr2)}
.perm-cb.on{background:rgba(0,155,185,.08);border-color:rgba(0,155,185,.22)}
.perm-box{width:16px;height:16px;border-radius:4px;border:1.5px solid var(--bdr2);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s}
.perm-cb.on .perm-box{background:var(--cy);border-color:var(--cy)}
.perm-label{font-size:11px;color:var(--t2)}
.perm-cb.on .perm-label{color:var(--t1)}
.role-presets{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px}
.rp-btn{padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid var(--bdr);background:var(--card);color:var(--t2);font-family:'DM Sans',sans-serif;transition:all .15s}
.rp-btn:hover{border-color:var(--bdr2);color:var(--cy)}
.sec-list{display:flex;flex-direction:column;gap:8px;margin-bottom:14px}
.sec-row{display:flex;align-items:flex-start;gap:12px;background:var(--card);border:1px solid var(--bdr);border-radius:12px;padding:13px 15px;cursor:pointer;transition:all .15s}
.sec-row:hover{border-color:var(--bdr2);transform:translateX(2px)}
.sec-row.rd{border-left:3px solid var(--rd)}.sec-row.am{border-left:3px solid var(--am)}.sec-row.gr{border-left:3px solid var(--gr)}
.sec-body{flex:1;min-width:0}
.sec-client{font-size:12px;font-weight:700;color:var(--t1);margin-bottom:2px}
.sec-task{font-size:12px;color:var(--t2)}
.sec-meta{font-size:10px;color:var(--t3);margin-top:3px}
.fu{animation:fu .2s ease}
@keyframes fu{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:768px){
  .hdr{padding:0 12px;height:48px}
  .main{padding:12px}
  .hero{padding:15px;margin-bottom:12px}
  .hero-robot{height:80px}
  .sgrid{grid-template-columns:1fr 1fr;gap:8px}
  .sc-v{font-size:26px}
  .cgrid{grid-template-columns:1fr}
  .dsg{grid-template-columns:1fr 1fr;gap:8px}
  .ds-v{font-size:22px}
  .ic-grid{grid-template-columns:1fr 1fr}
  .fr{grid-template-columns:1fr}
  .clg{grid-column:1fr}
  .dtitle{font-size:18px}
  .pdc{gap:9px}
  .dv{display:none}
  .task-grid{grid-template-columns:1fr}
}
@media(max-width:480px){
  .ic-grid{grid-template-columns:1fr}
  .dsg{grid-template-columns:1fr 1fr}
  .sc-field-grid{grid-template-columns:1fr}
  .clg{grid-template-columns:1fr}
}
`;
