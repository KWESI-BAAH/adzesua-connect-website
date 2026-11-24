'use strict';
/* =========================================================
   Adzesua OS — core: state, data store, utilities, engines
   ========================================================= */

const APP = { writeIssue: null, db: null, user: null, downloads: null, canWrite: true, ready: false, offline: false, uid: null, me: null, version: 0, loadNote: '' };
const COLLS = ['schools', 'contacts', 'deals', 'activities', 'batches', 'cards', 'devices', 'items', 'moves', 'suppliers', 'purchases', 'sales', 'expenses', 'journals', 'staff', 'products', 'accounts', 'settings', 'departments', 'leave', 'staffpay', 'payruns', 'advances', 'tickets', 'projects', 'budgets', 'assets', 'members', 'invites', 'requests', 'sms', 'smsconfig'];
const S = {};
COLLS.forEach(c => (S[c] = new Map()));

/* ---------- utilities ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const num = v => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isFinite(n) ? n : 0; };
const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const pad = (n, w = 2) => String(n).padStart(w, '0');
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const nowISO = () => new Date().toISOString();
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const monthKey = iso => (iso || '').slice(0, 7);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = iso => { if (!iso) return '—'; const [y, m, d] = iso.slice(0, 10).split('-'); if (!d) return iso; return `${+d} ${MONTHS[+m - 1]} ${y}`; };
const fmtMonth = key => { const [y, m] = key.split('-'); return `${MONTHS[+m - 1]} ${y.slice(2)}`; };
const fmtNum = (n, d = 0) => (+n || 0).toLocaleString('en-GH', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtMoney = (n, opts = {}) => { const v = r2(+n || 0); const s = Math.abs(v).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return (v < 0 ? '−' : '') + (opts.bare ? '' : 'GH₵ ') + s; };
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
const sum = (arr, f = x => x) => arr.reduce((t, x) => t + (+f(x) || 0), 0);
const groupBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); (m[k] = m[k] || []).push(x); return m; }, {});
const clean = o => JSON.parse(JSON.stringify(o));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function all(c) { return [...S[c].values()]; }
function get(c, id) { return id ? S[c].get(id) : undefined; }
function settings() {
  const s = get('settings', 'company') || {};
  return Object.assign({
    companyName: 'Adzesua Connect Limited', tagline: 'Technology for Learning', address: 'Agona Swedru, Agona West Municipal, Central Region', phone: '', email: '', tin: '', regNo: '',
    cardPrefix: 'ADZ', cardPrice: 25, cardCost: 10, renewalFee: 0, replacementFee: 30, academicYear: '2026/27',
    invoiceDueDays: 14, paymentInstructions: '', wifiPackagePrice: 3,
    vatRegistered: false, vatNo: '', vatRate: 15, nhilRate: 2.5, getfundRate: 2.5,
    ssnitEmpRate: 5.5, ssnitErRate: 13, tier1Rate: 13.5, tier2Rate: 5, ssnitMin: 587.8, ssnitMax: 69000,
    payeBands: '588:0, 80:5, 100:10, 2900:17.5, 16000:25, 30332:30, *:35', bonusCapPct: 15, bonusRate: 5,
    slaUrgent: 4, slaHigh: 24, slaNormal: 72, slaLow: 168, annualLeaveDefault: 15,
  }, s);
}

/* ---------- chart of accounts ---------- */
const BASE_ACCOUNTS = [
  ['1000', 'Cash on hand', 'asset', 'cash'], ['1010', 'Mobile Money (MoMo)', 'asset', 'cash'], ['1020', 'Bank account', 'asset', 'cash'],
  ['1100', 'Accounts receivable', 'asset'], ['1150', 'Input VAT & levies (claimable)', 'asset'], ['1300', 'Staff advances & loans', 'asset'], ['1200', 'Inventory', 'asset'], ['1500', 'Equipment & devices', 'asset'], ['1510', 'Accumulated depreciation', 'asset'],
  ['2000', 'Accounts payable', 'liability'], ['2100', 'Taxes payable', 'liability'], ['2101', 'Output VAT (15%)', 'liability'], ['2102', 'NHIL payable (2.5%)', 'liability'], ['2103', 'GETFund levy payable (2.5%)', 'liability'], ['2110', 'PAYE payable', 'liability'], ['2120', 'SSNIT Tier 1 payable', 'liability'], ['2130', 'Tier 2 pension payable', 'liability'], ['2140', 'Other payroll deductions payable', 'liability'], ['2200', 'Loans', 'liability'], ['2300', 'Net salaries payable', 'liability'],
  ['3000', 'Share capital', 'equity'], ['3100', 'Retained earnings', 'equity'],
  ['4000', 'Smart card sales', 'income'], ['4010', 'Exeat renewal fees', 'income'], ['4020', 'Card replacement fees', 'income'], ['4100', 'Wi-Fi data sales', 'income'], ['4900', 'Other income', 'income'],
  ['5000', 'Card production cost', 'cogs'], ['5100', 'Internet & bandwidth', 'cogs'], ['5200', 'Other direct costs', 'cogs'],
  ['6000', 'Salaries & commissions', 'expense'], ['6010', 'Employer SSNIT & pension', 'expense'], ['6100', 'Transport & travel', 'expense'], ['6200', 'Marketing & outreach', 'expense'], ['6300', 'Rent & utilities', 'expense'],
  ['6400', 'Software, hosting & domains', 'expense'], ['6500', 'Bank & MoMo charges', 'expense'], ['6600', 'Repairs & maintenance', 'expense'], ['6610', 'Depreciation', 'expense'],
  ['6700', 'Registration, legal & compliance', 'expense'], ['6800', 'Communication & airtime', 'expense'], ['6900', 'Miscellaneous', 'expense'],
];
const ACCT_TYPES = { asset: 'Assets', liability: 'Liabilities', equity: 'Equity', income: 'Income', cogs: 'Direct costs', expense: 'Operating expenses' };
function accounts() {
  const list = BASE_ACCOUNTS.map(([code, name, type, sub]) => ({ code, name, type, sub: sub || '', base: true }));
  all('accounts').forEach(a => { if (!list.find(x => x.code === a.code)) list.push({ code: a.code, name: a.name, type: a.type, sub: a.sub || '', id: a.id }); });
  return list.sort((a, b) => a.code.localeCompare(b.code));
}
const acct = code => accounts().find(a => a.code === code);
const acctName = code => { const a = acct(code); return a ? a.name : code || '—'; };
const cashAccounts = () => accounts().filter(a => a.sub === 'cash');
const acctOpts = types => accounts().filter(a => types.includes(a.type)).map(a => [a.code, `${a.code} · ${a.name}`]);

/* ---------- reference lists ---------- */
const REGIONS = ['Ahafo', 'Ashanti', 'Bono', 'Bono East', 'Central', 'Eastern', 'Greater Accra', 'North East', 'Northern', 'Oti', 'Savannah', 'Upper East', 'Upper West', 'Volta', 'Western', 'Western North'];
const SCHOOL_STATUS = ['Prospect', 'Engaged', 'Pilot', 'Customer', 'Inactive'];
const DEAL_STAGES = [['Lead', 10], ['Contacted', 20], ['Meeting held', 40], ['Proposal sent', 60], ['Pilot', 80], ['Won', 100], ['Lost', 0]];
const BATCH_STAGES = ['Data collection', 'Design approval', 'Printing', 'Encoding', 'Delivered', 'Activated'];
const CARD_STATUS = ['Pending print', 'Printed', 'Issued', 'Active', 'Lost', 'Blocked', 'Replaced'];
const ACTIVITY_TYPES = ['Call', 'Visit', 'Meeting', 'WhatsApp', 'Email', 'Task'];
const CONTACT_ROLES = ['Headmaster / Headmistress', 'Assistant Head (Admin)', 'Assistant Head (Academic)', 'Assistant Head (Domestic)', 'Senior Housemaster / Housemistress', 'Housemaster / Housemistress', 'Bursar / Accountant', 'ICT Coordinator', 'PTA Chair', 'Board member', 'GES / District officer', 'Other'];

/* ---------- data store ---------- */
let renderQueued = false;
function scheduleRender() { if (renderQueued) return; renderQueued = true; requestAnimationFrame(() => { renderQueued = false; APP.version++; if (typeof render === 'function') render(); }); }

async function connect() {
  const timer = setTimeout(() => { if (!APP.ready) { APP.loadNote = 'Your records are taking longer than usual to load. What you see may be incomplete.'; scheduleRender(); } }, 10000);
  if (!window.claude || typeof window.claude.use !== 'function') { APP.offline = true; APP.ready = true; clearTimeout(timer); scheduleRender(); return; }
  try {
    const [db, user, dl] = await Promise.all([window.claude.use('db'), window.claude.use('user'), window.claude.use('downloads')]);
    APP.db = db; APP.user = user; APP.downloads = dl;
  } catch (e) { APP.db = null; }
  if (APP.user) {
    try { APP.uid = await APP.user.id(); } catch (e) { }
    try { const w = APP.user.can && APP.user.can('data.write'); if (w === false) { APP.canWrite = false; APP.writeIssue = { reason: 'role' }; } } catch (e) { }
    try { APP.me = await APP.user.me(); } catch (e) { }
  }
  if (!APP.db) { APP.offline = true; APP.ready = true; clearTimeout(timer); scheduleRender(); return; }
  const pending = new Set(COLLS);
  COLLS.forEach(c => {
    APP.db.collection(c).onSnapshot(snap => {
      const m = new Map();
      snap.docs.forEach(d => { if (d.exists) m.set(d.id, Object.assign({}, d.data(), { id: d.id })); });
      S[c] = m;
      if (!snap.metadata.fromCache) pending.delete(c);
      if (pending.size === 0 && !APP.ready) { APP.ready = true; APP.loadNote = ''; clearTimeout(timer); }
      invalidate(); scheduleRender();
    }, err => {
      pending.delete(c);
      if (err && err.code === 'revoked') { APP.canWrite = false; APP.writeIssue = { reason: 'session', coll: c }; }
      APP.loadNote = 'Some records could not be loaded (' + (err && err.code || 'error') + '). Reopen the page to try again.';
      if (pending.size === 0) { APP.ready = true; clearTimeout(timer); }
      scheduleRender();
    });
  });
}

async function withRetry(fn) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try { return await fn(); } catch (e) {
      const code = e && e.code;
      if (code === 'resource_exhausted') { await sleep(1500 + attempt * 800); continue; }
      if (code === 'unavailable' && attempt < 2) { await sleep(400 + Math.random() * 600); continue; }
      throw e;
    }
  }
  throw { code: 'resource_exhausted', message: 'Too many changes at once. Wait a moment and try again.' };
}
function errText(e) {
  const code = e && e.code;
  if (code === 'invalid_argument') return 'The database refused this change. Your role may not allow it.';
  if (code === 'quota_exceeded') return 'The data store is full. Delete old records before adding more.';
  if (code === 'revoked') return 'Your access to this page changed. Reopen it to continue.';
  return (e && e.message) || 'Something went wrong saving. Try again.';
}
async function save(c, rec) {
  if (!APP.canWrite) throw { message: 'You can view but not edit these records.' };
  if (typeof canWriteColl === 'function' && !canWriteColl(c)) throw { message: 'Your role can view these records but not change them.' };
  const id = rec.id || uid();
  const prev = get(c, id);
  if (prev && typeof canUpdateColl === 'function' && !canUpdateColl(c)) throw { message: 'Your role can add these records but not change them once saved.' };
  const data = clean(Object.assign({}, rec, { id, updatedAt: nowISO(), createdAt: (prev && prev.createdAt) || rec.createdAt || nowISO(), createdBy: (prev && prev.createdBy) || rec.createdBy || APP.uid || '' }));
  S[c].set(id, data); invalidate(); scheduleRender();
  if (!APP.db) return id;
  try { await withRetry(() => APP.db.collection(c).doc(id).set(data)); }
  catch (e) { if (prev) S[c].set(id, prev); else S[c].delete(id); invalidate(); scheduleRender(); if (e && e.code === 'invalid_argument') { APP.writeIssue = { reason: 'refused', coll: c, at: new Date().toLocaleTimeString() }; scheduleRender(); throw { message: `The database refused to save this (${c}). Your role may not allow it, or the database rules need publishing again.` }; } throw { message: errText(e) }; }
  return id;
}
async function removeRec(c, id) {
  if (!APP.canWrite) throw { message: 'You can view but not edit these records.' };
  if (typeof canDeleteColl === 'function' && !canDeleteColl(c)) throw { message: 'Your role cannot delete these records. Ask Finance or the administrator.' };
  const prev = get(c, id); S[c].delete(id); invalidate(); scheduleRender();
  if (!APP.db) return;
  try { await withRetry(() => APP.db.collection(c).doc(id).delete()); }
  catch (e) { if (prev) S[c].set(id, prev); invalidate(); scheduleRender(); throw { message: errText(e) }; }
}
/* sequential bulk writer with progress */
async function bulkSave(c, recs, onProgress) {
  let done = 0;
  for (const r of recs) { await save(c, r); done++; onProgress && onProgress(done, recs.length); if (APP.db) await sleep(60); }
  return done;
}

/* ---------- numbering ---------- */
function nextNumber(coll, field, prefix, width = 4) {
  let max = 0;
  all(coll).forEach(r => { const m = String(r[field] || '').match(/(\d+)\s*$/); if (m && String(r[field]).startsWith(prefix)) max = Math.max(max, +m[1]); });
  return prefix + pad(max + 1, width);
}
function nextCardNumbers(schoolId, count) {
  const sc = get('schools', schoolId); const code = (sc && sc.code || 'SCH').toUpperCase();
  const prefix = `${settings().cardPrefix}-${code}-`;
  let max = 0;
  all('cards').forEach(c => { if ((c.cardNo || '').startsWith(prefix)) max = Math.max(max, +(c.cardNo.slice(prefix.length)) || 0); });
  return Array.from({ length: count }, (_, i) => prefix + pad(max + 1 + i, 5));
}

/* ---------- derived engines (memoised per data version) ---------- */
let CACHE = {};
function invalidate() { CACHE = {}; }
function memo(key, fn) { if (!(key in CACHE)) CACHE[key] = fn(); return CACHE[key]; }

function saleSubtotal(s) { return r2(sum(s.lines || [], l => num(l.qty) * num(l.price))); }
function saleTaxes(s) {
  if (s.taxMode !== 'vat') return { vat: 0, nhil: 0, getfund: 0, total: 0 };
  const R = s.taxRates || settings(); const b = saleSubtotal(s);
  const vat = r2(b * num(R.vatRate) / 100), nhil = r2(b * num(R.nhilRate) / 100), getfund = r2(b * num(R.getfundRate) / 100);
  return { vat, nhil, getfund, total: r2(vat + nhil + getfund) };
}
function saleTotal(s) { return r2(saleSubtotal(s) + saleTaxes(s).total); }
function salePaid(s) { return s.kind === 'receipt' ? saleTotal(s) : r2(sum(s.payments || [], p => num(p.amount))); }
function saleBalance(s) { return r2(saleTotal(s) - salePaid(s)); }
function saleStatus(s) {
  if (s.status === 'draft') return 'Draft';
  if (s.status === 'void') return 'Void';
  if (s.kind === 'receipt') return 'Paid';
  const bal = saleBalance(s), tot = saleTotal(s);
  if (bal <= 0.004) return 'Paid';
  if (s.dueDate && s.dueDate < todayISO()) return 'Overdue';
  return bal < tot ? 'Part paid' : 'Unpaid';
}
const saleLive = s => s.status !== 'draft' && s.status !== 'void';

function purchaseLinesValue(p) { return r2(sum(p.lines || [], l => num(l.qty) * num(l.unitCost))); }
function purchaseTotal(p) { return r2(purchaseLinesValue(p) + num(p.shipping) + num(p.otherCosts) + num(p.inputVat)); }
function purchasePaid(p) { return r2(sum(p.payments || [], x => num(x.amount))); }
/* landed cost per line (extras spread by value) */
function purchaseLanded(p) {
  const base = purchaseLinesValue(p); const extra = num(p.shipping) + num(p.otherCosts);
  return (p.lines || []).map(l => { const v = num(l.qty) * num(l.unitCost); const share = base > 0 ? extra * v / base : 0; const total = v + share; return Object.assign({}, l, { landedTotal: r2(total), landedUnit: num(l.qty) ? total / num(l.qty) : 0 }); });
}

function inventory() {
  return memo('inv', () => {
    const events = [];
    all('purchases').forEach(p => {
      if (p.status !== 'received') return;
      purchaseLanded(p).forEach((l, i) => { if ((l.target || '').startsWith('item:')) events.push({ itemId: l.target.slice(5), date: p.receivedDate || p.date, kind: 'in', qty: num(l.qty), unitCost: l.landedUnit, ref: p.number, src: 'purchase', srcId: p.id, order: p.createdAt || '' }); });
    });
    all('moves').forEach(m => {
      const inKinds = ['opening', 'adjust-in'];
      events.push({ itemId: m.itemId, date: m.date, kind: inKinds.includes(m.type) ? 'in' : 'out', qty: num(m.qty), unitCost: num(m.unitCost), ref: m.ref || '', src: 'move', srcId: m.id, type: m.type, order: m.createdAt || '' });
    });
    events.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.kind === 'in' ? -1 : 1) - (b.kind === 'in' ? -1 : 1) || a.order.localeCompare(b.order));
    const stats = {}; const moveCost = {}; const history = {};
    all('items').forEach(it => (stats[it.id] = { qty: 0, value: 0, avg: num(it.defaultCost) }));
    events.forEach(e => {
      const st = stats[e.itemId] || (stats[e.itemId] = { qty: 0, value: 0, avg: 0 });
      if (e.kind === 'in') { st.qty += e.qty; st.value += e.qty * e.unitCost; st.avg = st.qty > 0 ? st.value / st.qty : e.unitCost; e.cost = e.qty * e.unitCost; }
      else { const cost = e.qty * (st.avg || 0); st.qty -= e.qty; st.value -= cost; if (st.qty <= 0) st.value = Math.max(0, st.value); e.cost = cost; if (e.src === 'move') moveCost[e.srcId] = r2(cost); }
      if (e.src === 'move' && e.kind === 'in') moveCost[e.srcId] = r2(e.cost);
      e.balance = st.qty;
      (history[e.itemId] = history[e.itemId] || []).push(e);
    });
    Object.values(stats).forEach(s => { s.value = r2(s.value); });
    return { stats, moveCost, history };
  });
}

const LEDGER_HOOKS = [];
/* journal entries derived from source documents */
function ledger() {
  return memo('ledger', () => {
    const E = [];
    const push = (date, ref, memo, lines, src, srcId) => { const ls = lines.filter(l => Math.abs(l.dr || 0) > 0.0001 || Math.abs(l.cr || 0) > 0.0001).map(l => ({ acct: l.acct, dr: r2(l.dr || 0), cr: r2(l.cr || 0) })); if (ls.length) E.push({ date: date || '', ref, memo, lines: ls, src, srcId }); };
    all('sales').filter(saleLive).forEach(s => {
      const party = s.schoolId ? (get('schools', s.schoolId) || {}).name : (s.customer || '');
      const incomeLines = (s.lines || []).map(l => ({ acct: l.account || '4900', cr: num(l.qty) * num(l.price) }));
      const total = saleTotal(s); const tx = saleTaxes(s);
      incomeLines.push({ acct: '2101', cr: tx.vat }, { acct: '2102', cr: tx.nhil }, { acct: '2103', cr: tx.getfund });
      if (s.kind === 'receipt') push(s.date, s.number, `Sales receipt${party ? ' · ' + party : ''}`, [{ acct: s.account || '1000', dr: total }, ...incomeLines], 'sale', s.id);
      else {
        push(s.date, s.number, `Invoice${party ? ' · ' + party : ''}`, [{ acct: '1100', dr: total }, ...incomeLines], 'sale', s.id);
        (s.payments || []).forEach(p => push(p.date, s.number, `Payment received${party ? ' · ' + party : ''}`, [{ acct: p.account || '1000', dr: num(p.amount) }, { acct: '1100', cr: num(p.amount) }], 'sale', s.id));
      }
    });
    all('purchases').forEach(p => {
      const sup = (get('suppliers', p.supplierId) || {}).name || 'supplier';
      if (p.status === 'received') {
        const lines = purchaseLanded(p).map(l => ({ acct: (l.target || '').startsWith('item:') ? '1200' : ((l.target || '').startsWith('acct:') ? l.target.slice(5) : '1200'), dr: l.landedTotal }));
        push(p.receivedDate || p.date, p.number, `Goods received · ${sup}`, [...lines, { acct: '1150', dr: num(p.inputVat) }, { acct: '2000', cr: purchaseTotal(p) }], 'purchase', p.id);
      }
      if (p.status !== 'cancelled') (p.payments || []).forEach(x => push(x.date, p.number, `Paid ${sup}`, [{ acct: '2000', dr: num(x.amount) }, { acct: x.account || '1010', cr: num(x.amount) }], 'purchase', p.id));
    });
    all('expenses').forEach(e => { const iv = Math.min(num(e.inputVat), num(e.amount)); push(e.date, e.ref || 'EXP', e.description || acctName(e.account), [{ acct: e.account || '6900', dr: num(e.amount) - iv }, { acct: '1150', dr: iv }, { acct: e.paidFrom || '1000', cr: num(e.amount) }], 'expense', e.id); });
    const inv = inventory();
    all('moves').forEach(m => {
      const cost = inv.moveCost[m.id] || 0; const it = get('items', m.itemId) || {};
      if (m.type === 'opening') push(m.date, m.ref || 'STOCK', `Opening stock · ${it.name || ''}`, [{ acct: '1200', dr: cost }, { acct: m.account || '3000', cr: cost }], 'move', m.id);
      else if (m.type === 'adjust-in') push(m.date, m.ref || 'STOCK', `Stock found · ${it.name || ''}`, [{ acct: '1200', dr: cost }, { acct: m.account || '4900', cr: cost }], 'move', m.id);
      else push(m.date, m.ref || 'STOCK', `${m.type === 'issue' ? 'Stock used' : 'Stock written off'} · ${it.name || ''}`, [{ acct: m.account || (m.type === 'issue' ? '5000' : '5200'), dr: cost }, { acct: '1200', cr: cost }], 'move', m.id);
    });
    all('journals').forEach(j => push(j.date, j.number || 'JNL', j.memo || 'Journal entry', (j.lines || []).map(l => ({ acct: l.account, dr: num(l.debit), cr: num(l.credit) })), 'journal', j.id));
    LEDGER_HOOKS.forEach(h => { try { h(push); } catch (err) { console.error(err); } });
    E.sort((a, b) => a.date.localeCompare(b.date));
    return E;
  });
}
const normalDebit = type => type === 'asset' || type === 'cogs' || type === 'expense';
function balances(from, to) {
  const key = `bal|${from || ''}|${to || ''}`;
  return memo(key, () => {
    const b = {};
    ledger().forEach(e => { if ((from && e.date < from) || (to && e.date > to)) return; e.lines.forEach(l => { const x = b[l.acct] || (b[l.acct] = { dr: 0, cr: 0 }); x.dr += l.dr; x.cr += l.cr; }); });
    const out = {};
    accounts().forEach(a => { const x = b[a.code] || { dr: 0, cr: 0 }; out[a.code] = r2(normalDebit(a.type) ? x.dr - x.cr : x.cr - x.dr); });
    Object.keys(b).forEach(k => { if (!(k in out)) out[k] = r2(b[k].dr - b[k].cr); });
    return out;
  });
}
function pnl(from, to) {
  const b = balances(from, to); const A = accounts();
  const pick = t => A.filter(a => a.type === t).map(a => ({ code: a.code, name: a.name, amount: b[a.code] || 0 }));
  const income = pick('income'), cogs = pick('cogs'), expense = pick('expense');
  const ti = r2(sum(income, x => x.amount)), tc = r2(sum(cogs, x => x.amount)), te = r2(sum(expense, x => x.amount));
  return { income, cogs, expense, totalIncome: ti, totalCogs: tc, gross: r2(ti - tc), totalExpense: te, net: r2(ti - tc - te) };
}
function balanceSheet(asAt) {
  const b = balances('', asAt); const A = accounts();
  const pick = t => A.filter(a => a.type === t).map(a => ({ code: a.code, name: a.name, amount: b[a.code] || 0 }));
  const assets = pick('asset'), liabilities = pick('liability'), equity = pick('equity');
  const earnings = pnl('', asAt).net;
  const ta = r2(sum(assets, x => x.amount)), tl = r2(sum(liabilities, x => x.amount)), teq = r2(sum(equity, x => x.amount) + earnings);
  return { assets, liabilities, equity, earnings, totalAssets: ta, totalLiabilities: tl, totalEquity: teq, check: r2(ta - tl - teq) };
}
function monthlySeries(n = 6) {
  const out = []; const d = new Date(); d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1); const from = `${x.getFullYear()}-${pad(x.getMonth() + 1)}-01`;
    const last = new Date(x.getFullYear(), x.getMonth() + 1, 0); const to = `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`;
    const p = pnl(from, to); out.push({ key: monthKey(from), from, to, income: p.totalIncome, costs: r2(p.totalCogs + p.totalExpense), net: p.net });
  }
  return out;
}
function cashPosition() { const b = balances('', todayISO()); return cashAccounts().map(a => ({ code: a.code, name: a.name, amount: b[a.code] || 0 })); }

/* ---------- CSV ---------- */
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  const t = text.replace(/\r\n?/g, '\n');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',' || ch === '\t' || ch === ';') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}
function toCSV(rows) { return rows.map(r => r.map(v => { let s = String(v ?? ''); if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n'); }

if (typeof module !== 'undefined') module.exports = { S, APP, COLLS, ledger, balances, pnl, balanceSheet, inventory, saleTotal, saleStatus, purchaseLanded, invalidate, accounts, parseCSV, nextCardNumbers, settings, monthlySeries };
