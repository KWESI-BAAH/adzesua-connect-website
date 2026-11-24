'use strict';
/* Adzesua HQ — SMS gateway (Arkesel).
   The Arkesel API key lives only here, as a Firebase secret (ARKESEL_API_KEY).
   The browser never sees it: HQ calls these functions, which check who is asking,
   enforce the daily cap, send through Arkesel and write a log record to /sms. */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { setGlobalOptions, logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { ROLES, LEGACY_ROLE, COLL_PAGES, ROLE_LABEL } = require('./roles.js');

admin.initializeApp();
const db = admin.firestore();
const ARKESEL_KEY = defineSecret('ARKESEL_API_KEY');
setGlobalOptions({ region: 'europe-west1', maxInstances: 2, memory: '256MiB', timeoutSeconds: 60 });
const withKey = { secrets: [ARKESEL_KEY], enforceAppCheck: false };

const COST_PER_SMS = 0.028; // GHS, Arkesel GHS 50 bundle — used only for estimates
const MAX_PARTS = 6;
const NON_ADMIN_MAX_RECIPIENTS = 20;
const ACCESS_ALERTS_PER_DAY = 10;

/* ---------------- helpers ---------------- */
const today = () => new Date().toISOString().slice(0, 10); // Ghana is UTC+0 all year
const nowISO = () => new Date().toISOString();
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const r2 = n => Math.round(n * 100) / 100;
const money = n => 'GHS ' + r2(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 && d.startsWith('0')) d = '233' + d.slice(1);
  else if (d.length === 9) d = '233' + d;
  return /^233[2-5]\d{8}$/.test(d) ? d : null;
}
/* keep messages in the plain GSM alphabet so one SMS holds 160 characters, not 70 */
function plain(text) {
  return String(text || '')
    .replace(/GH₵|₵/g, 'GHS ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/ {2,}/g, ' ').trim();
}
const isGsm = t => /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\\[~\]|€]*$/.test(t);
function parts(t) { const n = t.length; if (isGsm(t)) return n <= 160 ? 1 : Math.ceil(n / 153); return n <= 70 ? 1 : Math.ceil(n / 67); }

async function getConfig() {
  const s = await db.doc('smsconfig/main').get();
  return Object.assign({ senderId: '', alertPhone: '', summaryPhone: '', dailyCap: 300, autoReceipts: true, autoReminders: false, reminderDays: '3, 7, 14', securityAlerts: true, morningSummary: false, signature: 'Adzesua Connect' }, s.exists ? s.data() : {});
}
async function companyName() { const s = await db.doc('settings/company').get(); return (s.exists && s.data().companyName) || 'Adzesua Connect'; }

async function whoIs(auth) {
  if (!auth || !auth.uid) throw new HttpsError('unauthenticated', 'Sign in to Adzesua HQ first.');
  const owner = await db.doc('config/owner').get();
  if (owner.exists && owner.data().uid === auth.uid) return { uid: auth.uid, role: 'Admin', name: auth.token.name || auth.token.email || 'Owner' };
  const m = await db.doc('members/' + auth.uid).get();
  if (!m.exists) throw new HttpsError('permission-denied', 'You are not a member of Adzesua HQ.');
  const d = m.data(); const role = LEGACY_ROLE[d.role] || d.role;
  if (!ROLES[role]) throw new HttpsError('permission-denied', 'Your role is not recognised.');
  return { uid: auth.uid, role, name: d.name || d.email || '' };
}
const canSms = me => me.role === 'Admin' || (ROLES[me.role] || {}).sms === 'e';
const canWriteSales = me => me.role === 'Admin' || (COLL_PAGES.sales || []).some(p => (ROLES[me.role] || {})[p] === 'e');
function need(ok, msg) { if (!ok) throw new HttpsError('permission-denied', msg); }

/* count against today's cap; throws if the cap would be passed */
async function reserve(cfg, count, kind) {
  const ref = db.doc('smsstats/' + today());
  await db.runTransaction(async tx => {
    const s = await tx.get(ref); const d = s.exists ? s.data() : { sent: 0, byKind: {} };
    const cap = Math.max(0, num(cfg.dailyCap) || 300);
    if (d.sent + count > cap) throw new HttpsError('resource-exhausted', `Today's SMS limit of ${cap} would be passed (${d.sent} sent so far). An admin can raise it in SMS settings.`);
    if (kind === 'access' && ((d.byKind || {}).access || 0) + count > ACCESS_ALERTS_PER_DAY) throw new HttpsError('resource-exhausted', 'Too many access alerts today.');
    tx.set(ref, { id: today(), sent: d.sent + count, byKind: Object.assign({}, d.byKind, { [kind]: ((d.byKind || {})[kind] || 0) + count }), updatedAt: nowISO() });
  });
}
async function release(count, kind) {
  const ref = db.doc('smsstats/' + today());
  await db.runTransaction(async tx => { const s = await tx.get(ref); if (!s.exists) return; const d = s.data(); tx.update(ref, { sent: Math.max(0, d.sent - count), [`byKind.${kind}`]: Math.max(0, ((d.byKind || {})[kind] || 0) - count) }); }).catch(() => { });
}

async function arkesel(path, body) {
  const key = String(ARKESEL_KEY.value() || '').trim().replace(/^["']|["']$/g, '');
  if (!key) throw new HttpsError('failed-precondition', 'The Arkesel API key has not been set on the server yet.');
  const res = await fetch('https://sms.arkesel.com' + path, { method: body ? 'POST' : 'GET', headers: { 'api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok || (data && data.status && String(data.status).toLowerCase() !== 'success')) {
    const msg = (data && (data.message || data.error)) || `Arkesel answered ${res.status}`;
    logger.warn('Arkesel error', { path, status: res.status, msg });
    throw new HttpsError('unavailable', 'Arkesel did not send it: ' + String(msg).slice(0, 200));
  }
  return data;
}

/* the one place messages leave: cap, send, log. logId makes a send happen at most once. */
async function deliver({ cfg, to, message, kind, by, byName, ref, logId }) {
  if (!cfg.senderId) throw new HttpsError('failed-precondition', 'Set your registered sender ID in SMS settings first.');
  const numbers = [...new Set(to.map(normPhone).filter(Boolean))];
  if (!numbers.length) throw new HttpsError('invalid-argument', 'No valid Ghana phone numbers to send to.');
  const text = plain(message);
  if (!text) throw new HttpsError('invalid-argument', 'The message is empty.');
  const p = parts(text);
  if (p > MAX_PARTS) throw new HttpsError('invalid-argument', `That message is too long (${p} SMS each). Keep it under ${MAX_PARTS * 153} characters.`);
  const logRef = logId ? db.collection('sms').doc(logId) : db.collection('sms').doc();
  const base = { id: logRef.id, kind, to: numbers, count: numbers.length, message: text, parts: p, cost: r2(numbers.length * p * COST_PER_SMS), by: by || 'system', byName: byName || 'Automatic', ref: ref || null, at: nowISO(), createdAt: nowISO(), status: 'sending' };
  if (logId) { try { await logRef.create(base); } catch (e) { if (e.code === 6 || /already exists/i.test(e.message || '')) return { skipped: true, reason: 'already-sent' }; throw e; } }
  else await logRef.set(base);
  try { await reserve(cfg, numbers.length * p, kind); }
  catch (e) { await logRef.update({ status: 'blocked', error: e.message }); throw e; }
  try {
    const r = await arkesel('/api/v2/sms/send', { sender: String(cfg.senderId).slice(0, 11), message: text, recipients: numbers });
    await logRef.update({ status: 'sent', providerIds: ((r && r.data) || []).map(x => x && x.id).filter(Boolean).slice(0, 50) });
    return { sent: numbers.length, parts: p, cost: base.cost, id: logRef.id };
  } catch (e) {
    await release(numbers.length * p, kind);
    await logRef.update({ status: 'failed', error: String(e.message || e).slice(0, 300) });
    throw e;
  }
}

/* ---------------- money helpers (same sums as HQ) ---------------- */
const saleSubtotal = s => r2((s.lines || []).reduce((a, l) => a + num(l.qty) * num(l.price), 0));
function saleTaxTotal(s, co) { if (s.taxMode !== 'vat') return 0; const R = s.taxRates || co; const b = saleSubtotal(s); return r2(r2(b * num(R.vatRate) / 100) + r2(b * num(R.nhilRate) / 100) + r2(b * num(R.getfundRate) / 100)); }
const saleTotal = (s, co) => r2(saleSubtotal(s) + saleTaxTotal(s, co));
const salePaid = (s, co) => s.kind === 'receipt' ? saleTotal(s, co) : r2((s.payments || []).reduce((a, p) => a + num(p.amount), 0));
const saleLive = s => s.status !== 'draft' && s.status !== 'void';
async function companySettings() { const s = await db.doc('settings/company').get(); return Object.assign({ vatRate: 15, nhilRate: 2.5, getfundRate: 2.5, companyName: 'Adzesua Connect', paymentInstructions: '' }, s.exists ? s.data() : {}); }
async function salePhone(s) {
  if (s.smsPhone && normPhone(s.smsPhone)) return s.smsPhone;
  if (s.schoolId) { const sc = await db.doc('schools/' + s.schoolId).get(); if (sc.exists && normPhone(sc.data().phone)) return sc.data().phone; }
  return null;
}
const fmtDate = iso => { if (!iso) return ''; const d = new Date(iso + 'T00:00:00Z'); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
function reminderText(s, co, cfg, bal) {
  const due = s.dueDate && s.dueDate < today() ? `was due ${fmtDate(s.dueDate)}` : `is due ${fmtDate(s.dueDate)}`;
  return `${cfg.signature || co.companyName}: Reminder - invoice ${s.number} has a balance of ${money(bal)} which ${due}.${co.paymentInstructions ? ' Pay: ' + String(co.paymentInstructions).slice(0, 120) : ''} Thank you.`;
}

/* ---------------- callable: manual send from the SMS page ---------------- */
exports.smsSend = onCall(withKey, async req => {
  const me = await whoIs(req.auth); need(canSms(me), 'Your role cannot send SMS.');
  const to = Array.isArray(req.data && req.data.to) ? req.data.to.slice(0, 2000) : [];
  const message = String((req.data && req.data.message) || '').slice(0, 1200);
  if (me.role !== 'Admin' && new Set(to.map(normPhone).filter(Boolean)).size > NON_ADMIN_MAX_RECIPIENTS) throw new HttpsError('permission-denied', `Only the administrator can text more than ${NON_ADMIN_MAX_RECIPIENTS} people at once.`);
  const cfg = await getConfig();
  return deliver({ cfg, to, message, kind: 'manual', by: me.uid, byName: me.name, ref: null });
});

/* ---------------- callable: receipt after a payment ---------------- */
exports.smsReceipt = onCall(withKey, async req => {
  const me = await whoIs(req.auth); need(canWriteSales(me) || canSms(me), 'Your role cannot send receipts.');
  const saleId = String((req.data && req.data.saleId) || ''); const manual = !!(req.data && req.data.manual);
  if (!/^[\w-]{1,80}$/.test(saleId)) throw new HttpsError('invalid-argument', 'Which sale?');
  const cfg = await getConfig();
  if (!manual && !cfg.autoReceipts) return { skipped: true, reason: 'off' };
  const snap = await db.doc('sales/' + saleId).get(); if (!snap.exists) throw new HttpsError('not-found', 'That sale no longer exists.');
  const s = snap.data(); if (!saleLive(s)) return { skipped: true, reason: 'not-live' };
  const co = await companySettings(); const tot = saleTotal(s, co), paid = salePaid(s, co), bal = r2(tot - paid);
  if (paid <= 0) return { skipped: true, reason: 'nothing-paid' };
  const phone = await salePhone(s); if (!phone) return { skipped: true, reason: 'no-phone' };
  const sig = cfg.signature || co.companyName;
  const last = s.kind === 'receipt' ? tot : num(((s.payments || []).slice(-1)[0] || {}).amount);
  const text = s.kind === 'receipt'
    ? `${sig}: Received ${money(tot)} with thanks. Receipt ${s.number}, ${fmtDate(s.date)}.`
    : `${sig}: Received ${money(last)} for invoice ${s.number}. ${bal > 0.004 ? `Balance ${money(bal)}.` : 'Fully paid.'} Thank you.`;
  return deliver({ cfg, to: [phone], message: text, kind: 'receipt', by: me.uid, byName: me.name, ref: { coll: 'sales', id: saleId, number: s.number }, logId: manual ? null : `rcpt-${saleId}-${Math.round(paid * 100)}` });
});

/* ---------------- callable: payment reminder (button on an invoice) ---------------- */
exports.smsReminder = onCall(withKey, async req => {
  const me = await whoIs(req.auth); need(canWriteSales(me) || canSms(me), 'Your role cannot send reminders.');
  const saleId = String((req.data && req.data.saleId) || ''); if (!/^[\w-]{1,80}$/.test(saleId)) throw new HttpsError('invalid-argument', 'Which invoice?');
  const snap = await db.doc('sales/' + saleId).get(); if (!snap.exists) throw new HttpsError('not-found', 'That invoice no longer exists.');
  const s = snap.data(); if (s.kind === 'receipt' || !saleLive(s)) throw new HttpsError('failed-precondition', 'Only issued invoices get reminders.');
  const co = await companySettings(); const bal = r2(saleTotal(s, co) - salePaid(s, co));
  if (bal <= 0.004) throw new HttpsError('failed-precondition', 'This invoice is already paid.');
  const phone = await salePhone(s); if (!phone) throw new HttpsError('failed-precondition', 'No phone number: add one under “Text receipts to” on the invoice, or on the school.');
  const cfg = await getConfig();
  return deliver({ cfg, to: [phone], message: reminderText(s, co, cfg, bal), kind: 'reminder', by: me.uid, byName: me.name, ref: { coll: 'sales', id: saleId, number: s.number } });
});

/* ---------------- callable: someone outside asked for access ---------------- */
exports.smsAccessAlert = onCall(withKey, async req => {
  if (!req.auth || !req.auth.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const r = await db.doc('requests/' + req.auth.uid).get(); if (!r.exists) return { skipped: true };
  const cfg = await getConfig(); if (!cfg.securityAlerts || !normPhone(cfg.alertPhone)) return { skipped: true, reason: 'off' };
  const d = r.data(); const who = String(d.name || '').replace(/[^\w .'-]/g, '').slice(0, 40); const em = String(d.email || '').replace(/[^\w.@+-]/g, '').slice(0, 60);
  try { return await deliver({ cfg, to: [cfg.alertPhone], message: `Adzesua HQ: ${who ? who + ' (' + em + ')' : em} signed in without an invitation and is asking for access. Review it in Setup.`, kind: 'access', ref: { coll: 'requests', id: req.auth.uid }, logId: 'access-' + req.auth.uid }); }
  catch (e) { return { skipped: true, reason: 'limit' }; }
});

/* ---------------- callable: welcome SMS for a new team member ---------------- */
const HQ_URL = 'https://adzesuahq.web.app';
const ROLE_SHORT = { Admin: 'full access to everything', BizDev: 'schools, pipeline, invoices and SMS', Finance: 'invoices, expenses, accounts and payroll', Ops: 'cards, devices, stock and support', Agent: 'Wi-Fi sales, cards and support at your school', HR: 'team, leave and payroll', Auditor: 'read-only books and reports', Viewer: 'dashboard, team directory and your leave' };
exports.smsWelcome = onCall(withKey, async req => {
  const me = await whoIs(req.auth); need(me.role === 'Admin', 'Only the administrator can do this.');
  const email = String((req.data && req.data.email) || '').toLowerCase().slice(0, 200); const uid = String((req.data && req.data.uid) || '').slice(0, 128);
  let rec = null, joined = false;
  if (uid) { if (!/^[\w-]{1,128}$/.test(uid)) throw new HttpsError('invalid-argument', 'Which person?'); const m = await db.doc('members/' + uid).get(); if (m.exists) { rec = m.data(); joined = true; } }
  else if (email) { if (email.includes('/')) throw new HttpsError('invalid-argument', 'Which person?'); const i = await db.doc('invites/' + email).get(); if (i.exists) rec = Object.assign({ email }, i.data()); }
  if (!rec) throw new HttpsError('not-found', 'That invitation or member no longer exists.');
  let phone = rec.phone;
  if (!normPhone(phone) && rec.staffId) { const st = await db.doc('staff/' + String(rec.staffId).replace(/[^\w-]/g, '')).get(); if (st.exists) phone = st.data().phone; }
  if (!normPhone(phone)) throw new HttpsError('failed-precondition', 'No valid phone number for this person. Add one on the invitation or their team record.');
  const role = LEGACY_ROLE[rec.role] || rec.role; const first = String(rec.name || '').trim().split(/\s+/)[0].replace(/[^\w'-]/g, '').slice(0, 20);
  const roleText = `${(ROLE_LABEL[role] || role).replace(' (Admin)', '').replace(' (read-only)', '')} (${ROLE_SHORT[role] || 'your team pages'})`;
  const em = String(rec.email || email).replace(/[^\w.@+-]/g, '');
  const text = joined
    ? `Hi${first ? ' ' + first : ''}, welcome to Adzesua Connect! You now have access to Adzesua HQ as ${roleText}. Sign in with ${em} here (or press Check again if the page is already open):\n${HQ_URL}\nKeep the link private.`
    : `Hi${first ? ' ' + first : ''}, welcome to Adzesua Connect! You have been added to Adzesua HQ as ${roleText}.\nTo sign in:\n1. Open this link:\n${HQ_URL}\n2. Tap Continue with Google if ${em} is a Gmail/Google account, otherwise tap Create your account and set a password\n3. Use this exact email: ${em}\nKeep the link private.`;
  const cfg = await getConfig();
  return deliver({ cfg, to: [phone], message: text, kind: 'welcome', by: me.uid, byName: me.name, ref: { coll: joined ? 'members' : 'invites', id: joined ? uid : email } });
});

/* ---------------- callable: admin tools ---------------- */
exports.smsTest = onCall(withKey, async req => {
  const me = await whoIs(req.auth); need(me.role === 'Admin', 'Only the administrator can do this.');
  const cfg = await getConfig(); const to = (req.data && req.data.to) || cfg.alertPhone;
  if (!normPhone(to)) throw new HttpsError('invalid-argument', 'Add your phone number as the alert phone in SMS settings first.');
  return deliver({ cfg, to: [to], message: `${cfg.signature || 'Adzesua Connect'}: Test message from Adzesua HQ. SMS is working.`, kind: 'test', by: me.uid, byName: me.name });
});
exports.smsBalance = onCall(withKey, async req => {
  const me = await whoIs(req.auth); need(me.role === 'Admin' || canSms(me), 'Your role cannot see the SMS balance.');
  const r = await arkesel('/api/v2/clients/balance-details');
  const d = (r && r.data) || {};
  return { balance: d.balance ?? d.sms_balance ?? null, user: d.user ?? null, raw: d };
});

/* ---------------- every morning: overdue reminders + MD's summary ---------------- */
exports.smsDaily = onSchedule({ schedule: '30 7 * * *', timeZone: 'Africa/Accra', secrets: [ARKESEL_KEY] }, async () => {
  const cfg = await getConfig(); if (!cfg.senderId) return;
  const co = await companySettings(); const t = today(); const yest = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const sales = (await db.collection('sales').get()).docs.map(d => d.data());
  const days = String(cfg.reminderDays || '').split(/[,\s]+/).map(x => parseInt(x, 10)).filter(n => n > 0 && n < 400);
  let overdueTotal = 0, overdueCount = 0;
  for (const s of sales) {
    if (s.kind === 'receipt' || !saleLive(s) || !s.dueDate) continue;
    const bal = r2(saleTotal(s, co) - salePaid(s, co)); if (bal <= 0.004) continue;
    const over = Math.round((Date.parse(t) - Date.parse(s.dueDate)) / 864e5);
    if (over > 0) { overdueTotal += bal; overdueCount++; }
    if (!cfg.autoReminders || !days.includes(over)) continue;
    const phone = await salePhone(s); if (!phone) continue;
    try { await deliver({ cfg, to: [phone], message: reminderText(s, co, cfg, bal), kind: 'reminder', ref: { coll: 'sales', id: s.id, number: s.number }, logId: `rem-${s.id}-${over}` }); }
    catch (e) { logger.warn('reminder failed', s.number, e.message); }
  }
  if (!cfg.morningSummary) return;
  const to = normPhone(cfg.summaryPhone) ? cfg.summaryPhone : cfg.alertPhone; if (!normPhone(to)) return;
  const live = sales.filter(saleLive);
  const billed = live.filter(s => s.date === yest).reduce((a, s) => a + saleTotal(s, co), 0);
  const cash = live.reduce((a, s) => a + (s.kind === 'receipt' ? (s.date === yest ? saleTotal(s, co) : 0) : (s.payments || []).filter(p => p.date === yest).reduce((b, p) => b + num(p.amount), 0)), 0);
  const tickets = (await db.collection('tickets').get()).docs.map(d => d.data()).filter(x => !['Resolved', 'Closed'].includes(x.status)).length;
  const reqs = (await db.collection('requests').get()).size;
  const msg = `Adzesua HQ ${fmtDate(t)}: Yesterday billed ${money(billed)}, collected ${money(cash)}. Overdue: ${overdueCount} invoice${overdueCount === 1 ? '' : 's'}, ${money(overdueTotal)}. Open tickets: ${tickets}.${reqs ? ` Access requests: ${reqs}.` : ''}`;
  try { await deliver({ cfg, to: [to], message: msg, kind: 'summary', logId: 'summary-' + t }); } catch (e) { logger.warn('summary failed', e.message); }
});
