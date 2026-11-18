'use strict';
/* =========================================================
   Adzesua OS — enterprise modules: roles, HR, leave, payroll,
   tax & VAT, support, projects, budgets, fixed assets
   ========================================================= */

/* ---------------- roles & access ---------------- */
function isAdminLevel() { try { if (APP.offline || !APP.user) return true; return !!((APP.user.isOwner && APP.user.isOwner()) || (APP.user.canEdit && APP.user.canEdit())); } catch (e) { return false; } }
function myRole() {
  try { if (APP.offline || !APP.user) return 'Admin'; if (APP.user.isOwner && APP.user.isOwner()) return 'Admin'; } catch (e) { }
  const m = APP.uid && get('members', APP.uid); const r = m && (LEGACY_ROLE[m.role] || m.role); if (r && ROLES[r]) return r;
  return isAdminLevel() ? 'Admin' : 'Viewer';
}
const perm = key => key === 'dashboard' ? ((ROLES[myRole()] || {}).dashboard || 'v') : (ROLES[myRole()] || {})[key];
function allowed(key) { return !!perm(key); }
function pageWritable() { return perm(route().nav) === 'e'; }
function canWriteColl(c) { if (myRole() === 'Admin') return true; return (COLL_PAGES[c] || []).some(k => perm(k) === 'e'); }
const seesMoney = () => allowed('reports');
const NAMES = {}; let namesPending = false;
async function resolveNames(ids) {
  if (!APP.user || !APP.user.profiles) return; const need = ids.filter(id => id && !(id in NAMES)); if (!need.length || namesPending) return;
  namesPending = true; try { const ps = await APP.user.profiles(need); need.forEach(id => (NAMES[id] = (ps && ps[id] && ps[id].name) || '')); } catch (e) { need.forEach(id => (NAMES[id] = '')); } namesPending = false; scheduleRender();
}

/* ---------------- HR: people & departments ---------------- */
const EMP_TYPES = ['Full-time', 'Part-time', 'Contract', 'Intern', 'National Service', 'Volunteer', 'Shareholder / director'];
ENT.staff.fields = [
  { k: 'name', label: 'Full name', req: true, span: 2 },
  { k: 'role', label: 'Job title' },
  { k: 'status', label: 'Status', type: 'select', opts: ['Active', 'On leave', 'Former'], def: 'Active' },
  { k: 'departmentId', label: 'Department', type: 'ref', ref: 'departments' },
  { k: 'managerId', label: 'Reports to', type: 'select', opts: r => all('staff').filter(s => s.id !== r.id).map(s => [s.id, s.name]) },
  { k: 'employmentType', label: 'Employment type', type: 'select', opts: EMP_TYPES, def: 'Full-time' },
  { k: 'location', label: 'Based in' },
  { k: 'startDate', label: 'Start date', type: 'date' },
  { k: 'endDate', label: 'Contract end date', type: 'date', help: 'Leave blank if permanent.' },
  { k: 'phone', label: 'Phone', type: 'tel' },
  { k: 'email', label: 'Email', type: 'email' },
  { k: 'accessRole', label: 'System role', type: 'select', opts: () => Object.keys(ROLES).map(r => [r, ROLE_LABEL[r]]), help: 'Picked automatically when you give this person access in Setup.' },
  { k: 'annualLeaveDays', label: 'Annual leave days', type: 'number', min: 0, def: () => settings().annualLeaveDefault },
  { k: 'emergencyContact', label: 'Emergency contact', ph: 'Name and phone' },
  { k: 'docs', label: 'Documents on file', type: 'lines', cols: [{ k: 'title', label: 'Document', w: '36%' }, { k: 'ref', label: 'Where it is / link' }, { k: 'expires', label: 'Expires', type: 'date', w: '150px' }], help: 'Contract, Ghana Card copy, CV, certificates, NDA. Expiry dates show up as reminders.' },
  { k: 'notes', label: 'Notes', type: 'textarea', span: 2 },
];
ENT.staff.size = 'lg';
ENT.staff.afterSave = (r, isNew) => { if (isNew) location.hash = 'staff-' + r.id; };
ENT.staff.canDelete = r => all('payruns').some(p => (p.lines || []).some(l => l.staffId === r.id)) ? 'This person is on a payroll run. Set their status to Former instead.' : '';
ENT.departments = {
  coll: 'departments', label: 'Department', title: r => r.name || 'Department',
  fields: [
    { k: 'name', label: 'Department name', req: true, span: 2, ph: 'e.g. Sales & Partnerships' },
    { k: 'headId', label: 'Head of department', type: 'select', opts: () => all('staff').filter(s => s.status !== 'Former').map(s => [s.id, s.name]) },
    { k: 'code', label: 'Short code', ph: 'e.g. SAL' },
    { k: 'purpose', label: 'What this department is responsible for', type: 'textarea', span: 2 },
  ],
  canDelete: r => all('staff').some(s => s.departmentId === r.id) ? 'People are still in this department. Move them first.' : '',
};
ENT.staffpay = {
  coll: 'staffpay', label: 'Pay details', title: r => 'Pay details', size: 'lg',
  fields: [
    { k: 'inPayroll', label: 'Include in monthly payroll', type: 'check', def: true },
    { k: 'payType', label: 'Pay arrangement', type: 'select', opts: ['Monthly salary', 'Commission only', 'Salary + commission', 'Allowance only', 'Unpaid'] },
    { k: 'monthlyPay', label: 'Basic salary (monthly)', type: 'money', help: 'SSNIT is worked out on basic salary.' },
    { k: 'commissionRate', label: 'Commission (% of money collected)', type: 'number', min: 0, help: 'Applied to cash received on sales marked “Sold by” this person.' },
    { k: 'allowances', label: 'Regular monthly allowances', type: 'lines', cols: [{ k: 'name', label: 'Allowance', w: '40%' }, { k: 'amount', label: 'Amount (GH₵)', type: 'money', w: '140px' }, { k: 'taxable', label: 'Taxable?', type: 'select', opts: [['yes', 'Taxable'], ['no', 'Not taxable']], w: '150px' }], lineTotal: o => num(o.amount), totalText: lines => `Allowances <b>${fmtMoney(sum(lines, l => num(l.amount)))}</b>`, help: 'Transport, rent, airtime and similar. Most cash allowances are taxable in Ghana.' },
    { k: 'ssnitNo', label: 'SSNIT / Ghana Card number' },
    { k: 'tin', label: 'TIN' },
    { k: 'tier2', label: 'Tier 2 trustee' },
    { k: 'payMethod', label: 'Paid by', type: 'select', opts: ['MoMo', 'Bank transfer', 'Cash'] },
    { k: 'payTo', label: 'MoMo number or bank account', span: 2 },
  ],
};
function staffPay(id) { const sp = get('staffpay', id); if (sp) return sp; const s = get('staff', id) || {}; return { id, payType: s.payType || '', monthlyPay: s.monthlyPay || 0, commissionRate: s.commissionRate || 0, inPayroll: !!num(s.monthlyPay) || !!num(s.commissionRate), allowances: [] }; }
ACT.editPay = el => { if (!isAdminLevel()) return toast('Only the owner and editors can see pay details.', 'bad'); const sp = staffPay(el.dataset.id); const st = get('staff', el.dataset.id); openForm('staffpay', Object.assign({}, sp, { id: el.dataset.id }), { title: `Pay details · ${st.name}`, noDelete: true, onSave: r => save('staffpay', Object.assign({}, r, { id: el.dataset.id })) }); };
const deptName = id => (get('departments', id) || {}).name || '';
const docAlerts = () => all('staff').filter(s => s.status !== 'Former').flatMap(s => (s.docs || []).filter(d => d.expires && d.expires <= addDays(todayISO(), 30)).map(d => ({ s, d })));

VIEWS.team = () => {
  const f = vs('team'); const tab = f.tab || 'people'; const t = todayISO();
  const staff = all('staff'); const active = staff.filter(s => s.status !== 'Former');
  const away = all('leave').filter(l => l.status === 'Approved' && l.from <= t && l.to >= t).map(l => l.staffId);
  const contractsEnding = active.filter(s => s.endDate && s.endDate >= t && s.endDate <= addDays(t, 60));
  const tabs = [['people', 'People'], ['departments', 'Departments'], ['org', 'Org chart']];
  let body = '';
  if (tab === 'people') {
    const rows = staff.filter(s => (!f.dept || s.departmentId === f.dept) && (!f.status || s.status === f.status) && textMatch(f.q, s.name, s.role, s.phone));
    body = toolbar({ t: 'team', search: 'Search people', filters: [{ k: 'dept', label: 'Department', opts: all('departments').map(d => [d.id, d.name]) }, { k: 'status', label: 'Status', opts: ['Active', 'On leave', 'Former'] }] }) +
      dataTable({ id: 'teamT', rows, rowAct: 'go-staff', cols: [{ k: 'name', label: 'Name', f: r => `<b>${esc(r.name)}</b>${away.includes(r.id) ? ' ' + pill('Away today', 'gold') : ''}<span class="muted small block">${esc(r.role || '')}</span>` }, { k: 'dept', label: 'Department', v: r => deptName(r.departmentId), f: r => esc(deptName(r.departmentId) || '—') }, { k: 'mgr', label: 'Reports to', v: r => staffName(r.managerId), f: r => esc(staffName(r.managerId) || '—') }, { k: 'employmentType', label: 'Type' }, { k: 'startDate', label: 'Started', f: r => fmtDate(r.startDate) }, { k: 'phone', label: 'Phone', f: r => r.phone ? phoneCell(r.phone) : '—' }, { k: 'status', label: 'Status', f: r => statusPill(r.status || 'Active') }], empty: empty('No team members yet', 'Add yourself and Sharon first.') });
  } else if (tab === 'departments') {
    const D = all('departments');
    body = D.length ? `<div class="people">${D.map(d => { const mem = active.filter(s => s.departmentId === d.id); return `<article class="person dept"><div class="av" aria-hidden="true">${esc((d.code || d.name).slice(0, 3).toUpperCase())}</div><div class="pi"><h3>${esc(d.name)}</h3><span class="muted">Head: ${esc(staffName(d.headId) || 'not set')}</span></div>${d.purpose ? `<p class="small" style="grid-column:1/-1;margin:0">${esc(d.purpose)}</p>` : ''}<ul class="list" style="grid-column:1/-1;margin:0">${mem.map(m => `<li class="li click" data-act="go" data-to="staff-${m.id}"><div class="lim"><b>${esc(m.name)}</b><span class="muted">${esc(m.role || '')}</span></div></li>`).join('') || '<li class="li muted small">Nobody yet</li>'}</ul><div class="row" style="grid-column:1/-1">${btn('Edit', 'edit', { k: 'departments', id: d.id }, 'ghost sm')}</div></article>`; }).join('')}</div>` + (active.some(s => !s.departmentId) ? `<p class="muted small">Not in a department: ${active.filter(s => !s.departmentId).map(s => esc(s.name)).join(', ')}</p>` : '') : empty('No departments yet', 'Small teams often start with Management, Sales & Partnerships, Operations & Technology, and Finance & Admin.', `<div class="row">${btn('Create the four starter departments', 'starterDepts')}</div>`);
  } else {
    const kids = id => active.filter(s => (s.managerId || '') === id && s.id !== id);
    const roots = active.filter(s => !s.managerId || !get('staff', s.managerId));
    const node = (s, depth = 0) => depth > 8 ? '' : `<li><div class="onode" data-act="go" data-to="staff-${s.id}" tabindex="0"><b>${esc(s.name)}</b><span>${esc(s.role || '')}</span>${s.departmentId ? `<em>${esc(deptName(s.departmentId))}</em>` : ''}</div>${kids(s.id).length ? `<ul>${kids(s.id).map(k => node(k, depth + 1)).join('')}</ul>` : ''}</li>`;
    body = roots.length ? `<div class="orgwrap"><ul class="org">${roots.map(r => node(r)).join('')}</ul></div><p class="muted small">Set “Reports to” on each person to build the chart.</p>` : empty('No one to chart yet');
  }
  return pageHead('Team & departments', 'Who works on Adzesua Connect, where they sit and who they report to.', `${btn('New department', 'create', { k: 'departments' }, 'ghost w')}${btn(ic('plus') + ' Add person', 'create', { k: 'staff' })}`) +
    `<div class="tiles small">${tile('People', fmtNum(active.length), `${active.filter(s => s.employmentType === 'Full-time').length} full-time`)}${tile('Departments', fmtNum(all('departments').length), '')}${tile('Away today', fmtNum(away.length), away.map(staffName).join(', ') || 'Everyone in')}${tile('Needs attention', fmtNum(contractsEnding.length + docAlerts().length), `${contractsEnding.length} contracts ending · ${docAlerts().length} documents expiring`, contractsEnding.length + docAlerts().length ? 'warnt' : '')}</div>` +
    `<div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" class="tab ${tab === k ? 'on' : ''}" data-act="chip" data-vsk="team.tab" data-v="${k}">${l}</button>`).join('')}</div>${body}`;
};
ACT['go-staff'] = el => { location.hash = 'staff-' + el.dataset.id; };
ACT.starterDepts = async () => { for (const [name, code, purpose] of [['Management', 'MGT', 'Direction, partnerships with GES and school leadership, fundraising.'], ['Sales & Partnerships', 'SAL', 'School outreach, demos, pipeline, customer relationships.'], ['Operations & Technology', 'OPS', 'Card production, NFC readers, Wi-Fi installation, support and SSHMS.'], ['Finance & Admin', 'FIN', 'Accounts, payroll, tax, purchasing and HR administration.']]) await save('departments', { name, code, purpose }); toast('Departments created'); };

VIEWS.staff = id => {
  const s = get('staff', id); if (!s) return pageHead('Not found') + empty('This person is no longer on the team', '', `<a class="btn ghost" href="#team">Back</a>`);
  const t = todayISO(); const y = t.slice(0, 4); const bal = leaveBalance(id);
  const lv = all('leave').filter(l => l.staffId === id).sort((a, b) => b.from.localeCompare(a.from));
  const acts = all('activities').filter(a => a.ownerId === id && !a.done);
  const reports = all('staff').filter(x => x.managerId === id && x.status !== 'Former');
  const admin = isAdminLevel(); const sp = admin ? staffPay(id) : null;
  const slips = admin ? all('payruns').filter(p => (p.lines || []).some(l => l.staffId === id)).sort((a, b) => b.period.localeCompare(a.period)) : [];
  const adv = admin ? advanceOutstanding(id) : 0;
  return pageHead(s.name, `${esc(s.role || '')}${s.departmentId ? ' · ' + esc(deptName(s.departmentId)) : ''} ${statusPill(s.status || 'Active')}`, `${btn(ic('edit') + ' Edit profile', 'edit', { k: 'staff', id }, 'ghost')}${admin ? btn('Pay details', 'editPay', { id }, 'ghost w') : ''}${btn('Book leave', 'create', { k: 'leave', preset: JSON.stringify({ staffId: id }) }, 'ghost w')}${btn('Assign task', 'create', { k: 'activities', preset: JSON.stringify({ ownerId: id }) })}`, `<a href="#team" class="lnk">Team</a> /`) +
    `<div class="tiles small">${tile(`Leave left ${y}`, `${fmtNum(bal.remaining, bal.remaining % 1 ? 1 : 0)} <small>of ${fmtNum(bal.entitled)} days</small>`, `${fmtNum(bal.taken)} taken · ${fmtNum(bal.booked)} booked`)}${tile('Open tasks', fmtNum(acts.length), '')}${tile('Direct reports', fmtNum(reports.length), reports.map(r => r.name).join(', '))}${admin ? tile('Basic salary', num(sp.monthlyPay) ? fmtMoney(sp.monthlyPay) : '—', `${esc(sp.payType || 'Pay not set')}${num(sp.commissionRate) ? ' · ' + sp.commissionRate + '% commission' : ''}`) : tile('Started', fmtDate(s.startDate), esc(s.employmentType || ''))}</div>
    <div class="grid2">${panel('Profile', `<dl class="kv"><dt>Employment</dt><dd>${esc(s.employmentType || '—')}</dd><dt>Reports to</dt><dd>${s.managerId ? link('staff-' + s.managerId, staffName(s.managerId)) : '—'}</dd><dt>Start date</dt><dd>${fmtDate(s.startDate)}</dd><dt>Contract ends</dt><dd>${s.endDate ? fmtDate(s.endDate) + (s.endDate <= addDays(t, 60) ? ' ' + pill('Soon', 'gold') : '') : 'Permanent'}</dd><dt>Phone</dt><dd>${s.phone ? phoneCell(s.phone) : '—'}</dd><dt>Email</dt><dd>${esc(s.email || '—')}</dd><dt>Based in</dt><dd>${esc(s.location || '—')}</dd><dt>Emergency contact</dt><dd>${esc(s.emergencyContact || '—')}</dd></dl>${s.notes ? `<p class="note">${esc(s.notes)}</p>` : ''}`)}
    ${panel('Documents on file', (s.docs || []).length ? `<ul class="list">${s.docs.map(d => `<li class="li"><div class="lim"><b>${esc(d.title)}</b><span class="muted">${esc(d.ref || '')}</span></div>${d.expires ? (d.expires < t ? pill('Expired ' + fmtDate(d.expires), 'bad') : d.expires <= addDays(t, 30) ? pill('Expires ' + fmtDate(d.expires), 'gold') : `<span class="small muted">Expires ${fmtDate(d.expires)}</span>`) : ''}</li>`).join('')}</ul>` : '<p class="muted small">No documents recorded. Add the contract, Ghana Card copy and CV via Edit profile.</p>')}</div>
    <div class="grid2">${panel('Leave', lv.length ? `<ul class="list">${lv.slice(0, 8).map(l => `<li class="li click" data-act="open" data-k="leave" data-id="${l.id}"><div class="lim"><b>${esc(l.type)} · ${fmtNum(l.days)} ${l.days === 1 ? 'day' : 'days'}</b><span class="muted">${fmtDate(l.from)} – ${fmtDate(l.to)}</span></div>${statusPill(l.status)}</li>`).join('')}</ul>` : '<p class="muted small">No leave recorded.</p>')}
    ${admin ? panel('Payslips & advances', `${adv > 0 ? `<p class="banner warn">Advance still owed: <b>${fmtMoney(adv)}</b></p>` : ''}${slips.length ? `<ul class="list">${slips.map(p => { const l = p.lines.find(x => x.staffId === id); return `<li class="li click" data-act="payslip" data-run="${p.id}" data-staff="${id}"><div class="lim"><b>${fmtMonth(p.period)}</b><span class="muted">Gross ${fmtMoney(l.gross)} · PAYE ${fmtMoney(num(l.paye) + num(l.bonusTax))}</span></div>${statusPill(PR_STATUS[p.status])}<span class="amt">${fmtMoney(l.net)}</span></li>`; }).join('')}</ul>` : '<p class="muted small">No payroll runs yet.</p>'}`, btn('Record advance', 'create', { k: 'advances', preset: JSON.stringify({ staffId: id }) }, 'ghost sm w')) : panel('Open tasks', acts.length ? `<ul class="list">${acts.map(a => `<li class="li click" data-act="open" data-k="activities" data-id="${a.id}"><div class="lim"><b>${esc(a.subject)}</b><span class="muted">${fmtDate(a.due)}</span></div></li>`).join('')}</ul>` : '<p class="muted small">Nothing open.</p>')}</div>`;
};

/* ---------------- Leave ---------------- */
const LEAVE_TYPES = ['Annual', 'Sick', 'Casual', 'Maternity', 'Paternity', 'Study', 'Compassionate', 'Unpaid'];
function workingDays(from, to) { if (!from || !to || to < from) return 0; let n = 0; let d = new Date(from + 'T00:00:00'); const e = new Date(to + 'T00:00:00'); while (d <= e) { const w = d.getDay(); if (w !== 0 && w !== 6) n++; d.setDate(d.getDate() + 1); } return n; }
ENT.leave = {
  coll: 'leave', label: 'Leave', title: r => `${staffName(r.staffId)} · ${r.type}`,
  fields: [
    { k: 'staffId', label: 'Person', type: 'select', req: true, opts: () => all('staff').filter(s => s.status !== 'Former').map(s => [s.id, s.name]) },
    { k: 'type', label: 'Type of leave', type: 'select', opts: LEAVE_TYPES, def: 'Annual', req: true },
    { k: 'from', label: 'First day', type: 'date', req: true },
    { k: 'to', label: 'Last day', type: 'date', req: true },
    { k: 'days', label: 'Working days', type: 'number', min: 0, help: 'Worked out from the dates (Monday–Friday). Adjust for public holidays or half days.' },
    { k: 'status', label: 'Status', type: 'select', opts: ['Requested', 'Approved', 'Rejected', 'Cancelled'], def: 'Requested', req: true },
    { k: 'cover', label: 'Who covers', type: 'select', opts: () => all('staff').filter(s => s.status !== 'Former').map(s => [s.id, s.name]) },
    { k: 'reason', label: 'Reason / notes', type: 'textarea', span: 2 },
  ],
  onChange: (r, e) => { if (e && e.target && ['f_from', 'f_to'].includes(e.target.id)) { const d = $('#f_days'); if (d) d.value = workingDays(r.from, r.to); } },
  validate: r => r.to < r.from ? 'The last day is before the first day.' : '',
  beforeSave: r => { if (r.days === '' || r.days === undefined) r.days = workingDays(r.from, r.to); if (r.status === 'Approved' && !r.decidedOn) r.decidedOn = todayISO(); return r; },
};
function leaveBalance(id, year = todayISO().slice(0, 4)) {
  const s = get('staff', id) || {}; const ent = num(s.annualLeaveDays ?? settings().annualLeaveDefault) || num(settings().annualLeaveDefault);
  const L = all('leave').filter(l => l.staffId === id && l.type === 'Annual' && l.status === 'Approved' && (l.from || '').startsWith(year));
  const t = todayISO(); const taken = sum(L.filter(l => l.from <= t), l => num(l.days)), booked = sum(L.filter(l => l.from > t), l => num(l.days));
  return { entitled: ent, taken, booked, remaining: ent - taken - booked };
}
VIEWS.leave = () => {
  const t = todayISO(); const L = all('leave'); const f = vs('lv');
  const away = L.filter(l => l.status === 'Approved' && l.from <= t && l.to >= t);
  const pending = L.filter(l => l.status === 'Requested').sort((a, b) => a.from.localeCompare(b.from));
  const upcoming = L.filter(l => l.status === 'Approved' && l.from > t && l.from <= addDays(t, 30));
  const canDecide = ['Admin', 'HR'].includes(myRole());
  const rows = L.filter(l => (!f.staff || l.staffId === f.staff) && (!f.type || l.type === f.type) && (!f.status || l.status === f.status));
  if (!vs('lv').sortK) Object.assign(vs('lv'), { sortK: 'from', dir: 'desc' });
  const staff = all('staff').filter(s => s.status !== 'Former');
  return pageHead('Leave', 'Requests, approvals, who is away and how many days everyone has left.', btn(ic('plus') + ' Book leave', 'create', { k: 'leave' })) +
    `<div class="tiles small">${tile('Away today', fmtNum(away.length), away.map(l => staffName(l.staffId)).join(', ') || 'Everyone in')}${tile('Waiting for approval', fmtNum(pending.length), '', pending.length ? 'warnt' : '')}${tile('Next 30 days', fmtNum(upcoming.length), upcoming.map(l => `${staffName(l.staffId).split(' ')[0]} ${fmtDate(l.from)}`).join(', '))}${tile('Days taken this year', fmtNum(sum(L.filter(l => l.status === 'Approved' && l.from.startsWith(t.slice(0, 4)) && l.from <= t), l => num(l.days))), 'All types')}</div>` +
    (pending.length ? panel('Waiting for approval', `<ul class="list">${pending.map(l => `<li class="li"><div class="lim click" data-act="open" data-k="leave" data-id="${l.id}"><b>${esc(staffName(l.staffId))} · ${esc(l.type)} · ${fmtNum(l.days)} days</b><span class="muted">${fmtDate(l.from)} – ${fmtDate(l.to)}${l.reason ? ' · ' + esc(l.reason) : ''}${l.type === 'Annual' ? ` · ${fmtNum(leaveBalance(l.staffId).remaining)} days left` : ''}</span></div>${canDecide ? `${btn('Approve', 'leaveDecide', { id: l.id, s: 'Approved' }, 'primary sm')}${btn('Reject', 'leaveDecide', { id: l.id, s: 'Rejected' }, 'ghost sm w')}` : ''}</li>`).join('')}</ul>`) : '') +
    `<div class="grid2">${panel(`Annual leave balances · ${t.slice(0, 4)}`, staff.length ? `<div class="tw"><table class="dt"><thead><tr><th>Person</th><th class="num">Entitled</th><th class="num">Taken</th><th class="num">Booked</th><th class="num">Left</th></tr></thead><tbody>${staff.map(s => { const b = leaveBalance(s.id); return `<tr class="click" data-act="go" data-to="staff-${s.id}"><td>${esc(s.name)}</td><td class="num">${fmtNum(b.entitled)}</td><td class="num">${fmtNum(b.taken)}</td><td class="num">${fmtNum(b.booked)}</td><td class="num ${b.remaining < 0 ? 'badt' : ''}"><b>${fmtNum(b.remaining)}</b></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted small">Add team members first.</p>')}
    ${panel('Away now and soon', [...away, ...upcoming].length ? `<ul class="list">${[...away, ...upcoming].map(l => `<li class="li"><div class="lim"><b>${esc(staffName(l.staffId))}</b><span class="muted">${esc(l.type)} · ${fmtDate(l.from)} – ${fmtDate(l.to)}${l.cover ? ' · cover: ' + esc(staffName(l.cover)) : ''}</span></div>${l.from <= t ? pill('Away', 'gold') : ''}</li>`).join('')}</ul>` : '<p class="muted small">Nobody is away in the next 30 days.</p>')}</div>` +
    toolbar({ t: 'lv', search: 'Search', filters: [{ k: 'staff', label: 'Person', opts: staff.map(s => [s.id, s.name]) }, { k: 'type', label: 'Type', opts: LEAVE_TYPES }, { k: 'status', label: 'Status', opts: ['Requested', 'Approved', 'Rejected', 'Cancelled'] }] }) +
    dataTable({ id: 'lv', rows, rowAct: 'open', cols: [{ k: 'from', label: 'From', f: r => fmtDate(r.from) }, { k: 'to', label: 'To', f: r => fmtDate(r.to) }, { k: 'person', label: 'Person', v: r => staffName(r.staffId), f: r => `<b>${esc(staffName(r.staffId))}</b>` }, { k: 'type', label: 'Type' }, { k: 'days', label: 'Days', cls: 'num', v: r => num(r.days) }, { k: 'status', label: 'Status', f: r => statusPill(r.status) }], empty: empty('No leave recorded yet') }).replace(/data-act="open"/g, 'data-act="open" data-k="leave"');
};
Object.assign(TONES, { Requested: 'gold', Approved: 'good', Rejected: 'bad', Cancelled: 'mute', 'On leave': 'gold', Former: 'mute' });
ACT.leaveDecide = async el => { const l = get('leave', el.dataset.id); await save('leave', Object.assign({}, l, { status: el.dataset.s, decidedOn: todayISO(), decidedBy: APP.uid || '' })); toast(`Leave ${el.dataset.s.toLowerCase()}`); };

/* ---------------- Payroll ---------------- */
const PR_STATUS = { draft: 'Draft', approved: 'Approved', paid: 'Paid' };
Object.assign(TONES, { Approved: 'good', Paid: 'good', Draft: 'mute' });
function parseBands(str) { return String(str || '').split(',').map(x => x.trim()).filter(Boolean).map(x => { const [w, r] = x.split(':'); return { width: w.trim() === '*' ? Infinity : num(w), rate: num(r) }; }); }
function payeTax(taxable, bandsStr) { let left = Math.max(0, taxable), tax = 0; for (const b of parseBands(bandsStr)) { const part = Math.min(left, b.width); tax += part * b.rate / 100; left -= part; if (left <= 0) break; } return r2(tax); }
function computePayLine(l, R) {
  const basic = num(l.basic), at = num(l.allowTax), an = num(l.allowNonTax), com = num(l.commission), bonus = num(l.bonus);
  const gross = r2(basic + at + an + com + bonus);
  const base = basic > 0 ? Math.min(Math.max(basic, num(R.ssnitMin)), num(R.ssnitMax) || Infinity) : 0;
  const ssnitEmp = r2(base * num(R.ssnitEmpRate) / 100), ssnitEr = r2(base * num(R.ssnitErRate) / 100);
  const tier1 = r2(base * num(R.tier1Rate) / 100), tier2 = r2(ssnitEmp + ssnitEr - tier1);
  const cap = basic * 12 * num(R.bonusCapPct) / 100; const bonusIn = Math.min(bonus, cap), bonusOver = Math.max(0, bonus - cap);
  const bonusTax = r2(bonusIn * num(R.bonusRate) / 100);
  const taxable = r2(Math.max(0, basic + at + com + bonusOver - ssnitEmp));
  const paye = payeTax(taxable, R.payeBands);
  const net = r2(gross - ssnitEmp - paye - bonusTax - num(l.advanceDeduct) - num(l.otherDeduct));
  return Object.assign({}, l, { gross, ssnitBase: r2(base), ssnitEmp, ssnitEr, tier1, tier2, bonusTax, taxable, paye, net, cost: r2(gross + ssnitEr) });
}
const payRates = () => { const s = settings(); return { ssnitEmpRate: s.ssnitEmpRate, ssnitErRate: s.ssnitErRate, tier1Rate: s.tier1Rate, tier2Rate: s.tier2Rate, ssnitMin: s.ssnitMin, ssnitMax: s.ssnitMax, payeBands: s.payeBands, bonusCapPct: s.bonusCapPct, bonusRate: s.bonusRate }; };
function periodEnd(period) { const [y, m] = period.split('-').map(Number); const l = new Date(y, m, 0); return `${y}-${pad(m)}-${pad(l.getDate())}`; }
function commissionFor(staffId, period, rate) {
  if (!num(rate)) return 0; const from = period + '-01', to = periodEnd(period); let base = 0;
  all('sales').filter(s => saleLive(s) && s.salesRepId === staffId).forEach(s => { const ratio = saleTotal(s) ? saleSubtotal(s) / saleTotal(s) : 1; if (s.kind === 'receipt') { if (s.date >= from && s.date <= to) base += saleSubtotal(s); } else (s.payments || []).forEach(p => { if (p.date >= from && p.date <= to) base += num(p.amount) * ratio; }); });
  return r2(base * num(rate) / 100);
}
function advanceOutstanding(staffId, excludeRun) {
  const given = sum(all('advances').filter(a => a.staffId === staffId), a => num(a.amount));
  const back = sum(all('payruns').filter(p => p.id !== excludeRun && p.status !== 'draft'), p => sum((p.lines || []).filter(l => l.staffId === staffId), l => num(l.advanceDeduct)));
  return r2(given - back);
}
ENT.advances = {
  coll: 'advances', label: 'Salary advance', title: r => `${staffName(r.staffId)} · ${fmtMoney(r.amount)}`, size: 'sm',
  fields: [
    { k: 'staffId', label: 'Person', type: 'select', req: true, opts: () => all('staff').map(s => [s.id, s.name]) },
    { k: 'date', label: 'Date given', type: 'date', req: true, def: () => todayISO() },
    { k: 'amount', label: 'Amount', type: 'money', req: true },
    { k: 'account', label: 'Paid from', type: 'select', req: true, def: '1010', opts: () => cashAccounts().map(a => [a.code, a.name]) },
    { k: 'monthly', label: 'Recover per month', type: 'money', help: 'Deducted in each payroll run until repaid.' },
    { k: 'note', label: 'Note' },
  ],
  validate: r => num(r.amount) <= 0 ? 'Enter an amount above zero.' : '',
};
ENT.payrates = { coll: 'settings', label: 'Payroll rates', title: () => 'Payroll rates', size: 'lg', fields: [
  { k: 'payeBands', label: 'PAYE monthly bands (width:rate%)', span: 2, help: 'GRA resident monthly bands effective 1 Sept 2026: first 588 at 0%, next 80 at 5%, next 100 at 10%, next 2,900 at 17.5%, next 16,000 at 25%, next 30,332 at 30%, above 50,000 at 35%. Write the last band as *:rate.' },
  { k: 'ssnitEmpRate', label: 'Employee SSNIT %', type: 'number' }, { k: 'ssnitErRate', label: 'Employer contribution %', type: 'number' },
  { k: 'tier1Rate', label: 'Tier 1 to SSNIT %', type: 'number', help: 'The rest of the 18.5% goes to the Tier 2 trustee.' }, { k: 'tier2Rate', label: 'Tier 2 %', type: 'number' },
  { k: 'ssnitMin', label: 'Minimum insurable salary (monthly)', type: 'money' }, { k: 'ssnitMax', label: 'Maximum insurable salary (monthly)', type: 'money' },
  { k: 'bonusCapPct', label: 'Bonus taxed at flat rate up to (% of annual basic)', type: 'number' }, { k: 'bonusRate', label: 'Flat bonus tax %', type: 'number' },
] };
ACT.editPayRates = () => openForm('payrates', settings(), { onSave: saveSettings, noDelete: true, title: 'Payroll rates', sub: 'Change these when GRA or SSNIT publish new rates. Runs already approved keep the rates they were made with.' });
LEDGER_HOOKS.push(push => {
  all('payruns').forEach(p => {
    if (p.status === 'draft') return; const L = p.lines || []; const S2 = k => r2(sum(L, l => num(l[k]))); const ref = `PAY-${p.period}`;
    push(p.approvedOn && p.approvedOn.slice(0, 7) === p.period ? p.approvedOn : periodEnd(p.period), ref, `Payroll ${fmtMonth(p.period)}`, [{ acct: '6000', dr: S2('gross') }, { acct: '6010', dr: S2('ssnitEr') }, { acct: '2120', cr: S2('tier1') }, { acct: '2130', cr: S2('tier2') }, { acct: '2110', cr: r2(S2('paye') + S2('bonusTax')) }, { acct: '1300', cr: S2('advanceDeduct') }, { acct: '2140', cr: S2('otherDeduct') }, { acct: '2300', cr: S2('net') }], 'payrun', p.id);
    if (p.status === 'paid') push(p.paidOn || periodEnd(p.period), ref, `Salaries paid ${fmtMonth(p.period)}`, [{ acct: '2300', dr: S2('net') }, { acct: p.paidFrom || '1010', cr: S2('net') }], 'payrun', p.id);
  });
  all('advances').forEach(a => push(a.date, 'ADV', `Salary advance · ${staffName(a.staffId)}`, [{ acct: '1300', dr: num(a.amount) }, { acct: a.account || '1010', cr: num(a.amount) }], 'advance', a.id));
});
VIEWS.payroll = () => {
  if (!isAdminLevel()) return pageHead('Payroll') + empty('Payroll is private', 'Only the owner and people with Editor access can open payroll and pay details. Ask the owner if you need it.');
  const runs = all('payruns').sort((a, b) => b.period.localeCompare(a.period)); const t = todayISO(); const b = balances('', t);
  const thisPeriod = t.slice(0, 7); const has = runs.some(r => r.period === thisPeriod);
  const ytd = runs.filter(r => r.status !== 'draft' && r.period.startsWith(t.slice(0, 4)));
  const R = settings(); const people = all('staff').filter(s => s.status !== 'Former');
  const advRows = people.map(s => ({ s, owed: advanceOutstanding(s.id) })).filter(x => x.owed > 0.004);
  return pageHead('Payroll', `Monthly pay with Ghana PAYE, SSNIT Tier 1 and Tier 2 worked out for you. Private to the owner and editors.`, `${btn('Payroll rates', 'editPayRates', {}, 'ghost w')}${btn('Salary advance', 'create', { k: 'advances' }, 'ghost w')}${btn(ic('plus') + (has ? ' New run' : ` Run ${fmtMonth(thisPeriod)} payroll`), 'newPayrun', { period: has ? '' : thisPeriod })}`) +
    `<div class="tiles small">${tile(`Payroll cost ${t.slice(0, 4)}`, fmtMoney(sum(ytd, r => sum(r.lines || [], l => num(l.cost)))), 'Gross pay plus employer SSNIT')}${tile('PAYE owed to GRA', fmtMoney(b['2110'] || 0), 'Due by the 15th of the next month', (b['2110'] || 0) > 0 ? 'warnt' : '')}${tile('SSNIT & Tier 2 owed', fmtMoney((b['2120'] || 0) + (b['2130'] || 0)), 'Due by the 14th of the next month', (b['2120'] || 0) + (b['2130'] || 0) > 0 ? 'warnt' : '')}${tile('Salaries not yet paid', fmtMoney(b['2300'] || 0), 'Approved runs awaiting payment')}</div>` +
    panel('Payroll runs', runs.length ? `<div class="tw"><table class="dt"><thead><tr><th>Month</th><th class="num">People</th><th class="num">Gross</th><th class="num">PAYE</th><th class="num">SSNIT + Tier 2</th><th class="num">Net pay</th><th class="num">Total cost</th><th>Status</th></tr></thead><tbody>${runs.map(r => { const L = r.lines || []; return `<tr class="click" data-act="go" data-to="payrun-${r.id}"><td><b>${fmtMonth(r.period)}</b></td><td class="num">${L.length}</td><td class="num">${fmtMoney(sum(L, l => num(l.gross)))}</td><td class="num">${fmtMoney(sum(L, l => num(l.paye) + num(l.bonusTax)))}</td><td class="num">${fmtMoney(sum(L, l => num(l.ssnitEmp) + num(l.ssnitEr)))}</td><td class="num"><b>${fmtMoney(sum(L, l => num(l.net)))}</b></td><td class="num">${fmtMoney(sum(L, l => num(l.cost)))}</td><td>${statusPill(PR_STATUS[r.status])}</td></tr>`; }).join('')}</tbody></table></div>` : empty('No payroll runs yet', 'Set each person’s pay details, then run payroll for the month.')) +
    `<div class="grid2">${panel('Who is on payroll', people.length ? `<ul class="list">${people.map(s => { const sp = staffPay(s.id); const on = sp.inPayroll !== false && !/unpaid/i.test(sp.payType || '') && (num(sp.monthlyPay) || num(sp.commissionRate) || (sp.allowances || []).length); return `<li class="li"><div class="lim click" data-act="go" data-to="staff-${s.id}"><b>${esc(s.name)}</b><span class="muted">${esc(sp.payType || 'Pay not set')}${num(sp.monthlyPay) ? ' · basic ' + fmtMoney(sp.monthlyPay) : ''}${num(sp.commissionRate) ? ' · ' + sp.commissionRate + '% commission' : ''}</span></div>${on ? pill('On payroll', 'good') : pill('Not on payroll', 'mute')}${btn('Pay details', 'editPay', { id: s.id }, 'ghost sm')}</li>`; }).join('')}</ul>` : '<p class="muted small">Add team members first.</p>')}
    ${panel('Rates in use', `<dl class="kv sm"><dt>PAYE bands (monthly)</dt><dd class="mono">${esc(R.payeBands)}</dd><dt>SSNIT</dt><dd>Employee ${R.ssnitEmpRate}% · employer ${R.ssnitErRate}% · Tier 1 ${R.tier1Rate}% to SSNIT, Tier 2 ${R.tier2Rate}% to trustee</dd><dt>Insurable salary</dt><dd>${fmtMoney(R.ssnitMin)} – ${fmtMoney(R.ssnitMax)} a month</dd><dt>Bonus</dt><dd>${R.bonusRate}% flat up to ${R.bonusCapPct}% of annual basic; the rest is taxed with salary</dd></dl>${advRows.length ? `<p class="small" style="margin-top:12px"><b>Advances owed:</b> ${advRows.map(x => `${esc(x.s.name)} ${fmtMoney(x.owed)}`).join(' · ')}</p>` : ''}<p class="muted small">Check against GRA and SSNIT notices each January and when the law changes.</p>`)}</div>`;
};
ACT.newPayrun = async el => {
  let period = el.dataset.period;
  if (!period) { const d = new Date(); const used = new Set(all('payruns').map(r => r.period)); for (let i = 0; i < 24 && !period; i++) { const x = new Date(d.getFullYear(), d.getMonth() - i + 1, 1); const k = `${x.getFullYear()}-${pad(x.getMonth() + 1)}`; if (!used.has(k)) period = k; } }
  if (all('payruns').some(r => r.period === period)) return toast('There is already a run for that month.', 'bad');
  const R = payRates();
  const lines = all('staff').filter(s => s.status !== 'Former').map(s => [s, staffPay(s.id)]).filter(([, sp]) => sp.inPayroll !== false && !/unpaid/i.test(sp.payType || '') && (num(sp.monthlyPay) || num(sp.commissionRate) || (sp.allowances || []).length)).map(([s, sp]) => {
    const al = sp.allowances || []; const adv = advanceOutstanding(s.id); const mon = sum(all('advances').filter(a => a.staffId === s.id), a => num(a.monthly));
    return computePayLine({ staffId: s.id, name: s.name, role: s.role || '', basic: num(sp.monthlyPay), allowTax: sum(al.filter(a => a.taxable !== 'no'), a => num(a.amount)), allowNonTax: sum(al.filter(a => a.taxable === 'no'), a => num(a.amount)), commission: commissionFor(s.id, period, sp.commissionRate), bonus: 0, advanceDeduct: Math.min(adv, mon || adv), otherDeduct: 0, ssnitNo: sp.ssnitNo || '', payTo: [sp.payMethod, sp.payTo].filter(Boolean).join(' · ') }, R);
  });
  if (!lines.length) return toast('Nobody is set up for payroll yet. Open Pay details for each person first.', 'bad');
  const id = await save('payruns', { period, status: 'draft', payDate: periodEnd(period), rates: R, lines });
  location.hash = 'payrun-' + id;
};
const PR_COLS = [['basic', 'Basic'], ['allowTax', 'Taxable allow.'], ['allowNonTax', 'Non-tax allow.'], ['commission', 'Commission'], ['bonus', 'Bonus'], ['advanceDeduct', 'Advance recovery'], ['otherDeduct', 'Other deduction']];
VIEWS.payrun = id => {
  if (!isAdminLevel()) return VIEWS.payroll();
  const p = get('payruns', id); if (!p) return pageHead('Not found') + `<a class="btn ghost" href="#payroll">Back</a>`;
  const L = p.lines || []; const draft = p.status === 'draft'; const T = k => sum(L, l => num(l[k]));
  return pageHead(`Payroll · ${fmtMonth(p.period)}`, `${statusPill(PR_STATUS[p.status])} <span class="muted">· ${L.length} people · pay date ${fmtDate(p.payDate)}${p.paidOn ? ' · paid ' + fmtDate(p.paidOn) + ' from ' + esc(acctName(p.paidFrom)) : ''}</span>`,
    draft ? `${btn('Delete run', 'prDelete', { id }, 'ghost danger-t w')}${btn('Save changes', 'prSave', { id }, 'ghost w')}${btn('Approve & post', 'prApprove', { id })}` : `${p.status === 'approved' ? btn('Back to draft', 'prReopen', { id }, 'ghost w') : ''}${btn('Pay PAYE', 'remit', { k: 'paye', period: p.period }, 'ghost w')}${btn('Pay SSNIT', 'remit', { k: 'ssnit', period: p.period }, 'ghost w')}${btn('Pay Tier 2', 'remit', { k: 'tier2', period: p.period }, 'ghost w')}${p.status === 'approved' ? btn('Mark salaries paid', 'prPaid', { id }) : ''}`, `<a href="#payroll" class="lnk">Payroll</a> /`) +
    `<div class="tiles small">${tile('Gross pay', fmtMoney(T('gross')), '')}${tile('PAYE', fmtMoney(T('paye') + T('bonusTax')), `To GRA by 15 ${fmtMonth(addDays(periodEnd(p.period), 1).slice(0, 7))}`)}${tile('SSNIT Tier 1 / Tier 2', `${fmtMoney(T('tier1'))}`, `Tier 2 ${fmtMoney(T('tier2'))} · by 14 ${fmtMonth(addDays(periodEnd(p.period), 1).slice(0, 7))}`)}${tile('Net to pay staff', fmtMoney(T('net')), `Total cost ${fmtMoney(T('cost'))}`, 'hero')}</div>` +
    (draft ? `<div class="banner info">Edit the amounts below; totals update as you type. <b>Save changes</b> keeps the draft. <b>Approve & post</b> records the payroll in your accounts.</div>` : '') +
    `<div class="tw" id="prgrid"><table class="dt prt"><thead><tr><th>Person</th>${PR_COLS.map(([, l]) => `<th class="num">${l}</th>`).join('')}<th class="num">Gross</th><th class="num">SSNIT 5.5%</th><th class="num">PAYE</th><th class="num">Net pay</th><th class="num">Employer 13%</th><th></th></tr></thead><tbody>${L.map((l, i) => `<tr data-i="${i}"><td><b>${esc(l.name)}</b><span class="muted small block">${esc(l.role || '')}</span></td>${PR_COLS.map(([k]) => `<td class="num">${draft ? `<input type="number" step="0.01" min="0" class="num prin" id="pr_${i}_${k}" data-k="${k}" value="${esc(num(l[k]) || '')}" aria-label="${esc(l.name)} ${k}">` : (num(l[k]) ? fmtMoney(l[k], { bare: true }) : '<span class="muted">—</span>')}</td>`).join('')}<td class="num" data-o="gross">${fmtMoney(l.gross, { bare: true })}</td><td class="num" data-o="ssnitEmp">${fmtMoney(l.ssnitEmp, { bare: true })}</td><td class="num" data-o="paye">${fmtMoney(num(l.paye) + num(l.bonusTax), { bare: true })}</td><td class="num" data-o="net"><b>${fmtMoney(l.net, { bare: true })}</b></td><td class="num" data-o="ssnitEr">${fmtMoney(l.ssnitEr, { bare: true })}</td><td><button class="btn ghost sm" data-act="payslip" data-run="${id}" data-staff="${l.staffId}">Payslip</button></td></tr>`).join('')}</tbody>
    <tfoot><tr><td>Total</td>${PR_COLS.map(([k]) => `<td class="num">${fmtMoney(T(k), { bare: true })}</td>`).join('')}<td class="num">${fmtMoney(T('gross'), { bare: true })}</td><td class="num">${fmtMoney(T('ssnitEmp'), { bare: true })}</td><td class="num">${fmtMoney(T('paye') + T('bonusTax'), { bare: true })}</td><td class="num">${fmtMoney(T('net'), { bare: true })}</td><td class="num">${fmtMoney(T('ssnitEr'), { bare: true })}</td><td></td></tr></tfoot></table></div>` +
    (draft && all('staff').some(s => s.status !== 'Former' && !L.some(l => l.staffId === s.id)) ? `<div class="inline-form"><label for="pradd">Add someone to this run</label><select id="pradd">${all('staff').filter(s => s.status !== 'Former' && !L.some(l => l.staffId === s.id)).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>${btn('Add', 'prAdd', { id }, 'ghost w')}</div>` : '') +
    `<p class="muted small">PAYE is worked out on basic + taxable allowances + commission − employee SSNIT. Bonus up to ${p.rates.bonusCapPct}% of annual basic is taxed at ${p.rates.bonusRate}% flat (checked per run, not cumulatively for the year). SSNIT uses basic salary within the insurable range.</p>`;
};
function readPayrunGrid(p) { const R = p.rates || payRates(); return (p.lines || []).map((l, i) => { const o = Object.assign({}, l); PR_COLS.forEach(([k]) => { const el = $(`#pr_${i}_${k}`); if (el) o[k] = num(el.value); }); return computePayLine(o, R); }); }
document.addEventListener('input', e => {
  if (!e.target.classList.contains('prin')) return; const id = route().param; const p = get('payruns', id); if (!p) return;
  const lines = readPayrunGrid(p); const i = +e.target.closest('tr').dataset.i; const l = lines[i]; const tr = e.target.closest('tr');
  const set = (k, v) => { const c = $(`[data-o="${k}"]`, tr); if (c) c.innerHTML = k === 'net' ? `<b>${fmtMoney(v, { bare: true })}</b>` : fmtMoney(v, { bare: true }); };
  set('gross', l.gross); set('ssnitEmp', l.ssnitEmp); set('paye', l.paye + l.bonusTax); set('net', l.net); set('ssnitEr', l.ssnitEr);
});
ACT.prSave = async el => { const p = get('payruns', el.dataset.id); await save('payruns', Object.assign({}, p, { lines: readPayrunGrid(p) })); toast('Draft saved'); };
ACT.prApprove = async el => { const p = get('payruns', el.dataset.id); const lines = readPayrunGrid(p); if (lines.some(l => l.net < 0)) return toast('Someone’s net pay is below zero. Reduce their deductions.', 'bad'); const ok = await ask({ title: `Approve ${fmtMonth(p.period)} payroll?`, body: `Net pay ${fmtMoney(sum(lines, l => l.net))}. This posts salaries, PAYE and SSNIT to your accounts.`, ok: 'Approve & post' }); if (!ok) return; await save('payruns', Object.assign({}, p, { lines, status: 'approved', approvedOn: todayISO() })); toast('Payroll approved'); };
ACT.prReopen = async el => { const p = get('payruns', el.dataset.id); await save('payruns', Object.assign({}, p, { status: 'draft' })); };
ACT.prDelete = async el => { const ok = await ask({ title: 'Delete this draft run?', ok: 'Delete', danger: true }); if (!ok) return; await removeRec('payruns', el.dataset.id); location.hash = 'payroll'; };
ACT.prAdd = async el => { const p = get('payruns', el.dataset.id); const sid = $('#pradd').value; const s = get('staff', sid); const sp = staffPay(sid); const lines = readPayrunGrid(p); lines.push(computePayLine({ staffId: sid, name: s.name, role: s.role || '', basic: num(sp.monthlyPay), allowTax: 0, allowNonTax: 0, commission: commissionFor(sid, p.period, sp.commissionRate), bonus: 0, advanceDeduct: 0, otherDeduct: 0 }, p.rates || payRates())); await save('payruns', Object.assign({}, p, { lines })); };
ENT._prpaid = { coll: null, label: 'Payment', title: () => 'Payment', size: 'sm', fields: [] };
ACT.prPaid = el => { const p = get('payruns', el.dataset.id); openForm('_prpaid', { paidOn: todayISO(), paidFrom: '1010' }, { title: `Pay ${fmtMonth(p.period)} salaries`, sub: `Net pay ${fmtMoney(sum(p.lines || [], l => num(l.net)))}`, okLabel: 'Mark paid', fields: [{ k: 'paidOn', label: 'Date paid', type: 'date', req: true }, { k: 'paidFrom', label: 'Paid from', type: 'select', req: true, opts: () => cashAccounts().map(a => [a.code, a.name]) }], onSave: r => save('payruns', Object.assign({}, get('payruns', p.id), { status: 'paid', paidOn: r.paidOn, paidFrom: r.paidFrom })) }); };
ACT.remit = el => {
  const k = el.dataset.k; const per = el.dataset.period; const b = balances('', todayISO());
  const map = { paye: ['2110', 'PAYE to GRA'], ssnit: ['2120', 'SSNIT Tier 1'], tier2: ['2130', 'Tier 2 pension to trustee'], vat: ['', ''] };
  const [acc, label] = map[k]; const runs = all('payruns').filter(r => r.period === per && r.status !== 'draft');
  const due = k === 'paye' ? sum(runs, r => sum(r.lines, l => num(l.paye) + num(l.bonusTax))) : k === 'ssnit' ? sum(runs, r => sum(r.lines, l => num(l.tier1))) : sum(runs, r => sum(r.lines, l => num(l.tier2)));
  const amt = r2(due || Math.max(0, b[acc] || 0));
  openForm('journals', { date: todayISO(), memo: `${label} · ${fmtMonth(per)}`, lines: [{ account: acc, description: label, debit: amt, credit: '' }, { account: '1010', description: 'Paid from', debit: '', credit: amt }] }, { title: `Record payment: ${label}`, sub: `Change the second line if you paid from cash or bank.` });
};
function payslipHtml(p, l) {
  const C = settings(); const row = (a, b) => num(b) ? `<tr><td>${a}</td><td class="num">${fmtMoney(b, { bare: true })}</td></tr>` : '';
  return `<article class="doc slip"><header class="dochead"><div class="docbrand">${MARK_SVG}<div><b>Adzesua</b> Connect<span>${esc(C.companyName)}</span></div></div><div class="docmeta"><h2>Payslip</h2><span class="mono">${fmtMonth(p.period)}</span></div></header>
  <div class="docparties"><div><span class="idk">Employee</span><b>${esc(l.name)}</b><span>${esc(l.role || '')}</span>${l.ssnitNo ? `<span>SSNIT ${esc(l.ssnitNo)}</span>` : ''}</div><div><span class="idk">Paid to</span><b>${esc(l.payTo || '—')}</b></div><div><span class="idk">Pay date</span><b>${fmtDate(p.paidOn || p.payDate)}</b></div></div>
  <div class="slipgrid"><table class="doct"><thead><tr><th>Earnings</th><th class="num">GH₵</th></tr></thead><tbody>${row('Basic salary', l.basic)}${row('Taxable allowances', l.allowTax)}${row('Non-taxable allowances', l.allowNonTax)}${row('Commission', l.commission)}${row('Bonus', l.bonus)}</tbody><tfoot><tr class="tt"><td>Gross pay</td><td class="num">${fmtMoney(l.gross, { bare: true })}</td></tr></tfoot></table>
  <table class="doct"><thead><tr><th>Deductions</th><th class="num">GH₵</th></tr></thead><tbody>${row(`SSNIT (${p.rates.ssnitEmpRate}%)`, l.ssnitEmp)}${row('PAYE income tax', l.paye)}${row('Bonus tax', l.bonusTax)}${row('Salary advance recovery', l.advanceDeduct)}${row('Other deductions', l.otherDeduct)}</tbody><tfoot><tr class="tt"><td>Total deductions</td><td class="num">${fmtMoney(l.gross - l.net, { bare: true })}</td></tr></tfoot></table></div>
  <table class="doct"><tfoot><tr class="due"><td>Net pay</td><td class="num">${fmtMoney(l.net)}</td></tr></tfoot></table>
  <p class="docnote small">Employer also paid SSNIT ${fmtMoney(l.ssnitEr)} (${p.rates.ssnitErRate}%) on your behalf. Taxable income ${fmtMoney(l.taxable)}.</p><footer class="docfoot">${esc(C.companyName)} · Confidential</footer></article>`;
}
ACT.payslip = el => { const p = get('payruns', el.dataset.run); const l = (p.lines || []).find(x => x.staffId === el.dataset.staff); if (!l) return; openModal(`<div class="mhead"><h2>Payslip · ${esc(l.name)}</h2><p class="muted">${fmtMonth(p.period)} · ${statusPill(PR_STATUS[p.status])}</p><button class="icbtn x" data-act="closeModal" aria-label="Close">×</button></div><div class="mbody"><div class="docwrap">${payslipHtml(p, l)}</div></div><div class="mfoot"><span class="tspace"></span>${btn(ic('dl') + ' Download', 'slipDl', { run: p.id, staff: l.staffId }, 'ghost')}</div>`, 'xl'); };
ACT.slipDl = el => { const p = get('payruns', el.dataset.run); const l = p.lines.find(x => x.staffId === el.dataset.staff); offerFile(`Payslip-${l.name.replace(/\s+/g, '-')}-${p.period}.html`, standaloneDoc(`Payslip ${l.name} ${fmtMonth(p.period)}`, payslipHtml(p, l))); };
function standaloneDoc(title, inner) { const css = [...document.styleSheets].map(ss => { try { return [...ss.cssRules].map(r => r.cssText).join('\n'); } catch (e) { return ''; } }).join('\n'); return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet"><style>${css}body{background:#fff;padding:24px}.doc{box-shadow:none;margin:0 auto}</style></head><body data-theme="light">${inner}<p style="text-align:center;font:12px Inter,sans-serif;color:#667">Open in a browser and press Ctrl+P (or ⌘P) to save as PDF or print.</p></body></html>`; }

/* ---------------- Tax & VAT ---------------- */
ENT.taxset = { coll: 'settings', label: 'VAT settings', title: () => 'VAT', size: 'sm', fields: [
  { k: 'vatRegistered', label: 'Adzesua Connect is VAT-registered', type: 'check' },
  { k: 'vatNo', label: 'VAT registration number (TIN)' },
  { k: 'vatRate', label: 'VAT %', type: 'number' }, { k: 'nhilRate', label: 'NHIL %', type: 'number' }, { k: 'getfundRate', label: 'GETFund levy %', type: 'number' },
] };
ACT.editTax = () => openForm('taxset', settings(), { onSave: saveSettings, noDelete: true, title: 'VAT settings', sub: 'Since 1 Jan 2026: VAT 15% + NHIL 2.5% + GETFund 2.5%, all on the same base and all claimable as input tax.' });
function lastWorkingDay(period) { let d = periodEnd(period); for (let i = 0; i < 4; i++) { const w = new Date(d + 'T00:00:00').getDay(); if (w !== 0 && w !== 6) break; d = addDays(d, -1); } return d; }
function nextMonth(period) { const [y, m] = period.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`; }
VIEWS.tax = () => {
  const s = settings(); const t = todayISO(); const b = balances('', t);
  const months = monthlySeries(12).map(m => m.key).reverse();
  const turnover12 = sum(all('sales').filter(x => saleLive(x) && x.date >= addDays(t, -365)), saleSubtotal);
  const vatRows = months.map(k => { const [f, e] = [k + '-01', periodEnd(k)]; const bl = balances(f, e); const outT = (bl['2101'] || 0) + (bl['2102'] || 0) + (bl['2103'] || 0); const inT = bl['1150'] || 0; const sales = sum(all('sales').filter(x => saleLive(x) && x.date >= f && x.date <= e && x.taxMode === 'vat'), saleSubtotal); return { k, sales, vat: bl['2101'] || 0, nhil: bl['2102'] || 0, get: bl['2103'] || 0, outT, inT, net: r2(outT - inT), due: lastWorkingDay(nextMonth(k)) }; });
  const payRows = months.map(k => { const runs = all('payruns').filter(r => r.period === k && r.status !== 'draft'); return { k, paye: sum(runs, r => sum(r.lines, l => num(l.paye) + num(l.bonusTax))), t1: sum(runs, r => sum(r.lines, l => num(l.tier1))), t2: sum(runs, r => sum(r.lines, l => num(l.tier2))), n: runs.length }; }).filter(r => r.n);
  const owed = [['2101', 'Output VAT'], ['2102', 'NHIL'], ['2103', 'GETFund levy'], ['1150', 'Input VAT & levies (to claim)'], ['2110', 'PAYE'], ['2120', 'SSNIT Tier 1'], ['2130', 'Tier 2 pension']];
  return pageHead('Tax & VAT', 'VAT on your sales, input VAT you can claim back, and payroll taxes due to GRA and SSNIT.', `${btn('VAT settings', 'editTax', {}, 'ghost w')}${s.vatRegistered ? btn('Record VAT payment', 'vatPay', {}, '') : ''}`) +
    (!s.vatRegistered ? `<div class="banner info"><b>Not VAT-registered.</b> Your sales show no VAT. Since January 2026 the registration threshold for businesses supplying goods is GH₵750,000 a year; check with GRA whether your services need registration. Your sales in the last 12 months: <b>${fmtMoney(turnover12)}</b> (${fmtNum(100 * turnover12 / 750000, 1)}% of GH₵750,000). Turn VAT on in <b>VAT settings</b> once you register.</div>` : '') +
    `<div class="tiles small">${tile('Net VAT owed', fmtMoney((b['2101'] || 0) + (b['2102'] || 0) + (b['2103'] || 0) - (b['1150'] || 0)), 'Output minus input')}${tile('PAYE owed', fmtMoney(b['2110'] || 0), 'By the 15th of the next month')}${tile('SSNIT owed', fmtMoney(b['2120'] || 0), 'By the 14th of the next month')}${tile('Tier 2 owed', fmtMoney(b['2130'] || 0), 'To your Tier 2 trustee')}</div>` +
    (s.vatRegistered ? panel('Monthly VAT returns', `<div class="tw"><table class="dt"><thead><tr><th>Month</th><th class="num">VAT-able sales</th><th class="num">VAT 15%</th><th class="num">NHIL</th><th class="num">GETFund</th><th class="num">Input claimed</th><th class="num">Net payable</th><th>File &amp; pay by</th></tr></thead><tbody>${vatRows.map(r => `<tr><td><b>${fmtMonth(r.k)}</b></td><td class="num">${fmtMoney(r.sales, { bare: true })}</td><td class="num">${fmtMoney(r.vat, { bare: true })}</td><td class="num">${fmtMoney(r.nhil, { bare: true })}</td><td class="num">${fmtMoney(r.get, { bare: true })}</td><td class="num">${fmtMoney(r.inT, { bare: true })}</td><td class="num"><b>${fmtMoney(r.net, { bare: true })}</b></td><td class="${r.due < t && r.net > 0 ? 'badt' : ''}">${fmtDate(r.due)}</td></tr>`).join('')}</tbody></table></div><p class="muted small">Returns are due by the last working day of the following month. File on the GRA Taxpayers' Portal.</p>`) : '') +
    panel('Payroll taxes by month', payRows.length ? `<div class="tw"><table class="dt"><thead><tr><th>Month</th><th class="num">PAYE</th><th>PAYE due</th><th class="num">SSNIT Tier 1</th><th class="num">Tier 2</th><th>SSNIT due</th><th></th></tr></thead><tbody>${payRows.map(r => `<tr><td><b>${fmtMonth(r.k)}</b></td><td class="num">${fmtMoney(r.paye, { bare: true })}</td><td>15 ${fmtMonth(nextMonth(r.k))}</td><td class="num">${fmtMoney(r.t1, { bare: true })}</td><td class="num">${fmtMoney(r.t2, { bare: true })}</td><td>14 ${fmtMonth(nextMonth(r.k))}</td><td>${btn('Pay PAYE', 'remit', { k: 'paye', period: r.k }, 'ghost sm w')} ${btn('Pay SSNIT', 'remit', { k: 'ssnit', period: r.k }, 'ghost sm w')} ${btn('Pay Tier 2', 'remit', { k: 'tier2', period: r.k }, 'ghost sm w')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">No approved payroll yet.</p>') +
    panel('Balances with GRA and SSNIT today', `<ul class="list acc">${owed.map(([c, l]) => `<li class="li click" data-act="go" data-to="account-${c}"><span class="mono muted">${c}</span><div class="lim"><b>${l}</b></div><span class="amt">${fmtMoney(b[c] || 0)}</span></li>`).join('')}</ul>`);
};
ACT.vatPay = () => { const b = balances('', todayISO()); const o = [['2101', b['2101'] || 0], ['2102', b['2102'] || 0], ['2103', b['2103'] || 0]]; const inp = b['1150'] || 0; const net = r2(sum(o, x => x[1]) - inp); openForm('journals', { date: todayISO(), memo: 'VAT return payment', lines: [...o.filter(x => x[1]).map(([a, v]) => ({ account: a, debit: r2(v), credit: '' })), ...(inp ? [{ account: '1150', debit: '', credit: r2(inp) }] : []), { account: '1020', description: 'Paid to GRA', debit: net < 0 ? -net : '', credit: net > 0 ? net : '' }] }, { title: 'Record VAT payment', sub: 'Clears output VAT and levies against input VAT. Adjust if you are paying for one month only.' }); };

/* ---------------- Support tickets ---------------- */
const TK_STATUS = ['Open', 'In progress', 'Waiting on school', 'Resolved', 'Closed'];
const TK_PRI = ['Urgent', 'High', 'Normal', 'Low'];
Object.assign(TONES, { Open: 'info', 'In progress': 'gold', 'Waiting on school': 'mute', Resolved: 'good', Closed: 'mute', Urgent: 'bad', High: 'gold', Normal: '', Low: 'mute' });
const nowLocal = () => { const d = new Date(); return `${todayISO()}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
ENT.tickets = {
  coll: 'tickets', label: 'Ticket', title: r => `${r.number || 'Ticket'} · ${r.subject || ''}`, size: 'lg',
  fields: [
    { k: 'subject', label: 'Problem', req: true, span: 2, ph: 'e.g. Main gate reader not reading cards' },
    { k: 'schoolId', label: 'School', type: 'ref', ref: 'schools' },
    { k: 'contactId', label: 'Reported by', type: 'ref', ref: 'contacts' },
    { k: 'category', label: 'Category', type: 'select', opts: ['Faulty reader / device', 'Card not working', 'Lost or damaged card', 'Wi-Fi outage or slow', 'Data package / payment', 'Billing', 'SSHMS / software', 'Training request', 'Other'], def: 'Faulty reader / device' },
    { k: 'priority', label: 'Priority', type: 'select', opts: TK_PRI, def: 'Normal', req: true },
    { k: 'status', label: 'Status', type: 'select', opts: TK_STATUS, def: 'Open', req: true },
    { k: 'assigneeId', label: 'Assigned to', type: 'select', opts: staffOpts },
    { k: 'deviceId', label: 'Device involved', type: 'ref', ref: 'devices' },
    { k: 'openedAt', label: 'Reported at', type: 'datetime-local', def: nowLocal },
    { k: 'description', label: 'Details', type: 'textarea', span: 2 },
    { k: 'resolution', label: 'What was done', type: 'textarea', span: 2 },
  ],
  beforeSave: r => { if (!r.number) r.number = nextNumber('tickets', 'number', 'TKT-'); if (['Resolved', 'Closed'].includes(r.status) && !r.resolvedAt) r.resolvedAt = nowLocal(); if (!['Resolved', 'Closed'].includes(r.status)) r.resolvedAt = ''; return r; },
};
const slaHours = p => num(settings()['sla' + (p || 'Normal')]) || 72;
const hoursSince = (a, b = new Date()) => (b - new Date(a)) / 3600000;
const tkOpen = t => !['Resolved', 'Closed'].includes(t.status);
function slaState(t) { if (!t.openedAt) return { label: '—', breach: false }; const limit = slaHours(t.priority); const used = tkOpen(t) ? hoursSince(t.openedAt) : hoursSince(t.openedAt, new Date(t.resolvedAt || t.openedAt)); const breach = used > limit; const left = limit - used; return { breach, used, label: tkOpen(t) ? (breach ? `Late by ${fmtDur(-left)}` : `${fmtDur(left)} left`) : `Fixed in ${fmtDur(used)}` }; }
const fmtDur = h => h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${fmtNum(h, h < 10 ? 1 : 0)} h` : `${fmtNum(h / 24, 1)} days`;
function slaBreaches() { return all('tickets').filter(t => tkOpen(t) && slaState(t).breach); }
VIEWS.support = () => {
  const f = vs('tk'); const tab = f.tab || 'open'; const T = all('tickets');
  const base = T.filter(t => (!f.school || t.schoolId === f.school) && (!f.who || t.assigneeId === f.who) && (!f.cat || t.category === f.cat) && textMatch(f.q, t.number, t.subject, t.description));
  const tabs = { open: base.filter(tkOpen), late: base.filter(t => tkOpen(t) && slaState(t).breach), mine: base.filter(t => tkOpen(t) && !t.assigneeId), done: base.filter(t => !tkOpen(t)), all: base };
  const res30 = T.filter(t => !tkOpen(t) && t.resolvedAt && t.resolvedAt.slice(0, 10) >= addDays(todayISO(), -30));
  if (!vs('tkT').sortK) Object.assign(vs('tkT'), { sortK: 'openedAt', dir: 'desc' });
  return pageHead('Support tickets', 'Problems schools report: faulty readers, card issues, Wi-Fi outages. Each priority has a target fix time.', `${btn('Response targets', 'editSla', {}, 'ghost w')}${btn(ic('plus') + ' New ticket', 'create', { k: 'tickets' })}`) +
    `<div class="tiles small">${tile('Open', fmtNum(T.filter(tkOpen).length), `${T.filter(t => tkOpen(t) && t.priority === 'Urgent').length} urgent`)}${tile('Past target', fmtNum(slaBreaches().length), 'Open and late', slaBreaches().length ? 'neg' : '')}${tile('Fixed in 30 days', fmtNum(res30.length), '')}${tile('Average fix time', res30.length ? fmtDur(sum(res30, t => hoursSince(t.openedAt, new Date(t.resolvedAt))) / res30.length) : '—', 'Last 30 days')}</div>` +
    `<div class="chiprow">${[['open', 'Open'], ['late', 'Past target'], ['mine', 'Unassigned'], ['done', 'Resolved'], ['all', 'All']].map(([k, l]) => `<button class="chipf ${tab === k ? 'on' : ''} ${k === 'late' && tabs.late.length ? 'alert' : ''}" data-act="chip" data-vsk="tk.tab" data-v="${k}">${l} <span>${tabs[k].length}</span></button>`).join('')}</div>` +
    toolbar({ t: 'tk', search: 'Search tickets', filters: [{ k: 'school', label: 'School', opts: all('schools').map(s => [s.id, s.name]) }, { k: 'who', label: 'Assigned', opts: staffOpts() }, { k: 'cat', label: 'Category', opts: ENT.tickets.fields[3].opts }] }) +
    dataTable({ id: 'tkT', rows: tabs[tab], rowAct: 'open', cols: [{ k: 'number', label: 'Ticket', f: r => `<b class="mono">${esc(r.number)}</b>` }, { k: 'subject', label: 'Problem', f: r => `<b>${esc(r.subject)}</b><span class="muted small block">${esc(r.category || '')}${r.schoolId ? ' · ' + esc(schoolShort(r.schoolId)) : ''}</span>` }, { k: 'priority', label: 'Priority', v: r => TK_PRI.indexOf(r.priority), f: r => statusPill(r.priority) }, { k: 'status', label: 'Status', f: r => statusPill(r.status) }, { k: 'assignee', label: 'Assigned', v: r => staffName(r.assigneeId), f: r => esc(staffName(r.assigneeId) || '—') }, { k: 'openedAt', label: 'Reported', f: r => fmtDate((r.openedAt || '').slice(0, 10)) }, { k: 'sla', label: 'Target', v: r => slaState(r).used || 0, f: r => { const s = slaState(r); return `<span class="${s.breach ? 'badt' : 'muted'}">${s.label}</span>`; } }], empty: empty(tab === 'late' ? 'Nothing is late' : 'No tickets here', 'Log every problem a school reports so nothing is forgotten.') }).replace(/data-act="open"/g, 'data-act="open" data-k="tickets"');
};
ENT.slaset = { coll: 'settings', label: 'Response targets', title: () => 'SLA', size: 'sm', fields: [{ k: 'slaUrgent', label: 'Urgent: fix within (hours)', type: 'number' }, { k: 'slaHigh', label: 'High (hours)', type: 'number' }, { k: 'slaNormal', label: 'Normal (hours)', type: 'number' }, { k: 'slaLow', label: 'Low (hours)', type: 'number' }] };
ACT.editSla = () => openForm('slaset', settings(), { onSave: saveSettings, noDelete: true, title: 'Response targets', sub: 'Promise these to schools in your service agreement.' });

/* ---------------- Projects ---------------- */
const PJ_STATUS = ['Planning', 'Active', 'On hold', 'Done', 'Cancelled'];
Object.assign(TONES, { Planning: 'info', 'On hold': 'mute', Done: 'good' });
const PJ_TEMPLATES = {
  'Smart card rollout': ['Agree scope and price with the head', 'Collect student data from SSHMS', 'Approve card design with the school', 'Order blank cards and lanyards', 'Print cards', 'Encode chips and link UIDs', 'Install gate readers', 'Train housemasters and security', 'Distribute cards to students', 'Go live: exeats on cards', 'Collect card fees'],
  'Wi-Fi installation': ['Site survey and coverage plan', 'Agree terms with the school', 'Order equipment', 'Fibre / internet connection installed', 'Install routers and access points', 'Test coverage in dorms and classrooms', 'Set up data packages and sellers', 'Launch to students'],
  'Other': [],
};
ENT.projects = {
  coll: 'projects', label: 'Project', title: r => r.name || 'Project', size: 'lg',
  fields: [
    { k: 'name', label: 'Project name', req: true, span: 2, ph: 'e.g. SWESCO smart card rollout' },
    { k: 'type', label: 'Type', type: 'select', opts: Object.keys(PJ_TEMPLATES), def: 'Smart card rollout', hideIf: r => !!r.id, help: 'Fills in a starter checklist you can change.' },
    { k: 'schoolId', label: 'School', type: 'ref', ref: 'schools' },
    { k: 'ownerId', label: 'Project lead', type: 'select', opts: staffOpts },
    { k: 'status', label: 'Status', type: 'select', opts: PJ_STATUS, def: 'Planning', req: true },
    { k: 'start', label: 'Start', type: 'date', def: () => todayISO() },
    { k: 'due', label: 'Target finish', type: 'date' },
    { k: 'budget', label: 'Budget (costs)', type: 'money' },
    { k: 'goal', label: 'What “done” looks like', type: 'textarea', span: 2 },
  ],
  beforeSave: r => { if (!r.id && !(r.tasks || []).length) r.tasks = (PJ_TEMPLATES[r.type] || []).map(title => ({ id: uid(), title, done: false })); return r; },
  afterSave: (r, isNew) => { if (isNew) location.hash = 'project-' + r.id; },
  afterDelete: () => { location.hash = 'projects'; },
};
const pjProgress = p => { const T = p.tasks || []; return T.length ? Math.round(100 * T.filter(t => t.done).length / T.length) : (p.status === 'Done' ? 100 : 0); };
const pjCost = id => r2(sum(all('expenses').filter(e => e.projectId === id), e => num(e.amount)) + sum(all('purchases').filter(p => p.projectId === id && p.status !== 'cancelled'), purchaseTotal));
VIEWS.projects = () => {
  const f = vs('pj'); const P = all('projects').filter(p => (!f.status || p.status === f.status) && textMatch(f.q, p.name, (get('schools', p.schoolId) || {}).name)); const t = todayISO();
  const act = all('projects').filter(p => p.status === 'Active');
  return pageHead('Projects', 'Rolling out cards or Wi-Fi at a school, step by step, with dates and costs.', btn(ic('plus') + ' New project', 'create', { k: 'projects' })) +
    `<div class="tiles small">${tile('Active', fmtNum(act.length), '')}${tile('Behind schedule', fmtNum(act.filter(p => p.due && p.due < t).length), 'Past target finish', act.some(p => p.due && p.due < t) ? 'neg' : '')}${tile('Planning', fmtNum(all('projects').filter(p => p.status === 'Planning').length), '')}${tile('Spent on active projects', fmtMoney(sum(act, p => pjCost(p.id))), `Budget ${fmtMoney(sum(act, p => num(p.budget)))}`)}</div>` +
    toolbar({ t: 'pj', search: 'Search projects', filters: [{ k: 'status', label: 'Status', opts: PJ_STATUS }] }) +
    (P.length ? `<div class="pjgrid">${P.sort((a, b) => PJ_STATUS.indexOf(a.status) - PJ_STATUS.indexOf(b.status)).map(p => { const pr = pjProgress(p); const late = p.due && p.due < t && !['Done', 'Cancelled'].includes(p.status); const next = (p.tasks || []).find(x => !x.done); return `<article class="pjcard" data-act="go" data-to="project-${p.id}" tabindex="0"><div class="pjh"><b>${esc(p.name)}</b>${statusPill(p.status)}</div><span class="muted small">${esc((get('schools', p.schoolId) || {}).name || '')}${p.ownerId ? ' · ' + esc(staffName(p.ownerId)) : ''}</span><div class="mini big"><span style="width:${pr}%"></span></div><div class="pjm"><span>${pr}% done</span><span class="${late ? 'badt' : 'muted'}">${p.due ? (late ? 'Late · ' : 'Due ') + fmtDate(p.due) : 'No date'}</span></div>${next ? `<span class="small">Next: ${esc(next.title)}</span>` : ''}${num(p.budget) ? `<span class="small muted">${fmtMoney(pjCost(p.id))} of ${fmtMoney(p.budget)} spent</span>` : ''}</article>`; }).join('')}</div>` : empty('No projects yet', 'Start one for the SWESCO card rollout. It comes with a ready-made checklist.', `<div class="row">${btn('New project', 'create', { k: 'projects', preset: JSON.stringify({ name: 'SWESCO smart card rollout', type: 'Smart card rollout' }) })}</div>`));
};
VIEWS.project = id => {
  const p = get('projects', id); if (!p) return pageHead('Not found') + `<a class="btn ghost" href="#projects">Back</a>`;
  const T = p.tasks || []; const pr = pjProgress(p); const t = todayISO(); const cost = pjCost(id);
  const ex = all('expenses').filter(e => e.projectId === id); const pu = all('purchases').filter(x => x.projectId === id);
  return pageHead(p.name, `${statusPill(p.status)} <span class="muted">· ${esc((get('schools', p.schoolId) || {}).name || 'No school')} · lead ${esc(staffName(p.ownerId) || 'not set')}</span>`, `${btn(ic('edit') + ' Edit', 'edit', { k: 'projects', id }, 'ghost')}${btn('Log a cost', 'create', { k: 'expenses', preset: JSON.stringify({ projectId: id, schoolId: p.schoolId || '' }) }, 'ghost w')}`, `<a href="#projects" class="lnk">Projects</a> /`) +
    `<div class="tiles small">${tile('Progress', `${pr}%`, `${T.filter(x => x.done).length} of ${T.length} steps`)}${tile('Timeline', p.due ? fmtDate(p.due) : '—', p.start ? `Started ${fmtDate(p.start)}` : '', p.due && p.due < t && p.status !== 'Done' ? 'neg' : '')}${tile('Spent', fmtMoney(cost), num(p.budget) ? `of ${fmtMoney(p.budget)} budget` : 'No budget set', num(p.budget) && cost > num(p.budget) ? 'neg' : '')}${tile('Open tickets', fmtNum(all('tickets').filter(x => tkOpen(x) && x.schoolId && x.schoolId === p.schoolId).length), 'At this school')}</div>` +
    `<div class="grid2">${panel('Checklist', `<ul class="list tasks">${T.map((x, i) => `<li class="li"><button class="chkbtn ${x.done ? 'on' : ''}" data-act="pjTask" data-id="${id}" data-i="${i}" aria-label="${x.done ? 'Mark not done' : 'Mark done'}" ${!APP.canWrite ? 'disabled' : ''}>${x.done ? ic('check', 12) : ''}</button><div class="lim"><b class="${x.done ? 'struck' : ''}">${esc(x.title)}</b>${x.ownerId || x.due ? `<span class="muted">${esc(staffName(x.ownerId))}${x.due ? ' · ' + fmtDate(x.due) : ''}</span>` : ''}</div><button class="icbtn" data-act="pjTaskDel" data-id="${id}" data-i="${i}" aria-label="Remove step">×</button></li>`).join('')}</ul>${APP.canWrite ? `<div class="inline-form" style="margin-top:10px"><label for="pjnew" class="sr">New step</label><input id="pjnew" placeholder="Add a step and press Enter"><select id="pjnewo" aria-label="Owner"><option value="">Owner</option>${staffOpts().map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select><input id="pjnewd" type="date" aria-label="Due date" style="max-width:160px">${btn('Add', 'pjAdd', { id }, 'ghost w')}</div>` : ''}`)}
    ${panel('Costs', ex.length + pu.length ? `<ul class="list">${ex.map(e => `<li class="li click" data-act="open" data-k="expenses" data-id="${e.id}"><div class="lim"><b>${esc(e.description)}</b><span class="muted">${fmtDate(e.date)} · ${esc(acctName(e.account))}</span></div><span class="amt">${fmtMoney(e.amount)}</span></li>`).join('')}${pu.map(x => `<li class="li click" data-act="open" data-k="purchases" data-id="${x.id}"><div class="lim"><b>${esc(x.number)} · ${esc((get('suppliers', x.supplierId) || {}).name || '')}</b><span class="muted">${fmtDate(x.date)} · purchase</span></div><span class="amt">${fmtMoney(purchaseTotal(x))}</span></li>`).join('')}</ul>` : '<p class="muted small">Pick this project on an expense or purchase to see it here.</p>')}</div>` +
    (p.goal ? panel('What “done” looks like', `<p style="margin:0;white-space:pre-wrap">${esc(p.goal)}</p>`) : '');
};
ACT.pjTask = async el => { const p = get('projects', el.dataset.id); const tasks = (p.tasks || []).map((x, i) => i === +el.dataset.i ? Object.assign({}, x, { done: !x.done, doneOn: !x.done ? todayISO() : '' }) : x); const all_ = tasks.length && tasks.every(x => x.done); await save('projects', Object.assign({}, p, { tasks, status: all_ && p.status === 'Active' ? 'Done' : (p.status === 'Planning' && tasks.some(x => x.done) ? 'Active' : p.status) })); };
ACT.pjTaskDel = async el => { const p = get('projects', el.dataset.id); await save('projects', Object.assign({}, p, { tasks: (p.tasks || []).filter((x, i) => i !== +el.dataset.i) })); };
ACT.pjAdd = async el => { const v = $('#pjnew').value.trim(); if (!v) return; const p = get('projects', el.dataset.id); await save('projects', Object.assign({}, p, { tasks: [...(p.tasks || []), { id: uid(), title: v, ownerId: $('#pjnewo').value, due: $('#pjnewd').value, done: false }] })); setTimeout(() => { const i = $('#pjnew'); i && i.focus(); }, 60); };
document.addEventListener('keydown', e => { if (e.target.id === 'pjnew' && e.key === 'Enter') { e.preventDefault(); const b = $('[data-act="pjAdd"]'); b && b.click(); } });

/* ---------------- Budgets ---------------- */
VIEWS.budgets = () => {
  const f = vs('bud'); const year = f.year || todayISO().slice(0, 4); const tab = f.tab || 'plan'; const doc = get('budgets', year) || { lines: {} };
  const A = accounts().filter(a => ['income', 'cogs', 'expense'].includes(a.type)); const years = [...new Set([todayISO().slice(0, 4), String(+todayISO().slice(0, 4) + 1), ...all('budgets').map(b => b.id)])].sort();
  const yrSel = `<label class="fsel"><span class="sr">Year</span><select id="bud-year" data-vs="bud.year">${years.map(y => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select></label>`;
  const tabs = `<div class="tabs" role="tablist">${[['plan', 'Plan'], ['vs', 'Budget vs actual']].map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" class="tab ${tab === k ? 'on' : ''}" data-act="chip" data-vsk="bud.tab" data-v="${k}">${l}</button>`).join('')}</div>`;
  const canEditB = APP.canWrite && perm('budgets') === 'e';
  let body = '';
  if (tab === 'plan') {
    const grp = Object.entries(groupBy(A, a => a.type));
    body = `<div class="tw budwrap"><table class="dt budt"><thead><tr><th>Account</th><th class="num">Year total</th>${MONTHS.map(m => `<th class="num">${m}</th>`).join('')}</tr></thead><tbody>${grp.map(([type, list]) => `<tr class="bsh"><td colspan="14">${ACCT_TYPES[type]}</td></tr>${list.map(a => { const v = (doc.lines || {})[a.code] || []; return `<tr><td><span class="mono muted">${a.code}</span> ${esc(a.name)}</td><td class="num"><input type="number" step="1" min="0" class="num budyr" data-code="${a.code}" aria-label="${esc(a.name)} year total" placeholder="${fmtNum(sum(v))}" ${canEditB ? '' : 'disabled'}></td>${MONTHS.map((m, i) => `<td class="num"><input type="number" step="1" min="0" class="num budm" data-code="${a.code}" data-m="${i}" value="${num(v[i]) || ''}" aria-label="${esc(a.name)} ${m}" ${canEditB ? '' : 'disabled'}></td>`).join('')}</tr>`; }).join('')}`).join('')}</tbody></table></div><p class="muted small">Type a year total to spread it evenly across the months, or fill months one by one. Save when done.</p>`;
  } else {
    const per = f.per || 'ytd'; const t = todayISO(); const curM = year === t.slice(0, 4) ? +t.slice(5, 7) : 12;
    const mIdx = per === 'ytd' ? [...Array(curM).keys()] : per === 'year' ? [...Array(12).keys()] : [+per];
    const from = `${year}-${pad(mIdx[0] + 1)}-01`, to = periodEnd(`${year}-${pad(mIdx[mIdx.length - 1] + 1)}`);
    const bal = balances(from, to);
    const rows = A.map(a => { const bud = sum(mIdx, i => num(((doc.lines || {})[a.code] || [])[i])); const act = bal[a.code] || 0; const fav = a.type === 'income' ? act - bud : bud - act; return { a, bud, act, var: fav, pct: bud ? 100 * act / bud : null }; }).filter(r => r.bud || r.act);
    const tot = type => { const L = rows.filter(r => r.a.type === type); return { bud: sum(L, r => r.bud), act: sum(L, r => r.act) }; };
    const ti = tot('income'), tc = tot('cogs'), te = tot('expense');
    body = `<div class="toolbar"><label class="fsel"><span class="sr">Period</span><select id="bud-per" data-vs="bud.per"><option value="ytd" ${per === 'ytd' ? 'selected' : ''}>Year to date</option><option value="year" ${per === 'year' ? 'selected' : ''}>Full year</option>${MONTHS.map((m, i) => `<option value="${i}" ${per === String(i) ? 'selected' : ''}>${m} ${year}</option>`).join('')}</select></label><span class="muted small">${fmtDate(from)} – ${fmtDate(to)}</span></div>
    <div class="tiles small">${tile('Revenue vs budget', fmtMoney(ti.act), `Budget ${fmtMoney(ti.bud)}${ti.bud ? ' · ' + fmtNum(100 * ti.act / ti.bud) + '%' : ''}`, ti.act < ti.bud ? 'warnt' : '')}${tile('Costs vs budget', fmtMoney(tc.act + te.act), `Budget ${fmtMoney(tc.bud + te.bud)}`, tc.act + te.act > tc.bud + te.bud && tc.bud + te.bud ? 'neg' : '')}${tile('Profit', fmtMoney(ti.act - tc.act - te.act), `Budgeted ${fmtMoney(ti.bud - tc.bud - te.bud)}`)}${tile('Accounts over budget', fmtNum(rows.filter(r => r.a.type !== 'income' && r.bud && r.act > r.bud).length), '')}</div>
    ${rows.length ? `<div class="tw"><table class="dt"><thead><tr><th>Account</th><th class="num">Budget</th><th class="num">Actual</th><th class="num">Difference</th><th>Used</th></tr></thead><tbody>${rows.map(r => `<tr class="click" data-act="go" data-to="account-${r.a.code}"><td><span class="mono muted">${r.a.code}</span> ${esc(r.a.name)}</td><td class="num">${fmtMoney(r.bud, { bare: true })}</td><td class="num">${fmtMoney(r.act, { bare: true })}</td><td class="num ${r.var < 0 ? 'badt' : 'up'}">${r.var >= 0 ? '+' : ''}${fmtMoney(r.var, { bare: true })}</td><td style="min-width:140px">${r.pct === null ? '<span class="muted small">No budget</span>' : `<div class="mini big"><span style="width:${Math.min(100, r.pct)}%;background:${(r.a.type === 'income' ? r.pct >= 100 : r.pct <= 100) ? 'var(--leaf)' : 'var(--bad)'}"></span></div><span class="small muted">${fmtNum(r.pct)}%</span>`}</td></tr>`).join('')}</tbody></table></div><p class="muted small">Green difference is good: more revenue or less cost than planned.</p>` : empty('No budget or activity for this period', 'Fill in the Plan tab first.')}`;
  }
  return pageHead(`Budget ${year}`, 'Plan monthly revenue and spending, then compare with what actually happened.', `${yrSel}${tab === 'plan' && canEditB ? btn('Copy last year’s actuals', 'budFromActual', { year }, 'ghost w') + btn('Save budget', 'budSave', { year }) : ''}`) + tabs + body;
};
document.addEventListener('change', e => { if (e.target.classList.contains('budyr')) { const v = num(e.target.value); const code = e.target.dataset.code; const each = Math.round(v / 12 * 100) / 100; $$(`.budm[data-code="${code}"]`).forEach((i, k) => (i.value = k === 11 ? r2(v - each * 11) : each)); e.target.value = ''; e.target.placeholder = fmtNum(v); } });
ACT.budSave = async el => { const lines = {}; $$('.budm').forEach(i => { const c = i.dataset.code; (lines[c] = lines[c] || Array(12).fill(0))[+i.dataset.m] = num(i.value); }); Object.keys(lines).forEach(c => { if (!lines[c].some(Boolean)) delete lines[c]; }); await save('budgets', { id: el.dataset.year, year: +el.dataset.year, lines }); toast('Budget saved'); };
ACT.budFromActual = async el => { const y = +el.dataset.year - 1; const lines = {}; accounts().filter(a => ['income', 'cogs', 'expense'].includes(a.type)).forEach(a => { const v = MONTHS.map((m, i) => r2(balances(`${y}-${pad(i + 1)}-01`, periodEnd(`${y}-${pad(i + 1)}`))[a.code] || 0)); if (v.some(Boolean)) lines[a.code] = v; }); if (!Object.keys(lines).length) return toast(`No actuals recorded in ${y} to copy.`, 'bad'); const ok = await ask({ title: `Replace the ${el.dataset.year} plan with ${y} actuals?`, ok: 'Copy' }); if (!ok) return; await save('budgets', { id: el.dataset.year, year: +el.dataset.year, lines }); toast('Copied. Adjust and save.'); };

/* ---------------- Fixed assets ---------------- */
const ASSET_CATS = { 'NFC readers': 36, 'Card printers': 48, 'Network equipment': 36, 'Computers & phones': 36, 'Furniture': 60, 'Vehicles & motorbikes': 60, 'Other': 36 };
Object.assign(TONES, { 'In use': 'good', Disposed: 'mute' });
ENT.assets = {
  coll: 'assets', label: 'Fixed asset', title: r => r.name || 'Asset', size: 'lg',
  fields: [
    { k: 'name', label: 'Asset', req: true, span: 2, ph: 'e.g. Card printer (Evolis Primacy)' },
    { k: 'category', label: 'Category', type: 'select', opts: Object.keys(ASSET_CATS), def: 'NFC readers', req: true },
    { k: 'tag', label: 'Asset tag / serial' },
    { k: 'acquiredOn', label: 'Date acquired', type: 'date', req: true, def: () => todayISO() },
    { k: 'cost', label: 'Cost', type: 'money', req: true },
    { k: 'lifeMonths', label: 'Useful life (months)', type: 'number', min: 1, help: 'Readers and network gear ~36 months, printers ~48, furniture ~60.' },
    { k: 'salvage', label: 'Value left at end of life', type: 'money', def: 0 },
    { k: 'funding', label: 'How it was paid for', type: 'select', req: true, def: 'recorded', opts: [['recorded', 'Already recorded as a purchase/expense to Equipment'], ['opening', 'Owned before the system (adds to capital)']] },
    { k: 'schoolId', label: 'Located at school', type: 'ref', ref: 'schools' },
    { k: 'deviceId', label: 'Linked device', type: 'ref', ref: 'devices' },
    { k: 'status', label: 'Status', type: 'select', opts: ['In use', 'Disposed'], def: 'In use' },
    { k: 'disposedOn', label: 'Disposed on', type: 'date', showIf: r => r.status === 'Disposed' },
    { k: 'proceeds', label: 'Sold for', type: 'money', showIf: r => r.status === 'Disposed' },
    { k: 'proceedsAcct', label: 'Money received into', type: 'select', def: '1010', opts: () => cashAccounts().map(a => [a.code, a.name]), showIf: r => r.status === 'Disposed' },
    { k: 'notes', label: 'Notes', type: 'textarea', span: 2 },
  ],
  onChange: (r, e) => { if (e && e.target && e.target.id === 'f_category') { const l = $('#f_lifeMonths'); if (l) l.value = ASSET_CATS[r.category] || 36; } },
  beforeSave: r => { if (!num(r.lifeMonths)) r.lifeMonths = ASSET_CATS[r.category] || 36; if (r.status !== 'Disposed') { r.disposedOn = ''; r.proceeds = ''; } else if (!r.disposedOn) r.disposedOn = todayISO(); return r; },
  validate: r => num(r.salvage) > num(r.cost) ? 'Value left cannot be more than cost.' : '',
};
function monthEnds(fromISO, toISO) { const out = []; if (!fromISO || !toISO) return out; let [y, m] = fromISO.slice(0, 7).split('-').map(Number); m++; if (m > 12) { m = 1; y++; } while (true) { const pe = periodEnd(`${y}-${pad(m)}`); if (pe > toISO) break; out.push(pe); m++; if (m > 12) { m = 1; y++; } } return out; }
function assetSchedule(a, asAt = todayISO()) {
  const life = num(a.lifeMonths) || 36; const monthly = r2((num(a.cost) - num(a.salvage)) / life);
  const end = a.status === 'Disposed' && a.disposedOn && a.disposedOn < asAt ? a.disposedOn : asAt;
  const months = monthEnds(a.acquiredOn, end).slice(0, life); let acc = 0;
  const rows = months.map((d, i) => { const amt = i === life - 1 ? r2(num(a.cost) - num(a.salvage) - acc) : monthly; acc = r2(acc + amt); return { date: d, amt, acc, nbv: r2(num(a.cost) - acc) }; });
  return { monthly, rows, acc, nbv: r2(num(a.cost) - acc), fully: rows.length >= life };
}
LEDGER_HOOKS.push(push => {
  all('assets').forEach(a => {
    if (a.funding === 'opening') push(a.acquiredOn, 'ASSET', `Asset brought in · ${a.name}`, [{ acct: '1500', dr: num(a.cost) }, { acct: '3000', cr: num(a.cost) }], 'asset', a.id);
    const sch = assetSchedule(a); sch.rows.forEach(r => push(r.date, 'DEP', `Depreciation · ${a.name}`, [{ acct: '6610', dr: r.amt }, { acct: '1510', cr: r.amt }], 'asset', a.id));
    if (a.status === 'Disposed' && a.disposedOn && a.disposedOn <= todayISO()) { const gain = r2(num(a.proceeds) - sch.nbv); push(a.disposedOn, 'ASSET', `Disposal · ${a.name}`, [{ acct: '1510', dr: sch.acc }, { acct: a.proceedsAcct || '1010', dr: num(a.proceeds) }, { acct: '6900', dr: gain < 0 ? -gain : 0 }, { acct: '1500', cr: num(a.cost) }, { acct: '4900', cr: gain > 0 ? gain : 0 }], 'asset', a.id); }
  });
});
VIEWS.assets = () => {
  const f = vs('fa'); const A = all('assets').filter(a => (!f.cat || a.category === f.cat) && (!f.status || a.status === f.status) && textMatch(f.q, a.name, a.tag)).map(a => Object.assign({}, a, { _s: assetSchedule(a) }));
  const live = all('assets').filter(a => a.status !== 'Disposed').map(a => assetSchedule(a)); const yS = todayISO().slice(0, 4) + '-01-01';
  return pageHead('Fixed assets', 'Readers, printers, routers, laptops: what they cost and what they are worth now after wear and tear.', btn(ic('plus') + ' Add asset', 'create', { k: 'assets' })) +
    `<div class="tiles small">${tile('Cost of assets in use', fmtMoney(sum(all('assets').filter(a => a.status !== 'Disposed'), a => num(a.cost))), `${live.length} assets`)}${tile('Book value now', fmtMoney(sum(live, s => s.nbv)), 'Cost less depreciation')}${tile('Depreciation this year', fmtMoney(balances(yS, todayISO())['6610'] || 0), 'Posted monthly')}${tile('Monthly charge', fmtMoney(sum(live.filter(s => !s.fully), s => s.monthly)), 'Straight line')}</div>` +
    toolbar({ t: 'fa', search: 'Search assets', filters: [{ k: 'cat', label: 'Category', opts: Object.keys(ASSET_CATS) }, { k: 'status', label: 'Status', opts: ['In use', 'Disposed'] }] }) +
    dataTable({ id: 'fa', rows: A, rowAct: 'assetView', cols: [{ k: 'name', label: 'Asset', f: r => `<b>${esc(r.name)}</b><span class="muted small block">${esc(r.category)}${r.tag ? ' · ' + esc(r.tag) : ''}</span>` }, { k: 'acquiredOn', label: 'Acquired', f: r => fmtDate(r.acquiredOn) }, { k: 'cost', label: 'Cost', cls: 'num', v: r => num(r.cost), f: r => fmtMoney(r.cost) }, { k: 'acc', label: 'Depreciated', cls: 'num', v: r => r._s.acc, f: r => fmtMoney(r._s.acc) }, { k: 'nbv', label: 'Book value', cls: 'num', v: r => r._s.nbv, f: r => `<b>${fmtMoney(r._s.nbv)}</b>` }, { k: 'life', label: 'Life used', v: r => r._s.rows.length / (num(r.lifeMonths) || 36), f: r => `<div class="mini big" style="min-width:90px"><span style="width:${Math.min(100, 100 * r._s.rows.length / (num(r.lifeMonths) || 36))}%"></span></div><span class="small muted">${r._s.rows.length} of ${r.lifeMonths} months</span>` }, { k: 'where', label: 'Where', v: r => schoolShort(r.schoolId), f: r => esc(r.schoolId ? schoolShort(r.schoolId) : 'Office') }, { k: 'status', label: 'Status', f: r => statusPill(r.status || 'In use') }], empty: empty('No fixed assets yet', 'Register equipment that lasts more than a year: card printers, gate readers, routers, laptops. Depreciation is posted for you every month.') });
};
ACT.assetView = el => { const a = get('assets', el.dataset.id); const s = assetSchedule(a); openModal(`<div class="mhead"><h2>${esc(a.name)}</h2><p class="muted">${esc(a.category)} · bought ${fmtDate(a.acquiredOn)} for ${fmtMoney(a.cost)} · ${statusPill(a.status || 'In use')}</p><button class="icbtn x" data-act="closeModal" aria-label="Close">×</button></div><div class="mbody"><div class="tiles small">${tile('Book value', fmtMoney(s.nbv))}${tile('Depreciated', fmtMoney(s.acc))}${tile('Per month', fmtMoney(s.monthly))}</div>${s.rows.length ? `<div class="tw"><table class="dt"><thead><tr><th>Month</th><th class="num">Charge</th><th class="num">To date</th><th class="num">Book value</th></tr></thead><tbody>${s.rows.slice().reverse().slice(0, 24).map(r => `<tr><td>${fmtMonth(r.date.slice(0, 7))}</td><td class="num">${fmtMoney(r.amt, { bare: true })}</td><td class="num">${fmtMoney(r.acc, { bare: true })}</td><td class="num">${fmtMoney(r.nbv, { bare: true })}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">Depreciation starts at the end of the first full month after purchase.</p>'}</div><div class="mfoot"><span class="tspace"></span>${btn(ic('edit') + ' Edit', 'assetEdit', { id: a.id }, 'ghost')}</div>`, 'lg'); };
ACT.assetEdit = el => { closeModal(); openForm('assets', get('assets', el.dataset.id)); };

/* ---------------- source links for new ledger sources ---------------- */
const _srcOpen = ACT.srcOpen;
ACT.srcOpen = el => { const { src, id } = el.dataset; if (src === 'payrun') { if (isAdminLevel()) location.hash = 'payrun-' + id; return; } if (src === 'advance') return openForm('advances', get('advances', id)); if (src === 'asset') return ACT.assetView({ dataset: { id } }); return _srcOpen(el); };

/* ---------------- Dashboard extension ---------------- */
const _dash = VIEWS.dashboard;
VIEWS.dashboard = () => {
  const t = todayISO(); const late = slaBreaches(); const openTk = all('tickets').filter(tkOpen);
  const pj = all('projects').filter(p => p.status === 'Active'); const away = all('leave').filter(l => l.status === 'Approved' && l.from <= t && l.to >= t);
  const pendingLeave = all('leave').filter(l => l.status === 'Requested').length;
  const b = balances('', t); const prev = t.slice(0, 7); const lastP = (() => { const [y, m] = prev.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`; })();
  const deadlines = [];
  if (isAdminLevel() && (b['2110'] || 0) > 0.004) deadlines.push([`${prev}-15`, `PAYE for ${fmtMonth(lastP)} to GRA`, b['2110']]);
  if (isAdminLevel() && ((b['2120'] || 0) + (b['2130'] || 0)) > 0.004) deadlines.push([`${prev}-14`, `SSNIT & Tier 2 for ${fmtMonth(lastP)}`, (b['2120'] || 0) + (b['2130'] || 0)]);
  if (settings().vatRegistered) deadlines.push([lastWorkingDay(prev), `VAT return for ${fmtMonth(lastP)}`, (b['2101'] || 0) + (b['2102'] || 0) + (b['2103'] || 0) - (b['1150'] || 0)]);
  docAlerts().forEach(({ s, d }) => deadlines.push([d.expires, `${s.name}: ${d.title} expires`, null]));
  all('staff').filter(s => s.status !== 'Former' && s.endDate && s.endDate >= t && s.endDate <= addDays(t, 60)).forEach(s => deadlines.push([s.endDate, `${s.name}'s contract ends`, null]));
  deadlines.sort((a, b2) => a[0].localeCompare(b2[0]));
  const ops = `<div class="tiles small">${tile('Open support tickets', fmtNum(openTk.length), late.length ? `<span class="badt">${late.length} past target</span>` : 'All within target', late.length ? 'neg' : '')}${tile('Active projects', fmtNum(pj.length), pj.slice(0, 2).map(p => `${esc(p.name)} ${pjProgress(p)}%`).join(' · ') || 'None running')}${tile('Away today', fmtNum(away.length), away.map(l => esc(staffName(l.staffId))).join(', ') || (pendingLeave ? `${pendingLeave} leave requests waiting` : 'Everyone in'))}${tile('Next deadline', deadlines.length ? fmtDate(deadlines[0][0]) : '—', deadlines.length ? esc(deadlines[0][1]) : 'Nothing due', deadlines.length && deadlines[0][0] < t ? 'neg' : '')}</div>`;
  const dl = deadlines.length ? panel('Deadlines & compliance', `<ul class="list">${deadlines.slice(0, 6).map(([d, l, amt]) => `<li class="li"><div class="lim"><b>${esc(l)}</b><span class="muted">${fmtDate(d)}</span></div>${amt !== null ? `<span class="amt">${fmtMoney(amt)}</span>` : ''}${d < t ? pill('Late', 'bad') : d <= addDays(t, 7) ? pill('This week', 'gold') : ''}</li>`).join('')}</ul>`, `<a class="lnk sm" href="#tax">Tax</a>`) : '';
  const tk = openTk.length ? panel('Support queue', `<ul class="list">${openTk.sort((a, c) => TK_PRI.indexOf(a.priority) - TK_PRI.indexOf(c.priority)).slice(0, 5).map(x => { const s = slaState(x); return `<li class="li click" data-act="open" data-k="tickets" data-id="${x.id}"><div class="lim"><b>${esc(x.subject)}</b><span class="muted">${esc(x.number)} · ${esc(schoolShort(x.schoolId))}${x.assigneeId ? ' · ' + esc(staffName(x.assigneeId)) : ''}</span></div>${statusPill(x.priority)}<span class="small ${s.breach ? 'badt' : 'muted'}">${s.label}</span></li>`; }).join('')}</ul>`, `<a class="lnk sm" href="#support">All tickets</a>`) : '';
  if (seesMoney()) return _dash() + ops + (dl || tk ? `<div class="grid2">${dl || ''}${tk || ''}</div>` : '');
  /* lighter dashboard for roles without finance */
  const hr = new Date().getHours(); const nm = APP.me && APP.me.name ? ', ' + APP.me.name.split(' ')[0] : '';
  const myTasks = all('activities').filter(a => !a.done && (!a.ownerId || true)).sort((a, c) => (a.due || '9').localeCompare(c.due || '9')).slice(0, 8);
  const t0 = todayISO(); const [ms0] = monthRange(0); const live0 = all('sales').filter(saleLive);
  const salesTiles = (allowed('sales') || allowed('pipeline')) ? `<div class="tiles small">${allowed('sales') ? tile('Sold this month', fmtMoney(sum(live0.filter(x => x.date >= ms0 && x.date <= t0), saleTotal)), 'Invoices and receipts') + tile('Owed by schools', fmtMoney(sum(live0.filter(x => x.kind !== 'receipt'), saleBalance)), `${live0.filter(x => saleStatus(x) === 'Overdue').length} overdue invoices`) : ''}${allowed('pipeline') ? (() => { const od = all('deals').filter(d => !['Won', 'Lost'].includes(d.stage)); return tile('Open opportunities', fmtNum(od.length), `Weighted ${fmtMoney(sum(od, d => num(d.value) * (DEAL_STAGES.find(x => x[0] === d.stage) || [0, 0])[1] / 100))}`) + tile('Won this year', fmtNum(all('deals').filter(d => d.stage === 'Won' && (d.updatedAt || '').startsWith(t0.slice(0, 4))).length), 'Opportunities'); })() : ''}</div>` : '';
  return pageHead(`${hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'}${nm}`, `${esc(settings().companyName)} · ${fmtDate(t)} · ${esc(ROLE_LABEL[myRole()])}`, allowed('activities') ? btn(ic('plus') + ' Activity', 'create', { k: 'activities' }) : '') + salesTiles + ops +
    `<div class="grid2">${allowed('activities') ? panel('Coming up', myTasks.length ? `<ul class="list">${myTasks.map(a => `<li class="li"><button class="chkbtn" data-act="toggleDone" data-id="${a.id}" aria-label="Mark done"></button><div class="lim" data-act="open" data-k="activities" data-id="${a.id}"><b>${esc(a.subject)}</b><span class="muted">${esc(a.type)} · ${fmtDate(a.due)}${a.ownerId ? ' · ' + esc(staffName(a.ownerId)) : ''}</span></div></li>`).join('')}</ul>` : '<p class="muted small">Nothing open.</p>') : ''}${allowed('support') ? tk : ''}</div>`;
};

/* ---------------- School page: tickets & projects ---------------- */
const _school = VIEWS.school;
VIEWS.school = id => { const html = _school(id); if (!get('schools', id)) return html; const tk = all('tickets').filter(t => t.schoolId === id).sort((a, b) => (b.openedAt || '').localeCompare(a.openedAt || '')); const pj = all('projects').filter(p => p.schoolId === id); const pre = JSON.stringify({ schoolId: id });
  return html + `<div class="grid2">${panel('Support tickets', tk.length ? `<ul class="list">${tk.slice(0, 6).map(x => `<li class="li click" data-act="open" data-k="tickets" data-id="${x.id}"><div class="lim"><b>${esc(x.subject)}</b><span class="muted">${esc(x.number)} · ${fmtDate((x.openedAt || '').slice(0, 10))}</span></div>${statusPill(x.status)}</li>`).join('')}</ul>` : '<p class="muted small">No tickets from this school.</p>', btn(ic('plus', 14) + ' Ticket', 'create', { k: 'tickets', preset: pre }, 'ghost sm w'))}${panel('Projects', pj.length ? `<ul class="list">${pj.map(p => `<li class="li click" data-act="go" data-to="project-${p.id}"><div class="lim"><b>${esc(p.name)}</b><span class="muted">${pjProgress(p)}% · due ${fmtDate(p.due)}</span></div>${statusPill(p.status)}</li>`).join('')}</ul>` : '<p class="muted small">No projects here yet.</p>', btn(ic('plus', 14) + ' Project', 'create', { k: 'projects', preset: pre }, 'ghost sm w'))}</div>`; };

/* ---------------- Setup: team access ---------------- */
const _setup = VIEWS.setup;
function accessMatrix() {
  const groups = NAV.filter(([g]) => g).map(([g, items]) => [g, items.filter(([k]) => k !== 'setup')]);
  const R = Object.keys(ROLES); const cell = v => v === 'e' ? '<span class="pm e" title="View & edit">Edit</span>' : v === 'v' ? '<span class="pm v" title="View only">View</span>' : '<span class="pm n" title="Hidden">—</span>';
  return `<div class="tw"><table class="dt matrix"><thead><tr><th>Page</th>${R.map(r => `<th class="c">${esc(ROLE_LABEL[r].replace(' (Admin)', '').replace(' (read-only)', ''))}</th>`).join('')}</tr></thead><tbody>${groups.map(([g, items]) => `<tr class="bsh"><td colspan="${R.length + 1}">${esc(g)}</td></tr>${items.map(([k, l]) => `<tr><td>${esc(l)}${k === 'payroll' ? ' <span class="muted small">(Editor share needed)</span>' : ''}</td>${R.map(r => `<td class="c">${cell(k === 'dashboard' ? (ROLES[r].dashboard || 'v') : ROLES[r][k])}</td>`).join('')}</tr>`).join('')}`).join('')}<tr><td>Setup, prices & roles</td>${R.map(r => `<td class="c">${cell(ROLES[r].setup)}</td>`).join('')}</tr></tbody></table></div>`;
}
VIEWS.setup = () => {
  const mem = all('members'); resolveNames(mem.map(m => m.id)); const admin = myRole() === 'Admin';
  const roleSel = (id, cur, dis) => `<select id="${id}" ${dis ? 'disabled' : ''}>${Object.keys(ROLES).map(r => `<option value="${r}" ${cur === r ? 'selected' : ''}>${esc(ROLE_LABEL[r])}</option>`).join('')}</select>`;
  const staffFor = m => all('staff').find(s => s.userId === m.id);
  const access = window.ADZ_PLATFORM === 'firebase' ? fbAccessPanel(admin, roleSel) : panel('Team access', `<p class="small" style="margin-top:0">1. Share this page from its claude.ai menu: <b>Editor</b> for people who handle payroll (Finance & Accounts, HR), <b>Contributor</b> for everyone else, <b>Viewer</b> for auditors and board members. 2. Add them here and pick their role.</p>
    <ul class="list"><li class="li"><div class="lim"><b>${esc((APP.me && APP.me.name) || 'You')}</b><span class="muted">Owner</span></div>${pill(ROLE_LABEL.Admin, 'good')}</li>${mem.filter(m => m.id !== APP.uid).map(m => { const st = staffFor(m); const r = LEGACY_ROLE[m.role] || m.role; return `<li class="li"><div class="lim"><b>${esc(NAMES[m.id] || m.label || 'Someone')}</b><span class="muted">${st ? esc(st.role || '') : ''}${['Finance', 'HR'].includes(r) ? ' · needs Editor share for payroll' : ''}</span></div><label class="sr" for="role-${m.id}">Role</label>${roleSel('role-' + m.id, r, !admin).replace('<select', `<select data-act-change="setRole" data-id="${m.id}"`)}${btn('Remove', 'rmMember', { id: m.id }, 'ghost sm danger-t w')}</li>`; }).join('')}</ul>
    ${admin && APP.user && APP.user.search ? `<div class="inline-form" style="margin-top:10px"><label for="memq">Add a person</label><input id="memq" placeholder="Search people this page is shared with" autocomplete="off">${roleSel('memrole', 'BizDev', false)}</div><div id="memres" class="picklist"></div>` : (APP.offline ? '<p class="muted small">Open this page in claude.ai to manage access.</p>' : '')}
    <p class="muted small">Payroll, pay details and salary advances are locked in the database to you and Editors. Everything else follows the role below: pages a role cannot see are hidden, and view-only pages cannot be changed.</p>`);
  const roles = panel('Roles', `<ul class="list">${Object.keys(ROLES).map(r => { const who = all('staff').filter(s => s.accessRole === r && s.status !== 'Former').map(s => s.name); return `<li class="li"><div class="lim"><b>${esc(ROLE_LABEL[r])}</b><span class="muted">${esc(ROLE_DESC[r])}</span>${who.length ? `<span class="small">Assigned: ${esc(who.join(', '))}</span>` : ''}</div></li>`; }).join('')}</ul>`);
  const rates = panel('Tax, payroll & service settings', `<dl class="kv sm"><dt>VAT</dt><dd>${settings().vatRegistered ? `Registered${settings().vatNo ? ' · ' + esc(settings().vatNo) : ''} · ${settings().vatRate}% + NHIL ${settings().nhilRate}% + GETFund ${settings().getfundRate}%` : 'Not registered'}</dd><dt>Payroll</dt><dd>PAYE bands effective Sept 2026 · SSNIT ${settings().ssnitEmpRate}% + ${settings().ssnitErRate}%</dd><dt>Support targets</dt><dd>Urgent ${settings().slaUrgent} h · High ${settings().slaHigh} h · Normal ${settings().slaNormal} h · Low ${settings().slaLow} h</dd><dt>Annual leave</dt><dd>${settings().annualLeaveDefault} working days default</dd></dl><div class="row wrap">${btn('VAT', 'editTax', {}, 'ghost sm w')}${isAdminLevel() ? btn('Payroll rates', 'editPayRates', {}, 'ghost sm w') : ''}${btn('Support targets', 'editSla', {}, 'ghost sm w')}${btn('Leave default', 'editLeaveDef', {}, 'ghost sm w')}</div>`);
  return _setup() + `<div class="grid2">${access}${roles}</div>` + panel('Access matrix', accessMatrix()) + rates;
};
ENT.leavedef = { coll: 'settings', label: 'Leave', title: () => 'Leave', size: 'sm', fields: [{ k: 'annualLeaveDefault', label: 'Default annual leave (working days)', type: 'number', min: 0, help: 'Ghana’s Labour Act minimum is 15 working days a year.' }] };
ACT.editLeaveDef = () => openForm('leavedef', settings(), { onSave: saveSettings, noDelete: true, title: 'Annual leave' });
document.addEventListener('change', async e => { if (e.target.dataset.actChange === 'setRole') { const m = get('members', e.target.dataset.id); try { await save('members', Object.assign({}, m, { role: e.target.value })); toast('Role updated'); } catch (err) { toast(err.message, 'bad'); } } });
ACT.rmMember = async el => { const ok = await ask({ title: 'Remove this person’s role?', body: 'They keep whatever sharing access you gave them on claude.ai but will only see the Viewer pages. Remove their access from the share menu too.', ok: 'Remove', danger: true }); if (ok) await removeRec('members', el.dataset.id); };
let memTimer;
document.addEventListener('input', e => {
  if (e.target.id !== 'memq') return; clearTimeout(memTimer); const q = e.target.value;
  memTimer = setTimeout(async () => { const box = $('#memres'); if (!box) return; try { const hits = await APP.user.search(q); box.innerHTML = (hits || []).filter(h => h.id !== APP.uid).slice(0, 8).map(h => { const st = all('staff').find(x => x.name && h.name && (x.name.toLowerCase() === h.name.toLowerCase() || h.name.toLowerCase().includes(x.name.toLowerCase().split(' ')[0]))); return `<button class="gr" data-act="addMember" data-id="${esc(h.id)}" data-name="${esc(h.name || '')}" data-staff="${st ? st.id : ''}"><span class="grl">${esc(h.name || 'Someone')}</span>${st ? `<span class="grs">Team: ${esc(st.name)} · suggested ${esc(ROLE_LABEL[st.accessRole] || '')}</span>` : (h.guest ? '<span class="grs">Guest</span>' : '')}</button>`; }).join('') || '<p class="muted small">Nobody found. Share the page with them first.</p>'; } catch (err) { box.innerHTML = '<p class="muted small">Search is not available here.</p>'; } }, 200);
});
document.addEventListener('focusin', e => { if (e.target.id === 'memq' && !e.target.value) e.target.dispatchEvent(new Event('input', { bubbles: true })); });
ACT.addMember = async el => { const st = get('staff', el.dataset.staff); const role = (st && st.accessRole && $('#memrole').value === 'BizDev' && st.accessRole) || $('#memrole').value; await save('members', { id: el.dataset.id, role, staffId: st ? st.id : '' }); if (st && st.userId !== el.dataset.id) await save('staff', Object.assign({}, st, { userId: el.dataset.id })); NAMES[el.dataset.id] = el.dataset.name; toast(`${el.dataset.name || 'Person'} added as ${ROLE_LABEL[role]}`); };


/* ---------------- Firebase (Adzesua HQ on GitHub): invitations & sign-out ---------------- */
ACT.signOut = async () => { const ok = await ask({ title: 'Sign out of Adzesua HQ?', ok: 'Sign out' }); if (ok && window.ADZ_SIGNOUT) window.ADZ_SIGNOUT(); };
const hqLink = () => location.href.split('#')[0];
function fbAccessPanel(admin, roleSel) {
  const ownerUid = window.ADZ_SESSION && window.ADZ_SESSION.ownerUid;
  const mem = all('members').sort((a, b) => (a.id === ownerUid ? -1 : b.id === ownerUid ? 1 : (a.name || '').localeCompare(b.name || '')));
  const memberEmails = new Set(mem.map(m => (m.email || '').toLowerCase()));
  const pending = all('invites').filter(i => !memberEmails.has((i.id || '').toLowerCase()));
  const staffOptsHtml = `<option value="">Not linked</option>${all('staff').filter(s => s.status !== 'Former').map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}`;
  return panel('Team access', `<p class="small" style="margin-top:0">Members sign in at <b>${esc(hqLink())}</b> with their own email and password. Invite someone below, then send them the link: they choose <b>Create your account</b> with the invited email and get the role you picked.</p>
    <div class="row wrap" style="margin:0 0 6px">${btn(ic('copy') + ' Copy link', 'copyHqLink', {}, 'ghost sm')}</div>
    <ul class="list">${mem.map(m => { const isOwner = m.id === ownerUid; const st = get('staff', m.staffId); return `<li class="li"><div class="lim"><b>${esc(m.name || m.email || 'Member')}</b><span class="muted">${esc(m.email || '')}${st ? ' · ' + esc(st.role || st.name) : ''}${isOwner ? ' · Owner' : ''}</span></div>${isOwner ? pill(ROLE_LABEL.Admin, 'good') : `<label class="sr" for="role-${m.id}">Role</label>${roleSel('role-' + m.id, LEGACY_ROLE[m.role] || m.role, !admin).replace('<select', `<select data-act-change="setRole" data-id="${m.id}"`)}${btn('Remove', 'fbRemove', { id: m.id }, 'ghost sm danger-t w')}`}</li>`; }).join('')}
    ${pending.map(i => `<li class="li"><div class="lim"><b>${esc(i.name || i.id)}</b><span class="muted">${esc(i.id)} · invited ${fmtDate((i.invitedAt || '').slice(0, 10))}, not joined yet</span></div>${pill(ROLE_LABEL[i.role] || i.role, 'gold')}${btn('Message', 'inviteMsg', { id: i.id }, 'ghost sm')}${btn('Cancel', 'inviteCancel', { id: i.id }, 'ghost sm danger-t w')}</li>`).join('')}</ul>
    ${admin ? `<div class="invite"><h3>Invite a member</h3><div class="fgrid"><div class="fld"><label for="invName">Name</label><input id="invName" placeholder="e.g. Sharon Fafali Aku"></div><div class="fld"><label for="invEmail">Email</label><input id="invEmail" type="email" placeholder="name@example.com"></div><div class="fld"><label for="invStaff">Team record</label><select id="invStaff">${staffOptsHtml}</select></div><div class="fld"><label for="invRole">Role</label>${roleSel('invRole', 'BizDev', false)}</div></div><div class="row">${btn('Send invitation', 'inviteSend')}</div></div>` : ''}`);
}
document.addEventListener('change', e => { if (e.target.id === 'invStaff') { const st = get('staff', e.target.value); if (st) { if (st.accessRole && $('#invRole')) $('#invRole').value = st.accessRole; if ($('#invName') && !$('#invName').value) $('#invName').value = st.name; if ($('#invEmail') && !$('#invEmail').value && st.email) $('#invEmail').value = st.email; } } });
ACT.copyHqLink = () => copyText(hqLink(), 'Link copied');
ACT.inviteSend = async () => {
  const email = ($('#invEmail').value || '').trim().toLowerCase(); const name = $('#invName').value.trim(); const role = $('#invRole').value; const staffId = $('#invStaff').value;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('Enter a valid email address.', 'bad');
  if (all('members').some(m => (m.email || '').toLowerCase() === email)) return toast('That person is already a member.', 'bad');
  await save('invites', { id: email, email, name, role, staffId, invitedAt: nowISO(), invitedBy: APP.uid || '' });
  if (staffId) { const st = get('staff', staffId); if (st && (st.accessRole !== role || (!st.email && email))) await save('staff', Object.assign({}, st, { accessRole: role, email: st.email || email })); }
  toast(`Invitation saved for ${email}`); ACT.inviteMsg({ dataset: { id: email } });
};
ACT.inviteMsg = el => { const i = get('invites', el.dataset.id); if (!i) return; const first = (i.name || '').split(' ')[0]; copyText(`Hi${first ? ' ' + first : ''}, you've been added to Adzesua HQ, our company workspace, as ${ROLE_LABEL[i.role] || i.role}.\n\n1. Open ${hqLink()}\n2. Tap "Create your account"\n3. Use this email: ${i.id}\n4. Choose a password (at least 8 characters)\n\nKeep the link private. It is for Adzesua Connect staff only.`, 'Invitation message copied. Paste it into WhatsApp or email.'); };
ACT.inviteCancel = async el => { const ok = await ask({ title: 'Cancel this invitation?', ok: 'Cancel invitation', danger: true }); if (ok) await removeRec('invites', el.dataset.id); };
ACT.fbRemove = async el => { const m = get('members', el.dataset.id); const ok = await ask({ title: `Remove ${esc(m.name || m.email)}?`, body: 'They will no longer be able to open Adzesua HQ. Their login still exists but leads nowhere. You can invite them again later.', ok: 'Remove access', danger: true }); if (!ok) return; await removeRec('members', m.id); if (m.email && get('invites', m.email.toLowerCase())) await removeRec('invites', m.email.toLowerCase()); toast('Access removed'); };
