'use strict';
/* =========================================================
   Adzesua HQ — Launch & fundraising plan (pre-launch tracker)
   A project template plus a one-click "Add the plan" for the
   administrator on the Projects page. Owners: md = Managing
   Director, bd = Business Development.
   ========================================================= */
const LAUNCH_PLAN_NAME = 'Launch & fundraising plan';
const LAUNCH_PLAN = [
  ['Sales: add the Agona target schools and their key contacts to HQ', 'bd', '2026-11-30'],
  ['SWESCO: headmaster signs the letter of intent', 'md', '2026-12-04'],
  ['Compliance: confirm TIN and business operating permit are current', 'md', '2026-12-04'],
  ['Product: get supplier quotes for NFC cards, lanyards, gate readers and ZC300 ribbons', 'md', '2026-12-04'],
  ['SWESCO: agree card price and yearly exeat fee; PTA approval', 'md', '2026-12-11'],
  ['SWESCO: load Form 1 student data into SSHMS', 'md', '2026-12-11'],
  ['SWESCO: card design signed off by the school', 'bd', '2026-12-11'],
  ['Sales: meet the heads at Nyakrom SHTS, SWESBUS and Nsaba Presby', 'bd', '2026-12-11'],
  ['Product: buy sample NFC cards and two readers', 'md', '2026-12-11'],
  ['Pitch: one-page summary and pitch deck final', 'md', '2026-12-11'],
  ['Sales: signed letters of intent from 3 more schools', 'bd', '2026-12-18'],
  ['Sales: letter of support from the Agona West GES district director', 'bd', '2026-12-18'],
  ['Compliance: register with the Data Protection Commission', 'md', '2026-12-18'],
  ['Product: mock exeat sign-out and return at SWESCO; film a 60-second demo', 'md', '2026-12-18'],
  ['Pitch: numbers sheet (unit costs, prices, 3-year projection)', 'md', '2026-12-18'],
  ['Funding: ask card and reader suppliers for credit terms', 'md', '2026-12-18'],
  ['Funding: pitch friends, family and diaspora contacts', 'md', '2026-12-31'],
  ['Funding: pitch the SWESCO old students association', 'md', '2027-01-10'],
  ['Sales: letter of support from the Agona East GES district director', 'bd', '2027-01-15'],
  ['Funding: apply to the Tony Elumelu Foundation programme (opens 1 January)', 'md', '2027-01-31'],
  ['Funding: approach GAIN and Accra Angels Network once 3 schools have signed', 'md', '2027-02-28'],
  ['Funding: apply to Orange Corners Ghana when the call opens', 'md', '2027-03-15'],
  ['Funding: watch for the next Adwumawura (NEIP) window', 'md', '2027-03-31'],
];
PJ_TEMPLATES[LAUNCH_PLAN_NAME] = LAUNCH_PLAN.map(t => t[0]);

function launchOwners() {
  const staff = all('staff').filter(s => s.status !== 'Former');
  const md = staff.find(s => s.userId && s.userId === APP.uid) || staff.find(s => s.accessRole === 'Admin') || staff.find(s => /ebenezer/i.test(s.name || ''));
  const bd = staff.find(s => /fafali|sharon/i.test(s.name || '')) || staff.find(s => s.accessRole === 'BizDev');
  return { md: md ? md.id : '', bd: bd ? bd.id : '' };
}
const launchPlanExists = () => all('projects').some(p => p.name === LAUNCH_PLAN_NAME && p.status !== 'Cancelled');
const _projectsView = VIEWS.projects;
VIEWS.projects = () => {
  const html = _projectsView();
  if (myRole() !== 'Admin' || launchPlanExists() || !APP.canWrite) return html;
  const banner = `<div class="banner info" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><span style="flex:1;min-width:220px"><b>Launch & fundraising plan.</b> ${LAUNCH_PLAN.length} steps from the SWESCO pilot to the first funding applications, with owners and dates.</span>${btn(ic('plus') + ' Add the plan', 'launchPlanAdd')}</div>`;
  return html.replace('</header>', '</header>' + banner);
};
ACT.launchPlanAdd = async el => {
  if (launchPlanExists()) return toast('The plan is already in Projects.');
  el.disabled = true; const o = launchOwners();
  const rec = {
    name: LAUNCH_PLAN_NAME, type: 'Other', status: 'Active', start: todayISO(), due: '2027-03-31', ownerId: o.md,
    goal: 'SWESCO signed and running as the pilot, at least 3 more Agona schools with signed letters of intent, the demo filmed, and funding applications in (Tony Elumelu, Orange Corners), with enough money raised for the printer, cards and readers.',
    tasks: LAUNCH_PLAN.map(([title, who, due]) => ({ id: uid(), title, ownerId: o[who] || '', due, done: false })),
  };
  try { const id = await save('projects', rec); toast('Plan added'); location.hash = 'project-' + id; }
  catch (e) { el.disabled = false; toast(e.message || 'Could not add the plan.', 'bad'); }
};
