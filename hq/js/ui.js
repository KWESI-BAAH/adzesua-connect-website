'use strict';
/* =========================================================
   Adzesua OS — UI kit: actions, tables, forms, modals, charts
   ========================================================= */

const ACT = {};
const VS = (() => { try { return JSON.parse(localStorage.getItem('adz-vs') || '{}'); } catch (e) { return {}; } })();
function vs(id) { return VS[id] || (VS[id] = {}); }
function persistVS() { try { localStorage.setItem('adz-vs', JSON.stringify(VS)); } catch (e) { } }
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------- delegated events ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act];
  if (fn) { e.preventDefault(); try { const r = fn(el, e); if (r && r.catch) r.catch(err => toast(err.message || String(err), 'bad')); } catch (err) { console.error(err); toast(err.message || String(err), 'bad'); } }
});
let vsTimer;
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.vs) { const [t, k] = el.dataset.vs.split('.'); vs(t)[k] = el.type === 'checkbox' ? el.checked : el.value; vs(t).limit = 0; clearTimeout(vsTimer); vsTimer = setTimeout(() => { persistVS(); scheduleRender(); }, el.tagName === 'SELECT' ? 0 : 140); }
  if (el.closest('#modal')) recalcForm();
});
document.addEventListener('change', e => { const el = e.target; if (el.dataset.vs && el.tagName === 'SELECT') { const [t, k] = el.dataset.vs.split('.'); vs(t)[k] = el.value; persistVS(); scheduleRender(); } if (el.closest('#modal')) recalcForm(e); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#modal').classList.contains('open')) closeModal();
  if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) { e.preventDefault(); const s = $('#gsearch'); s && s.focus(); }
});
ACT.sort = el => { const s = vs(el.dataset.t); s.dir = s.sortK === el.dataset.k && s.dir === 'asc' ? 'desc' : 'asc'; s.sortK = el.dataset.k; persistVS(); scheduleRender(); };
ACT.more = el => { const s = vs(el.dataset.t); s.limit = (s.limit || 100) + 200; scheduleRender(); };
ACT.go = el => { location.hash = el.dataset.to; };
ACT.closeModal = () => closeModal();
ACT.chip = el => { const [t, k] = el.dataset.vsk.split('.'); vs(t)[k] = el.dataset.v; vs(t).limit = 0; persistVS(); scheduleRender(); };

/* ---------- tooltip ---------- */
const tipEl = document.createElement('div'); tipEl.className = 'tip'; tipEl.setAttribute('role', 'tooltip');
document.addEventListener('DOMContentLoaded', () => document.body.appendChild(tipEl));
document.addEventListener('mouseover', e => { const t = e.target.closest('[data-tip]'); if (!t) { tipEl.style.opacity = 0; return; } tipEl.innerHTML = t.dataset.tip; tipEl.style.opacity = 1; });
document.addEventListener('mousemove', e => { if (tipEl.style.opacity === '1') { const w = tipEl.offsetWidth; const x = Math.min(e.clientX + 14, innerWidth - w - 8); tipEl.style.transform = `translate(${x}px,${e.clientY + 14}px)`; } });

/* ---------- toast & confirm ---------- */
function toast(msg, kind = 'ok') {
  const box = $('#toasts'); const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = msg; box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, kind === 'bad' ? 6000 : 3000);
}
function ask({ title, body = '', ok = 'Confirm', danger = false }) {
  return new Promise(res => {
    openModal(`<div class="mhead"><h2>${esc(title)}</h2></div><div class="mbody"><p class="muted">${body}</p></div>
      <div class="mfoot"><button class="btn ghost" data-act="askNo">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-act="askYes">${esc(ok)}</button></div>`, 'sm');
    ACT.askYes = () => { closeModal(); res(true); }; ACT.askNo = () => { closeModal(); res(false); };
  });
}

/* ---------- modal ---------- */
let modalStack = [];
function openModal(html, size = '') {
  const m = $('#modal');
  if (m.classList.contains('open')) modalStack.push({ html: $('.mcard', m).innerHTML, size: $('.mcard', m).dataset.size, form: CURRENT_FORM });
  m.innerHTML = `<div class="mback" data-act="closeModal"></div><div class="mcard ${size}" data-size="${size}" role="dialog" aria-modal="true">${html}</div>`;
  m.classList.add('open'); document.body.classList.add('noscroll');
  setTimeout(() => { const f = $('.mcard input:not([type=hidden]):not([type=checkbox]), .mcard select, .mcard textarea', m); f && f.focus(); }, 30);
}
function closeModal() {
  const m = $('#modal');
  const prev = modalStack.pop();
  if (prev) { m.innerHTML = `<div class="mback" data-act="closeModal"></div><div class="mcard ${prev.size}" data-size="${prev.size}" role="dialog" aria-modal="true">${prev.html}</div>`; CURRENT_FORM = prev.form; return; }
  m.classList.remove('open'); m.innerHTML = ''; document.body.classList.remove('noscroll'); CURRENT_FORM = null;
}

/* ---------- small renderers ---------- */
const pill = (text, tone = '') => `<span class="pill ${tone}">${esc(text)}</span>`;
const TONES = {
  Prospect: '', Engaged: 'info', Pilot: 'gold', Customer: 'good', Inactive: 'mute',
  Lead: '', Contacted: 'info', 'Meeting held': 'info', 'Proposal sent': 'gold', Won: 'good', Lost: 'bad',
  'Pending print': 'mute', Printed: 'info', Issued: 'gold', Active: 'good', Lost_: 'bad', Blocked: 'bad', Replaced: 'mute',
  Draft: 'mute', Unpaid: 'gold', 'Part paid': 'info', Paid: 'good', Overdue: 'bad', Void: 'mute',
  Ordered: 'info', Shipped: 'gold', Received: 'good', Cancelled: 'mute',
  'In stock': 'info', Installed: 'good', Faulty: 'bad', Retired: 'mute',
  'Data collection': 'mute', 'Design approval': 'info', Printing: 'gold', Encoding: 'gold', Delivered: 'good', Activated: 'good',
};
const statusPill = (s, ctx) => pill(s, (ctx === 'card' && s === 'Lost') ? 'bad' : (TONES[s] ?? ''));
const link = (to, text) => `<a href="#${esc(to)}" class="lnk">${esc(text)}</a>`;
const schoolLink = id => { const s = get('schools', id); return s ? link('school-' + id, s.name) : '<span class="muted">—</span>'; };
const empty = (title, body = '', btn = '') => `<div class="empty"><div class="empty-mark">${MARK_SVG}</div><h3>${esc(title)}</h3>${body ? `<p>${body}</p>` : ''}${btn}</div>`;
function btn(label, act, attrs = {}, cls = 'primary') {
  const a = Object.entries(attrs).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
  const needsWrite = cls.includes('w') || ['primary', 'danger'].some(c => cls.includes(c));
  let blocked = needsWrite && !APP.canWrite;
  if (!blocked && needsWrite && typeof canWriteColl === 'function') { const k = attrs.k; const coll = k ? (k === 'wifiLog' ? 'sales' : (ENT[k] && ENT[k].coll) || null) : null; blocked = coll ? !canWriteColl(coll) : (k ? false : !pageWritable()); }
  return `<button class="btn ${cls}" data-act="${act}" ${a} ${blocked ? 'disabled title="Not available for your role"' : ''}>${label}</button>`;
}
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', dl: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>', trash: '<path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V4h12"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', check: '<path d="m5 12 5 5 9-10"/>', nfc: '<path d="M6 8a8 8 0 0 1 0 8M10 6a12 12 0 0 1 0 12M14 4a16 16 0 0 1 0 16"/>',
};
const ic = (n, s = 16) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const MARK_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="24" cy="40" r="13" fill="none" stroke="currentColor" stroke-width="7"/><path d="M37.5 22v31h6" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="miter"/><path d="M45.3 18.6A10 10 0 0 1 60.7 18.6" fill="none" stroke="var(--gold)" stroke-width="3.4" stroke-linecap="round"/><circle cx="53" cy="25" r="4.4" fill="var(--gold)"/></svg>`;

/* ---------- tables ---------- */
function dataTable({ id, rows, cols, rowAct, rowAttr = 'id', empty: emptyHtml = '', select = false, foot = '', pageSize = 100 }) {
  const st = vs(id);
  let list = rows.slice();
  if (st.sortK) { const c = cols.find(c => c.k === st.sortK); if (c) { const v = c.v || (r => r[c.k]); list.sort((a, b) => { const x = v(a), y = v(b); const r = (typeof x === 'number' && typeof y === 'number') ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true }); return st.dir === 'desc' ? -r : r; }); } }
  if (!list.length) return emptyHtml || `<div class="empty small"><p>Nothing matches.</p></div>`;
  const limit = st.limit || pageSize; const shown = list.slice(0, limit);
  const sel = st.sel || (st.sel = {});
  const th = cols.map(c => `<th class="${c.cls || ''}"><button class="th" data-act="sort" data-t="${id}" data-k="${c.k}">${esc(c.label)}${st.sortK === c.k ? `<span class="sd">${st.dir === 'desc' ? '↓' : '↑'}</span>` : ''}</button></th>`).join('');
  const body = shown.map(r => `<tr ${rowAct ? `data-act="${rowAct}" data-id="${esc(r[rowAttr])}" tabindex="0" class="click"` : ''}>${select ? `<td class="selc" data-act="selRow" data-t="${id}" data-id="${esc(r.id)}"><input type="checkbox" aria-label="Select row" ${sel[r.id] ? 'checked' : ''}></td>` : ''}${cols.map((c, ci) => `<td class="${c.cls || ''}${ci === 0 ? ' lead' : ''}" data-label="${esc(c.label)}">${c.f ? c.f(r) : esc(r[c.k] ?? '')}</td>`).join('')}</tr>`).join('');
  const allSel = select && shown.every(r => sel[r.id]);
  return `<div class="tw"><table class="dt cardify"><thead><tr>${select ? `<th class="selc"><input type="checkbox" aria-label="Select all shown" data-act="selAll" data-t="${id}" ${allSel ? 'checked' : ''}></th>` : ''}${th}</tr></thead><tbody>${body}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ''}</table></div>
  ${list.length > limit ? `<div class="morebar"><span class="muted">Showing ${fmtNum(limit)} of ${fmtNum(list.length)}</span><button class="btn ghost" data-act="more" data-t="${id}">Show more</button></div>` : `<div class="countbar muted">${fmtNum(list.length)} ${list.length === 1 ? 'record' : 'records'}</div>`}`;
}
ACT.selRow = (el, e) => { e.stopPropagation(); const s = vs(el.dataset.t); s.sel = s.sel || {}; if (s.sel[el.dataset.id]) delete s.sel[el.dataset.id]; else s.sel[el.dataset.id] = 1; scheduleRender(); };
ACT.selAll = (el) => { const s = vs(el.dataset.t); s.sel = s.sel || {}; const ids = $$(`tbody td.selc`, el.closest('table')).map(td => td.dataset.id); const on = !ids.every(i => s.sel[i]); ids.forEach(i => { if (on) s.sel[i] = 1; else delete s.sel[i]; }); scheduleRender(); };
function selected(t) { return Object.keys(vs(t).sel || {}); }
function clearSel(t) { vs(t).sel = {}; }
const textMatch = (q, ...vals) => { if (!q) return true; const s = vals.join(' ').toLowerCase(); return q.toLowerCase().split(/\s+/).every(w => s.includes(w)); };

function toolbar({ t, search = 'Search', filters = [], actions = '' }) {
  const st = vs(t);
  const f = filters.map(fl => `<label class="fsel"><span class="sr">${esc(fl.label)}</span><select id="${t}-${fl.k}" data-vs="${t}.${fl.k}"><option value="">${esc(fl.label)}: all</option>${fl.opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${st[fl.k] === String(v) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select></label>`).join('');
  return `<div class="toolbar"><label class="sbox">${ic('search')}<span class="sr">${esc(search)}</span><input id="${t}-q" type="search" placeholder="${esc(search)}" value="${esc(st.q || '')}" data-vs="${t}.q" autocomplete="off"></label>${f}<div class="tspace"></div>${actions}</div>`;
}

/* ---------- forms ---------- */
let CURRENT_FORM = null;
function optList(f, rec) {
  let o = typeof f.opts === 'function' ? f.opts(rec) : f.opts;
  if (f.ref) o = all(f.ref).filter(r => !f.refFilter || f.refFilter(r, rec)).map(r => [r.id, (ENT[f.ref] && ENT[f.ref].title(r)) || r.name || r.id]).sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  return (o || []).map(x => Array.isArray(x) ? x : [x, x]);
}
function fieldHtml(f, rec) {
  const v = rec[f.k] ?? (typeof f.def === 'function' ? f.def(rec) : f.def) ?? '';
  const id = `f_${f.k}`; const req = f.req ? 'required' : '';
  const lab = `<label for="${id}">${esc(f.label)}${f.req ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>`;
  const help = f.help ? `<small class="help">${f.help}</small>` : '';
  const wrap = inner => `<div class="fld ${f.span ? 'span' + f.span : ''}" data-k="${f.k}" ${f.showIf && !f.showIf(rec) ? 'hidden' : ''}>${inner}${help}</div>`;
  switch (f.type) {
    case 'textarea': return wrap(`${lab}<textarea id="${id}" rows="${f.rows || 3}" ${req}>${esc(v)}</textarea>`);
    case 'select': case 'ref': {
      const opts = optList(f, rec);
      return wrap(`${lab}<select id="${id}" ${req}>${f.req && v !== '' ? '' : `<option value="">${esc(f.ph || '— Select —')}</option>`}${opts.map(([ov, ol]) => `<option value="${esc(ov)}" ${String(v) === String(ov) ? 'selected' : ''}>${esc(ol)}</option>`).join('')}</select>`);
    }
    case 'multi': { const opts = optList(f, rec); const cur = Array.isArray(v) ? v : []; return wrap(`<span class="lbl">${esc(f.label)}</span><div class="chips" id="${id}">${opts.map(([ov, ol]) => `<label class="chipc"><input type="checkbox" value="${esc(ov)}" ${cur.includes(ov) ? 'checked' : ''}><span>${esc(ol)}</span></label>`).join('')}</div>`); }
    case 'check': return wrap(`<label class="chk"><input type="checkbox" id="${id}" ${v ? 'checked' : ''}><span>${esc(f.label)}</span></label>`);
    case 'lines': return `<div class="fld span2" data-k="${f.k}">${f.label ? `<span class="lbl">${esc(f.label)}</span>` : ''}${linesEditor(f, Array.isArray(v) ? v : [])}${help}</div>`;
    case 'html': return `<div class="fld span2">${f.html(rec)}</div>`;
    default: {
      const type = f.type === 'money' || f.type === 'number' ? 'number' : (f.type || 'text');
      const step = f.type === 'money' ? 'step="0.01"' : (f.type === 'number' ? `step="${f.step || 'any'}"` : '');
      return wrap(`${lab}<div class="${f.type === 'money' ? 'money' : ''}">${f.type === 'money' ? '<span>GH₵</span>' : ''}<input id="${id}" type="${type}" ${step} ${f.min !== undefined ? `min="${f.min}"` : ''} value="${esc(v)}" ${req} ${f.ph ? `placeholder="${esc(f.ph)}"` : ''} ${f.list ? `list="${id}_dl"` : ''} autocomplete="off"></div>${f.list ? `<datalist id="${id}_dl">${f.list().map(x => `<option value="${esc(x)}">`).join('')}</datalist>` : ''}`);
    }
  }
}
/* line editors: columns {k,label,type,opts,w} */
function linesEditor(f, rows) {
  const cols = f.cols;
  const head = cols.map(c => `<th style="width:${c.w || 'auto'}" class="${c.type === 'money' || c.type === 'number' ? 'num' : ''}">${esc(c.label)}</th>`).join('');
  const showT = !!f.lineTotal;
  const rowHtml = r => `<tr>${cols.map(c => `<td>${lineCell(c, r)}</td>`).join('')}${showT ? '<td class="lt num" data-lt></td>' : ''}<td><button type="button" class="icbtn" data-act="lineDel" aria-label="Remove line">${ic('trash', 15)}</button></td></tr>`;
  const list = rows.length ? rows : [f.blank ? f.blank() : {}];
  return `<div class="lines" data-lines="${f.k}"><div class="tw"><table class="lt-table"><thead><tr>${head}${showT ? `<th class="num">${esc(f.totalLabel || 'Amount')}</th>` : ''}<th></th></tr></thead><tbody>${list.map(rowHtml).join('')}</tbody></table></div>
    <div class="lines-foot"><button type="button" class="btn ghost sm" data-act="lineAdd" data-k="${f.k}">${ic('plus', 14)} Add line</button><div class="lines-total" data-total></div></div><template>${rowHtml(f.blank ? f.blank() : {})}</template></div>`;
}
function lineCell(c, r) {
  const v = r[c.k] ?? (c.def !== undefined ? (typeof c.def === 'function' ? c.def() : c.def) : '');
  const lbl = `aria-label="${esc(c.label)}"`;
  if (c.type === 'select') { const opts = (typeof c.opts === 'function' ? c.opts() : c.opts).map(x => Array.isArray(x) ? x : [x, x]); return `<select data-col="${c.k}" ${lbl}><option value="">—</option>${opts.map(([ov, ol]) => `<option value="${esc(ov)}" ${String(v) === String(ov) ? 'selected' : ''}>${esc(ol)}</option>`).join('')}</select>`; }
  const t = c.type === 'money' || c.type === 'number' ? 'number' : (c.type || 'text');
  return `<input data-col="${c.k}" type="${t}" ${t === 'number' ? 'step="any" class="num"' : ''} value="${esc(v)}" ${lbl}>`;
}
ACT.lineAdd = el => { const box = el.closest('[data-lines]'); const tpl = $('template', box); $('tbody', box).insertAdjacentHTML('beforeend', tpl.innerHTML); recalcForm(); };
ACT.lineDel = el => { const tb = el.closest('tbody'); if (tb.children.length > 1) el.closest('tr').remove(); else $$('input,select', el.closest('tr')).forEach(i => (i.value = '')); recalcForm(); };
function readLines(box, f) {
  return $$('tbody tr', box).map(tr => { const o = {}; $$('[data-col]', tr).forEach(i => { const c = f.cols.find(c => c.k === i.dataset.col); o[i.dataset.col] = c && (c.type === 'money' || c.type === 'number') ? (i.value === '' ? '' : num(i.value)) : i.value.trim(); }); return o; })
    .filter(o => Object.values(o).some(v => v !== '' && v !== 0));
}
function readForm() {
  const F = CURRENT_FORM; if (!F) return {};
  const rec = Object.assign({}, F.rec);
  F.fields.forEach(f => {
    if (f.type === 'html') return;
    if (f.type === 'lines') { const box = $(`[data-lines="${f.k}"]`); rec[f.k] = box ? readLines(box, f) : []; return; }
    const el = $(`#f_${f.k}`); if (!el) return;
    if (f.type === 'multi') rec[f.k] = $$('input:checked', el).map(i => i.value);
    else if (f.type === 'check') rec[f.k] = el.checked;
    else if (f.type === 'money' || f.type === 'number') rec[f.k] = el.value === '' ? '' : num(el.value);
    else rec[f.k] = el.value.trim();
  });
  return rec;
}
function recalcForm(e) {
  const F = CURRENT_FORM; if (!F) return;
  F.fields.filter(f => f.type === 'lines').forEach(f => {
    const box = $(`[data-lines="${f.k}"]`); if (!box) return;
    if (e && f.onLineChange && e.target.closest(`[data-lines="${f.k}"]`)) f.onLineChange(e.target.closest('tr'), e.target);
    let tot = 0; $$('tbody tr', box).forEach(tr => { const o = {}; $$('[data-col]', tr).forEach(i => (o[i.dataset.col] = i.value)); const amt = f.lineTotal ? f.lineTotal(o) : 0; tot += amt; const c = $('[data-lt]', tr); if (c) c.textContent = f.lineTotal ? fmtMoney(amt, { bare: true }) : ''; });
    const t = $('[data-total]', box); if (t) t.innerHTML = f.totalText ? f.totalText(readLines(box, f), readForm()) : (f.lineTotal ? `Total <b>${fmtMoney(tot)}</b>` : '');
  });
  if (F.onChange) F.onChange(readForm(), e);
  F.fields.forEach(f => { if (f.showIf) { const el = $(`.fld[data-k="${f.k}"]`); if (el) el.hidden = !f.showIf(readForm()); } });
}
/* openForm(key, rec, {title, fields override, onSave}) */
function openForm(key, rec = {}, opts = {}) {
  const E = ENT[key]; const fields = (opts.fields || E.fields).filter(f => !f.hideIf || !f.hideIf(rec));
  const isNew = !rec.id;
  CURRENT_FORM = { key, rec: Object.assign({}, rec), fields, onSave: opts.onSave, onChange: opts.onChange || E.onChange };
  const title = opts.title || `${isNew ? 'New' : 'Edit'} ${E.label.toLowerCase()}`;
  openModal(`<form id="eform" novalidate><div class="mhead"><h2>${esc(title)}</h2>${opts.sub ? `<p class="muted">${opts.sub}</p>` : ''}<button type="button" class="icbtn x" data-act="closeModal" aria-label="Close">×</button></div>
    <div class="mbody"><div class="fgrid">${fields.map(f => fieldHtml(f, rec)).join('')}</div><p class="ferr" role="alert"></p></div>
    <div class="mfoot">${!isNew && E.coll && !opts.noDelete ? `<button type="button" class="btn ghost danger-t" data-act="formDelete">${ic('trash', 15)} Delete</button>` : ''}<span class="tspace"></span><button type="button" class="btn ghost" data-act="closeModal">Cancel</button>${E.coll && typeof canWriteColl === 'function' && !canWriteColl(E.coll) ? '<span class="muted small">View only for your role</span>' : ''}<button type="submit" class="btn primary" ${!APP.canWrite || (E.coll && typeof canWriteColl === 'function' && !canWriteColl(E.coll)) ? 'disabled' : ''}>${esc(opts.okLabel || (isNew ? 'Create' : 'Save changes'))}</button></div></form>`, opts.size || E.size || '');
  setTimeout(recalcForm, 0);
}
document.addEventListener('submit', async e => {
  if (e.target.id !== 'eform') return; e.preventDefault();
  const F = CURRENT_FORM; const E = ENT[F.key]; const rec = readForm();
  const missing = F.fields.filter(f => f.req && (rec[f.k] === '' || rec[f.k] === undefined || (Array.isArray(rec[f.k]) && !rec[f.k].length)) && !(f.showIf && !f.showIf(rec)));
  const errEl = $('.ferr');
  if (missing.length) { errEl.textContent = `Fill in: ${missing.map(f => f.label).join(', ')}.`; const el = $(`#f_${missing[0].k}`); el && el.focus(); return; }
  if (E.validate) { const msg = E.validate(rec); if (msg) { errEl.textContent = msg; return; } }
  const sub = $('button[type=submit]', e.target); sub.disabled = true; sub.textContent = 'Saving…';
  try {
    const final = E.beforeSave ? E.beforeSave(rec) : rec;
    let id;
    if (F.onSave) id = await F.onSave(final); else id = await save(E.coll, final);
    closeModal(); toast(`${E.label} saved`);
    if (E.afterSave) E.afterSave(Object.assign({}, final, { id }), !F.rec.id);
  } catch (err) { errEl.textContent = err.message || 'Could not save.'; sub.disabled = false; sub.textContent = 'Try again'; }
});
ACT.formDelete = async () => {
  const F = CURRENT_FORM; const E = ENT[F.key]; const rec = F.rec;
  const block = E.canDelete && E.canDelete(rec);
  if (block) { $('.ferr').textContent = block; return; }
  const ok = await ask({ title: `Delete this ${E.label.toLowerCase()}?`, body: `${esc(E.title(rec))} will be removed for everyone. This cannot be undone.`, ok: 'Delete', danger: true });
  if (!ok) return;
  try { await removeRec(E.coll, rec.id); closeModal(); toast(`${E.label} deleted`); if (E.afterDelete) E.afterDelete(rec); } catch (err) { toast(err.message, 'bad'); }
};

/* ---------- charts (SVG) ---------- */
function barChart({ labels, series, height = 220, fmt = v => fmtMoney(v), id = 'chart' }) {
  const W = 640, H = height, padL = 64, padR = 8, padT = 12, padB = 26;
  const max = Math.max(1, ...series.flatMap(s => s.values.map(v => Math.max(0, v))));
  const step = niceMax(max / 4); const ticks = Math.max(1, Math.ceil(max / step - 1e-9)); const nice = step * ticks;
  const iw = W - padL - padR, ih = H - padT - padB; const gw = iw / labels.length; const bw = Math.min(26, (gw - 12) / series.length - 2);
  let g = '';
  for (let i = 0; i <= ticks; i++) { const y = padT + ih - ih * i / ticks; g += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" class="grid"/><text x="${padL - 8}" y="${y + 4}" class="axis" text-anchor="end">${shortMoney(nice * i / ticks)}</text>`; }
  labels.forEach((lab, i) => {
    const gx = padL + gw * i + (gw - (bw + 2) * series.length) / 2;
    series.forEach((s, j) => {
      const v = Math.max(0, s.values[i] || 0); const h = Math.max(v > 0 ? 2 : 0, ih * v / nice); const x = gx + j * (bw + 2); const y = padT + ih - h;
      const r = Math.min(4, h / 2, bw / 2);
      const path = h > 0 ? `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${y + h}Z` : '';
      g += `<path d="${path}" fill="${s.color}" class="bar"/><rect x="${gx - 4}" y="${padT}" width="${(bw + 2) * series.length + 8}" height="${ih}" fill="transparent" data-tip="<b>${esc(lab)}</b>${series.map(ss => `<div><i style='background:${ss.color}'></i>${esc(ss.name)} <b>${esc(fmt(ss.values[i] || 0))}</b></div>`).join('')}"/>`;
    });
    g += `<text x="${padL + gw * i + gw / 2}" y="${H - 8}" class="axis" text-anchor="middle">${esc(lab)}</text>`;
  });
  g += `<line x1="${padL}" x2="${W - padR}" y1="${padT + ih}" y2="${padT + ih}" class="base"/>`;
  const legend = series.length > 1 ? `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  return `${legend}<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map(s => s.name).join(' and '))} by month">${g}</svg>`;
}
function hbars(items, fmt = v => fmtMoney(v)) {
  const max = Math.max(1, ...items.map(i => i.value));
  if (!items.length) return '<p class="muted small">No data yet.</p>';
  return `<div class="hbars">${items.map(i => `<div class="hb" data-tip="<b>${esc(i.label)}</b><div>${esc(fmt(i.value))}</div>"><span class="hbl">${esc(i.label)}</span><span class="hbt"><span class="hbf" style="width:${Math.max(1, 100 * i.value / max)}%;background:${i.color || 'var(--c1)'}"></span></span><span class="hbv">${esc(fmt(i.value))}</span></div>`).join('')}</div>`;
}
function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
function shortMoney(v) { if (v >= 1e6) return (v / 1e6).toFixed(v % 1e6 ? 1 : 0) + 'm'; if (v >= 1e3) return (v / 1e3).toFixed(v % 1e3 ? 1 : 0) + 'k'; return fmtNum(v); }
function stageBar(stages, counts) {
  const total = sum(stages, s => counts[s] || 0) || 1;
  return `<div class="stagebar">${stages.map((s, i) => `<div class="sb" style="flex:${Math.max(0.0001, counts[s] || 0)}" data-tip="<b>${esc(s)}</b><div>${counts[s] || 0}</div>"><span style="opacity:${0.35 + 0.65 * (i + 1) / stages.length}"></span></div>`).join('')}</div>`;
}

/* ---------- files ---------- */
async function offerFile(filename, data) {
  if (!APP.downloads) { try { await navigator.clipboard.writeText(typeof data === 'string' ? data : ''); toast('Downloads are not available here, so the contents were copied to your clipboard.'); } catch (e) { toast('Downloads are not available in this view.', 'bad'); } return; }
  try { await APP.downloads.save({ filename, data }); toast('File ready'); }
  catch (e) { if (e && e.code === 'declined') return; if (e && e.code === 'rate_limited') toast('A download prompt is already open.', 'bad'); else toast('Could not prepare the download (' + (e && e.code || 'error') + ').', 'bad'); }
}
async function copyText(text, what = 'Copied') { try { await navigator.clipboard.writeText(text); toast(what); } catch (e) { toast('Copy was blocked by the browser.', 'bad'); } }
function pickFile(accept) {
  return new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => { const f = i.files[0]; if (!f) return res(null); const r = new FileReader(); r.onload = () => res({ name: f.name, text: r.result }); r.readAsText(f); }; i.click(); });
}
