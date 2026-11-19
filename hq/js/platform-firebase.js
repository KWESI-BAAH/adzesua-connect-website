'use strict';
/* =========================================================
   Adzesua HQ — Firebase platform layer.
   Provides the same window.claude.use('db' | 'user' | 'downloads')
   interface the app uses inside claude.ai, backed by Firebase
   Authentication (email + password) and Cloud Firestore.
   Also drives the sign-in screen (#gate).
   ========================================================= */
(function () {
  /* Refuse to run inside another site's frame (clickjacking). */
  if (window.top !== window.self) { try { window.top.location = window.self.location.href; } catch (e) { } document.documentElement.innerHTML = ''; return; }
  const cfg = window.ADZ_FIREBASE_CONFIG || {};
  const configured = !!(cfg.apiKey && cfg.projectId && !/PASTE/i.test(cfg.apiKey) && window.firebase);
  window.ADZ_PLATFORM = configured ? 'firebase' : 'unconfigured';
  let resolveSession; const session = new Promise(r => (resolveSession = r));
  const S0 = { user: null, ownerUid: null, member: null };

  /* ---------- gate (sign-in screen) ---------- */
  const g = id => document.getElementById(id);
  function gateMode(mode, msg) {
    const gate = g('gate'); if (!gate) return;
    gate.dataset.mode = mode; document.body.classList.toggle('gated', mode !== 'hidden');
    const lbl = { signin: 'Sign in', signup: 'Create account', reset: 'Send reset link' }[mode]; if (lbl && g('gSubmit')) { g('gSubmit').querySelector('span').textContent = lbl; g('gSubmit').classList.remove('loading'); g('gSubmit').disabled = false; }
    const pw = g('gPass'); if (pw) pw.setAttribute('autocomplete', mode === 'signup' ? 'new-password' : 'current-password');
    gate.classList.add('ready'); gate.querySelectorAll('[data-show]').forEach(el => { el.hidden = !el.dataset.show.split(' ').includes(mode); });
    const err = g('gErr'); if (err) { err.textContent = msg || ''; err.hidden = !msg; }
    const ok = g('gOk'); if (ok) { ok.hidden = true; }
    ['gOk2'].forEach(i => { const x = g(i); if (x) x.hidden = true; }); const e2 = g('gErr2'); if (e2) { e2.textContent = mode === 'verify' ? (msg || '') : ''; e2.hidden = !(mode === 'verify' && msg); }
    if (mode === 'hidden') { gate.setAttribute('aria-hidden', 'true'); return; }
    gate.removeAttribute('aria-hidden');
    const first = gate.querySelector(`[data-show~="${mode}"] input:not([type=checkbox])`); if (first) setTimeout(() => first.focus(), 60);
  }
  function busy(on, label) { const b = g('gSubmit'); if (!b) return; b.disabled = on; b.classList.toggle('loading', on); if (label) b.querySelector('span').textContent = label; }
  const FRIENDLY = {
    'auth/invalid-email': 'That email address does not look right.',
    'auth/user-not-found': 'Email or password is incorrect.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/invalid-login-credentials': 'Email or password is incorrect.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes, or reset your password.',
    'auth/email-already-in-use': 'An account with this email already exists. Sign in instead.',
    'auth/weak-password': 'Use at least 8 characters for your password.',
    'auth/network-request-failed': 'No internet connection. Check your data or Wi-Fi and try again.',
    'auth/missing-password': 'Enter your password.',
    'not-verified': 'Your email is not confirmed yet. Open the link we sent, then try again.',
    'auth/unauthorized-domain': 'Google sign-in is not allowed on this web address yet. In Firebase → Authentication → Settings → Authorized domains, add this site’s domain.',
    'auth/account-exists-with-different-credential': 'This email already signs in another way. Use your email and password instead.',
    'auth/operation-not-allowed': 'This sign-in method is turned off in Firebase → Authentication → Sign-in method.',
    'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups for this site and try again.',
  };
  const friendly = e => FRIENDLY[e && e.code] || (e && e.message) || 'Something went wrong. Try again.';

  document.addEventListener('DOMContentLoaded', () => {
    if (!g('gate')) return;
    if (!configured) { gateMode('setup'); return; }
    gateMode(g('gate').dataset.mode || 'checking');
    g('gForm').addEventListener('submit', onSubmit);
    document.querySelectorAll('[data-gate]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); gateMode(a.dataset.gate); }));
    const eye = g('gEye'); if (eye) eye.addEventListener('click', () => { const p = g('gPass'); const show = p.type === 'password'; p.type = show ? 'text' : 'password'; eye.setAttribute('aria-pressed', show); eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); });
    const gg = g('gGoogle'); if (gg) gg.addEventListener('click', googleSignIn);
    const vd = g('gVerified'); if (vd) vd.addEventListener('click', async () => {
      const u = firebase.auth().currentUser; if (!u) return gateMode('signin');
      vd.disabled = true;
      try { await u.reload(); await u.getIdToken(true); estP = null; await establish(firebase.auth().currentUser); }
      catch (e) { if (e && e.code === 'verify') { gateMode('verify', FRIENDLY['not-verified']); g('gVEmail').textContent = u.email; } else if (e && e.code === 'no-access') { g('gNoEmail').textContent = u.email; gateMode('noaccess'); } else gateMode('verify', friendly(e)); }
      finally { vd.disabled = false; }
    });
    const rs = g('gResend'); if (rs) rs.addEventListener('click', async () => { const u = firebase.auth().currentUser; if (!u) return; try { await u.sendEmailVerification(); const ok = g('gOk2'); ok.textContent = 'A new link is on its way to ' + u.email + '. Check spam too.'; ok.hidden = false; } catch (e) { const er = g('gErr2'); er.textContent = friendly(e); er.hidden = false; } });
    const so2 = g('gSignOut2'); if (so2) so2.addEventListener('click', () => firebase.auth().signOut().then(() => location.reload()));
    const chk = g('gCheck'); if (chk) chk.addEventListener('click', () => location.reload());
    const out = g('gSignOut'); if (out) out.addEventListener('click', () => firebase.auth().signOut().then(() => location.reload()));
  });

  async function onSubmit(e) {
    e.preventDefault();
    const mode = g('gate').dataset.mode; const auth = firebase.auth();
    const email = g('gEmail').value.trim().toLowerCase(); const pass = g('gPass').value;
    try {
      if (mode === 'signin') {
        busy(true, 'Signing in…');
        await auth.setPersistence(g('gKeep').checked ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
        await auth.signInWithEmailAndPassword(email, pass);
      } else if (mode === 'signup') {
        const name = g('gName').value.trim(); const pass2 = g('gPass2').value;
        if (!name) throw { message: 'Enter your full name.' };
        if (pass.length < 8) throw { code: 'auth/weak-password' };
        if (pass !== pass2) throw { message: 'The two passwords do not match.' };
        busy(true, 'Creating your account…');
        const cred = await auth.createUserWithEmailAndPassword(email, pass);
        await cred.user.updateProfile({ displayName: name });
        S0.pendingName = name;
        try { await cred.user.sendEmailVerification(); } catch (e) { }
        await establish(cred.user);
      } else if (mode === 'reset') {
        busy(true, 'Sending…');
        await auth.sendPasswordResetEmail(email);
        busy(false, 'Send reset link');
        const ok = g('gOk'); ok.textContent = `If ${email} has an account, a reset link is on its way. Check your inbox and spam folder.`; ok.hidden = false;
        return;
      }
    } catch (err) {
      if (err && err.code === 'verify') { showVerify(email); return; }
      if (err && err.code === 'no-access') { const em = g('gNoEmail'); if (em) em.textContent = email; busy(false, 'Create account'); gateMode('noaccess'); return; }
      busy(false, mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link');
      const box = g('gErr'); box.textContent = friendly(err); box.hidden = false;
    }
  }

  async function googleSignIn() {
    const btn = g('gGoogle'); const err = g('gErr'); err.hidden = true; btn.disabled = true; btn.querySelector('span').textContent = 'Opening Google…';
    try {
      const auth = firebase.auth(); const p = new firebase.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      let cred;
      try { cred = await auth.signInWithPopup(p); }
      catch (e) { if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) { await auth.signInWithRedirect(p); return; } throw e; }
      S0.pendingName = cred.user.displayName || '';
      await establish(cred.user);
    } catch (e) {
      if (e && e.code === 'no-access') { gateMode('noaccess'); const em = g('gNoEmail'); if (em) em.textContent = (firebase.auth().currentUser || {}).email || ''; return; }
      if (!(e && (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request'))) { err.textContent = friendly(e); err.hidden = false; }
    } finally { btn.disabled = false; btn.querySelector('span').textContent = 'Continue with Google'; }
  }

  function showVerify(email) { const v = g('gVEmail'); if (v) v.textContent = email || ''; gateMode('verify'); }

  if (!configured) {
    window.claude = { use: () => new Promise(() => { }) };
    return;
  }

  firebase.initializeApp(cfg);
  const auth = firebase.auth(); const fs = firebase.firestore();

  let estP = null, estUid = null;
  function establish(u) { if (!estP || estUid !== u.uid) { estUid = u.uid; estP = establishInner(u); estP.catch(() => { estP = null; }); } return estP; }
  async function establishInner(u) {
    if (S0.established === u.uid) return;
    const email = (u.email || '').toLowerCase();
    const ownerRef = fs.doc('config/owner');
    let ownerSnap = await ownerRef.get();
    if (!ownerSnap.exists) {
      if (!u.emailVerified) throw { code: 'verify' };
      await ownerRef.set({ uid: u.uid, at: new Date().toISOString() });
      await fs.doc('members/' + u.uid).set({ id: u.uid, role: 'Admin', name: u.displayName || S0.pendingName || email, email, joinedAt: new Date().toISOString() });
      S0.ownerUid = u.uid; await seed(u);
    } else {
      S0.ownerUid = ownerSnap.data().uid;
      let m = null; try { m = await fs.doc('members/' + u.uid).get(); } catch (e) { m = null; }
      if (!m || !m.exists) {
        let inv = null, check = 'not-found'; try { inv = await fs.doc('invites/' + email).get(); } catch (e) { inv = null; check = 'denied:' + (e && e.code); }
        if (!inv || !inv.exists) {
          try { await fs.doc('requests/' + u.uid).set({ id: u.uid, email, name: u.displayName || S0.pendingName || '', provider: (u.providerData && u.providerData[0] && u.providerData[0].providerId) || 'password', check, at: new Date().toISOString() }); } catch (e) { }
          throw { code: 'no-access' };
        }
        if (!u.emailVerified) throw { code: 'verify' };
        const d = inv.data();
        await fs.doc('members/' + u.uid).set({ id: u.uid, role: d.role, staffId: d.staffId || '', name: u.displayName || S0.pendingName || d.name || email, email, joinedAt: new Date().toISOString() });
      }
    }
    const me = await fs.doc('members/' + u.uid).get();
    S0.member = me.exists ? me.data() : { role: 'Admin' };
    S0.user = u; S0.established = u.uid;
    fs.doc('members/' + u.uid).onSnapshot(s => { if (s.exists) S0.member = s.data(); else if (u.uid !== S0.ownerUid) location.reload(); }, () => { });
    const who = g('gWho'); if (who) who.textContent = S0.member.name || email;
    gateMode('hidden'); resolveSession(u);
  }

  auth.onAuthStateChanged(async u => {
    if (!u) { if (S0.established) location.reload(); else gateMode('signin'); return; }
    try { await establish(u); }
    catch (e) {
      if (e && e.code === 'verify') showVerify(u.email);
      else if (e && e.code === 'no-access') { const em = g('gNoEmail'); if (em) em.textContent = u.email; gateMode('noaccess'); }
      else gateMode('signin', friendly(e));
    }
  });
  window.ADZ_SIGNOUT = () => auth.signOut().then(() => location.reload());

  /* ---------- db: Firestore behind the artifact db interface ---------- */
  const mapCode = c => ({ 'permission-denied': 'invalid_argument', 'invalid-argument': 'invalid_argument', 'resource-exhausted': 'resource_exhausted', 'unavailable': 'unavailable', 'deadline-exceeded': 'unavailable', 'unauthenticated': 'revoked' }[c] || 'unavailable');
  const wrapErr = e => { throw { code: mapCode(e && e.code), message: (e && e.message) || 'Error' }; };
  const meta = m => ({ fromCache: !!(m && m.fromCache), hasPendingWrites: !!(m && m.hasPendingWrites) });
  const conv = snap => ({ docs: snap.docs.map(d => ({ id: d.id, exists: true, data: () => d.data(), metadata: meta(d.metadata) })), size: snap.size, empty: snap.empty, metadata: meta(snap.metadata), docChanges: () => [] });
  const emptySnap = () => ({ docs: [], size: 0, empty: true, metadata: { fromCache: false, hasPendingWrites: false }, docChanges: () => [] });
  function docRef(path) {
    const d = fs.doc(path);
    return {
      id: d.id, path,
      get: () => d.get().then(s => ({ id: s.id, exists: s.exists, data: () => s.data(), metadata: meta(s.metadata) })).catch(e => e.code === 'permission-denied' ? { id: d.id, exists: false, data: () => undefined, metadata: meta() } : wrapErr(e)),
      set: data => d.set(data).catch(wrapErr),
      update: data => d.update(data).catch(wrapErr),
      delete: () => d.delete().catch(wrapErr),
      onSnapshot: (next, err) => d.onSnapshot(s => next({ id: s.id, exists: s.exists, data: () => s.data(), metadata: meta(s.metadata) }), e => e.code === 'permission-denied' ? next({ id: d.id, exists: false, data: () => undefined, metadata: meta() }) : err && err({ code: mapCode(e.code), message: e.message })),
      collection: p => collRef(path + '/' + p),
    };
  }
  function collRef(path) {
    const c = fs.collection(path);
    return {
      path,
      doc: id => docRef(path + '/' + (id || c.doc().id)),
      add: data => c.add(data).then(r => docRef(path + '/' + r.id)).catch(wrapErr),
      get: () => c.get().then(conv).catch(e => e.code === 'permission-denied' ? emptySnap() : wrapErr(e)),
      onSnapshot: (next, err) => c.onSnapshot({ includeMetadataChanges: false }, s => next(conv(s)), e => e.code === 'permission-denied' ? next(emptySnap()) : err && err({ code: mapCode(e.code), message: e.message })),
      where() { return this; }, orderBy() { return this; }, limit() { return this; },
    };
  }
  const db = { doc: docRef, collection: collRef };

  /* ---------- user ---------- */
  const PAY_ROLES = ['Admin', 'Finance', 'HR'];
  const memberCache = {};
  const user = {
    id: async () => S0.user && S0.user.uid,
    me: async () => ({ name: (S0.member && S0.member.name) || (S0.user && (S0.user.displayName || S0.user.email)) || '' }),
    isOwner: () => !!S0.user && S0.user.uid === S0.ownerUid,
    canEdit: () => !!S0.user && (S0.user.uid === S0.ownerUid || PAY_ROLES.includes(S0.member && S0.member.role)),
    can: k => k === 'data.write' ? !(S0.member && S0.member.role === 'Auditor') : null,
    profiles: async ids => {
      const out = {};
      for (const id of ids) {
        if (!(id in memberCache)) { try { const s = await fs.doc('members/' + id).get(); memberCache[id] = s.exists ? s.data().name || s.data().email || '' : ''; } catch (e) { memberCache[id] = ''; } }
        out[id] = { name: memberCache[id] };
      }
      return out;
    },
  };

  /* ---------- downloads: a normal browser download ---------- */
  const downloads = {
    save: async ({ filename, data }) => {
      const blob = data instanceof Blob ? data : new Blob([data], { type: /\.csv$/.test(filename) ? 'text/csv' : /\.json$/.test(filename) ? 'application/json' : /\.html?$/.test(filename) ? 'text/html' : 'application/octet-stream' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
      return { status: 'saved' };
    },
  };

  window.claude = { use: async name => { await session; return name === 'db' ? db : name === 'user' ? user : name === 'downloads' ? downloads : null; } };
  window.ADZ_FS = fs; window.ADZ_SESSION = S0;

  /* ---------- first-run records (written once, when the owner first signs in) ---------- */
  async function seed(u) {
    const has = await fs.doc('settings/company').get(); if (has.exists) return;
    const now = new Date().toISOString(); const today = now.slice(0, 10);
    const docs = {
      'settings/company': { id: 'company', companyName: 'Adzesua Connect Limited', tagline: 'Technology for Learning', address: 'Agona Swedru, Agona West Municipal, Central Region', cardPrefix: 'ADZ', cardPrice: 25, cardCost: 10, renewalFee: 0, replacementFee: 30, academicYear: '2026/27', invoiceDueDays: 14, wifiPackagePrice: 3 },
      'products/prod-card': { id: 'prod-card', name: 'Student smart card', category: 'card', price: 25, account: '4000', unitCost: 10, active: true, notes: 'Sold in Form 1. Price range GH₵20–25, maximum GH₵30.' },
      'products/prod-renewal': { id: 'prod-renewal', name: 'Exeat renewal (yearly)', category: 'renewal', price: 0, account: '4010', active: true, notes: 'Set the fee in Setup → Cards & pricing.' },
      'products/prod-replace': { id: 'prod-replace', name: 'Replacement card', category: 'replacement', price: 30, account: '4020', unitCost: 10, active: true },
      'products/prod-wifi1gb': { id: 'prod-wifi1gb', name: 'Wi-Fi data 1GB', category: 'wifi', price: 3, account: '4100', active: true, notes: 'Main campus package.' },
      'schools/swesco': { id: 'swesco', name: 'Swedru Secondary School', code: 'SWS', status: 'Pilot', services: ['Smart Card', 'Wi-Fi'], region: 'Central', district: 'Agona West Municipal', town: 'Agona Swedru', notes: 'Pilot school (SWESCO). Wi-Fi: campus student data sales over fibre broadband. Smart card: Side Spine design (design 10), student records from SSHMS.' },
      'staff/ebenezer': { id: 'ebenezer', name: u.displayName || 'Ebenezer', role: 'Managing Director', status: 'Active', employmentType: 'Shareholder / director', accessRole: 'Admin', annualLeaveDays: 15, userId: u.uid },
      'staff/sharon': { id: 'sharon', name: 'Sharon Fafali Aku', role: 'Business Development Director', status: 'Active', location: 'Agona Swedru', managerId: 'ebenezer', accessRole: 'BizDev', annualLeaveDays: 15, notes: 'Leads outreach and sales.' },
      'deals/swesco-card': { id: 'swesco-card', title: 'SWESCO smart card pilot', schoolId: 'swesco', product: 'Smart Card', stage: 'Pilot', ownerId: 'ebenezer', nextStep: 'Test card printing in SSHMS before going live' },
      'deals/swesco-wifi': { id: 'swesco-wifi', title: 'SWESCO campus Wi-Fi pilot', schoolId: 'swesco', product: 'Wi-Fi', stage: 'Pilot', ownerId: 'ebenezer' },
      'batches/swesco-pilot': { id: 'swesco-pilot', name: 'SWESCO pilot cards', schoolId: 'swesco', stage: 'Design approval', design: 'Side Spine (design 10)', unitPrice: 25, unitCost: 10, orderedOn: today, notes: '"SWEDRU SECONDARY SCHOOL" in bold on the spine. Test printing in SSHMS before going live.' },
      'items/nfc-cards': { id: 'nfc-cards', name: 'Blank NFC PVC cards', category: 'Card stock', unit: 'pcs', location: 'Store' },
      'items/lanyards': { id: 'lanyards', name: 'Lanyards', category: 'Card accessories', unit: 'pcs', location: 'Store' },
      'activities/print-test': { id: 'print-test', type: 'Task', subject: 'Test card printing in SSHMS before going live', schoolId: 'swesco', dealId: 'swesco-card', ownerId: 'ebenezer', due: today, done: false },
      'activities/renewal-fee': { id: 'renewal-fee', type: 'Task', subject: 'Decide the yearly exeat renewal fee and enter it in Setup', ownerId: 'ebenezer', due: today, done: false },
      'activities/duns': { id: 'duns', type: 'Task', subject: 'Follow up the D-U-N-S number request (Play Store organisation account)', ownerId: 'ebenezer', due: today, done: false },
      'projects/swesco-card-rollout': { id: 'swesco-card-rollout', name: 'SWESCO smart card pilot rollout', type: 'Smart card rollout', schoolId: 'swesco', ownerId: 'ebenezer', status: 'Planning', start: today, goal: 'Every pilot student at SWESCO holds a Side Spine card; gate taps are checked against exeats in SSHMS; card fees collected.', tasks: ['Agree scope and price with the head', 'Collect student data from SSHMS', 'Test card printing in SSHMS', 'Approve card design (Side Spine) with the school', 'Order blank cards and lanyards', 'Print cards', 'Encode chips and link UIDs', 'Install gate readers', 'Train housemasters and security', 'Distribute cards to students', 'Go live: exeats on cards', 'Collect card fees'].map((title, i) => ({ id: 't' + (i + 1), title, done: false })) },
    };
    const batch = fs.batch();
    Object.entries(docs).forEach(([p, d]) => batch.set(fs.doc(p), Object.assign({ createdAt: now, updatedAt: now, createdBy: u.uid }, d)));
    await batch.commit();
  }
})();
