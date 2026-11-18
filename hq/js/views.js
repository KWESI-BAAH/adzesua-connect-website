'use strict';
/* =========================================================
   Adzesua OS — pages, router, workflows
   ========================================================= */

const NAV = [
  ['Overview', [['dashboard', 'Dashboard']]],
  ['Smart cards', [['cards', 'Card programme'], ['card-registry', 'Card registry'], ['devices', 'Readers & devices']]],
  ['Customers', [['schools', 'Schools'], ['contacts', 'Contacts'], ['pipeline', 'Pipeline'], ['activities', 'Activities'], ['support', 'Support tickets']]],
  ['Delivery', [['projects', 'Projects'], ['wifi', 'Wi-Fi data sales']]],
  ['Money', [['sales', 'Invoices & receipts'], ['expenses', 'Expenses'], ['purchases', 'Purchases'], ['budgets', 'Budgets'], ['tax', 'Tax & VAT'], ['reports', 'Reports'], ['ledger', 'Accounts'], ['journal', 'Journal']]],
  ['People', [['team', 'Team & departments'], ['leave', 'Leave'], ['payroll', 'Payroll']]],
  ['Assets & stock', [['inventory', 'Inventory'], ['assets', 'Fixed assets'], ['suppliers', 'Suppliers']]],
  ['', [['setup', 'Setup']]],
];
const ROUTE_PARENT = { school: 'schools', sale: 'sales', item: 'inventory', account: 'ledger', staff: 'team', payrun: 'payroll', project: 'projects' };
function route() {
  const h = (location.hash || '#dashboard').slice(1) || 'dashboard';
  const m = h.match(/^(school|sale|item|account|staff|payrun|project)-(.+)$/);
  return m ? { name: m[1], param: m[2], nav: ROUTE_PARENT[m[1]] } : { name: h, nav: h };
}
window.addEventListener('hashchange', () => { document.body.classList.remove('navopen'); $('#main').scrollTop = 0; window.scrollTo(0, 0); scheduleRender(); });

const VIEWS = {};
let PAGE_TITLE = '';
const pageHead = (title, sub = '', actions = '', crumbs = '') => { PAGE_TITLE = title; return `<header class="phead">${crumbs ? `<div class="crumbs">${crumbs}</div>` : ''}<div class="phrow"><div><h1>${esc(title)}</h1>${sub ? `<p class="psub">${sub}</p>` : ''}</div><div class="pact">${actions}</div></div></header>`; };
const tile = (label, value, sub = '', cls = '') => `<div class="tile ${cls}"><span class="tl">${esc(label)}</span><span class="tv">${value}</span>${sub ? `<span class="ts">${sub}</span>` : ''}</div>`;
const panel = (title, body, actions = '', cls = '') => `<section class="panel ${cls}"><div class="ph"><h2>${esc(title)}</h2><div class="pa">${actions}</div></div><div class="pb">${body}</div></section>`;
const delta = (cur, prev) => { if (!prev && !cur) return '<span class="muted">No change</span>'; if (!prev) return '<span class="up">New this month</span>'; const d = (cur - prev) / Math.abs(prev) * 100; return `<span class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${fmtNum(Math.abs(d))}%</span> <span class="muted">vs last month</span>`; };
const waLink = p => { const d = String(p || '').replace(/\D/g, ''); if (!d) return ''; const n = d.startsWith('0') ? '233' + d.slice(1) : d; return `https://wa.me/${n}`; };
const phoneCell = (p, wa) => p ? `<span class="nowrap">${esc(p)}</span>${(wa || p) ? ` <a class="wa" href="${waLink(wa || p)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" aria-label="Open WhatsApp chat">WhatsApp</a>` : ''}` : '<span class="muted">—</span>';
const staffName = id => (get('staff', id) || {}).name || '';
const monthRange = (offset = 0) => { const d = new Date(); const x = new Date(d.getFullYear(), d.getMonth() + offset, 1); const l = new Date(x.getFullYear(), x.getMonth() + 1, 0); return [`${x.getFullYear()}-${pad(x.getMonth() + 1)}-01`, `${l.getFullYear()}-${pad(l.getMonth() + 1)}-${pad(l.getDate())}`]; };
const productBy = cat => all('products').find(p => p.category === cat && p.active !== false);
const cardRevenueAccounts = ['4000', '4010', '4020'];
const isLiveCard = c => !['Replaced'].includes(c.status);
const renewedThisYear = c => (c.renewals || []).includes(settings().academicYear);
const schoolShort = id => { const s = get('schools', id); return s ? (s.code || s.name) : '—'; };

/* ---------- shell ---------- */
function navHtml(active) {
  const overdueTasks = all('activities').filter(a => !a.done && a.due && a.due < todayISO()).length;
  const overdueInv = all('sales').filter(s => saleLive(s) && saleStatus(s) === 'Overdue').length;
  const low = lowStock().length;
  const badge = { activities: overdueTasks, sales: overdueInv, inventory: low, support: typeof slaBreaches === 'function' ? slaBreaches().length : 0, leave: all('leave').filter(l => l.status === 'Requested').length };
  return NAV.filter(([, items]) => typeof allowed !== 'function' || items.some(([k]) => allowed(k))).map(([g, items]) => `<div class="ng">${g ? `<span class="ngl">${esc(g)}</span>` : ''}${items.filter(([k]) => typeof allowed !== 'function' || allowed(k)).map(([k, l]) => `<a href="#${k}" class="nl ${active === k ? 'on' : ''}" ${active === k ? 'aria-current="page"' : ''}><span>${esc(l)}</span>${badge[k] ? `<span class="nb" title="Needs attention">${badge[k]}</span>` : ''}</a>`).join('')}</div>`).join('');
}
function banners() {
  const b = [];
  if (APP.offline) b.push(`<div class="banner warn">Your records could not be reached from this view. Open this page in claude.ai while signed in to load and save data.</div>`);
  if (APP.loadNote) b.push(`<div class="banner warn">${esc(APP.loadNote)}</div>`);
  if (!APP.canWrite && !APP.offline) b.push(`<div class="banner info">You have view-only access. Ask the administrator if you need to make changes.</div>`);
  if (APP.busy) b.push(`<div class="banner info"><b>${esc(APP.busy.label)}</b> ${APP.busy.done} of ${APP.busy.total}<div class="prog"><span style="width:${100 * APP.busy.done / Math.max(1, APP.busy.total)}%"></span></div></div>`);
  if (!APP.ready && !APP.offline) b.push(`<div class="banner info loading">Loading your records…</div>`);
  return b.join('');
}
function render() {
  const r = route();
  $('#nav').innerHTML = navHtml(r.nav);
  if (typeof renderQmenu === 'function') renderQmenu();
  const me = APP.me && APP.me.name; $('#whoami').textContent = me ? me : (APP.offline ? 'Not connected' : 'Signed in');
  const ae = document.activeElement; const fid = ae && ae.id && $('#main').contains(ae) ? ae.id : null; let ss = null; try { ss = fid ? ae.selectionStart : null; } catch (e) { }
  const V = VIEWS[r.name] || VIEWS.dashboard; let html;
  try { html = (typeof allowed === 'function' && !allowed(r.nav)) ? pageHead('Not part of your role') + empty('This page is not part of your role', `You are set up as <b>${esc(ROLE_LABEL[myRole()])}</b>. Ask the owner to change your role in Setup → Team access.`, `<a class="btn ghost" href="#dashboard">Go to dashboard</a>`) : V(r.param); } catch (e) { console.error(e); html = pageHead('Something went wrong') + `<div class="banner bad">This page could not be shown: ${esc(e.message)}. Go back to the <a href="#dashboard" class="lnk">dashboard</a>.</div>`; }
  const ro = typeof perm === 'function' && perm(r.nav) === 'v' && r.nav !== 'dashboard' ? `<div class="banner info">View only: your role (${esc(ROLE_LABEL[myRole()])}) can see this page but not change it.</div>` : '';
  $('#main').innerHTML = `<div class="page">${banners()}${ro}${html}</div>`;
  document.title = `${PAGE_TITLE ? PAGE_TITLE + ' · ' : ''}Adzesua OS`;
  if (fid) { const el = document.getElementById(fid); if (el) { el.focus(); try { if (ss != null) el.setSelectionRange(ss, ss); } catch (e) { } } }
}
ACT.navToggle = () => document.body.classList.toggle('navopen');

/* ---------- global search & quick create ---------- */
function searchAll(q) {
  if (!q || q.trim().length < 2) return [];
  const out = []; const add = (type, label, sub, to, act) => out.length < 14 && out.push({ type, label, sub, to, act });
  all('schools').filter(s => textMatch(q, s.name, s.code, s.town, s.district)).forEach(s => add('School', s.name, `${s.status || ''} · ${s.town || s.region || ''}`, 'school-' + s.id));
  all('cards').filter(c => textMatch(q, c.studentName, c.indexNo, c.cardNo, c.uid)).slice(0, 6).forEach(c => add('Card', c.studentName, `${c.cardNo || ''} · ${schoolShort(c.schoolId)}`, null, `card:${c.id}`));
  all('contacts').filter(c => textMatch(q, c.name, c.phone, c.role)).forEach(c => add('Contact', c.name, `${c.role || ''} · ${(get('schools', c.schoolId) || {}).name || ''}`, null, `contacts:${c.id}`));
  all('sales').filter(s => textMatch(q, s.number, s.customer, (get('schools', s.schoolId) || {}).name)).forEach(s => add(s.kind === 'receipt' ? 'Receipt' : 'Invoice', s.number, `${fmtMoney(saleTotal(s))} · ${saleStatus(s)}`, 'sale-' + s.id));
  all('items').filter(i => textMatch(q, i.name, i.sku)).forEach(i => add('Stock', i.name, i.category || '', 'item-' + i.id));
  all('suppliers').filter(s => textMatch(q, s.name, s.platform)).forEach(s => add('Supplier', s.name, s.platform || '', null, `suppliers:${s.id}`));
  all('deals').filter(d => textMatch(q, d.title)).forEach(d => add('Opportunity', d.title, d.stage || '', null, `deals:${d.id}`));
  return out;
}
function renderSearch() {
  const q = $('#gsearch').value; const res = searchAll(q); const box = $('#gresults');
  if (!q || q.trim().length < 2) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = res.length ? res.map((r, i) => `<button class="gr" data-act="gopen" data-to="${esc(r.to || '')}" data-open="${esc(r.act || '')}" ${i === 0 ? 'data-first' : ''}><span class="grt">${esc(r.type)}</span><span class="grl">${esc(r.label)}</span><span class="grs">${esc(r.sub)}</span></button>`).join('') : `<p class="muted gnone">No matches for “${esc(q)}”.</p>`;
}
ACT.gopen = el => { $('#gsearch').value = ''; $('#gresults').hidden = true; if (el.dataset.to) location.hash = el.dataset.to; else { const [k, id] = el.dataset.open.split(':'); if (k === 'card') openCard(id); else openForm(k, get(k, id)); } };
document.addEventListener('input', e => { if (e.target.id === 'gsearch') renderSearch(); });
document.addEventListener('keydown', e => { if (e.target.id === 'gsearch' && e.key === 'Enter') { const f = $('#gresults [data-first]'); f && f.click(); } if (e.target.id === 'gsearch' && e.key === 'Escape') { e.target.value = ''; $('#gresults').hidden = true; } });
document.addEventListener('click', e => { if (!e.target.closest('.gsearch')) { const b = $('#gresults'); if (b) b.hidden = true; } if (!e.target.closest('.qnew')) { const m = $('#qmenu'); if (m) m.hidden = true; } });
ACT.qnew = () => { const m = $('#qmenu'); m.hidden = !m.hidden; };
ACT.create = el => { $('#qmenu').hidden = true; const k = el.dataset.k; const preset = el.dataset.preset ? JSON.parse(el.dataset.preset) : {}; if (k === 'wifiLog') return openWifiLog(preset); openForm(k, preset); };
ACT.edit = el => openForm(el.dataset.k, get(el.dataset.k, el.dataset.id));
ACT.open = el => { const k = el.dataset.k || el.closest('[data-k]').dataset.k; openForm(k, get(k, el.dataset.id)); };

/* =================== DASHBOARD =================== */
VIEWS.dashboard = () => {
  const t = todayISO(); const [ms] = monthRange(0); const [ps, pe] = monthRange(-1);
  const pm = pnl(ms, t), pl = pnl(ps, pe), py = pnl(t.slice(0, 4) + '-01-01', t);
  const cash = cashPosition(); const cashTotal = sum(cash, x => x.amount);
  const recv = balances('', t)['1100'] || 0; const ap = balances('', t)['2000'] || 0;
  const cards = all('cards').filter(isLiveCard); const active = cards.filter(c => ['Active', 'Issued'].includes(c.status)).length;
  const deals = all('deals').filter(d => !['Won', 'Lost'].includes(d.stage));
  const prob = s => (DEAL_STAGES.find(x => x[0] === s) || [0, 0])[1];
  const weighted = sum(deals, d => num(d.value) * prob(d.stage) / 100);
  const hr = new Date().getHours(); const greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  const nm = APP.me && APP.me.name ? ', ' + APP.me.name.split(' ')[0] : '';
  const tasks = all('activities').filter(a => !a.done && (!a.due || a.due <= addDays(t, 7))).sort((a, b) => (a.due || '9').localeCompare(b.due || '9')).slice(0, 7);
  const batches = all('batches').filter(b => b.stage !== 'Activated').sort((a, b) => BATCH_STAGES.indexOf(a.stage) - BATCH_STAGES.indexOf(b.stage));
  const unpaid = all('sales').filter(s => saleLive(s) && s.kind !== 'receipt' && saleBalance(s) > 0.004).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')).slice(0, 6);
  const low = lowStock();
  const series = monthlySeries(6);
  const streams = py.income.filter(x => x.amount > 0).map(x => ({ label: x.name, value: x.amount }));
  const schools = all('schools'); const byStatus = groupBy(schools, s => s.status || 'Prospect');
  const attention = [];
  const od = all('activities').filter(a => !a.done && a.due && a.due < t).length; if (od) attention.push(`<a href="#activities" class="att bad"><b>${od}</b> overdue ${od === 1 ? 'activity' : 'activities'}</a>`);
  const oi = all('sales').filter(s => saleLive(s) && saleStatus(s) === 'Overdue'); if (oi.length) attention.push(`<a href="#sales" class="att bad"><b>${oi.length}</b> overdue ${oi.length === 1 ? 'invoice' : 'invoices'} · ${fmtMoney(sum(oi, saleBalance))}</a>`);
  if (low.length) attention.push(`<a href="#inventory" class="att warn"><b>${low.length}</b> stock ${low.length === 1 ? 'item' : 'items'} to reorder</a>`);
  const transit = all('purchases').filter(p => p.status === 'shipped').length; if (transit) attention.push(`<a href="#purchases" class="att info"><b>${transit}</b> ${transit === 1 ? 'order' : 'orders'} in transit</a>`);
  if (!num(settings().renewalFee)) attention.push(`<a href="#setup" class="att warn">Set your yearly exeat renewal fee</a>`);
  return pageHead(`${greet}${nm}`, `${esc(settings().companyName)} · ${fmtDate(t)}`, `${btn(ic('plus') + ' New invoice', 'create', { k: 'sales' })}${btn('Log expense', 'create', { k: 'expenses' }, 'ghost w')}`) +
    (attention.length ? `<div class="attn">${attention.join('')}</div>` : '') +
    `<div class="tiles">
      ${tile('Cash, MoMo & bank', fmtMoney(cashTotal), cash.map(c => `${esc(c.name.replace(' (MoMo)', ''))} ${fmtMoney(c.amount)}`).join(' · '), 'hero')}
      ${tile('Revenue this month', fmtMoney(pm.totalIncome), delta(pm.totalIncome, pl.totalIncome))}
      ${tile('Profit this year', fmtMoney(py.net), `Revenue ${fmtMoney(py.totalIncome)} · Costs ${fmtMoney(py.totalCogs + py.totalExpense)}`, py.net < 0 ? 'neg' : '')}
      ${tile('Owed to you', fmtMoney(recv), ap > 0 ? `You owe suppliers ${fmtMoney(ap)}` : 'Unpaid invoices')}
    </div>
    <div class="tiles small">
      ${tile('Student cards', fmtNum(cards.length), `${fmtNum(active)} issued or active`)}
      ${tile('Schools', fmtNum(schools.length), ['Customer', 'Pilot', 'Engaged', 'Prospect'].filter(k => byStatus[k]).map(k => `${byStatus[k].length} ${k.toLowerCase()}`).join(' · ') || 'Add your first school')}
      ${tile('Open opportunities', fmtNum(deals.length), `Weighted ${fmtMoney(weighted)}`)}
      ${tile('Stock value', fmtMoney(balances('', t)['1200'] || 0), `${all('items').length} items tracked`)}
    </div>
    <div class="grid2">
      ${panel('Revenue and costs · last 6 months', series.some(s => s.income || s.costs) ? barChart({ labels: series.map(s => fmtMonth(s.key)), series: [{ name: 'Revenue', color: 'var(--c1)', values: series.map(s => s.income) }, { name: 'Costs', color: 'var(--c2)', values: series.map(s => s.costs) }] }) : empty('No transactions yet', 'Revenue and costs appear here once you record sales and expenses.'), `<a class="lnk sm" href="#reports">Full report</a>`)}
      ${panel(`Revenue by stream · ${t.slice(0, 4)}`, hbars(streams), '')}
    </div>
    <div class="grid3">
      ${panel('Coming up', tasks.length ? `<ul class="list">${tasks.map(a => `<li class="li"><button class="chkbtn" data-act="toggleDone" data-id="${a.id}" aria-label="Mark done" ${!APP.canWrite ? 'disabled' : ''}></button><div class="lim" data-act="open" data-k="activities" data-id="${a.id}"><b>${esc(a.subject)}</b><span class="muted">${esc(a.type || '')}${a.schoolId ? ' · ' + esc((get('schools', a.schoolId) || {}).name || '') : ''}${a.ownerId ? ' · ' + esc(staffName(a.ownerId)) : ''}</span></div><span class="due ${a.due && a.due < t ? 'bad' : a.due === t ? 'warn' : ''}">${a.due ? (a.due < t ? 'Overdue · ' : a.due === t ? 'Today · ' : '') + fmtDate(a.due) : 'No date'}</span></li>`).join('')}</ul>` : '<p class="muted small">Nothing due this week.</p>', btn(ic('plus', 14) + ' Add', 'create', { k: 'activities' }, 'ghost sm w'))}
      ${panel('Card batches in progress', batches.length ? `<ul class="list">${batches.map(b => { const n = all('cards').filter(c => c.batchId === b.id).length; return `<li class="li click" data-act="batch" data-id="${b.id}"><div class="lim"><b>${esc(b.name)}</b><span class="muted">${esc(schoolShort(b.schoolId))} · ${fmtNum(n)}${b.qty ? ' of ' + fmtNum(b.qty) : ''} students registered</span></div>${statusPill(b.stage)}</li>`; }).join('')}</ul>` : '<p class="muted small">No batches in progress.</p>', `<a class="lnk sm" href="#cards">Programme</a>`)}
      ${panel('Waiting for payment', unpaid.length ? `<ul class="list">${unpaid.map(s => `<li class="li click" data-act="go" data-to="sale-${s.id}"><div class="lim"><b>${esc(s.number)} · ${esc((get('schools', s.schoolId) || {}).name || s.customer || '')}</b><span class="muted">Due ${fmtDate(s.dueDate)}</span></div><span class="amt">${fmtMoney(saleBalance(s))}</span></li>`).join('')}</ul>` : '<p class="muted small">Every invoice is paid.</p>', `<a class="lnk sm" href="#sales">All sales</a>`)}
    </div>`;
};
ACT.toggleDone = async el => { const a = get('activities', el.dataset.id); if (!a) return; await save('activities', Object.assign({}, a, { done: !a.done, doneAt: !a.done ? todayISO() : '' })); toast(a.done ? 'Reopened' : 'Marked done'); };

/* =================== SMART CARD PROGRAMME =================== */
VIEWS.cards = () => {
  const s = settings(); const ay = s.academicYear; const t = todayISO();
  const cards = all('cards').filter(isLiveCard);
  const active = cards.filter(c => ['Active', 'Issued'].includes(c.status));
  const linked = cards.filter(c => c.uid).length; const fee = cards.filter(c => c.feePaid).length; const ren = active.filter(renewedThisYear).length;
  const b = balances('', t); const rev = sum(cardRevenueAccounts, a => b[a] || 0); const prodCost = b['5000'] || 0;
  const margin = num(s.cardPrice) - num(s.cardCost);
  const byStage = groupBy(all('batches'), x => x.stage || 'Data collection');
  const schoolRows = all('schools').filter(sc => (sc.services || []).includes('Smart Card') || cards.some(c => c.schoolId === sc.id)).map(sc => {
    const cs = cards.filter(c => c.schoolId === sc.id); const act = cs.filter(c => ['Active', 'Issued'].includes(c.status));
    const r = sum(all('sales').filter(x => saleLive(x) && x.schoolId === sc.id).flatMap(x => x.lines || []).filter(l => cardRevenueAccounts.includes(l.account)), l => num(l.qty) * num(l.price));
    return { id: sc.id, name: sc.name, status: sc.status, total: cs.length, active: act.length, linked: cs.filter(c => c.uid).length, fee: cs.filter(c => c.feePaid).length, ren: act.filter(renewedThisYear).length, rev: r, enrol: num(sc.enrollment) };
  });
  return pageHead('Smart card programme', `One NFC card per student: ID, gate check and digital exeats. Academic year ${esc(ay)}.`, `${btn(ic('plus') + ' New batch', 'create', { k: 'batches' })}${btn('Import students', 'importCards', {}, 'ghost w')}${btn(ic('nfc') + ' Tap a card', 'scan', {}, 'ghost')}`) +
    (!num(s.renewalFee) ? `<div class="banner warn">The yearly exeat renewal fee is not set yet. <a class="lnk" href="#setup">Set it in Setup</a> before recording renewals.</div>` : '') +
    `<div class="tiles">
      ${tile('Cards registered', fmtNum(cards.length), `${fmtNum(linked)} linked to a chip`, 'hero')}
      ${tile('Issued or active', fmtNum(active.length), `${fmtNum(cards.filter(c => c.status === 'Pending print').length)} waiting to print`)}
      ${tile(`Renewed for ${ay}`, active.length ? `${fmtNum(ren)} <small>/ ${fmtNum(active.length)}</small>` : '0', active.length ? `${fmtNum(100 * ren / active.length)}% of active cards` : 'No active cards yet')}
      ${tile('Card revenue to date', fmtMoney(rev), `Fees paid on ${fmtNum(fee)} cards · production cost ${fmtMoney(prodCost)}`)}
    </div>
    <section class="panel"><div class="ph"><h2>Batches</h2><div class="pa"><span class="muted small">From data collection to activation at the gate</span></div></div>
      <div class="kanban">${BATCH_STAGES.map(st => { const list = byStage[st] || []; return `<div class="kcol"><div class="kh"><span>${esc(st)}</span><span class="kc">${list.length}</span></div>${list.map(bt => { const n = all('cards').filter(c => c.batchId === bt.id).length; const q = num(bt.qty); const i = BATCH_STAGES.indexOf(st); return `<div class="kcard" data-act="batch" data-id="${bt.id}" tabindex="0"><b>${esc(bt.name)}</b><span class="muted">${esc(schoolShort(bt.schoolId))}${bt.design ? ' · ' + esc(bt.design) : ''}</span>${q ? `<div class="mini"><span style="width:${Math.min(100, 100 * n / q)}%"></span></div><span class="small muted">${fmtNum(n)} of ${fmtNum(q)} students · ${fmtMoney(q * num(bt.unitPrice))}</span>` : `<span class="small muted">${fmtNum(n)} students registered</span>`}<div class="kmove">${i > 0 ? `<button class="icbtn" data-act="batchMove" data-id="${bt.id}" data-d="-1" aria-label="Move back" ${!APP.canWrite ? 'disabled' : ''}>‹</button>` : '<span></span>'}${i < BATCH_STAGES.length - 1 ? `<button class="icbtn" data-act="batchMove" data-id="${bt.id}" data-d="1" aria-label="Move forward" ${!APP.canWrite ? 'disabled' : ''}>›</button>` : ''}</div></div>`; }).join('') || '<div class="kempty">None</div>'}</div>`; }).join('')}</div></section>
    <div class="grid2">
      ${panel('Schools on the programme', dataTable({ id: 'progSchools', rows: schoolRows, rowAct: 'go-school', cols: [{ k: 'name', label: 'School', f: r => `<b>${esc(r.name)}</b>` }, { k: 'status', label: 'Status', f: r => statusPill(r.status) }, { k: 'total', label: 'Cards', cls: 'num', f: r => fmtNum(r.total) + (r.enrol ? `<span class="muted small"> / ${fmtNum(r.enrol)}</span>` : '') }, { k: 'active', label: 'Active', cls: 'num', f: r => fmtNum(r.active) }, { k: 'ren', label: `Renewed ${ay}`, cls: 'num', f: r => fmtNum(r.ren) }, { k: 'rev', label: 'Revenue', cls: 'num', f: r => fmtMoney(r.rev) }], empty: empty('No schools on the programme', 'Tick “Smart Card” under Services on a school to list it here.') }), '', 'span2')}
    </div>
    <div class="grid2">
      ${panel('Unit economics', `<dl class="kv"><dt>Price per card (Form 1)</dt><dd>${fmtMoney(s.cardPrice)}</dd><dt>Cost per card</dt><dd>${fmtMoney(s.cardCost)}</dd><dt>Margin per card</dt><dd><b>${fmtMoney(margin)}</b> <span class="muted">${s.cardPrice ? fmtNum(100 * margin / s.cardPrice) : 0}%</span></dd><dt>Yearly exeat renewal</dt><dd>${num(s.renewalFee) ? fmtMoney(s.renewalFee) : '<span class="pill gold">Not set</span>'}</dd><dt>Replacement card</dt><dd>${fmtMoney(s.replacementFee)}</dd></dl><p class="muted small">Change prices in <a class="lnk" href="#setup">Setup</a>. A school of 1,000 Form 1 students at these prices earns ${fmtMoney(1000 * margin)} in card margin${num(s.renewalFee) ? ` plus ${fmtMoney(1000 * num(s.renewalFee))} a year in renewals` : ''}.</p>`)}
      ${panel('Card status', cards.length ? hbars(CARD_STATUS.map(st => ({ label: st, value: all('cards').filter(c => c.status === st).length, color: ['Lost', 'Blocked'].includes(st) ? 'var(--bad)' : 'var(--c1)' })).filter(x => x.value), v => fmtNum(v)) : '<p class="muted small">Register students to see card status here.</p>', `<a class="lnk sm" href="#card-registry">Open registry</a>`)}
    </div>`;
};
ACT['go-school'] = el => { location.hash = 'school-' + el.dataset.id; };
ACT.batchMove = async (el, e) => { e.stopPropagation(); const b = get('batches', el.dataset.id); const i = BATCH_STAGES.indexOf(b.stage) + (+el.dataset.d); if (i < 0 || i >= BATCH_STAGES.length) return; await save('batches', Object.assign({}, b, { stage: BATCH_STAGES[i] })); toast(`${b.name} → ${BATCH_STAGES[i]}`); };
ACT.batch = el => openBatch(el.dataset.id);
function openBatch(id) {
  const b = get('batches', id); if (!b) return;
  const cards = all('cards').filter(c => c.batchId === id); const byS = groupBy(cards, c => c.status);
  const inv = b.invoiceId && get('sales', b.invoiceId);
  openModal(`<div class="mhead"><h2>${esc(b.name)}</h2><p class="muted">${esc((get('schools', b.schoolId) || {}).name || '')} · ${statusPill(b.stage)}</p><button class="icbtn x" data-act="closeModal" aria-label="Close">×</button></div>
  <div class="mbody">
    <div class="tiles small">${tile('Ordered', fmtNum(b.qty || 0))}${tile('Registered', fmtNum(cards.length))}${tile('Value', fmtMoney(num(b.qty) * num(b.unitPrice)))}${tile('Est. margin', fmtMoney(num(b.qty) * (num(b.unitPrice) - num(b.unitCost))))}</div>
    <dl class="kv"><dt>Design</dt><dd>${esc(b.design || '—')}</dd><dt>Ordered</dt><dd>${fmtDate(b.orderedOn)}</dd><dt>Delivery due</dt><dd>${fmtDate(b.dueOn)}</dd><dt>Invoice</dt><dd>${inv ? link('sale-' + inv.id, `${inv.number} · ${saleStatus(inv)}`) : '<span class="muted">Not invoiced yet</span>'}</dd><dt>Cards by status</dt><dd>${Object.entries(byS).map(([k, v]) => `${statusPill(k, 'card')} ${v.length}`).join(' ') || '—'}</dd></dl>
    ${b.notes ? `<p class="note">${esc(b.notes)}</p>` : ''}
    <div class="inline-form"><label for="bstat">Set every card in this batch to</label><select id="bstat">${CARD_STATUS.filter(s => s !== 'Replaced').map(s => `<option>${s}</option>`).join('')}</select>${btn('Apply', 'batchCardStatus', { id }, 'ghost w')}</div>
  </div>
  <div class="mfoot">${btn('Edit', 'batchEdit', { id }, 'ghost')}${btn('Import students', 'importCards', { batch: id }, 'ghost w')}${btn('Record materials used', 'batchMaterials', { id }, 'ghost w')}<span class="tspace"></span>${btn('View cards', 'batchCards', { id }, 'ghost')}${!inv ? btn('Create invoice', 'batchInvoice', { id }) : ''}</div>`, 'lg');
}
ACT.batchEdit = el => { closeModal(); openForm('batches', get('batches', el.dataset.id)); };
ACT.batchCards = el => { closeModal(); Object.assign(vs('reg'), { batch: el.dataset.id, school: '', status: '', q: '' }); location.hash = 'card-registry'; scheduleRender(); };
ACT.batchMaterials = el => { const b = get('batches', el.dataset.id); closeModal(); openForm('moves', { type: 'issue', ref: b.name, account: '5000', date: todayISO() }, { title: `Materials used · ${b.name}` }); };
ACT.batchInvoice = el => {
  const b = get('batches', el.dataset.id); const p = productBy('card'); closeModal();
  const qty = num(b.qty) || all('cards').filter(c => c.batchId === b.id).length || 1;
  openForm('sales', { kind: 'invoice', schoolId: b.schoolId, date: todayISO(), dueDate: addDays(todayISO(), +settings().invoiceDueDays || 14), status: 'issued', lines: [{ productId: p ? p.id : '', description: `Student smart cards · ${b.name}`, qty, price: num(b.unitPrice) || settings().cardPrice, account: '4000' }], batchId: b.id }, { title: `Invoice for ${b.name}`, onSave: async rec => { const id = await save('sales', rec); await save('batches', Object.assign({}, get('batches', b.id), { invoiceId: id })); return id; } });
};
ACT.batchCardStatus = async el => {
  const st = $('#bstat').value; const list = all('cards').filter(c => c.batchId === el.dataset.id && c.status !== st && c.status !== 'Replaced');
  if (!list.length) return toast('Every card is already at that status.');
  const ok = await ask({ title: `Set ${list.length} cards to ${st}?`, ok: 'Update cards' }); if (!ok) return;
  await bulkUpdateCards(list.map(c => c.id), c => Object.assign(c, { status: st, issuedOn: ['Issued', 'Active'].includes(st) ? (c.issuedOn || todayISO()) : c.issuedOn }), `Updating cards`);
};
async function bulkUpdateCards(ids, fn, label) {
  APP.busy = { label, done: 0, total: ids.length }; scheduleRender();
  try { const recs = ids.map(id => fn(Object.assign({}, get('cards', id)))).filter(Boolean); await bulkSave('cards', recs, (d, t) => { APP.busy.done = d; scheduleRender(); }); toast(`${ids.length} cards updated`); }
  catch (e) { toast(e.message, 'bad'); }
  finally { APP.busy = null; scheduleRender(); }
}

/* =================== CARD REGISTRY =================== */
function filteredCards() {
  const f = vs('reg'); const ay = settings().academicYear;
  return all('cards').filter(c => (!f.school || c.schoolId === f.school) && (!f.status || c.status === f.status) && (!f.form || c.form === f.form) && (!f.batch || c.batchId === f.batch) &&
    (!f.renewal || (f.renewal === 'paid' ? renewedThisYear(c) : !renewedThisYear(c))) && (!f.chip || (f.chip === 'linked' ? !!c.uid : !c.uid)) && (!f.fee || (f.fee === 'paid' ? !!c.feePaid : !c.feePaid)) &&
    textMatch(f.q, c.studentName, c.indexNo, c.cardNo, c.uid, c.className, c.house));
}
VIEWS['card-registry'] = () => {
  const ay = settings().academicYear; const rows = filteredCards(); const sel = selected('reg').filter(id => get('cards', id));
  const schools = all('schools').map(s => [s.id, s.name]);
  return pageHead('Card registry', `Every student card, its chip and its payments. Use a USB NFC reader with <b>Tap a card</b> to look students up instantly.`, `${btn(ic('nfc') + ' Tap a card', 'scan', {}, 'ghost')}${btn('Import students', 'importCards', {}, 'ghost w')}${btn(ic('dl') + ' Export', 'exportCards', {}, 'ghost')}${btn(ic('plus') + ' Add card', 'create', { k: 'cards' })}`) +
    toolbar({ t: 'reg', search: 'Search name, index no., card no. or UID', filters: [{ k: 'school', label: 'School', opts: schools }, { k: 'status', label: 'Status', opts: CARD_STATUS }, { k: 'form', label: 'Form', opts: ['1', '2', '3'] }, { k: 'batch', label: 'Batch', opts: all('batches').map(b => [b.id, b.name]) }, { k: 'fee', label: 'Card fee', opts: [['paid', 'Paid'], ['unpaid', 'Not paid']] }, { k: 'renewal', label: `Renewal ${ay}`, opts: [['paid', 'Renewed'], ['unpaid', 'Not renewed']] }, { k: 'chip', label: 'Chip', opts: [['linked', 'Linked'], ['unlinked', 'Not linked']] }] }) +
    (sel.length ? `<div class="bulkbar"><b>${sel.length} selected</b>${btn('Set status', 'bulkStatus', {}, 'ghost sm w')}${btn('Record card fee', 'bulkFee', {}, 'ghost sm w')}${btn(`Record ${ay} renewal`, 'bulkRenew', {}, 'ghost sm w')}${btn('Move to batch', 'bulkBatch', {}, 'ghost sm w')}${btn('Delete', 'bulkDelete', {}, 'ghost sm danger-t w')}<span class="tspace"></span><button class="btn ghost sm" data-act="clearSel">Clear selection</button></div>` : '') +
    dataTable({
      id: 'reg', rows, select: true, rowAct: 'card', pageSize: 150, cols: [
        { k: 'cardNo', label: 'Card no.', f: r => `<span class="mono">${esc(r.cardNo || '—')}</span>` },
        { k: 'studentName', label: 'Student', f: r => `<b>${esc(r.studentName)}</b>${r.indexNo ? `<span class="muted small block">${esc(r.indexNo)}</span>` : ''}` },
        { k: 'school', label: 'School', v: r => schoolShort(r.schoolId), f: r => esc(schoolShort(r.schoolId)) },
        { k: 'form', label: 'Form · class', f: r => esc([r.form ? 'Form ' + r.form : '', r.className].filter(Boolean).join(' · ') || '—') },
        { k: 'house', label: 'House', f: r => esc(r.house || '—') },
        { k: 'status', label: 'Status', f: r => statusPill(r.status, 'card') },
        { k: 'uid', label: 'Chip', v: r => r.uid ? 1 : 0, f: r => r.uid ? `<span class="ok" title="${esc(r.uid)}">${ic('check', 14)} Linked</span>` : '<span class="muted">—</span>' },
        { k: 'feePaid', label: 'Fee', v: r => r.feePaid ? 1 : 0, f: r => r.feePaid ? '<span class="ok">Paid</span>' : '<span class="muted">Unpaid</span>' },
        { k: 'renewed', label: ay, v: r => renewedThisYear(r) ? 1 : 0, f: r => renewedThisYear(r) ? '<span class="ok">Renewed</span>' : '<span class="muted">—</span>' },
      ], empty: empty('No cards yet', 'Import your students from the SSHMS export, or add a card by hand.', `<div class="row">${btn('Import students', 'importCards', {}, 'primary')}</div>`)
    });
};
ACT.clearSel = () => { clearSel('reg'); scheduleRender(); };
ACT.card = el => openCard(el.dataset.id);
function openCard(id) {
  const c = get('cards', id); if (!c) return; const s = settings();
  const sc = get('schools', c.schoolId) || {}; const b = get('batches', c.batchId);
  const repl = c.replacesId && get('cards', c.replacesId); const replBy = all('cards').find(x => x.replacesId === c.id);
  openModal(`<div class="mhead"><h2>${esc(c.studentName)}</h2><p class="muted"><span class="mono">${esc(c.cardNo || '')}</span> · ${statusPill(c.status, 'card')}</p><button class="icbtn x" data-act="closeModal" aria-label="Close">×</button></div>
  <div class="mbody"><div class="idcard"><div class="idspine">${esc(sc.name || 'School')}</div><div class="idbody"><span class="idk">Student</span><b>${esc(c.studentName)}</b><span class="idk">Index no.</span><span>${esc(c.indexNo || '—')}</span><span class="idk">Form · class · house</span><span>${esc([c.form ? 'Form ' + c.form : '', c.className, c.house].filter(Boolean).join(' · ') || '—')}</span><span class="idk">Card no.</span><span class="mono">${esc(c.cardNo || '—')}</span></div><div class="idmark">${MARK_SVG}</div></div>
  <dl class="kv"><dt>School</dt><dd>${sc.id ? link('school-' + sc.id, sc.name) : '—'}</dd><dt>Batch</dt><dd>${esc(b ? b.name : '—')}</dd><dt>Chip UID</dt><dd>${c.uid ? `<span class="mono">${esc(c.uid)}</span>` : '<span class="muted">Not linked</span>'}</dd><dt>Issued</dt><dd>${fmtDate(c.issuedOn)}</dd><dt>Card fee</dt><dd>${c.feePaid ? `<span class="ok">Paid</span>${c.feeRef ? ' · ' + esc(c.feeRef) : ''}` : 'Not paid'}</dd><dt>Exeat renewals</dt><dd>${(c.renewals || []).length ? c.renewals.map(r => pill(r, 'good')).join(' ') : '<span class="muted">None</span>'}</dd><dt>Guardian</dt><dd>${c.guardianPhone ? phoneCell(c.guardianPhone) : '—'}</dd>${repl ? `<dt>Replaces</dt><dd><a href="#" class="lnk" data-act="card" data-id="${repl.id}">${esc(repl.cardNo)}</a></dd>` : ''}${replBy ? `<dt>Replaced by</dt><dd><a href="#" class="lnk" data-act="card" data-id="${replBy.id}">${esc(replBy.cardNo)}</a></dd>` : ''}</dl>
  ${APP.canWrite ? `<div class="inline-form"><label for="linkuid">${c.uid ? 'Re-link chip' : 'Link chip'}</label><input id="linkuid" placeholder="Tap card on reader or type UID" autocomplete="off">${btn('Link', 'linkUid', { id }, 'ghost w')}</div>` : ''}
  ${c.notes ? `<p class="note">${esc(c.notes)}</p>` : ''}</div>
  <div class="mfoot">${btn('Edit', 'cardEdit', { id }, 'ghost')}${c.status !== 'Replaced' ? btn('Lost · issue replacement', 'cardReplace', { id }, 'ghost w') : ''}<span class="tspace"></span>${!c.feePaid ? btn('Record card fee', 'cardFee', { id }, 'ghost w') : ''}${!renewedThisYear(c) && c.status !== 'Replaced' ? btn(`Record ${s.academicYear} renewal`, 'cardRenew', { id }) : ''}</div>`, 'lg');
}
document.addEventListener('keydown', e => { if (e.target.id === 'linkuid' && e.key === 'Enter') { e.preventDefault(); const b = $('[data-act="linkUid"]'); b && b.click(); } if (e.target.id === 'scanuid' && e.key === 'Enter') { e.preventDefault(); doScan(); } });
ACT.cardEdit = el => { closeModal(); openForm('cards', get('cards', el.dataset.id)); };
ACT.linkUid = async el => {
  const u = normUid($('#linkuid').value); if (!u) return toast('Tap a card or type its UID first.', 'bad');
  const d = all('cards').find(c => c.uid === u && c.id !== el.dataset.id && c.status !== 'Replaced'); if (d) return toast(`That chip is already linked to ${d.studentName}.`, 'bad');
  const c = get('cards', el.dataset.id); await save('cards', Object.assign({}, c, { uid: u })); toast('Chip linked'); closeModal(); openCard(c.id);
};
ACT.cardFee = el => { closeModal(); collectCardMoney([el.dataset.id], 'fee'); };
ACT.cardRenew = el => { closeModal(); collectCardMoney([el.dataset.id], 'renewal'); };
ACT.cardReplace = async el => {
  const c = get('cards', el.dataset.id); const s = settings(); closeModal();
  openForm('_replace', { charge: true, account: '1010', fee: s.replacementFee, reason: 'Lost' }, {
    title: `Replace ${c.studentName}'s card`, sub: `The old card ${esc(c.cardNo)} will be marked Replaced and its chip unlinked. A new card number is issued.`, okLabel: 'Issue replacement',
    fields: [{ k: 'reason', label: 'Reason', type: 'select', opts: ['Lost', 'Damaged', 'Stolen', 'Details changed'] }, { k: 'charge', label: 'Charge a replacement fee', type: 'check' }, { k: 'fee', label: 'Fee', type: 'money', showIf: r => r.charge }, { k: 'account', label: 'Received into', type: 'select', opts: () => cashAccounts().map(a => [a.code, a.name]), showIf: r => r.charge }],
    onSave: async r => {
      let ref = '';
      if (r.charge && num(r.fee) > 0) { const p = productBy('replacement'); const number = nextNumber('sales', 'number', 'RCP-'); await save('sales', { kind: 'receipt', number, schoolId: c.schoolId, date: todayISO(), account: r.account, status: 'issued', lines: [{ productId: p ? p.id : '', description: `Replacement card · ${c.studentName} (${c.cardNo})`, qty: 1, price: num(r.fee), account: '4020' }] }); ref = number; }
      const nc = Object.assign({}, c); delete nc.id; delete nc.createdAt; Object.assign(nc, { cardNo: nextCardNumbers(c.schoolId, 1)[0], uid: '', status: 'Pending print', issuedOn: '', replacesId: c.id, notes: `Replacement (${r.reason}) for ${c.cardNo}${ref ? ' · fee ' + ref : ''}` });
      const nid = await save('cards', nc);
      await save('cards', Object.assign({}, c, { status: 'Replaced', uid: '', notes: [c.notes, `${r.reason} · replaced ${fmtDate(todayISO())}`].filter(Boolean).join('\n') }));
      setTimeout(() => openCard(nid), 50); return nid;
    }
  });
};
ENT._replace = { coll: null, label: 'Replacement', title: () => 'Replacement', size: 'sm', fields: [] };
ENT._collect = { coll: null, label: 'Payment', title: () => 'Payment', size: 'sm', fields: [] };
function collectCardMoney(ids, kind) {
  const s = settings(); const ay = s.academicYear;
  let cards = ids.map(id => get('cards', id)).filter(Boolean);
  cards = kind === 'fee' ? cards.filter(c => !c.feePaid) : cards.filter(c => !renewedThisYear(c) && c.status !== 'Replaced');
  if (!cards.length) return toast(kind === 'fee' ? 'Those cards are already paid for.' : `Those cards are already renewed for ${ay}.`);
  const price = kind === 'fee' ? num(s.cardPrice) : num(s.renewalFee);
  if (!price) return toast(kind === 'fee' ? 'Set the card price in Setup first.' : 'Set the renewal fee in Setup first.', 'bad');
  const schools = [...new Set(cards.map(c => c.schoolId))];
  openForm('_collect', { date: todayISO(), account: '1010', price }, {
    title: kind === 'fee' ? `Card fee for ${cards.length} ${cards.length === 1 ? 'student' : 'students'}` : `${ay} exeat renewal for ${cards.length} ${cards.length === 1 ? 'student' : 'students'}`,
    sub: `${cards.length} × price = total. One sales receipt is created and each card is marked.`, okLabel: 'Record payment',
    fields: [{ k: 'date', label: 'Date', type: 'date', req: true }, { k: 'price', label: 'Price per card', type: 'money', req: true }, { k: 'account', label: 'Received into', type: 'select', req: true, opts: () => cashAccounts().map(a => [a.code, a.name]) }, { k: 'html', type: 'html', html: () => `<p class="sumline" id="collectSum">Total <b>${fmtMoney(cards.length * price)}</b></p>` }],
    onChange: r => { const el = $('#collectSum'); if (el) el.innerHTML = `Total <b>${fmtMoney(cards.length * num(r.price))}</b>`; },
    onSave: async r => {
      const p = productBy(kind === 'fee' ? 'card' : 'renewal'); const number = nextNumber('sales', 'number', 'RCP-');
      const label = kind === 'fee' ? 'Student smart card' : `Exeat renewal ${ay}`;
      const id = await save('sales', { kind: 'receipt', number, schoolId: schools.length === 1 ? schools[0] : '', customer: schools.length === 1 ? '' : 'Students (several schools)', date: r.date, account: r.account, status: 'issued', lines: [{ productId: p ? p.id : '', description: `${label} · ${cards.length === 1 ? cards[0].studentName + ' (' + cards[0].cardNo + ')' : cards.length + ' students'}`, qty: cards.length, price: num(r.price), account: kind === 'fee' ? '4000' : '4010' }], cardIds: cards.map(c => c.id).slice(0, 2000) });
      await bulkUpdateCards(cards.map(c => c.id), c => kind === 'fee' ? Object.assign(c, { feePaid: true, feeRef: number }) : Object.assign(c, { renewals: [...new Set([...(c.renewals || []), ay])] }), 'Marking cards');
      clearSel('reg'); return id;
    }
  });
}
ACT.bulkFee = () => collectCardMoney(selected('reg'), 'fee');
ACT.bulkRenew = () => collectCardMoney(selected('reg'), 'renewal');
ACT.bulkStatus = () => {
  const ids = selected('reg');
  openForm('_collect', { status: 'Issued' }, { title: `Set status of ${ids.length} cards`, okLabel: 'Update', fields: [{ k: 'status', label: 'New status', type: 'select', opts: CARD_STATUS.filter(s => s !== 'Replaced'), req: true }], onSave: async r => { closeModal(); await bulkUpdateCards(ids, c => Object.assign(c, { status: r.status, issuedOn: ['Issued', 'Active'].includes(r.status) ? (c.issuedOn || todayISO()) : c.issuedOn }), 'Updating cards'); clearSel('reg'); } });
};
ACT.bulkBatch = () => {
  const ids = selected('reg');
  openForm('_collect', {}, { title: `Move ${ids.length} cards to a batch`, okLabel: 'Move', fields: [{ k: 'batchId', label: 'Batch', type: 'ref', ref: 'batches', req: true }], onSave: async r => { closeModal(); await bulkUpdateCards(ids, c => Object.assign(c, { batchId: r.batchId }), 'Moving cards'); clearSel('reg'); } });
};
ACT.bulkDelete = async () => {
  const ids = selected('reg'); const paid = ids.map(id => get('cards', id)).filter(c => c && (c.feePaid || (c.renewals || []).length)).length;
  const ok = await ask({ title: `Delete ${ids.length} cards?`, body: `${paid ? `<b>${paid} of them have payments recorded.</b> The payments stay in your accounts. ` : ''}This cannot be undone.`, ok: 'Delete cards', danger: true }); if (!ok) return;
  APP.busy = { label: 'Deleting cards', done: 0, total: ids.length };
  try { for (const id of ids) { await removeRec('cards', id); APP.busy.done++; scheduleRender(); await sleep(50); } toast(`${ids.length} cards deleted`); } catch (e) { toast(e.message, 'bad'); } finally { APP.busy = null; clearSel('reg'); scheduleRender(); }
};
ACT.exportCards = () => { const rows = filteredCards(); offerFile(`adzesua-cards-${todayISO()}.csv`, toCSV([['Card no', 'Student', 'Index no', 'School', 'Form', 'Class', 'House', 'Gender', 'Status', 'Chip UID', 'Fee paid', 'Renewals', 'Issued on', 'Guardian phone'], ...rows.map(c => [c.cardNo, c.studentName, c.indexNo, (get('schools', c.schoolId) || {}).name, c.form, c.className, c.house, c.gender, c.status, c.uid, c.feePaid ? 'Yes' : 'No', (c.renewals || []).join(' '), c.issuedOn, c.guardianPhone])])); };

/* tap-to-find */
ACT.scan = () => {
  openModal(`<div class="mhead"><h2>Tap a card</h2><p class="muted">Click the box, then tap a student card on your USB NFC reader. Readers that type the UID and press Enter work automatically.</p><button class="icbtn x" data-act="closeModal" aria-label="Close">×</button></div>
  <div class="mbody"><div class="scanbox">${ic('nfc', 36)}<label for="scanuid" class="sr">Card UID</label><input id="scanuid" class="big mono" placeholder="Waiting for a tap…" autocomplete="off"></div><div id="scanres"></div></div>`, 'sm');
};
function doScan() {
  const u = normUid($('#scanuid').value); const out = $('#scanres'); if (!u) return;
  const c = all('cards').find(x => x.uid === u && x.status !== 'Replaced');
  if (c) { closeModal(); openCard(c.id); return; }
  const unlinked = all('cards').filter(x => !x.uid && x.status !== 'Replaced').slice(0, 400);
  out.innerHTML = `<p class="banner warn">No student has chip <span class="mono">${esc(u)}</span> yet. Link it to a student:</p><input id="scanpick" placeholder="Search students without a chip" autocomplete="off"><div class="picklist" id="scanlist">${pickList(unlinked, u, '')}</div>`;
  $('#scanpick').addEventListener('input', ev => { $('#scanlist').innerHTML = pickList(unlinked, u, ev.target.value); });
  $('#scanuid').value = '';
}
const pickList = (cards, u, q) => cards.filter(c => textMatch(q, c.studentName, c.indexNo, c.cardNo)).slice(0, 8).map(c => `<button class="gr" data-act="scanLink" data-id="${c.id}" data-uid="${u}"><span class="grl">${esc(c.studentName)}</span><span class="grs">${esc(c.cardNo)} · ${esc(schoolShort(c.schoolId))}</span></button>`).join('') || '<p class="muted small">No match.</p>';
ACT.scanLink = async el => { const c = get('cards', el.dataset.id); await save('cards', Object.assign({}, c, { uid: el.dataset.uid })); toast(`Chip linked to ${c.studentName}`); closeModal(); openCard(c.id); };

/* CSV import from SSHMS */
let IMPORT = null;
ACT.importCards = el => {
  if (modalStack.length || $('#modal').classList.contains('open')) closeModal();
  const batch = el && el.dataset.batch ? get('batches', el.dataset.batch) : null;
  IMPORT = { rows: [], map: {}, batchId: batch ? batch.id : '', schoolId: batch ? batch.schoolId : (vs('reg').school || '') };
  openModal(`<div class="mhead"><h2>Import students</h2><p class="muted">Paste or upload the student list exported from SSHMS (CSV). Columns are matched by their headings: name, index number, form, class, house, gender, guardian phone.</p><button class="icbtn x" data-act="closeModal" aria-label="Close">×</button></div>
  <div class="mbody"><div class="fgrid">
    <div class="fld"><label for="imSchool">School <span class="req">*</span></label><select id="imSchool"><option value="">— Select —</option>${all('schools').map(s => `<option value="${s.id}" ${IMPORT.schoolId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
    <div class="fld"><label for="imBatch">Batch</label><select id="imBatch"><option value="">No batch</option>${all('batches').map(b => `<option value="${b.id}" ${IMPORT.batchId === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>
    <div class="fld span2"><label for="imText">Student list</label><textarea id="imText" rows="6" class="mono" placeholder="Name,Index No,Form,Class,House,Gender&#10;Ama Mensah,0123456,1,Science 1A,Aggrey,Female"></textarea><div class="row">${btn('Choose CSV file', 'imFile', {}, 'ghost sm')}<button class="btn ghost sm" data-act="imPreview">Preview</button></div></div>
  </div><div id="imPrev"></div></div>
  <div class="mfoot"><span class="tspace"></span><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" data-act="imGo" id="imGo" disabled>Import</button></div>`, 'xl');
};
ACT.imFile = async () => { const f = await pickFile('.csv,.tsv,.txt,text/csv'); if (!f) return; $('#imText').value = f.text; ACT.imPreview(); };
const IM_FIELDS = [['studentName', 'Name', /^(student'?s?\s*)?(full\s*)?name$|^student$|^names?$/i], ['firstName', 'First name', /first|given|other\s*name/i], ['lastName', 'Surname', /^(last|sur)\s*name|^surname|family/i], ['indexNo', 'Index no.', /index|admission|adm\.?\s*no|student\s*id|^id$|reg/i], ['form', 'Form', /^form|^year|^level/i], ['className', 'Class', /class|programme|program|course/i], ['house', 'House', /house|hall|dorm/i], ['gender', 'Gender', /gender|^sex/i], ['guardianPhone', 'Guardian phone', /guardian|parent|phone|contact|mobile/i]];
ACT.imPreview = () => {
  const rows = parseCSV($('#imText').value || ''); if (!rows.length) { $('#imPrev').innerHTML = '<p class="banner warn">Paste or choose a file first.</p>'; return; }
  const head = rows[0].map(h => h.trim()); const map = {};
  head.forEach((h, i) => { const f = IM_FIELDS.find(([k, , re]) => !(k in map) && re.test(h)); if (f) map[f[0]] = i; });
  let data = rows.slice(1);
  if (!('studentName' in map) && !('firstName' in map)) { map.studentName = 0; data = rows; }
  const recs = data.map(r => {
    const g = k => k in map ? (r[map[k]] || '').trim() : '';
    let name = g('studentName') || [g('firstName'), g('lastName')].filter(Boolean).join(' ');
    const fm = (g('form').match(/[1-3]/) || [''])[0]; const gd = g('gender'); const gender = /^f/i.test(gd) ? 'Female' : /^m/i.test(gd) ? 'Male' : '';
    return { studentName: name.replace(/\s+/g, ' '), indexNo: g('indexNo'), form: fm, className: g('className'), house: g('house'), gender, guardianPhone: g('guardianPhone') };
  }).filter(r => r.studentName);
  IMPORT.rows = recs;
  const school = $('#imSchool').value; const existing = new Set(all('cards').filter(c => c.schoolId === school && c.indexNo).map(c => c.indexNo));
  const dup = recs.filter(r => r.indexNo && existing.has(r.indexNo)).length;
  const matched = IM_FIELDS.filter(([k]) => k in map).map(([, l]) => l);
  $('#imPrev').innerHTML = `<p class="small"><b>${recs.length}</b> students found · columns matched: ${matched.map(m => pill(m, 'good')).join(' ')}${dup ? ` · <span class="pill gold">${dup} already registered (will be skipped)</span>` : ''}</p>
    <div class="tw"><table class="dt"><thead><tr><th>Name</th><th>Index no.</th><th>Form</th><th>Class</th><th>House</th><th>Gender</th></tr></thead><tbody>${recs.slice(0, 6).map(r => `<tr><td>${esc(r.studentName)}</td><td>${esc(r.indexNo)}</td><td>${esc(r.form)}</td><td>${esc(r.className)}</td><td>${esc(r.house)}</td><td>${esc(r.gender)}</td></tr>`).join('')}</tbody></table></div>${recs.length > 6 ? `<p class="muted small">…and ${recs.length - 6} more.</p>` : ''}`;
  $('#imGo').disabled = !recs.length || !APP.canWrite; $('#imGo').textContent = `Import ${recs.length - dup} students`;
};
ACT.imGo = async () => {
  const school = $('#imSchool').value; const batch = $('#imBatch').value;
  if (!school) return toast('Choose the school first.', 'bad');
  if (!get('schools', school).code) return toast('Give the school a short code first (used in card numbers).', 'bad');
  const existing = new Set(all('cards').filter(c => c.schoolId === school && c.indexNo).map(c => c.indexNo));
  const list = IMPORT.rows.filter(r => !(r.indexNo && existing.has(r.indexNo)));
  const nums = nextCardNumbers(school, list.length);
  const recs = list.map((r, i) => Object.assign({}, r, { schoolId: school, batchId: batch, cardNo: nums[i], status: 'Pending print', renewals: [], feePaid: false }));
  closeModal();
  APP.busy = { label: 'Importing students', done: 0, total: recs.length }; scheduleRender();
  try { await bulkSave('cards', recs, d => { APP.busy.done = d; scheduleRender(); }); toast(`${recs.length} students imported`); Object.assign(vs('reg'), { school, batch, status: '', q: '' }); location.hash = 'card-registry'; }
  catch (e) { toast(`Stopped after ${APP.busy.done}: ${e.message}`, 'bad'); }
  finally { APP.busy = null; scheduleRender(); }
};

/* =================== DEVICES =================== */
VIEWS.devices = () => {
  const f = vs('dev'); const rows = all('devices').filter(d => (!f.school || d.schoolId === f.school) && (!f.kind || d.kind === f.kind) && (!f.status || d.status === f.status) && textMatch(f.q, d.name, d.model, d.serial, d.location));
  const D = all('devices'); const gate = D.filter(d => /reader/i.test(d.kind || ''));
  return pageHead('Readers & devices', 'Gate and classroom NFC readers, card printers and network equipment, wherever they are.', btn(ic('plus') + ' Add device', 'create', { k: 'devices' })) +
    `<div class="tiles small">${tile('NFC readers', fmtNum(gate.length), `${gate.filter(d => d.status === 'Installed').length} installed`)}${tile('Installed', fmtNum(D.filter(d => d.status === 'Installed').length), 'All kinds')}${tile('In stock', fmtNum(D.filter(d => d.status === 'In stock').length), 'Ready to deploy')}${tile('Faulty', fmtNum(D.filter(d => d.status === 'Faulty').length), 'Needs repair or return', D.some(d => d.status === 'Faulty') ? 'neg' : '')}</div>` +
    toolbar({ t: 'dev', search: 'Search name, model, serial', filters: [{ k: 'school', label: 'School', opts: all('schools').map(s => [s.id, s.name]) }, { k: 'kind', label: 'Kind', opts: ENT.devices.fields[1].opts }, { k: 'status', label: 'Status', opts: ['In stock', 'Installed', 'Faulty', 'Retired'] }] }) +
    dataTable({ id: 'dev', rows, rowAct: 'open', cols: [{ k: 'name', label: 'Device', f: r => `<b>${esc(r.name)}</b><span class="muted small block">${esc(r.kind || '')}</span>` }, { k: 'model', label: 'Model · serial', f: r => `${esc(r.model || '—')}<span class="muted small block mono">${esc(r.serial || '')}</span>` }, { k: 'school', label: 'Where', v: r => schoolShort(r.schoolId), f: r => r.schoolId ? `${esc(schoolShort(r.schoolId))}<span class="muted small block">${esc(r.location || '')}</span>` : esc(r.location || 'Store') }, { k: 'status', label: 'Status', f: r => statusPill(r.status) }, { k: 'installedOn', label: 'Installed', f: r => fmtDate(r.installedOn) }, { k: 'cost', label: 'Cost', cls: 'num', v: r => num(r.cost), f: r => r.cost ? fmtMoney(r.cost) : '—' }], empty: empty('No devices yet', 'Add the gate readers and printers you buy so you always know where each one is.') }).replace(/data-act="open"/g, 'data-act="open" data-k="devices"');
};

/* =================== SCHOOLS =================== */
VIEWS.schools = () => {
  const f = vs('sch');
  const rows = all('schools').filter(s => (!f.status || s.status === f.status) && (!f.region || s.region === f.region) && (!f.service || (s.services || []).includes(f.service)) && textMatch(f.q, s.name, s.code, s.town, s.district)).map(s => {
    const cards = all('cards').filter(c => c.schoolId === s.id && isLiveCard(c)).length;
    const rev = sum(all('sales').filter(x => saleLive(x) && x.schoolId === s.id), saleTotal);
    const deals = all('deals').filter(d => d.schoolId === s.id && !['Won', 'Lost'].includes(d.stage)).length;
    return Object.assign({}, s, { _cards: cards, _rev: rev, _deals: deals });
  });
  const by = groupBy(all('schools'), s => s.status || 'Prospect');
  return pageHead('Schools', 'Every senior high school you work with or want to work with.', `${btn(ic('dl') + ' Export', 'exportSchools', {}, 'ghost')}${btn(ic('plus') + ' Add school', 'create', { k: 'schools' })}`) +
    `<div class="chiprow">${['', ...SCHOOL_STATUS].map(st => `<button class="chipf ${(f.status || '') === st ? 'on' : ''}" data-act="chip" data-vsk="sch.status" data-v="${st}">${st || 'All'} <span>${st ? (by[st] || []).length : all('schools').length}</span></button>`).join('')}</div>` +
    toolbar({ t: 'sch', search: 'Search schools', filters: [{ k: 'region', label: 'Region', opts: REGIONS }, { k: 'service', label: 'Service', opts: ['Smart Card', 'Wi-Fi'] }] }) +
    dataTable({ id: 'sch', rows, rowAct: 'go-school', cols: [{ k: 'name', label: 'School', f: r => `<b>${esc(r.name)}</b><span class="muted small block">${esc([r.town, r.district].filter(Boolean).join(' · ') || r.region || '')}</span>` }, { k: 'code', label: 'Code', f: r => `<span class="mono">${esc(r.code || '')}</span>` }, { k: 'status', label: 'Relationship', f: r => statusPill(r.status) }, { k: 'services', label: 'Services', v: r => (r.services || []).join(), f: r => (r.services || []).map(s => pill(s, 'info')).join(' ') || '<span class="muted">—</span>' }, { k: 'enrollment', label: 'Students', cls: 'num', v: r => num(r.enrollment), f: r => r.enrollment ? fmtNum(r.enrollment) : '—' }, { k: '_cards', label: 'Cards', cls: 'num', f: r => fmtNum(r._cards) }, { k: '_deals', label: 'Open opps', cls: 'num', f: r => fmtNum(r._deals) }, { k: '_rev', label: 'Revenue', cls: 'num', f: r => fmtMoney(r._rev) }], empty: empty('No schools yet', 'Add SWESCO and the schools you are talking to.', `<div class="row">${btn('Add school', 'create', { k: 'schools' })}</div>`) });
};
ACT.exportSchools = () => offerFile(`adzesua-schools-${todayISO()}.csv`, toCSV([['Name', 'Code', 'Status', 'Services', 'Region', 'District', 'Town', 'GPS', 'Category', 'Residency', 'Students', 'Enrolment', 'Phone', 'Email'], ...all('schools').map(s => [s.name, s.code, s.status, (s.services || []).join('; '), s.region, s.district, s.town, s.gps, s.category, s.type, s.gender, s.enrollment, s.phone, s.email])]));

VIEWS.school = id => {
  const s = get('schools', id); if (!s) return pageHead('School not found') + empty('This school no longer exists', '', `<a class="btn ghost" href="#schools">Back to schools</a>`);
  const pre = JSON.stringify({ schoolId: id });
  const contacts = all('contacts').filter(c => c.schoolId === id);
  const deals = all('deals').filter(d => d.schoolId === id);
  const acts = all('activities').filter(a => a.schoolId === id).sort((a, b) => (a.done - b.done) || (b.due || '').localeCompare(a.due || ''));
  const cards = all('cards').filter(c => c.schoolId === id && isLiveCard(c)); const active = cards.filter(c => ['Active', 'Issued'].includes(c.status));
  const sales = all('sales').filter(x => x.schoolId === id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const devices = all('devices').filter(d => d.schoolId === id); const batches = all('batches').filter(b => b.schoolId === id);
  const rev = sum(sales.filter(saleLive), saleTotal); const owed = sum(sales.filter(x => saleLive(x) && x.kind !== 'receipt'), saleBalance);
  const t = todayISO();
  return pageHead(s.name, `${statusPill(s.status)} ${(s.services || []).map(x => pill(x, 'info')).join(' ')} <span class="muted">· ${esc([s.town, s.district, s.region ? s.region + ' Region' : ''].filter(Boolean).join(', '))}</span>`,
    `${btn(ic('edit') + ' Edit', 'edit', { k: 'schools', id }, 'ghost')}${btn('Log activity', 'create', { k: 'activities', preset: pre }, 'ghost w')}${btn(ic('plus') + ' Invoice', 'create', { k: 'sales', preset: JSON.stringify({ schoolId: id, kind: 'invoice' }) })}`, `<a href="#schools" class="lnk">Schools</a> /`) +
    `<div class="tiles small">${tile('Student cards', fmtNum(cards.length), s.enrollment ? `${fmtNum(100 * cards.length / num(s.enrollment))}% of ${fmtNum(s.enrollment)} students` : `${active.length} active`)}${tile('Revenue to date', fmtMoney(rev), `${sales.filter(saleLive).length} sales`)}${tile('Owed by school', fmtMoney(owed), owed > 0 ? 'Unpaid invoices' : 'All settled', owed > 0 ? 'warnt' : '')}${tile('Devices here', fmtNum(devices.length), `${devices.filter(d => d.status === 'Installed').length} installed`)}</div>
    <div class="grid2">
      ${panel('People', contacts.length ? `<ul class="list">${contacts.map(c => `<li class="li"><div class="lim click" data-act="open" data-k="contacts" data-id="${c.id}"><b>${esc(c.name)}</b><span class="muted">${esc(c.role || '')}</span></div><span class="small">${phoneCell(c.phone, c.whatsapp)}</span></li>`).join('')}</ul>` : '<p class="muted small">No contacts yet. Start with the head and the senior housemaster.</p>', btn(ic('plus', 14) + ' Add', 'create', { k: 'contacts', preset: pre }, 'ghost sm w'))}
      ${panel('Details', `<dl class="kv"><dt>Card code</dt><dd class="mono">${esc(s.code || '—')}</dd><dt>GES category</dt><dd>${esc(s.category || '—')}</dd><dt>Residency</dt><dd>${esc(s.type || '—')}</dd><dt>Students</dt><dd>${esc(s.gender || '—')}${s.enrollment ? ' · ' + fmtNum(s.enrollment) : ''}</dd><dt>Houses</dt><dd>${esc(s.houses || '—')}</dd><dt>GPS</dt><dd class="mono">${esc(s.gps || '—')}</dd><dt>Phone</dt><dd>${s.phone ? phoneCell(s.phone) : '—'}</dd><dt>Email</dt><dd>${esc(s.email || '—')}</dd></dl>${s.notes ? `<p class="note">${esc(s.notes)}</p>` : ''}`)}
    </div>
    <div class="grid2">
      ${panel('Opportunities', deals.length ? `<ul class="list">${deals.map(d => `<li class="li click" data-act="open" data-k="deals" data-id="${d.id}"><div class="lim"><b>${esc(d.title)}</b><span class="muted">${esc(d.product || '')}${d.nextStep ? ' · Next: ' + esc(d.nextStep) : ''}</span></div>${statusPill(d.stage)}<span class="amt">${fmtMoney(d.value)}</span></li>`).join('')}</ul>` : '<p class="muted small">No opportunities recorded.</p>', btn(ic('plus', 14) + ' Add', 'create', { k: 'deals', preset: pre }, 'ghost sm w'))}
      ${panel('Activity', acts.length ? `<ul class="list">${acts.slice(0, 8).map(a => `<li class="li"><button class="chkbtn ${a.done ? 'on' : ''}" data-act="toggleDone" data-id="${a.id}" aria-label="${a.done ? 'Reopen' : 'Mark done'}" ${!APP.canWrite ? 'disabled' : ''}>${a.done ? ic('check', 12) : ''}</button><div class="lim click" data-act="open" data-k="activities" data-id="${a.id}"><b class="${a.done ? 'struck' : ''}">${esc(a.subject)}</b><span class="muted">${esc(a.type)} · ${fmtDate(a.due)}${a.ownerId ? ' · ' + esc(staffName(a.ownerId)) : ''}</span></div>${!a.done && a.due && a.due < t ? pill('Overdue', 'bad') : ''}</li>`).join('')}</ul>` : '<p class="muted small">Nothing logged yet.</p>', btn(ic('plus', 14) + ' Log', 'create', { k: 'activities', preset: pre }, 'ghost sm w'))}
    </div>
    <div class="grid2">
      ${panel('Card batches', batches.length ? `<ul class="list">${batches.map(b => `<li class="li click" data-act="batch" data-id="${b.id}"><div class="lim"><b>${esc(b.name)}</b><span class="muted">${fmtNum(all('cards').filter(c => c.batchId === b.id).length)} registered${b.qty ? ' of ' + fmtNum(b.qty) : ''}</span></div>${statusPill(b.stage)}</li>`).join('')}</ul><p class="small"><a class="lnk" href="#card-registry" data-act="schoolCards" data-id="${id}">See all ${fmtNum(cards.length)} cards</a></p>` : '<p class="muted small">No batches yet.</p>', `${btn('Import students', 'importCards', {}, 'ghost sm w')}${btn(ic('plus', 14) + ' Batch', 'create', { k: 'batches', preset: pre }, 'ghost sm w')}`)}
      ${panel('Devices', devices.length ? `<ul class="list">${devices.map(d => `<li class="li click" data-act="open" data-k="devices" data-id="${d.id}"><div class="lim"><b>${esc(d.name)}</b><span class="muted">${esc(d.kind || '')} · ${esc(d.location || '')}</span></div>${statusPill(d.status)}</li>`).join('')}</ul>` : '<p class="muted small">No devices here yet.</p>', btn(ic('plus', 14) + ' Add', 'create', { k: 'devices', preset: pre }, 'ghost sm w'))}
    </div>
    ${panel('Invoices & receipts', dataTable({ id: 'schSales', rows: sales, rowAct: 'go-sale', cols: saleCols(true) }) , '', '')}`;
};
ACT.schoolCards = el => { Object.assign(vs('reg'), { school: el.dataset.id, batch: '', status: '', q: '' }); location.hash = 'card-registry'; };

/* =================== CONTACTS =================== */
VIEWS.contacts = () => {
  const f = vs('con'); const rows = all('contacts').filter(c => (!f.school || c.schoolId === f.school) && (!f.role || c.role === f.role) && textMatch(f.q, c.name, c.phone, c.email, c.role));
  return pageHead('Contacts', 'Heads, housemasters, bursars and PTA leaders at each school.', `${btn(ic('dl') + ' Export', 'exportContacts', {}, 'ghost')}${btn(ic('plus') + ' Add contact', 'create', { k: 'contacts' })}`) +
    toolbar({ t: 'con', search: 'Search contacts', filters: [{ k: 'school', label: 'School', opts: all('schools').map(s => [s.id, s.name]) }, { k: 'role', label: 'Role', opts: CONTACT_ROLES }] }) +
    dataTable({ id: 'con', rows, rowAct: 'open', cols: [{ k: 'name', label: 'Name', f: r => `<b>${esc(r.name)}</b>` }, { k: 'role', label: 'Role' }, { k: 'school', label: 'School', v: r => (get('schools', r.schoolId) || {}).name, f: r => esc((get('schools', r.schoolId) || {}).name || '—') }, { k: 'phone', label: 'Phone', f: r => phoneCell(r.phone, r.whatsapp) }, { k: 'email', label: 'Email' }], empty: empty('No contacts yet', 'Add the people who make decisions at each school.') }).replace(/data-act="open"/g, 'data-act="open" data-k="contacts"');
};
ACT.exportContacts = () => offerFile(`adzesua-contacts-${todayISO()}.csv`, toCSV([['Name', 'Role', 'School', 'Phone', 'WhatsApp', 'Email', 'Notes'], ...all('contacts').map(c => [c.name, c.role, (get('schools', c.schoolId) || {}).name, c.phone, c.whatsapp, c.email, c.notes])]));

/* =================== PIPELINE =================== */
VIEWS.pipeline = () => {
  const f = vs('pip'); const deals = all('deals').filter(d => (!f.owner || d.ownerId === f.owner) && (!f.product || d.product === f.product) && textMatch(f.q, d.title, (get('schools', d.schoolId) || {}).name));
  const open = deals.filter(d => !['Won', 'Lost'].includes(d.stage));
  const weighted = sum(open, d => num(d.value) * (DEAL_STAGES.find(x => x[0] === d.stage) || [0, 0])[1] / 100);
  const won = deals.filter(d => d.stage === 'Won'); const lost = deals.filter(d => d.stage === 'Lost');
  return pageHead('Pipeline', 'Schools you are bringing on board, from first contact to signed.', btn(ic('plus') + ' New opportunity', 'create', { k: 'deals' })) +
    `<div class="tiles small">${tile('Open', fmtNum(open.length), fmtMoney(sum(open, d => num(d.value))) + ' total')}${tile('Weighted value', fmtMoney(weighted), 'Value × stage probability')}${tile('Won', fmtNum(won.length), fmtMoney(sum(won, d => num(d.value))))}${tile('Win rate', won.length + lost.length ? fmtNum(100 * won.length / (won.length + lost.length)) + '%' : '—', `${lost.length} lost`)}</div>` +
    toolbar({ t: 'pip', search: 'Search opportunities', filters: [{ k: 'owner', label: 'Owner', opts: staffOpts() }, { k: 'product', label: 'Product', opts: ['Smart Card', 'Wi-Fi', 'Smart Card + Wi-Fi', 'Other'] }] }) +
    `<div class="kanban wide">${DEAL_STAGES.map(([st, p], i) => { const list = deals.filter(d => d.stage === st); return `<div class="kcol ${st === 'Lost' ? 'dim' : ''}"><div class="kh"><span>${esc(st)} <span class="muted small">${p}%</span></span><span class="kc">${list.length}</span></div><div class="ksum">${fmtMoney(sum(list, d => num(d.value)))}</div>${list.map(d => `<div class="kcard" data-act="open" data-k="deals" data-id="${d.id}" tabindex="0"><b>${esc(d.title)}</b><span class="muted">${esc((get('schools', d.schoolId) || {}).name || '')}</span><span class="small">${fmtMoney(d.value)}${d.expectedClose ? ` · <span class="${d.expectedClose < todayISO() && i < 5 ? 'badt' : 'muted'}">${fmtDate(d.expectedClose)}</span>` : ''}</span>${d.nextStep ? `<span class="small muted">Next: ${esc(d.nextStep)}</span>` : ''}${d.ownerId ? `<span class="owner">${esc(staffName(d.ownerId))}</span>` : ''}<div class="kmove">${i > 0 ? `<button class="icbtn" data-act="dealMove" data-id="${d.id}" data-d="-1" aria-label="Move back" ${!APP.canWrite ? 'disabled' : ''}>‹</button>` : '<span></span>'}${i < DEAL_STAGES.length - 1 ? `<button class="icbtn" data-act="dealMove" data-id="${d.id}" data-d="1" aria-label="Move forward" ${!APP.canWrite ? 'disabled' : ''}>›</button>` : ''}</div></div>`).join('') || '<div class="kempty">None</div>'}</div>`; }).join('')}</div>`;
};
ACT.dealMove = async (el, e) => { e.stopPropagation(); const d = get('deals', el.dataset.id); const i = DEAL_STAGES.findIndex(s => s[0] === d.stage) + (+el.dataset.d); if (i < 0 || i >= DEAL_STAGES.length) return; await save('deals', Object.assign({}, d, { stage: DEAL_STAGES[i][0] })); if (DEAL_STAGES[i][0] === 'Won') { const s = get('schools', d.schoolId); if (s && !['Customer'].includes(s.status)) await save('schools', Object.assign({}, s, { status: 'Customer' })); toast('Won! School marked as a customer.'); } };

/* =================== ACTIVITIES =================== */
VIEWS.activities = () => {
  const f = vs('act'); const t = todayISO(); const tab = f.tab || 'open';
  const base = all('activities').filter(a => (!f.owner || a.ownerId === f.owner) && (!f.type || a.type === f.type) && textMatch(f.q, a.subject, a.outcome, (get('schools', a.schoolId) || {}).name));
  const tabs = { open: base.filter(a => !a.done), overdue: base.filter(a => !a.done && a.due && a.due < t), today: base.filter(a => !a.done && a.due === t), done: base.filter(a => a.done), all: base };
  const rows = tabs[tab];
  return pageHead('Activities', 'Calls, visits, meetings and to-dos for you and the team.', btn(ic('plus') + ' New activity', 'create', { k: 'activities' })) +
    `<div class="chiprow">${[['open', 'Open'], ['overdue', 'Overdue'], ['today', 'Today'], ['done', 'Done'], ['all', 'All']].map(([k, l]) => `<button class="chipf ${tab === k ? 'on' : ''} ${k === 'overdue' && tabs.overdue.length ? 'alert' : ''}" data-act="chip" data-vsk="act.tab" data-v="${k}">${l} <span>${tabs[k].length}</span></button>`).join('')}</div>` +
    toolbar({ t: 'act', search: 'Search activities', filters: [{ k: 'owner', label: 'Owner', opts: staffOpts() }, { k: 'type', label: 'Type', opts: ACTIVITY_TYPES }] }) +
    dataTable({ id: 'actT', rows, rowAct: 'open', cols: [{ k: 'done', label: '', v: r => r.done ? 1 : 0, f: r => `<button class="chkbtn ${r.done ? 'on' : ''}" data-act="toggleDoneRow" data-id="${r.id}" aria-label="${r.done ? 'Reopen' : 'Mark done'}" ${!APP.canWrite ? 'disabled' : ''}>${r.done ? ic('check', 12) : ''}</button>` }, { k: 'due', label: 'Due', f: r => `<span class="${!r.done && r.due && r.due < t ? 'badt' : ''}">${fmtDate(r.due)}</span>` }, { k: 'subject', label: 'Activity', f: r => `<b class="${r.done ? 'struck' : ''}">${esc(r.subject)}</b>${r.outcome ? `<span class="muted small block">${esc(r.outcome.slice(0, 90))}</span>` : ''}` }, { k: 'type', label: 'Type' }, { k: 'school', label: 'School', v: r => (get('schools', r.schoolId) || {}).name, f: r => esc((get('schools', r.schoolId) || {}).name || '—') }, { k: 'owner', label: 'Owner', v: r => staffName(r.ownerId), f: r => esc(staffName(r.ownerId) || '—') }], empty: empty(tab === 'overdue' ? 'Nothing overdue' : 'No activities here', 'Log calls, visits and follow-ups so nothing slips.') }).replace(/data-act="open"/g, 'data-act="open" data-k="activities"');
};
ACT.toggleDoneRow = (el, e) => { e.stopPropagation(); return ACT.toggleDone(el); };

/* =================== WI-FI =================== */
function openWifiLog(preset = {}) {
  const s = settings();
  ENT._wifi = ENT._wifi || { coll: null, label: 'Wi-Fi sales', title: () => 'Wi-Fi sales', size: 'sm', fields: [] };
  openForm('_wifi', Object.assign({ date: todayISO(), price: s.wifiPackagePrice, account: '1010', schoolId: (all('schools').find(x => (x.services || []).includes('Wi-Fi')) || {}).id }, preset), {
    title: 'Log Wi-Fi data sales', sub: 'Record a day’s (or shift’s) package sales in one go.', okLabel: 'Record sales',
    fields: [{ k: 'date', label: 'Date', type: 'date', req: true }, { k: 'schoolId', label: 'Campus', type: 'ref', ref: 'schools', req: true }, { k: 'qty', label: 'Packages sold', type: 'number', req: true, min: 0 }, { k: 'price', label: 'Price per package', type: 'money', req: true }, { k: 'account', label: 'Money received into', type: 'select', req: true, opts: () => cashAccounts().map(a => [a.code, a.name]) }, { k: 'note', label: 'Note', ph: 'e.g. 1GB packages, evening prep' }, { k: 'html', type: 'html', html: r => `<p class="sumline" id="wifiSum">Total <b>${fmtMoney(num(r.qty) * num(r.price))}</b></p>` }],
    onChange: r => { const el = $('#wifiSum'); if (el) el.innerHTML = `Total <b>${fmtMoney(num(r.qty) * num(r.price))}</b>`; },
    onSave: async r => { if (num(r.qty) <= 0) throw { message: 'Enter how many packages were sold.' }; const p = productBy('wifi'); return save('sales', { kind: 'receipt', number: nextNumber('sales', 'number', 'RCP-'), schoolId: r.schoolId, date: r.date, account: r.account, status: 'issued', channel: 'wifi', lines: [{ productId: p ? p.id : '', description: `Wi-Fi data packages${r.note ? ' · ' + r.note : ''}`, qty: num(r.qty), price: num(r.price), account: '4100' }] }); }
  });
}
VIEWS.wifi = () => {
  const t = todayISO(); const [ms] = monthRange(0); const ys = t.slice(0, 4) + '-01-01';
  const lines = all('sales').filter(saleLive).flatMap(s => (s.lines || []).filter(l => l.account === '4100').map(l => Object.assign({}, l, { sale: s, date: s.date })));
  const inR = (l, a, b) => l.date >= a && l.date <= b;
  const mRev = sum(lines.filter(l => inR(l, ms, t)), l => num(l.qty) * num(l.price)); const mPk = sum(lines.filter(l => inR(l, ms, t)), l => num(l.qty));
  const yRev = sum(lines.filter(l => inR(l, ys, t)), l => num(l.qty) * num(l.price)); const yBw = balances(ys, t)['5100'] || 0;
  const series = monthlySeries(6).map(m => ({ key: m.key, rev: balances(m.from, m.to)['4100'] || 0, bw: balances(m.from, m.to)['5100'] || 0 }));
  const recent = lines.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60);
  const days = new Set(lines.filter(l => inR(l, ms, t)).map(l => l.date)).size;
  return pageHead('Wi-Fi data sales', `Campus student data. Main package: 1GB at ${fmtMoney(settings().wifiPackagePrice)}.`, `${btn('Log bandwidth bill', 'create', { k: 'expenses', preset: JSON.stringify({ account: '5100', description: 'Fibre broadband' }) }, 'ghost w')}${btn(ic('plus') + ' Log sales', 'create', { k: 'wifiLog' })}`) +
    `<div class="tiles">${tile('Revenue this month', fmtMoney(mRev), `${fmtNum(mPk)} packages · ${days} selling ${days === 1 ? 'day' : 'days'}`, 'hero')}${tile('Average per selling day', fmtMoney(days ? mRev / days : 0), 'This month')}${tile(`Revenue ${t.slice(0, 4)}`, fmtMoney(yRev), `Bandwidth cost ${fmtMoney(yBw)}`)}${tile('Wi-Fi margin this year', fmtMoney(yRev - yBw), yRev ? `${fmtNum(100 * (yRev - yBw) / yRev)}% of revenue` : 'No sales yet', yRev - yBw < 0 ? 'neg' : '')}</div>
    <div class="grid2">${panel('Wi-Fi revenue and bandwidth cost', series.some(s => s.rev || s.bw) ? barChart({ labels: series.map(s => fmtMonth(s.key)), series: [{ name: 'Wi-Fi revenue', color: 'var(--c1)', values: series.map(s => s.rev) }, { name: 'Bandwidth cost', color: 'var(--c2)', values: series.map(s => s.bw) }] }) : empty('No Wi-Fi sales yet', 'Log daily package sales and your fibre bill to track the margin.'))}
    ${panel('Recent sales', recent.length ? `<div class="tw"><table class="dt"><thead><tr><th>Date</th><th>Campus</th><th class="num">Packages</th><th class="num">Amount</th></tr></thead><tbody>${recent.slice(0, 12).map(l => `<tr class="click" data-act="go" data-to="sale-${l.sale.id}"><td>${fmtDate(l.date)}</td><td>${esc(schoolShort(l.sale.schoolId))}</td><td class="num">${fmtNum(l.qty)}</td><td class="num">${fmtMoney(num(l.qty) * num(l.price))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">Nothing logged yet.</p>')}</div>`;
};

/* =================== SALES =================== */
const saleCols = (noSchool) => [
  { k: 'number', label: 'Number', f: r => `<b class="mono">${esc(r.number)}</b>` },
  { k: 'date', label: 'Date', f: r => fmtDate(r.date) },
  ...(noSchool ? [] : [{ k: 'party', label: 'Customer', v: r => (get('schools', r.schoolId) || {}).name || r.customer, f: r => esc((get('schools', r.schoolId) || {}).name || r.customer || '—') }]),
  { k: 'kind', label: 'Type', f: r => r.kind === 'receipt' ? 'Receipt' : 'Invoice' },
  { k: 'total', label: 'Total', cls: 'num', v: saleTotal, f: r => fmtMoney(saleTotal(r)) },
  { k: 'balance', label: 'Balance', cls: 'num', v: r => saleLive(r) ? saleBalance(r) : 0, f: r => saleLive(r) && saleBalance(r) > 0.004 ? `<b>${fmtMoney(saleBalance(r))}</b>` : '<span class="muted">—</span>' },
  { k: 'status', label: 'Status', v: saleStatus, f: r => statusPill(saleStatus(r)) },
  { k: 'dueDate', label: 'Due', f: r => r.kind === 'receipt' ? '<span class="muted">—</span>' : fmtDate(r.dueDate) },
];
ACT['go-sale'] = el => { location.hash = 'sale-' + el.dataset.id; };
VIEWS.sales = () => {
  const f = vs('sal'); const t = todayISO(); const [ms] = monthRange(0);
  const rows = all('sales').filter(s => (!f.kind || s.kind === f.kind) && (!f.status || saleStatus(s) === f.status) && (!f.school || s.schoolId === f.school) && textMatch(f.q, s.number, s.customer, (get('schools', s.schoolId) || {}).name, ...(s.lines || []).map(l => l.description)));
  const live = all('sales').filter(saleLive);
  const billed = sum(live.filter(s => s.date >= ms && s.date <= t), saleTotal);
  const cashIn = sum(live, s => s.kind === 'receipt' ? (s.date >= ms && s.date <= t ? saleTotal(s) : 0) : sum((s.payments || []).filter(p => p.date >= ms && p.date <= t), p => num(p.amount)));
  const owed = sum(live.filter(s => s.kind !== 'receipt'), saleBalance); const od = live.filter(s => saleStatus(s) === 'Overdue');
  if (!vs('sal').sortK) Object.assign(vs('sal'), { sortK: 'date', dir: 'desc' });
  return pageHead('Invoices & receipts', 'Bill schools on credit with invoices; record cash and MoMo sales with receipts.', `${btn(ic('dl') + ' Export', 'exportSales', {}, 'ghost')}${btn('New receipt', 'create', { k: 'sales', preset: JSON.stringify({ kind: 'receipt' }) }, 'ghost w')}${btn(ic('plus') + ' New invoice', 'create', { k: 'sales', preset: JSON.stringify({ kind: 'invoice' }) })}`) +
    `<div class="tiles small">${tile('Sold this month', fmtMoney(billed), 'Invoices and receipts')}${tile('Money in this month', fmtMoney(cashIn), 'Receipts and invoice payments')}${tile('Owed to you', fmtMoney(owed), `${live.filter(s => s.kind !== 'receipt' && saleBalance(s) > 0.004).length} unpaid invoices`)}${tile('Overdue', fmtMoney(sum(od, saleBalance)), `${od.length} ${od.length === 1 ? 'invoice' : 'invoices'}`, od.length ? 'neg' : '')}</div>` +
    toolbar({ t: 'sal', search: 'Search number, customer, item', filters: [{ k: 'kind', label: 'Type', opts: [['invoice', 'Invoices'], ['receipt', 'Receipts']] }, { k: 'status', label: 'Status', opts: ['Draft', 'Unpaid', 'Part paid', 'Overdue', 'Paid', 'Void'] }, { k: 'school', label: 'School', opts: all('schools').map(s => [s.id, s.name]) }] }) +
    dataTable({ id: 'sal', rows, rowAct: 'go-sale', cols: saleCols(false), empty: empty('No sales yet', 'Create an invoice for a school or record a cash sale.') });
};
ACT.exportSales = () => offerFile(`adzesua-sales-${todayISO()}.csv`, toCSV([['Number', 'Type', 'Date', 'Due', 'Customer', 'Status', 'Total', 'Paid', 'Balance', 'Items'], ...all('sales').map(s => [s.number, s.kind, s.date, s.dueDate, (get('schools', s.schoolId) || {}).name || s.customer, saleStatus(s), saleTotal(s), salePaid(s), saleBalance(s), (s.lines || []).map(l => `${l.qty} × ${l.description}`).join('; ')])]));
VIEWS.sale = id => {
  const s = get('sales', id); if (!s) return pageHead('Not found') + empty('This sale no longer exists', '', `<a class="btn ghost" href="#sales">Back to sales</a>`);
  const st = saleStatus(s); const isInv = s.kind !== 'receipt';
  return pageHead(`${isInv ? 'Invoice' : 'Receipt'} ${s.number}`, `${statusPill(st)} <span class="muted">· ${esc((get('schools', s.schoolId) || {}).name || s.customer || '')}</span>`,
    `${btn(ic('copy') + ' Copy for WhatsApp', 'saleCopy', { id }, 'ghost')}${btn(ic('dl') + ' Download', 'saleDownload', { id }, 'ghost')}${btn(ic('edit') + ' Edit', 'edit', { k: 'sales', id }, 'ghost')}${isInv && saleLive(s) && saleBalance(s) > 0.004 ? btn('Record payment', 'salePay', { id }) : ''}`, `<a href="#sales" class="lnk">Invoices & receipts</a> /`) +
    `<div class="docwrap">${saleDocHtml(s)}</div>` +
    (isInv && (s.payments || []).length ? panel('Payments', `<div class="tw"><table class="dt"><thead><tr><th>Date</th><th>Into</th><th>Reference</th><th class="num">Amount</th></tr></thead><tbody>${s.payments.map(p => `<tr><td>${fmtDate(p.date)}</td><td>${esc(acctName(p.account))}</td><td>${esc(p.note || '')}</td><td class="num">${fmtMoney(p.amount)}</td></tr>`).join('')}</tbody></table></div>`) : '');
};
function saleDocHtml(s) {
  const C = settings(); const sc = get('schools', s.schoolId); const isInv = s.kind !== 'receipt'; const tot = saleTotal(s), paid = salePaid(s), bal = saleBalance(s);
  return `<article class="doc"><header class="dochead"><div class="docbrand">${MARK_SVG}<div><b>Adzesua</b> Connect<span>${esc(C.tagline)}</span></div></div><div class="docmeta"><h2>${s.taxMode === 'vat' ? 'Tax ' : ''}${isInv ? 'Invoice' : 'Receipt'}</h2><span class="mono">${esc(s.number)}</span></div></header>
  <div class="docparties"><div><span class="idk">From</span><b>${esc(C.companyName)}</b><span>${esc(C.address)}</span>${C.phone ? `<span>${esc(C.phone)}</span>` : ''}${C.email ? `<span>${esc(C.email)}</span>` : ''}${C.tin ? `<span>TIN ${esc(C.tin)}</span>` : ''}${C.vatRegistered && C.vatNo ? `<span>VAT no. ${esc(C.vatNo)}</span>` : ''}</div><div><span class="idk">${isInv ? 'Bill to' : 'Received from'}</span><b>${esc(sc ? sc.name : s.customer || '')}</b>${sc ? `<span>${esc([sc.town, sc.district, sc.region ? sc.region + ' Region' : ''].filter(Boolean).join(', '))}</span>` : ''}</div><div><span class="idk">Date</span><b>${fmtDate(s.date)}</b>${isInv ? `<span class="idk">Due</span><b>${fmtDate(s.dueDate)}</b>` : `<span class="idk">Paid into</span><b>${esc(acctName(s.account))}</b>`}</div></div>
  <table class="doct"><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead><tbody>${(s.lines || []).map(l => `<tr><td>${esc(l.description || (get('products', l.productId) || {}).name || '')}</td><td class="num">${fmtNum(l.qty, num(l.qty) % 1 ? 2 : 0)}</td><td class="num">${fmtMoney(l.price, { bare: true })}</td><td class="num">${fmtMoney(num(l.qty) * num(l.price), { bare: true })}</td></tr>`).join('')}</tbody>
  <tfoot>${s.taxMode === 'vat' ? (() => { const tx = saleTaxes(s); const R = s.taxRates || C; return `<tr class="sub"><td colspan="3">Subtotal</td><td class="num">${fmtMoney(saleSubtotal(s))}</td></tr><tr class="sub"><td colspan="3">VAT ${R.vatRate}%</td><td class="num">${fmtMoney(tx.vat)}</td></tr><tr class="sub"><td colspan="3">NHIL ${R.nhilRate}%</td><td class="num">${fmtMoney(tx.nhil)}</td></tr><tr class="sub"><td colspan="3">GETFund levy ${R.getfundRate}%</td><td class="num">${fmtMoney(tx.getfund)}</td></tr>`; })() : ''}<tr class="tt"><td colspan="3">Total</td><td class="num">${fmtMoney(tot)}</td></tr>${isInv ? `<tr class="sub"><td colspan="3">Paid</td><td class="num">${fmtMoney(paid)}</td></tr><tr class="due"><td colspan="3">Balance due</td><td class="num">${fmtMoney(bal)}</td></tr>` : ''}</tfoot></table>
  ${s.notes ? `<p class="docnote">${esc(s.notes)}</p>` : ''}${isInv && C.paymentInstructions ? `<div class="docpay"><span class="idk">How to pay</span><p>${esc(C.paymentInstructions)}</p></div>` : ''}<footer class="docfoot">Thank you for choosing Adzesua Connect · Technology for Learning</footer></article>`;
}
ACT.salePay = el => { const s = get('sales', el.dataset.id); openForm('payment', { amount: saleBalance(s), date: todayISO(), account: '1010' }, { title: `Payment for ${s.number}`, sub: `Balance ${fmtMoney(saleBalance(s))}`, okLabel: 'Record payment', onSave: async p => { if (num(p.amount) > saleBalance(s) + 0.004) throw { message: `That is more than the balance of ${fmtMoney(saleBalance(s))}.` }; const cur = get('sales', s.id); await save('sales', Object.assign({}, cur, { payments: [...(cur.payments || []), { date: p.date, amount: num(p.amount), account: p.account, note: p.note || '' }] })); return s.id; } }); };
ACT.saleCopy = el => { const s = get('sales', el.dataset.id); const C = settings(); const who = (get('schools', s.schoolId) || {}).name || s.customer || ''; const isInv = s.kind !== 'receipt'; copyText([`*${C.companyName}*`, `${isInv ? 'Invoice' : 'Receipt'} ${s.number} · ${fmtDate(s.date)}`, who ? `${isInv ? 'To' : 'From'}: ${who}` : '', '', ...(s.lines || []).map(l => `• ${l.description} — ${fmtNum(l.qty)} × ${fmtMoney(l.price)} = ${fmtMoney(num(l.qty) * num(l.price))}`), '', `*Total: ${fmtMoney(saleTotal(s))}*`, isInv ? `Paid: ${fmtMoney(salePaid(s))}\n*Balance due: ${fmtMoney(saleBalance(s))}* by ${fmtDate(s.dueDate)}` : 'Paid in full. Thank you!', isInv && C.paymentInstructions ? `\nHow to pay: ${C.paymentInstructions}` : ''].filter(x => x !== null).join('\n').replace(/\n{3,}/g, '\n\n'), 'Copied. Paste it into WhatsApp.'); };
ACT.saleDownload = el => { const s = get('sales', el.dataset.id); const css = [...document.styleSheets].map(ss => { try { return [...ss.cssRules].map(r => r.cssText).join('\n'); } catch (e) { return ''; } }).join('\n'); offerFile(`${s.number}.html`, `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(s.number)} · Adzesua Connect</title><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet"><style>${css}body{background:#fff;padding:24px}.doc{box-shadow:none;margin:0 auto}@media print{body{padding:0}}</style></head><body data-theme="light">${saleDocHtml(s)}<p style="text-align:center;font:12px Inter,sans-serif;color:#667">Open in a browser and press Ctrl+P (or ⌘P) to save as PDF or print.</p></body></html>`); };

/* =================== EXPENSES =================== */
VIEWS.expenses = () => {
  const f = vs('exp'); const t = todayISO(); const [ms] = monthRange(0); const ys = t.slice(0, 4) + '-01-01';
  const months = [...new Set(all('expenses').map(e => monthKey(e.date)))].sort().reverse();
  const rows = all('expenses').filter(e => (!f.cat || e.account === f.cat) && (!f.month || monthKey(e.date) === f.month) && (!f.from || e.paidFrom === f.from) && textMatch(f.q, e.description, e.vendor, e.ref, acctName(e.account)));
  if (!vs('exp').sortK) Object.assign(vs('exp'), { sortK: 'date', dir: 'desc' });
  const E = all('expenses'); const m = E.filter(e => e.date >= ms && e.date <= t); const y = E.filter(e => e.date >= ys && e.date <= t);
  const cats = Object.entries(groupBy(y, e => e.account)).map(([k, v]) => ({ label: acctName(k), value: sum(v, e => num(e.amount)) })).sort((a, b) => b.value - a.value).slice(0, 6);
  return pageHead('Expenses', 'Everything you spend: transport, data bundles, hosting, salaries, bandwidth.', `${btn(ic('dl') + ' Export', 'exportExp', {}, 'ghost')}${btn(ic('plus') + ' Log expense', 'create', { k: 'expenses' })}`) +
    `<div class="grid2"><div class="tiles small col">${tile('This month', fmtMoney(sum(m, e => num(e.amount))), `${m.length} expenses`)}${tile(`This year`, fmtMoney(sum(y, e => num(e.amount))), `${y.length} expenses`)}${tile('Not yet paid', fmtMoney(sum(E.filter(e => e.paidFrom === '2000'), e => num(e.amount))), 'Recorded as owed')}</div>${panel(`Top categories · ${t.slice(0, 4)}`, hbars(cats.map(c => Object.assign(c, { color: 'var(--c2)' }))))}</div>` +
    toolbar({ t: 'exp', search: 'Search expenses', filters: [{ k: 'cat', label: 'Category', opts: acctOpts(['expense', 'cogs', 'asset']).filter(([c]) => c >= '1500') }, { k: 'month', label: 'Month', opts: months.map(k => [k, fmtMonth(k)]) }, { k: 'from', label: 'Paid from', opts: [...cashAccounts().map(a => [a.code, a.name]), ['2000', 'Not paid yet']] }] }) +
    dataTable({ id: 'exp', rows, rowAct: 'open', cols: [{ k: 'date', label: 'Date', f: r => fmtDate(r.date) }, { k: 'description', label: 'Description', f: r => `<b>${esc(r.description)}</b>${r.vendor ? `<span class="muted small block">${esc(r.vendor)}</span>` : ''}` }, { k: 'account', label: 'Category', v: r => acctName(r.account), f: r => esc(acctName(r.account)) }, { k: 'paidFrom', label: 'Paid from', v: r => acctName(r.paidFrom), f: r => r.paidFrom === '2000' ? pill('Owed', 'gold') : esc(acctName(r.paidFrom)) }, { k: 'amount', label: 'Amount', cls: 'num', v: r => num(r.amount), f: r => fmtMoney(r.amount) }], foot: rows.length ? `<tr><td colspan="4">Total shown</td><td class="num">${fmtMoney(sum(rows, e => num(e.amount)))}</td></tr>` : '', empty: empty('No expenses yet', 'Log what you spend so your profit is real.') }).replace(/data-act="open"/g, 'data-act="open" data-k="expenses"');
};
ACT.exportExp = () => offerFile(`adzesua-expenses-${todayISO()}.csv`, toCSV([['Date', 'Description', 'Category', 'Amount', 'Paid from', 'Paid to', 'Reference', 'School', 'Staff'], ...all('expenses').map(e => [e.date, e.description, acctName(e.account), e.amount, acctName(e.paidFrom), e.vendor, e.ref, (get('schools', e.schoolId) || {}).name, staffName(e.staffId)])]));

/* =================== PURCHASES =================== */
VIEWS.purchases = () => {
  const f = vs('pur'); const rows = all('purchases').filter(p => (!f.status || p.status === f.status) && (!f.supplier || p.supplierId === f.supplier) && textMatch(f.q, p.number, (get('suppliers', p.supplierId) || {}).name, ...(p.lines || []).map(l => l.description)));
  if (!vs('pur').sortK) Object.assign(vs('pur'), { sortK: 'date', dir: 'desc' });
  const P = all('purchases'); const open = P.filter(p => ['ordered', 'shipped'].includes(p.status));
  const stl = { ordered: 'Ordered', shipped: 'Shipped', received: 'Received', cancelled: 'Cancelled' };
  return pageHead('Purchases', 'Orders from Alibaba, AliExpress, Jiji and local shops, with landed cost into stock.', `${btn('Suppliers', 'go', { to: 'suppliers' }, 'ghost')}${btn(ic('plus') + ' New purchase', 'create', { k: 'purchases' })}`) +
    `<div class="tiles small">${tile('Open orders', fmtNum(open.length), fmtMoney(sum(open, purchaseTotal)))}${tile('In transit', fmtNum(P.filter(p => p.status === 'shipped').length), 'Shipped, not received')}${tile('You owe suppliers', fmtMoney(Math.max(0, balances('', todayISO())['2000'] || 0)), 'Received but unpaid, plus owed expenses')}${tile('Bought this year', fmtMoney(sum(P.filter(p => p.status !== 'cancelled' && (p.date || '') >= todayISO().slice(0, 4)), purchaseTotal)), 'Including shipping & duty')}</div>` +
    toolbar({ t: 'pur', search: 'Search purchases', filters: [{ k: 'status', label: 'Status', opts: Object.entries(stl) }, { k: 'supplier', label: 'Supplier', opts: all('suppliers').map(s => [s.id, s.name]) }] }) +
    dataTable({ id: 'pur', rows, rowAct: 'open', cols: [{ k: 'number', label: 'PO', f: r => `<b class="mono">${esc(r.number)}</b>` }, { k: 'date', label: 'Ordered', f: r => fmtDate(r.date) }, { k: 'supplier', label: 'Supplier', v: r => (get('suppliers', r.supplierId) || {}).name, f: r => esc((get('suppliers', r.supplierId) || {}).name || '—') }, { k: 'items', label: 'Items', v: r => (r.lines || []).length, f: r => esc((r.lines || []).map(l => l.description || '').filter(Boolean).join(', ').slice(0, 60) || `${(r.lines || []).length} lines`) }, { k: 'status', label: 'Status', f: r => statusPill(stl[r.status] || r.status) }, { k: 'total', label: 'Total', cls: 'num', v: purchaseTotal, f: r => fmtMoney(purchaseTotal(r)) }, { k: 'bal', label: 'Unpaid', cls: 'num', v: r => purchaseTotal(r) - purchasePaid(r), f: r => r.status === 'cancelled' ? '—' : (purchaseTotal(r) - purchasePaid(r) > 0.004 ? fmtMoney(purchaseTotal(r) - purchasePaid(r)) : '<span class="ok">Paid</span>') }], empty: empty('No purchases yet', 'Record orders for blank cards, lanyards, readers and routers.') }).replace(/data-act="open"/g, 'data-act="open" data-k="purchases"');
};

/* =================== INVENTORY =================== */
function lowStock() { const st = inventory().stats; return all('items').filter(i => num(i.reorderLevel) > 0 && (st[i.id] || { qty: 0 }).qty <= num(i.reorderLevel)); }
VIEWS.inventory = () => {
  const f = vs('inv'); const st = inventory().stats;
  const rows = all('items').filter(i => (!f.cat || i.category === f.cat) && textMatch(f.q, i.name, i.sku, i.location)).map(i => { const s = st[i.id] || { qty: 0, value: 0, avg: 0 }; return Object.assign({}, i, { _qty: s.qty, _val: s.value, _avg: s.avg, _state: s.qty <= 0 ? 'Out' : (num(i.reorderLevel) && s.qty <= num(i.reorderLevel) ? 'Low' : 'OK') }); });
  return pageHead('Inventory', 'Blank cards, lanyards, ribbons and hardware: what you have, what it cost, when to reorder.', `${btn('Record movement', 'create', { k: 'moves' }, 'ghost w')}${btn(ic('plus') + ' Add item', 'create', { k: 'items' })}`) +
    `<div class="tiles small">${tile('Stock value', fmtMoney(balances('', todayISO())['1200'] || 0), 'At average landed cost')}${tile('Items', fmtNum(all('items').length), `${rows.filter(r => r._qty > 0).length} in stock`)}${tile('To reorder', fmtNum(lowStock().length), 'At or below reorder level', lowStock().length ? 'warnt' : '')}${tile('Used this month', fmtMoney(sum(all('moves').filter(m => m.type === 'issue' && m.date >= monthRange(0)[0]), m => inventory().moveCost[m.id] || 0)), 'Charged to costs')}</div>` +
    toolbar({ t: 'inv', search: 'Search items', filters: [{ k: 'cat', label: 'Category', opts: ENT.items.fields[2].opts }] }) +
    dataTable({ id: 'invT', rows, rowAct: 'go-item', cols: [{ k: 'name', label: 'Item', f: r => `<b>${esc(r.name)}</b><span class="muted small block">${esc([r.sku, r.category].filter(Boolean).join(' · '))}</span>` }, { k: '_qty', label: 'On hand', cls: 'num', f: r => `<b>${fmtNum(r._qty, r._qty % 1 ? 2 : 0)}</b> <span class="muted small">${esc(r.unit || '')}</span>` }, { k: '_state', label: 'Level', f: r => r._state === 'OK' ? pill('OK', 'good') : r._state === 'Low' ? pill('Reorder', 'gold') : pill('Out', 'bad') }, { k: 'reorderLevel', label: 'Reorder at', cls: 'num', v: r => num(r.reorderLevel), f: r => r.reorderLevel ? fmtNum(r.reorderLevel) : '—' }, { k: '_avg', label: 'Avg cost', cls: 'num', f: r => r._avg ? fmtMoney(r._avg) : '—' }, { k: '_val', label: 'Value', cls: 'num', f: r => fmtMoney(r._val) }, { k: 'location', label: 'Kept at' }], empty: empty('No stock items yet', 'Add the things you buy and use: blank NFC cards, lanyards, card holders, printer ribbons.') });
};
ACT['go-item'] = el => { location.hash = 'item-' + el.dataset.id; };
VIEWS.item = id => {
  const it = get('items', id); if (!it) return pageHead('Not found') + empty('This item no longer exists', '', `<a class="btn ghost" href="#inventory">Back</a>`);
  const inv = inventory(); const s = inv.stats[id] || { qty: 0, value: 0, avg: 0 }; const h = (inv.history[id] || []).slice().reverse();
  const pre = JSON.stringify({ itemId: id });
  return pageHead(it.name, `${esc([it.sku, it.category, it.location].filter(Boolean).join(' · '))}`, `${btn(ic('edit') + ' Edit', 'edit', { k: 'items', id }, 'ghost')}${btn('Opening stock', 'create', { k: 'moves', preset: JSON.stringify({ itemId: id, type: 'opening', unitCost: it.defaultCost }) }, 'ghost w')}${btn('Record use', 'create', { k: 'moves', preset: JSON.stringify({ itemId: id, type: 'issue' }) })}`, `<a href="#inventory" class="lnk">Inventory</a> /`) +
    `<div class="tiles small">${tile('On hand', `${fmtNum(s.qty, s.qty % 1 ? 2 : 0)} <small>${esc(it.unit || '')}</small>`, num(it.reorderLevel) ? `Reorder at ${fmtNum(it.reorderLevel)}` : 'No reorder level set')}${tile('Average cost', fmtMoney(s.avg), 'Landed, weighted')}${tile('Value', fmtMoney(s.value), '')}${tile('Supplier', esc((get('suppliers', it.supplierId) || {}).name || '—'), '')}</div>` +
    panel('Stock card', h.length ? `<div class="tw"><table class="dt"><thead><tr><th>Date</th><th>Movement</th><th>Reference</th><th class="num">In</th><th class="num">Out</th><th class="num">Balance</th><th class="num">Cost</th></tr></thead><tbody>${h.map(e => `<tr class="click" ${e.src === 'move' ? `data-act="open" data-k="moves" data-id="${e.srcId}"` : `data-act="open" data-k="purchases" data-id="${e.srcId}"`}><td>${fmtDate(e.date)}</td><td>${e.src === 'purchase' ? 'Purchase received' : esc({ issue: 'Used / issued', opening: 'Opening stock', 'adjust-in': 'Adjustment in', 'adjust-out': 'Adjustment out' }[e.type] || e.type)}</td><td>${esc(e.ref || '')}</td><td class="num">${e.kind === 'in' ? fmtNum(e.qty) : ''}</td><td class="num">${e.kind === 'out' ? fmtNum(e.qty) : ''}</td><td class="num"><b>${fmtNum(e.balance)}</b></td><td class="num">${fmtMoney(e.cost || 0)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">No movements yet. Record opening stock or receive a purchase.</p>');
};

/* =================== SUPPLIERS =================== */
VIEWS.suppliers = () => {
  const f = vs('sup'); const rows = all('suppliers').filter(s => (!f.platform || s.platform === f.platform) && textMatch(f.q, s.name, s.supplies, s.country)).map(s => { const ps = all('purchases').filter(p => p.supplierId === s.id && p.status !== 'cancelled'); return Object.assign({}, s, { _n: ps.length, _tot: sum(ps, purchaseTotal), _last: ps.map(p => p.date).sort().pop() || '' }); });
  return pageHead('Suppliers', 'Where you buy cards, readers and network gear.', btn(ic('plus') + ' Add supplier', 'create', { k: 'suppliers' })) +
    toolbar({ t: 'sup', search: 'Search suppliers', filters: [{ k: 'platform', label: 'Platform', opts: ['Alibaba', 'AliExpress', 'Jiji', 'Local shop', 'Direct', 'Other'] }] }) +
    dataTable({ id: 'sup', rows, rowAct: 'open', cols: [{ k: 'name', label: 'Supplier', f: r => `<b>${esc(r.name)}</b><span class="muted small block">${esc((r.supplies || '').slice(0, 70))}</span>` }, { k: 'platform', label: 'Platform', f: r => r.platform ? pill(r.platform, 'info') : '—' }, { k: 'country', label: 'Country' }, { k: 'phone', label: 'Contact', f: r => r.phone ? phoneCell(r.phone) : esc(r.url || '—') }, { k: '_n', label: 'Orders', cls: 'num' }, { k: '_tot', label: 'Bought', cls: 'num', f: r => fmtMoney(r._tot) }, { k: '_last', label: 'Last order', f: r => fmtDate(r._last) }], empty: empty('No suppliers yet', 'Add the stores you buy from.') }).replace(/data-act="open"/g, 'data-act="open" data-k="suppliers"');
};

/* =================== TEAM =================== */
VIEWS.team = () => {
  const staff = all('staff').sort((a, b) => (a.status === 'Former') - (b.status === 'Former') || a.name.localeCompare(b.name)); const ys = todayISO().slice(0, 4) + '-01-01';
  return pageHead('Team', 'Who works on Adzesua Connect, what they own and what they are paid.', btn(ic('plus') + ' Add team member', 'create', { k: 'staff' })) +
    (staff.length ? `<div class="people">${staff.map(p => { const paid = sum(all('expenses').filter(e => e.staffId === p.id && e.date >= ys), e => num(e.amount)); const openActs = all('activities').filter(a => a.ownerId === p.id && !a.done).length; const deals = all('deals').filter(d => d.ownerId === p.id && !['Won', 'Lost'].includes(d.stage)); const won = all('deals').filter(d => d.ownerId === p.id && d.stage === 'Won'); return `<article class="person ${p.status === 'Former' ? 'dim' : ''}"><div class="av" aria-hidden="true">${esc((p.name || '?').split(' ').map(x => x[0]).slice(0, 2).join(''))}</div><div class="pi"><h3>${esc(p.name)}</h3><span class="muted">${esc(p.role || '')}${p.location ? ' · ' + esc(p.location) : ''}</span></div>
      <dl class="kv sm"><dt>Phone</dt><dd>${p.phone ? phoneCell(p.phone) : '—'}</dd><dt>Pay</dt><dd>${esc(p.payType || '—')}${num(p.monthlyPay) ? ' · ' + fmtMoney(p.monthlyPay) + '/mo' : ''}${num(p.commissionRate) ? ' · ' + p.commissionRate + '%' : ''}</dd><dt>Paid this year</dt><dd>${fmtMoney(paid)}</dd><dt>Open activities</dt><dd>${openActs}</dd><dt>Opportunities</dt><dd>${deals.length} open · ${won.length} won (${fmtMoney(sum(won, d => num(d.value)))})</dd></dl>
      <div class="row">${btn('Edit', 'edit', { k: 'staff', id: p.id }, 'ghost sm')}${btn('Record pay', 'payStaff', { id: p.id }, 'ghost sm w')}${btn('Assign task', 'create', { k: 'activities', preset: JSON.stringify({ ownerId: p.id }) }, 'ghost sm w')}</div></article>`; }).join('')}</div>` : empty('No team members yet', 'Add yourself and Sharon so you can assign activities and track pay.'));
};
ACT.payStaff = el => { const p = get('staff', el.dataset.id); const d = new Date(); openForm('expenses', { staffId: p.id, account: '6000', amount: num(p.monthlyPay) || '', description: `${/commission/i.test(p.payType || '') && !num(p.monthlyPay) ? 'Commission' : 'Salary'} · ${p.name} · ${MONTHS[d.getMonth()]} ${d.getFullYear()}`, vendor: p.name, paidFrom: '1010', date: todayISO() }, { title: `Pay ${p.name}` }); };

/* =================== REPORTS =================== */
function periodRange(key, f) {
  const t = todayISO(); const y = t.slice(0, 4); const d = new Date(); const q = Math.floor(d.getMonth() / 3);
  switch (key) {
    case 'month': return monthRange(0); case 'last': return monthRange(-1);
    case 'quarter': { const s = new Date(d.getFullYear(), q * 3, 1); const e = new Date(d.getFullYear(), q * 3 + 3, 0); return [`${s.getFullYear()}-${pad(s.getMonth() + 1)}-01`, `${e.getFullYear()}-${pad(e.getMonth() + 1)}-${pad(e.getDate())}`]; }
    case 'ytd': return [`${y}-01-01`, t]; case 'lastyear': return [`${+y - 1}-01-01`, `${+y - 1}-12-31`];
    case '12m': return [addDays(t, -365), t]; case 'all': return ['', t];
    case 'custom': return [f.from || `${y}-01-01`, f.to || t];
  }
  return [`${y}-01-01`, t];
}
const PERIODS = [['month', 'This month'], ['last', 'Last month'], ['quarter', 'This quarter'], ['ytd', 'Year to date'], ['12m', 'Last 12 months'], ['lastyear', 'Last year'], ['all', 'All time'], ['custom', 'Custom']];
VIEWS.reports = () => {
  const f = vs('rep'); const tab = f.tab || 'pnl'; const per = f.period || 'ytd'; const [from, to] = periodRange(per, f);
  const tabs = [['pnl', 'Profit & loss'], ['bs', 'Balance sheet'], ['cash', 'Cash flow'], ['tb', 'Trial balance'], ['ar', 'Who owes you'], ['rev', 'Revenue analysis']];
  const periodCtl = ['pnl', 'cash', 'rev'].includes(tab) ? `<div class="toolbar"><label class="fsel"><span class="sr">Period</span><select id="rep-period" data-vs="rep.period">${PERIODS.map(([k, l]) => `<option value="${k}" ${per === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>${per === 'custom' ? `<label class="fsel"><span class="sr">From</span><input type="date" id="rep-from" data-vs="rep.from" value="${esc(f.from || from)}"></label><label class="fsel"><span class="sr">To</span><input type="date" id="rep-to" data-vs="rep.to" value="${esc(f.to || to)}"></label>` : ''}<span class="muted small">${from ? fmtDate(from) : 'Start'} – ${fmtDate(to)}</span></div>` : (tab === 'bs' || tab === 'tb' ? `<div class="toolbar"><label class="fsel"><span class="muted small">As at</span> <input type="date" id="rep-asat" data-vs="rep.asat" value="${esc(f.asat || todayISO())}"></label></div>` : '');
  let body = '';
  const line = (l, v, cls = '') => `<tr class="${cls}"><td>${l}</td><td class="num">${v}</td></tr>`;
  const acctRow = x => line(`<a class="lnk" href="#account-${x.code}">${esc(x.name)}</a>`, fmtMoney(x.amount));
  if (tab === 'pnl') {
    const p = pnl(from, to); const nz = a => a.filter(x => Math.abs(x.amount) > 0.004);
    body = `<div class="stmt"><h3>${esc(settings().companyName)}</h3><p class="muted">Profit and loss · ${from ? fmtDate(from) : 'all time'} to ${fmtDate(to)}</p><table class="st">
      <tr class="sh"><td colspan="2">Revenue</td></tr>${nz(p.income).map(acctRow).join('') || line('<span class="muted">No revenue</span>', '')}${line('Total revenue', fmtMoney(p.totalIncome), 'tot')}
      <tr class="sh"><td colspan="2">Direct costs</td></tr>${nz(p.cogs).map(acctRow).join('') || line('<span class="muted">None</span>', '')}${line('Gross profit', fmtMoney(p.gross), 'tot')}${p.totalIncome ? line('<span class="muted">Gross margin</span>', `<span class="muted">${fmtNum(100 * p.gross / p.totalIncome)}%</span>`) : ''}
      <tr class="sh"><td colspan="2">Operating expenses</td></tr>${nz(p.expense).map(acctRow).join('') || line('<span class="muted">None</span>', '')}${line('Total operating expenses', fmtMoney(p.totalExpense), 'tot')}
      ${line(p.net >= 0 ? 'Net profit' : 'Net loss', fmtMoney(p.net), 'grand ' + (p.net < 0 ? 'neg' : ''))}</table></div>`;
  } else if (tab === 'bs') {
    const asat = f.asat || todayISO(); const b = balanceSheet(asat); const nz = a => a.filter(x => Math.abs(x.amount) > 0.004);
    body = `<div class="stmt"><h3>${esc(settings().companyName)}</h3><p class="muted">Balance sheet as at ${fmtDate(asat)}</p><table class="st">
      <tr class="sh"><td colspan="2">Assets</td></tr>${nz(b.assets).map(acctRow).join('') || line('<span class="muted">None</span>', '')}${line('Total assets', fmtMoney(b.totalAssets), 'tot')}
      <tr class="sh"><td colspan="2">Liabilities</td></tr>${nz(b.liabilities).map(acctRow).join('') || line('<span class="muted">None</span>', '')}${line('Total liabilities', fmtMoney(b.totalLiabilities), 'tot')}
      <tr class="sh"><td colspan="2">Equity</td></tr>${nz(b.equity).map(acctRow).join('')}${line('Profit to date (retained)', fmtMoney(b.earnings))}${line('Total equity', fmtMoney(b.totalEquity), 'tot')}
      ${line('Liabilities + equity', fmtMoney(b.totalLiabilities + b.totalEquity), 'grand')}</table>${Math.abs(b.check) > 0.01 ? `<p class="banner bad">Out of balance by ${fmtMoney(b.check)}.</p>` : `<p class="ok small">${ic('check', 14)} Balanced: assets equal liabilities plus equity.</p>`}</div>`;
  } else if (tab === 'tb') {
    const asat = f.asat || todayISO(); const bal = balances('', asat); const A = accounts().filter(a => Math.abs(bal[a.code] || 0) > 0.004);
    const dr = a => normalDebit(a.type) ? Math.max(0, bal[a.code]) : Math.max(0, -bal[a.code]); const cr = a => normalDebit(a.type) ? Math.max(0, -bal[a.code]) : Math.max(0, bal[a.code]);
    body = `<div class="stmt wide"><p class="muted">Trial balance as at ${fmtDate(asat)}</p><div class="tw"><table class="dt"><thead><tr><th>Code</th><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>${A.map(a => `<tr class="click" data-act="go" data-to="account-${a.code}"><td class="mono">${a.code}</td><td>${esc(a.name)}</td><td class="num">${dr(a) ? fmtMoney(dr(a), { bare: true }) : ''}</td><td class="num">${cr(a) ? fmtMoney(cr(a), { bare: true }) : ''}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="2">Totals</td><td class="num">${fmtMoney(sum(A, dr))}</td><td class="num">${fmtMoney(sum(A, cr))}</td></tr></tfoot></table></div></div>`;
  } else if (tab === 'cash') {
    const cashCodes = cashAccounts().map(a => a.code); const L = ledger().filter(e => e.date >= from && e.date <= to);
    const flows = {}; let open = 0; ledger().filter(e => from && e.date < from).forEach(e => e.lines.forEach(l => { if (cashCodes.includes(l.acct)) open += l.dr - l.cr; }));
    L.forEach(e => { const c = e.lines.filter(l => cashCodes.includes(l.acct)); const net = sum(c, l => l.dr - l.cr); if (Math.abs(net) < 0.004) return; const other = e.lines.filter(l => !cashCodes.includes(l.acct)); const label = other.length ? (other[0].acct === '1100' ? 'Payments from customers' : other[0].acct === '2000' ? 'Payments to suppliers' : acctName(other[0].acct)) : 'Transfers between accounts'; flows[label] = (flows[label] || 0) + net; });
    const ins = Object.entries(flows).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]); const outs = Object.entries(flows).filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]);
    const tin = sum(ins, x => x[1]), tout = sum(outs, x => x[1]);
    body = `<div class="stmt"><p class="muted">Cash, MoMo and bank movements · ${from ? fmtDate(from) : 'all time'} to ${fmtDate(to)}</p><table class="st">${line('Opening balance', fmtMoney(open), 'tot')}<tr class="sh"><td colspan="2">Money in</td></tr>${ins.map(([k, v]) => line(esc(k), fmtMoney(v))).join('') || line('<span class="muted">None</span>', '')}${line('Total in', fmtMoney(tin), 'tot')}<tr class="sh"><td colspan="2">Money out</td></tr>${outs.map(([k, v]) => line(esc(k), fmtMoney(v))).join('') || line('<span class="muted">None</span>', '')}${line('Total out', fmtMoney(tout), 'tot')}${line('Closing balance', fmtMoney(open + tin + tout), 'grand')}</table></div>`;
  } else if (tab === 'ar') {
    const t = todayISO(); const inv = all('sales').filter(s => saleLive(s) && s.kind !== 'receipt' && saleBalance(s) > 0.004);
    const bucket = s => { const d = s.dueDate ? daysBetween(s.dueDate, t) : 0; return d <= 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : 4; };
    const B = ['Not yet due', '1–30 days late', '31–60 days', '61–90 days', 'Over 90 days'];
    const by = groupBy(inv, s => s.schoolId || s.customer || '—');
    const rows = Object.entries(by).map(([k, list]) => { const b = [0, 0, 0, 0, 0]; list.forEach(s => (b[bucket(s)] += saleBalance(s))); return { k, name: (get('schools', k) || {}).name || k, b, tot: sum(b) }; }).sort((a, b) => b.tot - a.tot);
    body = rows.length ? `<div class="tw"><table class="dt"><thead><tr><th>Customer</th>${B.map(x => `<th class="num">${x}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>${rows.map(r => `<tr ${get('schools', r.k) ? `class="click" data-act="go" data-to="school-${r.k}"` : ''}><td><b>${esc(r.name)}</b></td>${r.b.map((v, i) => `<td class="num ${v && i >= 2 ? 'badt' : ''}">${v ? fmtMoney(v, { bare: true }) : ''}</td>`).join('')}<td class="num"><b>${fmtMoney(r.tot)}</b></td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td>${[0, 1, 2, 3, 4].map(i => `<td class="num">${fmtMoney(sum(rows, r => r.b[i]), { bare: true })}</td>`).join('')}<td class="num">${fmtMoney(sum(rows, r => r.tot))}</td></tr></tfoot></table></div>` : empty('Nobody owes you money', 'Unpaid invoices appear here, grouped by how late they are.');
  } else if (tab === 'rev') {
    const L = all('sales').filter(s => saleLive(s) && s.date >= from && s.date <= to).flatMap(s => (s.lines || []).map(l => ({ s, l, amt: num(l.qty) * num(l.price) })));
    const bySchool = Object.entries(groupBy(L, x => (get('schools', x.s.schoolId) || {}).name || x.s.customer || 'Other')).map(([k, v]) => ({ label: k, value: sum(v, x => x.amt) })).sort((a, b) => b.value - a.value).slice(0, 10);
    const byProd = Object.entries(groupBy(L, x => acctName(x.l.account))).map(([k, v]) => ({ label: k, value: sum(v, x => x.amt) })).sort((a, b) => b.value - a.value);
    const ms = monthlySeries(12);
    body = `<div class="grid2">${panel('By stream', hbars(byProd))}${panel('By school (top 10)', hbars(bySchool))}</div>${panel('Monthly profit · last 12 months', `<div class="tw"><table class="dt"><thead><tr><th>Month</th><th class="num">Revenue</th><th class="num">Costs</th><th class="num">Profit</th></tr></thead><tbody>${ms.map(m => `<tr><td>${fmtMonth(m.key)}</td><td class="num">${fmtMoney(m.income)}</td><td class="num">${fmtMoney(m.costs)}</td><td class="num ${m.net < 0 ? 'badt' : ''}"><b>${fmtMoney(m.net)}</b></td></tr>`).join('')}</tbody></table></div>`)}`;
  }
  return pageHead('Reports', 'Built automatically from every sale, payment, purchase, expense and stock movement.', `${btn(ic('dl') + ' Export ledger', 'exportLedger', {}, 'ghost')}`) +
    `<div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" class="tab ${tab === k ? 'on' : ''}" data-act="chip" data-vsk="rep.tab" data-v="${k}">${l}</button>`).join('')}</div>${periodCtl}${body}`;
};
ACT.exportLedger = () => offerFile(`adzesua-general-ledger-${todayISO()}.csv`, toCSV([['Date', 'Reference', 'Description', 'Account code', 'Account', 'Debit', 'Credit', 'Source'], ...ledger().flatMap(e => e.lines.map(l => [e.date, e.ref, e.memo, l.acct, acctName(l.acct), l.dr || '', l.cr || '', e.src]))]));

/* =================== ACCOUNTS / LEDGER =================== */
VIEWS.ledger = () => {
  const bal = balances('', todayISO()); const A = accounts(); const by = groupBy(A, a => a.type);
  return pageHead('Chart of accounts', 'Every account and its balance today. Click one to see its transactions.', btn(ic('plus') + ' Add account', 'create', { k: 'accounts' }, 'ghost w')) +
    `<div class="grid2">${Object.entries(ACCT_TYPES).map(([k, l]) => panel(l, `<ul class="list acc">${(by[k] || []).map(a => `<li class="li click" data-act="go" data-to="account-${a.code}"><span class="mono muted">${a.code}</span><div class="lim"><b>${esc(a.name)}</b>${a.sub === 'cash' ? '<span class="muted small">Money account</span>' : ''}</div><span class="amt ${Math.abs(bal[a.code] || 0) < 0.004 ? 'muted' : ''}">${fmtMoney(bal[a.code] || 0)}</span></li>`).join('')}</ul>`)).join('')}</div>`;
};
VIEWS.account = code => {
  const a = acct(code); if (!a) return pageHead('Account not found') + `<a class="btn ghost" href="#ledger">Back</a>`;
  const f = vs('acc'); const from = f.from || ''; const to = f.to || todayISO();
  const nd = normalDebit(a.type); const sign = l => nd ? l.dr - l.cr : l.cr - l.dr;
  let open = 0; ledger().filter(e => from && e.date < from).forEach(e => e.lines.filter(l => l.acct === code).forEach(l => (open += sign(l))));
  let run = open; const rows = ledger().filter(e => (!from || e.date >= from) && e.date <= to && e.lines.some(l => l.acct === code)).map(e => { const ls = e.lines.filter(l => l.acct === code); const dr = sum(ls, l => l.dr), cr = sum(ls, l => l.cr); run += nd ? dr - cr : cr - dr; return { e, dr, cr, run }; });
  return pageHead(`${a.code} · ${a.name}`, `${ACCT_TYPES[a.type]}${a.sub === 'cash' ? ' · money account' : ''}`, a.id ? btn(ic('edit') + ' Edit', 'edit', { k: 'accounts', id: a.id }, 'ghost') : '', `<a href="#ledger" class="lnk">Accounts</a> /`) +
    `<div class="toolbar"><label class="fsel"><span class="muted small">From</span> <input type="date" id="acc-from" data-vs="acc.from" value="${esc(from)}"></label><label class="fsel"><span class="muted small">To</span> <input type="date" id="acc-to" data-vs="acc.to" value="${esc(to)}"></label><span class="tspace"></span><span>Balance <b>${fmtMoney(run)}</b></span></div>` +
    (rows.length ? `<div class="tw"><table class="dt"><thead><tr><th>Date</th><th>Ref</th><th>Description</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr></thead><tbody>${from ? `<tr><td>${fmtDate(from)}</td><td></td><td class="muted">Opening balance</td><td></td><td></td><td class="num">${fmtMoney(open, { bare: true })}</td></tr>` : ''}${rows.map(r => `<tr class="click" data-act="srcOpen" data-src="${r.e.src}" data-id="${r.e.srcId}"><td>${fmtDate(r.e.date)}</td><td class="mono">${esc(r.e.ref)}</td><td>${esc(r.e.memo)}</td><td class="num">${r.dr ? fmtMoney(r.dr, { bare: true }) : ''}</td><td class="num">${r.cr ? fmtMoney(r.cr, { bare: true }) : ''}</td><td class="num"><b>${fmtMoney(r.run, { bare: true })}</b></td></tr>`).join('')}</tbody></table></div>` : empty('No transactions in this period'));
};
ACT.srcOpen = el => { const { src, id } = el.dataset; if (src === 'sale') location.hash = 'sale-' + id; else { const k = { purchase: 'purchases', expense: 'expenses', move: 'moves', journal: 'journals' }[src]; const r = get(k, id); r && openForm(k, r); } };

/* =================== JOURNAL =================== */
VIEWS.journal = () => {
  const f = vs('jnl'); const src = f.src || '';
  const L = ledger().filter(e => (!src || e.src === src) && textMatch(f.q, e.ref, e.memo, ...e.lines.map(l => acctName(l.acct)))).slice().reverse();
  const shown = L.slice(0, f.limit || 80);
  return pageHead('Journal', 'Every double-entry posting. Most are created for you; add manual entries for capital, loans, transfers and corrections.', btn(ic('plus') + ' Manual entry', 'create', { k: 'journals' })) +
    toolbar({ t: 'jnl', search: 'Search entries', filters: [{ k: 'src', label: 'Source', opts: [['sale', 'Sales'], ['purchase', 'Purchases'], ['expense', 'Expenses'], ['move', 'Stock'], ['journal', 'Manual']] }] }) +
    (shown.length ? `<div class="jlist">${shown.map(e => `<div class="je click" data-act="srcOpen" data-src="${e.src}" data-id="${e.srcId}"><div class="jeh"><span>${fmtDate(e.date)}</span><span class="mono">${esc(e.ref)}</span><b>${esc(e.memo)}</b>${pill({ sale: 'Sale', purchase: 'Purchase', expense: 'Expense', move: 'Stock', journal: 'Manual' }[e.src], e.src === 'journal' ? 'gold' : '')}</div><table class="jet">${e.lines.map(l => `<tr><td class="${l.cr ? 'ind' : ''}">${esc(acctName(l.acct))}</td><td class="num">${l.dr ? fmtMoney(l.dr, { bare: true }) : ''}</td><td class="num">${l.cr ? fmtMoney(l.cr, { bare: true }) : ''}</td></tr>`).join('')}</table></div>`).join('')}</div>${L.length > shown.length ? `<div class="morebar"><span class="muted">Showing ${shown.length} of ${L.length}</span><button class="btn ghost" data-act="more" data-t="jnl">Show more</button></div>` : ''}` : empty('No entries yet', 'Start with a manual entry for the share capital the shareholders paid in.', `<div class="row">${btn('Record share capital', 'create', { k: 'journals', preset: JSON.stringify({ memo: 'Share capital paid in by shareholders', lines: [{ account: '1020', debit: '', credit: '' }, { account: '3000', debit: '', credit: '' }] }) })}</div>`));
};

/* =================== SETUP =================== */
ENT.company = { coll: 'settings', label: 'Company details', title: () => 'Company', size: 'lg', fields: [
  { k: 'companyName', label: 'Registered name', req: true, span: 2 }, { k: 'tagline', label: 'Tagline' }, { k: 'regNo', label: 'Registration number' },
  { k: 'address', label: 'Registered office', span: 2 }, { k: 'phone', label: 'Phone', type: 'tel' }, { k: 'email', label: 'Email', type: 'email' }, { k: 'tin', label: 'TIN (GRA)' },
  { k: 'paymentInstructions', label: 'How customers pay you', type: 'textarea', span: 2, help: 'Printed on invoices, e.g. MoMo number and name, bank account details.' },
] };
ENT.pricing = { coll: 'settings', label: 'Card & pricing settings', title: () => 'Pricing', fields: [
  { k: 'academicYear', label: 'Current academic year', req: true, ph: '2026/27', help: 'Renewals are tracked per academic year.' }, { k: 'cardPrefix', label: 'Card number prefix', req: true },
  { k: 'cardPrice', label: 'Card price (Form 1)', type: 'money', req: true }, { k: 'cardCost', label: 'Cost to produce one card', type: 'money' },
  { k: 'renewalFee', label: 'Yearly exeat renewal fee', type: 'money' }, { k: 'replacementFee', label: 'Replacement card fee', type: 'money' },
  { k: 'wifiPackagePrice', label: 'Wi-Fi 1GB package price', type: 'money' }, { k: 'invoiceDueDays', label: 'Invoice payment terms (days)', type: 'number', min: 0 },
] };
const saveSettings = r => { const cur = get('settings', 'company') || {}; return save('settings', Object.assign({}, cur, r, { id: 'company' })); };
ACT.editCompany = () => openForm('company', settings(), { onSave: saveSettings, noDelete: true, title: 'Company details' });
ACT.editPricing = () => openForm('pricing', settings(), { onSave: async r => { await saveSettings(r); for (const [cat, k] of [['card', 'cardPrice'], ['renewal', 'renewalFee'], ['replacement', 'replacementFee'], ['wifi', 'wifiPackagePrice']]) { const p = productBy(cat); if (p && num(r[k]) && num(p.price) !== num(r[k])) await save('products', Object.assign({}, p, { price: num(r[k]) })); } return 'company'; }, noDelete: true, title: 'Card & pricing settings' });
VIEWS.setup = () => {
  const s = settings(); const f = vs('set');
  const counts = COLLS.filter(c => c !== 'settings').map(c => [c, S[c].size]);
  return pageHead('Setup', 'Company details, prices, products and your data.') +
    `<div class="grid2">${panel('Company', `<dl class="kv"><dt>Name</dt><dd>${esc(s.companyName)}</dd><dt>Registered office</dt><dd>${esc(s.address || '—')}</dd><dt>Registration no.</dt><dd>${esc(s.regNo || 'TBC')}</dd><dt>TIN</dt><dd>${esc(s.tin || '—')}</dd><dt>Phone · email</dt><dd>${esc([s.phone, s.email].filter(Boolean).join(' · ') || '—')}</dd><dt>On invoices</dt><dd>${esc(s.paymentInstructions || 'No payment instructions yet')}</dd></dl>`, btn(ic('edit', 14) + ' Edit', 'editCompany', {}, 'ghost sm w'))}
    ${panel('Cards & pricing', `<dl class="kv"><dt>Academic year</dt><dd>${esc(s.academicYear)}</dd><dt>Card numbers</dt><dd class="mono">${esc(s.cardPrefix)}-SWS-00001</dd><dt>Card price</dt><dd>${fmtMoney(s.cardPrice)} <span class="muted">(cost ${fmtMoney(s.cardCost)})</span></dd><dt>Exeat renewal</dt><dd>${num(s.renewalFee) ? fmtMoney(s.renewalFee) + ' a year' : pill('Not set', 'gold')}</dd><dt>Replacement</dt><dd>${fmtMoney(s.replacementFee)}</dd><dt>Wi-Fi 1GB</dt><dd>${fmtMoney(s.wifiPackagePrice)}</dd><dt>Payment terms</dt><dd>${s.invoiceDueDays} days</dd></dl>`, btn(ic('edit', 14) + ' Edit', 'editPricing', {}, 'ghost sm w'))}</div>
    ${panel('Products & services', dataTable({ id: 'prod', rows: all('products'), rowAct: 'open', cols: [{ k: 'name', label: 'Product', f: r => `<b>${esc(r.name)}</b>` }, { k: 'category', label: 'Kind' }, { k: 'price', label: 'Price', cls: 'num', v: r => num(r.price), f: r => fmtMoney(r.price) }, { k: 'account', label: 'Income account', v: r => r.account, f: r => esc(acctName(r.account)) }, { k: 'active', label: 'For sale', v: r => r.active !== false ? 1 : 0, f: r => r.active !== false ? '<span class="ok">Yes</span>' : '<span class="muted">No</span>' }], empty: empty('No products yet') }).replace(/data-act="open"/g, 'data-act="open" data-k="products"'), btn(ic('plus', 14) + ' Product', 'create', { k: 'products' }, 'ghost sm w'))}
    <div class="grid2">${panel('Your data', `<p class="small">Your records live in this page's private store and are shared only with people you give access to. Keep a backup file now and then.</p><div class="row">${btn(ic('dl') + ' Download full backup', 'backup', {}, 'ghost')}${btn('Restore from backup', 'restore', {}, 'ghost w')}</div><p class="muted small">${counts.filter(([, n]) => n).map(([c, n]) => `${fmtNum(n)} ${c}`).join(' · ') || 'No records yet.'}</p>`)}
    ${panel('Exports', `<div class="row wrap">${btn('Schools', 'exportSchools', {}, 'ghost sm')}${btn('Contacts', 'exportContacts', {}, 'ghost sm')}${btn('Cards', 'exportCards', {}, 'ghost sm')}${btn('Sales', 'exportSales', {}, 'ghost sm')}${btn('Expenses', 'exportExp', {}, 'ghost sm')}${btn('General ledger', 'exportLedger', {}, 'ghost sm')}</div><p class="muted small">CSV files open in Excel and Google Sheets.</p>`)}</div>`;
};
ACT.backup = () => { const out = { app: 'Adzesua OS', exportedAt: nowISO(), data: {} }; COLLS.forEach(c => (out.data[c] = all(c))); offerFile(`adzesua-backup-${todayISO()}.json`, JSON.stringify(out, null, 1)); };
ACT.restore = async () => {
  const f = await pickFile('.json,application/json'); if (!f) return; let j; try { j = JSON.parse(f.text); } catch (e) { return toast('That file is not a valid backup.', 'bad'); }
  if (!j || !j.data) return toast('That file is not an Adzesua OS backup.', 'bad');
  const recs = COLLS.flatMap(c => (j.data[c] || []).filter(r => r && r.id).map(r => [c, r]));
  const ok = await ask({ title: `Restore ${recs.length} records?`, body: `Records in the backup replace records with the same ID. Records not in the backup are kept. Backup from ${fmtDate((j.exportedAt || '').slice(0, 10))}.`, ok: 'Restore' }); if (!ok) return;
  APP.busy = { label: 'Restoring', done: 0, total: recs.length };
  try { for (const [c, r] of recs) { await save(c, r); APP.busy.done++; scheduleRender(); await sleep(60); } toast('Backup restored'); } catch (e) { toast(e.message, 'bad'); } finally { APP.busy = null; scheduleRender(); }
};

/* ---------- boot ---------- */
function renderQmenu() {
  $('#qmenu').innerHTML = [['sales', 'Invoice', { kind: 'invoice' }], ['sales', 'Sales receipt', { kind: 'receipt' }], ['wifiLog', 'Wi-Fi sales'], ['expenses', 'Expense'], ['purchases', 'Purchase'], ['cards', 'Student card'], ['batches', 'Card batch'], ['schools', 'School'], ['contacts', 'Contact'], ['deals', 'Opportunity'], ['activities', 'Activity'], ['tickets', 'Support ticket'], ['projects', 'Project'], ['leave', 'Leave request'], ['assets', 'Fixed asset'], ['moves', 'Stock movement']].filter(([k]) => typeof canWriteColl !== 'function' || canWriteColl(k === 'wifiLog' ? 'sales' : (ENT[k] && ENT[k].coll) || k)).filter(([k]) => typeof allowed !== 'function' || ({ sales: 'sales', wifiLog: 'wifi', expenses: 'expenses', purchases: 'purchases', cards: 'card-registry', batches: 'cards', schools: 'schools', contacts: 'contacts', deals: 'pipeline', activities: 'activities', tickets: 'support', projects: 'projects', leave: 'leave', assets: 'assets', moves: 'inventory' }[k] ? allowed({ sales: 'sales', wifiLog: 'wifi', expenses: 'expenses', purchases: 'purchases', cards: 'card-registry', batches: 'cards', schools: 'schools', contacts: 'contacts', deals: 'pipeline', activities: 'activities', tickets: 'support', projects: 'projects', leave: 'leave', assets: 'assets', moves: 'inventory' }[k]) : true)).map(([k, l, p]) => `<button class="gr" data-act="create" data-k="${k}" ${p ? `data-preset='${JSON.stringify(p)}'` : ''}><span class="grl">${l}</span></button>`).join('');
}
function boot() { render(); connect(); }
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
ACT.skipMain = () => $('#main').focus();
