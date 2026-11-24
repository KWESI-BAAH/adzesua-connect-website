'use strict';
/* =========================================================
   Adzesua HQ — Activity log (administrator only)
   Every sign-in, sign-out, add, change, delete, refused change
   and download is written to /audit. The database rules make it
   append-only: nobody, the administrator included, can edit or
   delete an entry, and only the administrator can read it.
   ========================================================= */
(function addNav() { const g = NAV.find(([n]) => n === ''); if (g && !g[1].some(([k]) => k === 'audit')) g[1].unshift(['audit', 'Activity log']); })();

const AUDIT_SKIP = new Set(['updatedAt', 'createdAt', 'createdBy', 'id']);
const AUDIT_ACTIONS = { signin: ['Signed in', 'good'], signout: ['Signed out', 'mute'], create: ['Added', 'info'], update: ['Changed', 'gold'], delete: ['Deleted', 'bad'], refused: ['Refused', 'bad'], denied: ['No access', 'bad'], download: ['Downloaded', 'info'] };
function auditCollLabel(c) { const e = Object.values(ENT).find(x => x && x.coll === c); return (e && e.label) || ({ members: 'Team access', invites: 'Invitation', requests: 'Access request', settings: 'Settings', smsconfig: 'SMS settings' })[c] || c; }
function auditRecLabel(c, rec) {
  if (!rec) return '';
  const e = Object.values(ENT).find(x => x && x.coll === c && typeof x.title === 'function');
  try { if (e) { const t = e.title(rec); if (t) return t; } } catch (err) { }
  return rec.name || rec.title || rec.number || rec.subject || rec.email || rec.studentName || rec.id || '';
}
const auditVal = v => { if (v === true) return 'yes'; if (v === false) return 'no'; if (v == null || v === '') return '—'; const s = String(v); return s.length > 40 ? s.slice(0, 40) + '…' : s; };
function auditFieldLabel(c, k) { const e = Object.values(ENT).find(x => x && x.coll === c && Array.isArray(x.fields)); const f = e && e.fields.find(x => x.k === k); return f ? f.label : k; }
function auditDiff(prev, next, c) {
  if (!prev || !next) return '';
  const keys = [...new Set([...Object.keys(prev), ...Object.keys(next)])].filter(k => !AUDIT_SKIP.has(k));
  const out = [];
  keys.forEach(k => {
    const a = prev[k], b = next[k];
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (Array.isArray(a) || Array.isArray(b)) out.push(`${auditFieldLabel(c, k)}: ${(a || []).length} → ${(b || []).length} items`);
    else if ((a && typeof a === 'object') || (b && typeof b === 'object')) out.push(`${auditFieldLabel(c, k)}: changed`);
    else out.push(`${auditFieldLabel(c, k)}: ${auditVal(a)} → ${auditVal(b)}`);
  });
  return out.slice(0, 12).join('; ') + (out.length > 12 ? `; +${out.length - 12} more` : '');
}
function auditWrite(action, c, id, prev, next) {
  if (typeof window.ADZ_AUDIT !== 'function') return;
  const rec = next || prev;
  window.ADZ_AUDIT({ action, coll: c, docId: id, label: auditRecLabel(c, rec), changes: action === 'update' ? auditDiff(prev, next, c) : '', detail: action === 'refused' ? 'The database refused this change' : '' });
}
/* downloads and exports */
const _auditOffer = offerFile;
offerFile = async function (filename, data) { if (typeof window.ADZ_AUDIT === 'function') window.ADZ_AUDIT({ action: 'download', detail: String(filename || '').slice(0, 200) }); return _auditOffer(filename, data); };

/* ---------- loading (newest first, in pages of 300) ---------- */
const AUDIT = { rows: [], loading: false, done: false, last: null, err: '' };
async function auditLoad(more) {
  if (!window.ADZ_FS || AUDIT.loading) return;
  AUDIT.loading = true; AUDIT.err = ''; scheduleRender();
  try {
    let q = window.ADZ_FS.collection('audit').orderBy('at', 'desc').limit(300);
    if (more && AUDIT.last) q = q.startAfter(AUDIT.last);
    const snap = await q.get();
    const rows = snap.docs.map(d => { const x = d.data(); const t = x.at && x.at.toDate ? x.at.toDate() : null; return Object.assign({}, x, { id: d.id, t, iso: t ? t.toISOString() : '' }); });
    AUDIT.rows = more ? AUDIT.rows.concat(rows) : rows; AUDIT.last = snap.docs[snap.docs.length - 1] || AUDIT.last; AUDIT.done = snap.docs.length < 300;
  } catch (e) { AUDIT.err = (e && e.code === 'permission-denied') ? 'Only the administrator can read the activity log. If you are the administrator, publish the latest database rules.' : 'Could not load the activity log (' + ((e && e.code) || 'error') + ').'; }
  AUDIT.loading = false; scheduleRender();
}
ACT.auditMore = () => auditLoad(true);
ACT.auditRefresh = () => { AUDIT.rows = []; AUDIT.last = null; AUDIT.done = false; auditLoad(false); };

const auditTime = r => r.t ? `${fmtDate(r.iso.slice(0, 10))} · ${r.t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : '…';
const auditDevice = ua => { ua = ua || ''; const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : ''; const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ''; return [br, os].filter(Boolean).join(' on '); };

VIEWS.audit = () => {
  if (myRole() !== 'Admin') return pageHead('Activity log') + empty('Administrator only', 'Only the Managing Director can see the activity log.');
  if (!window.ADZ_FS) return pageHead('Activity log') + empty('Available in Adzesua HQ', 'The activity log is kept in the signed-in HQ site.');
  if (!AUDIT.rows.length && !AUDIT.loading && !AUDIT.err && !AUDIT.done) setTimeout(() => auditLoad(false), 0);
  const f = vs('audit'); const t = todayISO(); const d7 = addDays(t, -6), d30 = addDays(t, -29);
  const people = [...new Map(AUDIT.rows.map(r => [r.uid, r.name || r.email])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  const inRange = r => !f.range || (f.range === 'today' ? r.iso.slice(0, 10) === t : f.range === '7' ? r.iso.slice(0, 10) >= d7 : r.iso.slice(0, 10) >= d30);
  const rows = AUDIT.rows.filter(r => (!f.who || r.uid === f.who) && (!f.act || r.action === f.act) && inRange(r) && textMatch(f.q, r.name, r.email, r.label, r.changes, r.detail, auditCollLabel(r.coll)));
  const today = AUDIT.rows.filter(r => r.iso.slice(0, 10) === t); const week = AUDIT.rows.filter(r => r.iso.slice(0, 10) >= d7);
  const tiles = `<div class="tiles small">${tile('Sign-ins today', fmtNum(today.filter(r => r.action === 'signin').length), `${fmtNum(new Set(today.filter(r => r.action === 'signin').map(r => r.uid)).size)} people`)}${tile('Changes today', fmtNum(today.filter(r => ['create', 'update', 'delete'].includes(r.action)).length), 'Added, changed or deleted')}${tile('Deleted this week', fmtNum(week.filter(r => r.action === 'delete').length), '', week.some(r => r.action === 'delete') ? 'warn' : '')}${tile('Refused or no access', fmtNum(week.filter(r => r.action === 'refused' || r.action === 'denied').length), 'This week', week.some(r => r.action === 'refused' || r.action === 'denied') ? 'neg' : '')}</div>`;
  const bar = toolbar({ t: 'audit', search: 'Search names, records, changes', filters: [{ k: 'who', label: 'Person', opts: people }, { k: 'act', label: 'Action', opts: Object.entries(AUDIT_ACTIONS).map(([k, v]) => [k, v[0]]) }, { k: 'range', label: 'Period', opts: [['today', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days']] }] });
  const team = (() => {
    const by = new Map(); AUDIT.rows.forEach(r => { const x = by.get(r.uid) || { name: r.name || r.email, role: r.role, last: null, lastDev: '', n7: 0 }; if (r.action === 'signin' && !x.last) { x.last = r; x.lastDev = auditDevice(r.ua); } if (r.iso.slice(0, 10) >= d7 && ['create', 'update', 'delete'].includes(r.action)) x.n7++; by.set(r.uid, x); });
    const list = [...by.values()].sort((a, b) => String((b.last || {}).iso || '').localeCompare(String((a.last || {}).iso || '')));
    return list.length ? `<div class="tw"><table class="dt"><thead><tr><th>Person</th><th>Last sign-in</th><th>Device</th><th class="num">Changes, last 7 days</th></tr></thead><tbody>${list.map(x => `<tr><td><b>${esc(x.name)}</b><span class="muted small block">${esc(ROLE_LABEL[x.role] || x.role || '')}</span></td><td>${x.last ? auditTime(x.last) : '<span class="muted">Not in the loaded entries</span>'}</td><td>${esc(x.lastDev || '—')}</td><td class="num">${fmtNum(x.n7)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">No activity yet.</p>';
  })();
  const table = AUDIT.err ? `<div class="banner warn">${esc(AUDIT.err)}</div>` : dataTable({ id: 'auditT', rows, pageSize: 200, cols: [
    { k: 'iso', label: 'When', f: r => `<span class="nowrap">${auditTime(r)}</span>` },
    { k: 'name', label: 'Who', f: r => `<b>${esc(r.name || r.email)}</b><span class="muted small block">${esc(ROLE_LABEL[r.role] || r.role || '')}</span>` },
    { k: 'action', label: 'Action', f: r => { const a = AUDIT_ACTIONS[r.action] || [r.action, '']; return pill(a[0], a[1]); } },
    { k: 'label', label: 'What', v: r => `${auditCollLabel(r.coll)} ${r.label}`, f: r => r.coll ? `<span class="muted small block">${esc(auditCollLabel(r.coll))}</span>${esc(r.label || r.docId || '')}` : esc(r.detail || '') },
    { k: 'changes', label: 'Details', f: r => `<span class="small">${esc(r.changes || (r.coll ? r.detail : '') || '')}</span>${['signin', 'denied'].includes(r.action) ? `<span class="muted small block">${esc(auditDevice(r.ua))}</span>` : ''}` },
  ], empty: AUDIT.loading ? '<p class="muted">Loading…</p>' : empty('Nothing here yet', 'Sign-ins and changes will appear as people use HQ.') });
  const more = !AUDIT.done && AUDIT.rows.length ? `<div class="row" style="margin-top:12px">${btn(AUDIT.loading ? 'Loading…' : 'Load older entries', 'auditMore', {}, 'ghost')}</div>` : '';
  return pageHead('Activity log', 'Who signed in and what they changed. Entries cannot be edited or deleted, and only you can see them.', `${btn('Refresh', 'auditRefresh', {}, 'ghost')}${btn(ic('dl') + ' Export CSV', 'auditExport', {}, 'ghost')}`) +
    tiles + panel('Team activity', team) + bar + table + more;
};
ACT.auditExport = () => offerFile(`adzesua-activity-log-${todayISO()}.csv`, toCSV([['When', 'Name', 'Email', 'Role', 'Action', 'Record', 'Details', 'Device'], ...AUDIT.rows.map(r => [r.iso, r.name, r.email, r.role, (AUDIT_ACTIONS[r.action] || [r.action])[0], r.coll ? `${auditCollLabel(r.coll)}: ${r.label}` : '', r.changes || r.detail || '', auditDevice(r.ua)])]));
