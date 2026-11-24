'use strict';
/* =========================================================
   Adzesua HQ — SMS (Arkesel, sent by the server)
   The browser only asks the server to send; the Arkesel key
   never comes here. Every message is logged in /sms.
   ========================================================= */
(function addNav() { const g = NAV.find(([n]) => n === 'Customers'); if (g && !g[1].some(([k]) => k === 'sms')) g[1].push(['sms', 'SMS messages']); })();

ICONS.send = '<path d="M4 12 20 4l-6 16-3-7-7-1z"/>';
const SMS_COST = 0.028; // GHS per SMS on Arkesel's GHS 50 bundle — estimates only
const SMS_NON_ADMIN_MAX = 20;
const smsDefaults = { senderId: '', signature: 'Adzesua Connect', alertPhone: '', summaryPhone: '', dailyCap: 300, autoReceipts: true, autoReminders: false, reminderDays: '3, 7, 14', securityAlerts: true, morningSummary: false };
const smsCfg = () => Object.assign({}, smsDefaults, get('smsconfig', 'main') || {});
const smsServer = () => typeof window.ADZ_CALL === 'function';
const smsCanSend = () => myRole() === 'Admin' || perm('sms') === 'e';
function smsNorm(p) {
  let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 && d.startsWith('0')) d = '233' + d.slice(1); else if (d.length === 9) d = '233' + d;
  return /^233[2-5]\d{8}$/.test(d) ? d : null;
}
const smsShow = n => n ? '0' + n.slice(3, 5) + ' ' + n.slice(5, 8) + ' ' + n.slice(8) : '';
function smsPlain(t) { return String(t || '').replace(/GH₵|₵/g, 'GHS ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/ {2,}/g, ' ').trim(); }
const smsGsm = t => /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\\[~\]|€]*$/.test(t);
function smsParts(t) { const n = t.length; if (!n) return 0; if (smsGsm(t)) return n <= 160 ? 1 : Math.ceil(n / 153); return n <= 70 ? 1 : Math.ceil(n / 67); }
async function smsCall(name, data) {
  if (!smsServer()) throw { message: 'SMS works only in Adzesua HQ (the signed-in site).' };
  return window.ADZ_CALL(name, data);
}

/* ---------- recipients ---------- */
const SMS_GROUPS = [['typed', 'Numbers I type'], ['contacts', 'School contacts'], ['schools', 'Schools (main phone)'], ['staff', 'Our team (active staff)']];
function smsRecipients() {
  const f = vs('sms'); const g = f.group || 'typed'; const sid = f.schoolId || '';
  let list = [];
  if (g === 'typed') list = String(f.numbers || '').split(/[\n,;]+/).map(x => x.trim()).filter(Boolean).map(x => ({ name: '', phone: x }));
  if (g === 'contacts') list = all('contacts').filter(c => !sid || c.schoolId === sid).map(c => ({ name: c.name, phone: c.phone || c.whatsapp }));
  if (g === 'schools') list = all('schools').filter(s => !sid || s.id === sid).map(s => ({ name: s.name, phone: s.phone }));
  if (g === 'staff') list = all('staff').filter(s => s.status !== 'Former').map(s => ({ name: s.name, phone: s.phone }));
  const seen = new Set(), ok = [], bad = [];
  list.forEach(r => { const n = smsNorm(r.phone); if (!n) { if (r.phone || g === 'typed') bad.push(r); return; } if (seen.has(n)) return; seen.add(n); ok.push(Object.assign({}, r, { n })); });
  const noPhone = g === 'typed' ? 0 : list.filter(r => !r.phone).length;
  return { ok, bad, noPhone };
}
const smsTemplates = () => { const sig = smsCfg().signature || 'Adzesua Connect'; return [
  ['Meeting confirmation', `${sig}: Confirming our meeting on [day] at [time]. We look forward to seeing you. Call 0XX XXX XXXX if anything changes.`],
  ['Cards ready', `${sig}: Student ID cards for your school are ready. Please let us know a good day to deliver and hand them over.`],
  ['Payment reminder', `${sig}: A friendly reminder that your balance with us is still outstanding. Kindly settle at your earliest convenience. Thank you.`],
  ['Wi-Fi maintenance', `${sig}: Campus Wi-Fi will be briefly unavailable on [day] from [time] for maintenance. Sorry for the inconvenience.`],
  ['Term greeting', `${sig}: Wishing your staff and students a successful term. We are here if you need anything.`],
  ['Staff notice', `${sig}: Team meeting on [day] at [time], [place]. Please be on time.`],
]; };

/* ---------- page ---------- */
VIEWS.sms = () => {
  const cfg = smsCfg(); const admin = myRole() === 'Admin'; const f = vs('sms');
  const logs = all('sms').sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const t = todayISO(), mo = t.slice(0, 7);
  const sentOf = arr => arr.filter(x => x.status === 'sent').reduce((a, x) => a + (+x.count || 0) * (+x.parts || 1), 0);
  const todayN = sentOf(logs.filter(x => String(x.at).slice(0, 10) === t)); const monthL = logs.filter(x => String(x.at).slice(0, 7) === mo); const monthN = sentOf(monthL);
  const failed = monthL.filter(x => x.status === 'failed' || x.status === 'blocked').length;
  const tiles = `<div class="tiles">${tile('Sent today', fmtNum(todayN), `Limit ${fmtNum(cfg.dailyCap)} a day`)}${tile('This month', fmtNum(monthN), `About GHS ${fmtNum(monthN * SMS_COST, 2)}`)}${tile('Not sent this month', fmtNum(failed), failed ? 'See the log below' : 'All good', failed ? 'warn' : '')}${tile('Arkesel balance', APP.smsBalance != null ? esc(String(APP.smsBalance)) : '—', btn('Check', 'smsBalance', {}, 'ghost sm'))}</div>`;

  const setupNote = !smsServer() ? `<div class="banner warn">SMS works only in Adzesua HQ, the signed-in site.</div>` : !cfg.senderId ? `<div class="banner warn">${admin ? 'Finish setting up SMS: open <b>SMS settings</b> below, enter your Arkesel sender ID and your phone number, then send yourself a test.' : 'SMS is not switched on yet. The administrator needs to finish the setup.'}</div>` : '';

  let compose = '';
  if (smsCanSend()) {
    const R = smsRecipients(); const msg = f.message || ''; const p = smsParts(smsPlain(msg)); const g = f.group || 'typed';
    const over = !admin && R.ok.length > SMS_NON_ADMIN_MAX;
    compose = panel('Send a message', `<div class="fgrid">
      <div class="fld"><label for="smsGroup">Send to</label><select id="smsGroup" data-sms-change="group">${SMS_GROUPS.map(([k, l]) => `<option value="${k}" ${g === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      ${g === 'contacts' || g === 'schools' ? `<div class="fld"><label for="smsSchool">School</label><select id="smsSchool" data-sms-change="schoolId"><option value="">All schools</option>${all('schools').sort((a, b) => String(a.name).localeCompare(String(b.name))).map(s => `<option value="${esc(s.id)}" ${f.schoolId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>` : '<div class="fld"></div>'}
      ${g === 'typed' ? `<div class="fld span2"><label for="smsNums">Phone numbers</label><textarea id="smsNums" rows="2" data-sms-input="numbers" placeholder="024 123 4567, 055 987 6543">${esc(f.numbers || '')}</textarea><small class="help">Separate with commas or new lines.</small></div>` : ''}
      <div class="fld span2"><label for="smsMsg">Message</label><textarea id="smsMsg" rows="4" data-sms-input="message" maxlength="900" placeholder="Type your message">${esc(msg)}</textarea>
      <small class="help" id="smsCount">${smsCountText(msg, R.ok.length)}</small></div>
      <div class="fld span2"><label for="smsTpl">Start from a template</label><select id="smsTpl" data-sms-change="tpl"><option value="">— Choose —</option>${smsTemplates().map(([l], i) => `<option value="${i}">${esc(l)}</option>`).join('')}</select></div>
    </div>
    <p class="small" id="smsWho">${smsWhoText(R, over)}</p>
    <div class="row">${btn(ic('send') + ' Send', 'smsSend', {}, 'primary')}${btn('Clear', 'smsClear', {}, 'ghost')}</div>`);
  }

  const settingsPanel = admin ? panel('SMS settings', `<dl class="kv sm">
      <dt>Sender ID</dt><dd>${cfg.senderId ? `<b>${esc(cfg.senderId)}</b>` : '<span class="muted">Not set</span>'}</dd>
      <dt>Your phone (alerts)</dt><dd>${cfg.alertPhone ? esc(cfg.alertPhone) : '<span class="muted">Not set</span>'}</dd>
      <dt>Daily limit</dt><dd>${fmtNum(cfg.dailyCap)} SMS</dd>
      <dt>Automatic</dt><dd>${[cfg.autoReceipts && 'Receipts when a payment is recorded', cfg.autoReminders && `Overdue reminders (days ${esc(cfg.reminderDays)})`, cfg.securityAlerts && 'Access-request alerts', cfg.morningSummary && 'Morning summary at 7:30'].filter(Boolean).map(x => `<span class="block">${x}</span>`).join('') || '<span class="muted">Nothing</span>'}</dd>
    </dl><div class="row wrap">${btn('Edit settings', 'smsSettings', {}, 'ghost sm w')}${btn('Send me a test', 'smsTest', {}, 'ghost sm w')}</div>
    <p class="muted small">The Arkesel API key is kept on the server as a secret. It is never stored in HQ or on GitHub.</p>`) : '';

  const log = panel('Message log', logs.length ? dataTable({ id: 'smsLog', rows: logs, cols: [
    { k: 'at', label: 'When', f: r => `<span class="nowrap">${fmtDate(r.at)}</span><span class="muted small block">${esc(String(r.at || '').slice(11, 16))}</span>` },
    { k: 'kind', label: 'Type', f: r => pill(({ manual: 'Message', receipt: 'Receipt', reminder: 'Reminder', access: 'Security', summary: 'Summary', test: 'Test', welcome: 'Welcome' })[r.kind] || r.kind || '', r.kind === 'access' ? 'gold' : 'info') },
    { k: 'to', label: 'To', v: r => (r.to || []).join(' '), f: r => `${esc(smsShow((r.to || [])[0]))}${(r.count || 0) > 1 ? ` <span class="muted small">+${r.count - 1} more</span>` : ''}${r.ref && r.ref.number ? `<span class="muted small block">${esc(r.ref.number)}</span>` : ''}` },
    { k: 'message', label: 'Message', f: r => `<span class="small">${esc(String(r.message || '').slice(0, 140))}${String(r.message || '').length > 140 ? '…' : ''}</span>` },
    { k: 'status', label: 'Status', f: r => pill(({ sent: 'Sent', failed: 'Failed', blocked: 'Blocked', sending: 'Sending' })[r.status] || r.status, r.status === 'sent' ? 'good' : r.status === 'sending' ? 'mute' : 'bad') + (r.error ? `<span class="muted small block">${esc(String(r.error).slice(0, 120))}</span>` : '') },
    { k: 'byName', label: 'By', f: r => esc(r.byName || '') },
    { k: 'cost', label: 'Est. cost', cls: 'num', f: r => r.status === 'sent' ? 'GHS ' + fmtNum(r.cost, 2) : '—' },
  ] }) : empty('No messages yet', 'Messages you send, receipts and reminders will be listed here.'));

  return pageHead('SMS messages', 'Text schools, contacts and the team from Adzesua HQ. Sent through Arkesel.') + setupNote + tiles + (compose || settingsPanel ? `<div class="grid2">${compose}${settingsPanel}</div>` : '') + log;
};
function smsCountText(msg, n) {
  const t = smsPlain(msg); const p = smsParts(t);
  if (!t) return '160 characters fit in one SMS.';
  return `${t.length} characters · ${p} SMS each${n ? ` · ${fmtNum(n)} recipient${n === 1 ? '' : 's'} · about GHS ${fmtNum(n * p * SMS_COST, 2)}` : ''}${!smsGsm(t) ? ' · <b>special characters make each SMS shorter</b>' : ''}${p > 1 ? ' · keep it under 160 to pay for one' : ''}`;
}
function smsWhoText(R, over) {
  const bits = [`<b>${fmtNum(R.ok.length)}</b> will get it`];
  if (R.bad.length) bits.push(`${R.bad.length} number${R.bad.length === 1 ? ' is' : 's are'} not a valid Ghana mobile${R.bad[0].name ? ` (e.g. ${esc(R.bad[0].name)})` : ''}`);
  if (R.noPhone) bits.push(`${R.noPhone} have no phone saved`);
  if (over) bits.push(`<span class="danger-t">only the administrator can text more than ${SMS_NON_ADMIN_MAX} people at once</span>`);
  return bits.join(' · ');
}
document.addEventListener('input', e => {
  const k = e.target.dataset && e.target.dataset.smsInput; if (!k) return;
  vs('sms')[k] = e.target.value; persistVS();
  const R = smsRecipients(); const c = $('#smsCount'); if (c) c.innerHTML = smsCountText(vs('sms').message || '', R.ok.length);
  const w = $('#smsWho'); if (w) w.innerHTML = smsWhoText(R, myRole() !== 'Admin' && R.ok.length > SMS_NON_ADMIN_MAX);
});
document.addEventListener('change', e => {
  const k = e.target.dataset && e.target.dataset.smsChange; if (!k) return;
  const f = vs('sms');
  if (k === 'tpl') { const tp = smsTemplates()[+e.target.value]; if (tp) f.message = tp[1]; }
  else { f[k] = e.target.value; if (k === 'group') f.schoolId = ''; }
  persistVS(); scheduleRender();
});
ACT.smsClear = () => { const f = vs('sms'); f.message = ''; f.numbers = ''; persistVS(); scheduleRender(); };
ACT.smsSend = async el => {
  const f = vs('sms'); const R = smsRecipients(); const text = smsPlain(f.message || ''); const p = smsParts(text);
  if (!R.ok.length) return toast('Add at least one valid phone number.', 'bad');
  if (!text) return toast('Type a message first.', 'bad');
  if (p > 6) return toast('That message is too long. Keep it under 900 characters.', 'bad');
  if (myRole() !== 'Admin' && R.ok.length > SMS_NON_ADMIN_MAX) return toast(`Only the administrator can text more than ${SMS_NON_ADMIN_MAX} people at once.`, 'bad');
  const h = new Date().getHours(); const late = h >= 21 || h < 6;
  const ok = await ask({ title: `Send to ${fmtNum(R.ok.length)} ${R.ok.length === 1 ? 'person' : 'people'}?`, body: `${p} SMS each, about <b>GHS ${fmtNum(R.ok.length * p * SMS_COST, 2)}</b> in total.${late ? '<br><br><b>It is late.</b> Unless this is urgent, consider sending it in the morning.' : ''}<br><br><span class="small">${esc(text)}</span>`, ok: 'Send' });
  if (!ok) return;
  el.disabled = true; el.textContent = 'Sending…';
  try { const r = await smsCall('smsSend', { to: R.ok.map(x => x.n), message: text }); toast(`Sent to ${fmtNum(r.sent)} ${r.sent === 1 ? 'person' : 'people'}`); f.message = ''; if ((f.group || 'typed') === 'typed') f.numbers = ''; persistVS(); scheduleRender(); }
  catch (e) { toast(e.message || 'Could not send.', 'bad'); el.disabled = false; el.textContent = 'Send'; }
};
ACT.smsTest = async () => { try { await smsCall('smsTest', {}); toast('Test SMS sent to your phone'); } catch (e) { toast(e.message || 'Could not send.', 'bad'); } };
ACT.smsBalance = async () => { try { const r = await smsCall('smsBalance', {}); APP.smsBalance = r.balance != null ? r.balance : 'See Arkesel'; scheduleRender(); } catch (e) { toast(e.message || 'Could not check the balance.', 'bad'); } };

/* ---------- settings (Admin) ---------- */
const smsPhoneOk = v => !v || !!smsNorm(v);
ENT.smsconfig = {
  coll: 'smsconfig', label: 'SMS settings', title: () => 'SMS settings', size: 'lg',
  fields: [
    { k: 'senderId', label: 'Sender ID', req: true, ph: 'ADZESUA', help: 'Exactly as approved on your Arkesel account. Up to 11 letters or numbers.' },
    { k: 'signature', label: 'Name at the start of messages', ph: 'Adzesua Connect' },
    { k: 'alertPhone', label: 'Your phone (security alerts and tests)', type: 'tel', ph: '024 000 0000' },
    { k: 'summaryPhone', label: 'Morning summary goes to', type: 'tel', ph: 'Blank = your phone' },
    { k: 'dailyCap', label: 'Most SMS per day', type: 'number', min: 1, help: 'A safety limit. Sending stops for the day once it is reached.' },
    { k: 'reminderDays', label: 'Remind on these days overdue', ph: '3, 7, 14', showIf: r => r.autoReminders },
    { k: 'autoReceipts', label: 'Text a receipt when a payment is recorded', type: 'check', span: 2 },
    { k: 'autoReminders', label: 'Text overdue invoices automatically (7:30 each morning)', type: 'check', span: 2 },
    { k: 'securityAlerts', label: 'Text me when someone uninvited asks for access', type: 'check', span: 2 },
    { k: 'morningSummary', label: 'Text me a summary every morning at 7:30', type: 'check', span: 2 },
  ],
  onChange: () => { const el = $('#f_autoReminders'); const fld = $('.fld[data-k="reminderDays"]'); if (el && fld) fld.hidden = !el.checked; },
  validate: r => {
    if (!/^[A-Za-z0-9 ]{1,11}$/.test(r.senderId || '')) return 'Sender ID: up to 11 letters or numbers.';
    if (!smsPhoneOk(r.alertPhone)) return 'Your phone is not a valid Ghana mobile number.';
    if (!smsPhoneOk(r.summaryPhone)) return 'The summary phone is not a valid Ghana mobile number.';
    if (!(+r.dailyCap >= 1)) return 'Set a daily limit of at least 1.';
    if (r.autoReminders && !String(r.reminderDays || '').split(/[,\s]+/).some(x => +x > 0)) return 'Give at least one day, e.g. 3, 7, 14.';
    return '';
  },
  beforeSave: r => { const keep = ['id', ...Object.keys(smsDefaults)]; const o = {}; keep.forEach(k => { if (k in r) o[k] = r[k]; }); o.id = 'main'; o.senderId = String(o.senderId || '').trim(); o.dailyCap = Math.round(+o.dailyCap) || 300; return o; },
};
ACT.smsSettings = () => openForm('smsconfig', Object.assign({}, smsCfg(), { id: 'main' }), { noDelete: true, title: 'SMS settings' });

/* ---------- invoices & receipts ---------- */
(function addSalePhone() { const F = ENT.sales.fields; if (F.some(f => f.k === 'smsPhone')) return; const i = F.findIndex(f => f.k === 'customer'); F.splice(i + 1, 0, { k: 'smsPhone', label: 'Text receipts to', type: 'tel', ph: 'Blank = the school’s phone', help: 'Used for SMS receipts and payment reminders.' }); })();
const smsSalePhone = s => smsNorm(s.smsPhone) || smsNorm((get('schools', s.schoolId) || {}).phone);
const smsSaleOk = () => smsServer() && (canWriteColl('sales') || smsCanSend());
const _saleView = VIEWS.sale;
VIEWS.sale = id => {
  const html = _saleView(id); const s = get('sales', id); if (!s || !smsSaleOk() || !saleLive(s)) return html;
  const isInv = s.kind !== 'receipt'; const b = [];
  if (salePaid(s) > 0) b.push(btn(ic('send') + ' Text receipt', 'smsSaleReceipt', { id }, 'ghost'));
  if (isInv && saleBalance(s) > 0.004) b.push(btn(ic('send') + ' Text reminder', 'smsSaleReminder', { id }, 'ghost'));
  return b.length ? html.replace('<div class="pact">', '<div class="pact">' + b.join('')) : html;
};
async function smsSaleAct(kind, id) {
  const s = get('sales', id); const ph = smsSalePhone(s);
  if (!ph) return toast('No phone number. Edit the sale and fill in “Text receipts to”, or add a phone to the school.', 'bad');
  const ok = await ask({ title: kind === 'receipt' ? 'Text the receipt?' : 'Text a payment reminder?', body: `To <b>${esc(smsShow(ph))}</b> for ${esc(s.number)}${kind === 'receipt' ? '' : `, balance ${fmtMoney(saleBalance(s))}`}.`, ok: 'Send' });
  if (!ok) return;
  try { const r = await smsCall(kind === 'receipt' ? 'smsReceipt' : 'smsReminder', { saleId: id, manual: true }); toast(r && r.skipped ? 'Nothing to send.' : 'Sent to ' + smsShow(ph)); } catch (e) { toast(e.message || 'Could not send.', 'bad'); }
}
ACT.smsSaleReceipt = el => smsSaleAct('receipt', el.dataset.id);
ACT.smsSaleReminder = el => smsSaleAct('reminder', el.dataset.id);

/* automatic receipt: after a payment is recorded or a paid receipt is created */
const _smsSave = save;
save = async function (c, rec) {
  const prev = c === 'sales' && rec && rec.id ? get('sales', rec.id) : null;
  const id = await _smsSave(c, rec);
  if (c === 'sales') { try { smsAutoReceipt(prev, get('sales', id)); } catch (e) { } }
  return id;
};
function smsAutoReceipt(prev, s) {
  if (!s || !smsServer() || !saleLive(s)) return; const cfg = smsCfg(); if (!cfg.senderId || !cfg.autoReceipts) return;
  const paidNow = salePaid(s), paidBefore = prev && saleLive(prev) ? salePaid(prev) : 0;
  if (paidNow <= paidBefore + 0.004) return;
  const ph = smsSalePhone(s); if (!ph) return;
  smsCall('smsReceipt', { saleId: s.id }).then(r => { if (r && r.sent) toast('Receipt texted to ' + smsShow(ph)); }).catch(e => toast('Receipt SMS not sent: ' + (e.message || 'error'), 'bad'));
}

/* ---------- welcome SMS for new team members (Admin) ---------- */
const smsWelcomeReady = () => smsServer() && myRole() === 'Admin' && !!smsCfg().senderId;
/* returns true if a text is being sent (so the caller can skip the copy-message fallback) */
function smsWelcome(who, phone) {
  if (!smsWelcomeReady() || !smsNorm(phone)) return false;
  smsCall('smsWelcome', who).then(() => toast('Welcome SMS sent to ' + smsShow(smsNorm(phone)))).catch(e => toast('Welcome SMS not sent: ' + (e.message || 'error'), 'bad'));
  return true;
}
ACT.inviteText = async el => {
  const i = get('invites', el.dataset.id); if (!i) return;
  const phone = i.phone || (get('staff', i.staffId) || {}).phone;
  if (!smsNorm(phone)) return toast('No phone number on this invitation or their team record.', 'bad');
  const ok = await ask({ title: 'Text the welcome message again?', body: `To <b>${esc(smsShow(smsNorm(phone)))}</b> with their role and how to sign in.`, ok: 'Send' });
  if (ok) smsWelcome({ email: i.id }, phone);
};
