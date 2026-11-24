'use strict';
/* Adzesua OS — roles and permissions (shared by the app and the Firestore rules generator) */
/* Each role: page -> 'e' (view & edit) or 'v' (view only). Pages not listed are hidden. */
const ALL_PAGES = ['dashboard', 'cards', 'card-registry', 'devices', 'schools', 'contacts', 'pipeline', 'activities', 'support', 'projects', 'wifi', 'sales', 'expenses', 'purchases', 'budgets', 'tax', 'reports', 'ledger', 'journal', 'team', 'leave', 'payroll', 'inventory', 'assets', 'suppliers', 'sms', 'audit', 'setup'];
const P = (e, v) => Object.assign({}, ...v.map(k => ({ [k]: 'v' })), ...e.map(k => ({ [k]: 'e' })));
const ROLES = {
  Admin: Object.fromEntries(ALL_PAGES.map(k => [k, 'e'])),
  BizDev: P(['cards', 'card-registry', 'schools', 'contacts', 'pipeline', 'activities', 'support', 'projects', 'sales', 'expenses', 'leave', 'sms'], ['dashboard', 'devices', 'wifi', 'inventory', 'team']),
  Finance: P(['sales', 'expenses', 'purchases', 'budgets', 'tax', 'journal', 'assets', 'suppliers', 'inventory', 'payroll', 'activities', 'leave', 'sms'], ['dashboard', 'reports', 'ledger', 'schools', 'contacts', 'cards', 'card-registry', 'wifi', 'projects', 'team']),
  Ops: P(['cards', 'card-registry', 'devices', 'inventory', 'purchases', 'suppliers', 'support', 'projects', 'wifi', 'activities', 'leave'], ['dashboard', 'schools', 'contacts', 'assets', 'team']),
  Agent: P(['wifi', 'card-registry', 'support', 'activities', 'leave'], ['dashboard', 'schools', 'cards', 'team']),
  HR: P(['team', 'leave', 'payroll', 'activities'], ['dashboard', 'projects']),
  Auditor: P([], ['dashboard', 'sales', 'expenses', 'purchases', 'budgets', 'tax', 'reports', 'ledger', 'journal', 'assets', 'inventory', 'schools', 'cards', 'projects', 'team']),
  Viewer: P(['leave'], ['dashboard', 'schools', 'team']),
};
const ROLE_LABEL = { Admin: 'Managing Director (Admin)', BizDev: 'Business Development', Finance: 'Finance & Accounts', Ops: 'Operations & Technical', Agent: 'Campus Agent', HR: 'HR & Admin', Auditor: 'Auditor / Board (read-only)', Viewer: 'Staff (basic)' };
const ROLE_DESC = {
  Admin: 'Everything: all records, payroll, setup, roles and approvals.',
  BizDev: 'Wins and looks after schools: pipeline, contacts, card programme, invoices and receipts, support, projects, own expense claims, texting schools (SMS). No payroll, profit or bank balances.',
  Finance: 'Keeps the books: invoices, expenses, purchases, budgets, VAT, journals, assets and payroll. Sees all reports. Can text receipts and payment reminders. Share as Editor so payroll opens.',
  Ops: 'Delivers the product: card printing and encoding, readers and devices, stock, purchasing, Wi-Fi, support tickets, rollout projects.',
  Agent: 'Works at a school: logs Wi-Fi sales, taps and looks up cards, records card fees and renewals, logs support issues.',
  HR: 'Team records, departments, leave approvals and payroll. Share as Editor so payroll opens.',
  Auditor: 'Reads the books and reports to check or advise. Cannot change anything.',
  Viewer: 'Dashboard, staff directory and own leave requests. For interns and new hires.',
};
const LEGACY_ROLE = { Sales: 'BizDev', Operations: 'Ops' };
const COLL_PAGES = { schools: ['schools'], contacts: ['contacts'], deals: ['pipeline'], activities: ['activities', 'pipeline', 'team'], batches: ['cards'], cards: ['card-registry', 'cards'], devices: ['devices'], items: ['inventory'], moves: ['inventory', 'cards'], suppliers: ['suppliers', 'purchases'], purchases: ['purchases'], sales: ['sales', 'wifi', 'card-registry'], expenses: ['expenses'], journals: ['journal', 'tax', 'payroll'], staff: ['team'], departments: ['team'], leave: ['leave'], tickets: ['support'], projects: ['projects'], budgets: ['budgets'], assets: ['assets'], staffpay: ['payroll'], payruns: ['payroll'], advances: ['payroll'], products: ['setup'], accounts: ['setup', 'ledger'], settings: ['setup', 'tax', 'payroll'], members: ['setup'], invites: ['setup'], requests: ['setup'] };
/* pages whose data a role may READ (wider than edit: a page shows related records) */
const COLL_READ_PAGES = { sales: ['sales', 'wifi', 'card-registry', 'reports', 'ledger', 'journal', 'tax'], expenses: ['expenses', 'reports', 'ledger', 'journal', 'tax'], purchases: ['purchases', 'inventory', 'suppliers', 'reports', 'ledger', 'journal'], journals: ['journal', 'ledger', 'reports', 'tax'], budgets: ['budgets'], assets: ['assets', 'reports', 'ledger'], moves: ['inventory', 'cards', 'reports', 'ledger'], suppliers: ['suppliers', 'purchases', 'inventory'], deals: ['pipeline', 'schools'], staffpay: ['payroll'], payruns: ['payroll'], advances: ['payroll'] };
/* everything not listed above is readable by every member: schools, contacts, staff, departments, cards, batches, devices, items, tickets, projects, activities, leave, products, accounts, settings */
/* Deleting money records is limited to these roles; Campus Agents may add sales but not change them later. */
const MONEY_COLLS = ['sales', 'expenses', 'purchases', 'journals', 'payruns', 'advances', 'assets', 'budgets', 'accounts', 'products'];
const MONEY_DELETERS = ['Admin', 'Finance', 'HR'];
const CREATE_ONLY = { sales: ['Agent'] };
const PAYROLL_ROLES = Object.keys(ROLES).filter(r => ROLES[r].payroll);
if (typeof module !== 'undefined') module.exports = { LEGACY_ROLE, MONEY_COLLS, MONEY_DELETERS, CREATE_ONLY, ROLES, ROLE_LABEL, ROLE_DESC, COLL_PAGES, COLL_READ_PAGES, ALL_PAGES, PAYROLL_ROLES };
