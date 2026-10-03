// Business File: owners keep their licenses, insurance, written plans and crew
// safety training in one place; NBW staff review documents, request new ones
// and post updates. Data lives in Supabase (see supabase/schema.sql).
// Knowledge checks are graded on the server, so this file never sees the
// answer key, and only staff can mark a document current.
(function () {
  "use strict";

  const BUCKET = "client-files";
  const DUE_SOON_DAYS = 30;
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const FILE_TYPES = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };
  const PAGE_URL = location.origin + location.pathname;

  // ==========================================================================
  // HELPERS
  // ==========================================================================
  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function safeUrl(url) {
    try {
      const u = new URL(url, location.href);
      return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
    } catch (e) { return null; }
  }
  function plural(n, word) { return `${n} ${word}${n === 1 ? "" : "s"}`; }

  // Calendar dates in Nevada time, as YYYY-MM-DD (matches the server's nv_today)
  const nvDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
  function today() { return nvDate.format(new Date()); }
  function addMonths(dateStr, months) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const out = new Date(Date.UTC(y, m - 1 + months, d));
    // Clamp overflow (Jan 31 + 1 month) to the month's last day, like Postgres
    if (out.getUTCDate() !== d) out.setUTCDate(0);
    return out.toISOString().slice(0, 10);
  }
  function daysBetween(fromStr, toStr) {
    return Math.round((Date.parse(toStr + "T00:00:00Z") - Date.parse(fromStr + "T00:00:00Z")) / 86400000);
  }
  const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  function fmtDate(dateStr) {
    return dateStr ? shortDate.format(new Date(String(dateStr).slice(0, 10) + "T00:00:00Z")) : "";
  }
  function fmtSize(bytes) {
    const kb = Math.max(1, Math.round(bytes / 1024));
    return kb >= 1024 ? (kb / 1024).toFixed(1) + " MB" : kb + " KB";
  }
  function errText(error) {
    return (error && (error.message || error.error_description)) || "Something went wrong. Try again.";
  }
  function byNewest(a, b) { return String(b.created_at).localeCompare(String(a.created_at)); }

  // ==========================================================================
  // STATE
  // ==========================================================================
  const S = {
    session: null,
    authMode: "signin",   // signin | signup | reset | recovery
    authMsg: null,        // { kind: "ok" | "err", text }
    authEmail: "",        // kept so a failed attempt doesn't clear it
    loading: true,
    loadError: null,
    isStaff: false,
    business: null,       // owner's business
    businesses: [],       // staff: every client
    clientId: null,       // staff: client being viewed
    employees: [],
    courses: [],
    questions: {},        // course_id -> [{ position, prompt, options }]
    attestations: [],
    files: [],            // training files
    docTypes: [],
    documents: [],
    docFiles: [],
    updates: [],
    tab: "home",
    showArchived: false,
    sheet: null,
    pageMsg: null,
    draft: {}             // form values kept when a form shows an error
  };

  const cfg = window.HUB_CONFIG || {};
  const sb = cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey)
    : null;

  // ==========================================================================
  // DATA
  // ==========================================================================
  async function fetchAll(queries) {
    const keys = Object.keys(queries);
    const results = await Promise.all(keys.map(k => queries[k]));
    const failed = results.find(r => r.error);
    if (failed) throw failed.error;
    const out = {};
    keys.forEach((k, i) => { out[k] = results[i].data; });
    return out;
  }

  async function loadAll() {
    if (!S.session) {
      Object.assign(S, { loading: false, isStaff: false, business: null, businesses: [], employees: [], attestations: [], files: [], documents: [], docFiles: [], updates: [] });
      render();
      return;
    }
    S.loading = true;
    S.loadError = null;
    render();

    try {
      const staff = await sb.rpc("is_staff");
      if (staff.error) throw staff.error;
      S.isStaff = staff.data === true;

      const shared = {
        courses: sb.from("courses").select("*").order("sort"),
        docTypes: sb.from("document_types").select("*").order("sort"),
        employees: sb.from("employees").select("*").order("full_name"),
        attestations: sb.from("attestations").select("*").order("completed_on", { ascending: false }),
        documents: sb.from("documents").select("*").order("created_at", { ascending: false }),
        docFiles: sb.from("document_files").select("*").order("created_at", { ascending: false }),
        updates: sb.from("updates").select("*").order("created_at", { ascending: false })
      };

      if (S.isStaff) {
        const d = await fetchAll(Object.assign({ businesses: sb.from("businesses").select("*").order("name") }, shared));
        Object.assign(S, d);
      } else {
        const biz = await sb.from("businesses").select("*").maybeSingle();
        if (biz.error) throw biz.error;
        S.business = biz.data;
        if (S.business) {
          const d = await fetchAll(Object.assign({
            questions: sb.from("course_questions").select("*").order("position"),
            files: sb.from("training_files").select("*").order("created_at", { ascending: false })
          }, shared));
          const qs = d.questions;
          delete d.questions;
          Object.assign(S, d);
          S.questions = {};
          qs.forEach(q => { (S.questions[q.course_id] = S.questions[q.course_id] || []).push(q); });
        }
      }
    } catch (error) {
      S.loading = false;
      S.loadError = errText(error);
      return render();
    }
    S.loading = false;
    render();
  }

  async function reloadDocuments() {
    const d = await fetchAll({
      documents: sb.from("documents").select("*").order("created_at", { ascending: false }),
      docFiles: sb.from("document_files").select("*").order("created_at", { ascending: false })
    });
    Object.assign(S, d);
  }

  function activeEmployees(businessId) {
    return S.employees.filter(e => e.active && (!businessId || e.business_id === businessId));
  }
  function employeeName(id) {
    const e = S.employees.find(x => x.id === id);
    return e ? e.full_name : "Unknown";
  }
  function courseTitle(id) {
    const c = S.courses.find(x => x.id === id);
    return c ? c.title : id;
  }
  function docType(id) {
    return S.docTypes.find(t => t.id === id) || { id, title: id, icon: "doc" };
  }
  function docTitle(d) {
    const t = docType(d.type_id).title;
    return d.label ? `${t} · ${d.label}` : t;
  }

  // Training status is always derived from the latest attestation, never stored
  function standing(employeeId, course) {
    let last = null;
    for (const a of S.attestations) {
      if (a.employee_id === employeeId && a.course_id === course.id && (!last || a.completed_on > last)) last = a.completed_on;
    }
    if (!last) return { key: "none", last: null, due: null };
    const due = addMonths(last, course.renew_months);
    const left = daysBetween(today(), due);
    return { key: left < 0 ? "expired" : left <= DUE_SOON_DAYS ? "soon" : "valid", last, due };
  }

  // Document standing: what the owner sees, from status plus expiry
  function docState(d) {
    if (d.status === "requested") return { key: "action", text: d.note || "We don't have a copy yet. Requested by NBW." };
    if (d.status === "rejected") return { key: "action", text: d.note || "We couldn't accept the last copy. Please upload a new one." };
    if (d.status === "under_review") return { key: "review", text: "We're checking it. Nothing to do right now." };
    if (!d.expires_on) return { key: "current", text: "On file" };
    const n = daysBetween(today(), d.expires_on);
    if (n < 0) return { key: "action", text: `Expired ${fmtDate(d.expires_on)} · ${plural(-n, "day")} past due` };
    if (n <= DUE_SOON_DAYS) return { key: "soon", text: `Expires ${fmtDate(d.expires_on)} · ${plural(n, "day")} left` };
    return { key: "current", text: `Expires ${fmtDate(d.expires_on)}` };
  }
  const DOC_ORDER = { action: 0, soon: 1, review: 2, current: 3 };
  function sortedDocs(businessId) {
    return S.documents
      .filter(d => d.business_id === businessId)
      .map(d => ({ d, st: docState(d) }))
      .sort((a, b) => DOC_ORDER[a.st.key] - DOC_ORDER[b.st.key]
        || String(a.d.expires_on || "9999").localeCompare(String(b.d.expires_on || "9999"))
        || docTitle(a.d).localeCompare(docTitle(b.d)));
  }

  // Every active employee x course pair that isn't current, worst first
  function trainingGaps(businessId) {
    const list = [];
    const counts = { valid: 0, soon: 0, expired: 0, none: 0 };
    S.courses.forEach(c => activeEmployees(businessId).forEach(e => {
      const st = standing(e.id, c);
      counts[st.key]++;
      if (st.key !== "valid") list.push({ e, c, st });
    }));
    const order = { expired: 0, none: 1, soon: 2 };
    list.sort((x, y) => order[x.st.key] - order[y.st.key] || (x.st.due || "").localeCompare(y.st.due || "") || x.e.full_name.localeCompare(y.e.full_name));
    return { list, counts };
  }

  // Combined counts for a business: documents plus crew training items
  function summary(businessId) {
    const docs = sortedDocs(businessId);
    const t = trainingGaps(businessId);
    const c = { action: 0, soon: 0, review: 0, current: 0 };
    docs.forEach(x => { c[x.st.key]++; });
    const docAction = c.action;
    c.action += t.counts.expired + t.counts.none;
    c.soon += t.counts.soon;
    c.current += t.counts.valid;
    return { docs, training: t, counts: c, docAction };
  }

  // ==========================================================================
  // ICONS & SMALL PIECES
  // ==========================================================================
  const svg = body => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  const ICON = {
    alert: svg('<path d="M12 7v6"/><path d="M12 17h.01"/>'),
    clock: svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'),
    eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    people: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 4.5a3.5 3.5 0 010 7"/><path d="M18 14a6.5 6.5 0 013.5 6"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    flask: svg('<path d="M9 3h6"/><path d="M10 3v6l-5.5 9.5A1.7 1.7 0 006 21h12a1.7 1.7 0 001.5-2.5L14 9V3"/><path d="M7.5 15h9"/>'),
    doc: svg('<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/>'),
    id: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.6-1.4 1.7-2 3-2s2.4.6 3 2"/><path d="M14.5 10h4M14.5 14h3"/>'),
    shield: svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
    hardhat: svg('<path d="M3 17h18v2H3z"/><path d="M5 17v-3a7 7 0 0114 0v3"/><path d="M10 7.5V5h4v2.5"/>'),
    upload: svg('<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/>'),
    home: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>'),
    folder: svg('<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>'),
    badge: svg('<path d="M12 3l2.4 1.8 3 .1.9 2.9 2.4 1.8-.9 2.9.9 2.9-2.4 1.8-.9 2.9-3 .1L12 21l-2.4-1.8-3-.1-.9-2.9-2.4-1.8.9-2.9-.9-2.9 2.4-1.8.9-2.9 3-.1z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
    chat: svg('<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>')
  };
  const COURSE_ICON = { heat: ICON.sun, hazcom: ICON.flask };
  const STATE_COLOR = { action: "c-red", soon: "c-orange", review: "c-blue", current: "c-green" };

  const PILLS = {
    // documents
    action: ["pill-err", "Action needed"],
    soon: ["pill-warn", "Renew soon"],
    review: ["pill-info", "Under review"],
    current: ["pill-ok", "Current"],
    // training
    valid: ["pill-ok", "Current"],
    due: ["pill-warn", "Due soon"],
    expired: ["pill-err", "Overdue"],
    none: ["pill-err", "No record"]
  };
  function pill(key) {
    const [cls, text] = PILLS[key];
    return `<span class="pill ${cls}">${text}</span>`;
  }
  // Training "soon" shares its key with documents' "soon", but reads "Due soon"
  function trainingPill(key) { return pill(key === "soon" ? "due" : key); }

  function appbar(withSignOut) {
    return `
      <header class="appbar">
        <div class="appbar-in">
          <span class="row" style="gap: 10px;">
            <img src="assets/logo.jpg" alt="Nevada Business Watch" width="146" height="40">
            ${S.isStaff && S.session ? `<span class="staff-chip">Staff</span>` : ""}
          </span>
          ${withSignOut ? `<button class="btn-ghost" data-action="sign-out">Sign out</button>` : ""}
        </div>
      </header>`;
  }

  function tile(color, icon, n, label) {
    return `
      <div class="tile">
        <span class="dot-ico ${color}">${icon}</span>
        <strong>${n}</strong>
        <span class="label">${label}</span>
      </div>`;
  }

  function fileLinks(docId, kind) {
    const files = S.docFiles.filter(f => f.document_id === docId).sort(byNewest);
    if (!files.length) return "";
    return `
      <ul class="file-list">${files.map(f => `
        <li>
          <button class="btn-link" data-action="download-file" data-kind="${kind}" data-id="${esc(f.id)}">${esc(f.file_name)}</button>
          <span class="fine">${esc(fmtSize(f.size_bytes))} · ${esc(fmtDate(f.created_at))}</span>
        </li>`).join("")}
      </ul>`;
  }

  function updateItem(u) {
    return `
      <li class="update">
        <span class="avatar">${ICON.shield}</span>
        <div>
          <div class="fine" style="font-size: 0.88rem;">NBW Client Team · ${esc(fmtDate(u.created_at))}</div>
          <p class="update-body">${esc(u.body)}</p>
        </div>
      </li>`;
  }

  // ==========================================================================
  // VIEWS: signed out
  // ==========================================================================
  function viewNotConfigured() {
    return appbar(false) + `
      <div class="wrap"><div class="panel narrow">
        <h2>Hub not set up yet</h2>
        <p class="kicker">Add your Supabase project URL and anon key to <code>hub-config.js</code>. See the README for the steps.</p>
      </div></div>`;
  }

  function authMsgHtml() {
    if (!S.authMsg) return "";
    const cls = S.authMsg.kind === "ok" ? "msg-ok" : "msg-err";
    return `<div class="msg ${cls}" role="${S.authMsg.kind === "ok" ? "status" : "alert"}">${esc(S.authMsg.text)}</div>`;
  }

  function viewAuth() {
    const m = S.authMode;
    const titles = { signin: "Sign in", signup: "Create an account", reset: "Reset your password", recovery: "Choose a new password" };
    const email = m === "recovery" ? "" : `
      <label class="field">Email
        <input type="email" name="email" required autocomplete="email" value="${esc(S.authEmail)}">
      </label>`;
    const password = m === "reset" ? "" : `
      <label class="field">${m === "recovery" ? "New password" : "Password"}
        <input type="password" name="password" required minlength="8"
          autocomplete="${m === "signin" ? "current-password" : "new-password"}">
      </label>`;
    const submit = { signin: "Sign in", signup: "Create account", reset: "Send reset link", recovery: "Save password" }[m];

    const links = m === "recovery" ? "" : `
      <div class="row" style="justify-content: space-between;">
        ${m !== "signin" ? `<button type="button" class="btn-link" data-auth-mode="signin">Sign in instead</button>` : ""}
        ${m !== "signup" ? `<button type="button" class="btn-link" data-auth-mode="signup">Create an account</button>` : ""}
        ${m === "signin" ? `<button type="button" class="btn-link" data-auth-mode="reset">Forgot password?</button>` : ""}
      </div>`;

    return appbar(false) + `
      <div class="wrap"><div class="panel narrow">
        <h1 style="margin-bottom: 4px;">Your Business File</h1>
        <p class="kicker" style="margin-bottom: 16px;">Licenses, insurance and crew safety training, watched by NBW</p>
        <form id="authForm" class="stack">
          <h2>${titles[m]}</h2>
          ${authMsgHtml()}
          ${email}
          ${password}
          <button type="submit" class="btn btn-primary">${submit}</button>
          ${links}
        </form>
      </div></div>`;
  }

  function viewSetup() {
    return appbar(true) + `
      <div class="wrap"><div class="panel narrow">
        <h2>Set up your Business File</h2>
        <p class="kicker" style="margin-bottom: 16px;">One business per login.</p>
        <form id="setupForm" class="stack">
          ${S.pageMsg ? `<div class="msg msg-err" role="alert">${esc(S.pageMsg)}</div>` : ""}
          <label class="field">Business name
            <input type="text" name="name" required maxlength="120" autocomplete="organization">
          </label>
          <label class="field">Your first name
            <input type="text" name="contact_name" maxlength="60" autocomplete="given-name">
          </label>
          <button type="submit" class="btn btn-primary">Continue</button>
        </form>
      </div></div>`;
  }

  // ==========================================================================
  // VIEWS: owner
  // ==========================================================================
  function docItem({ d, st }, primary) {
    const t = docType(d.type_id);
    const canUpload = st.key !== "review";
    return `
      <li class="item">
        <span class="sq-ico ${STATE_COLOR[st.key]}">${ICON[t.icon] || ICON.doc}</span>
        <div class="item-body">
          <div class="item-title">${esc(docTitle(d))}</div>
          ${pill(st.key)}
          <div class="item-sub">${esc(st.text)}</div>
          ${fileLinks(d.id, "doc")}
          ${canUpload ? `<button class="btn ${primary ? "btn-primary" : ""}" data-action="upload-doc" data-id="${esc(d.id)}">${ICON.upload}${primary ? "Upload this first" : "Upload"}</button>` : ""}
        </div>
      </li>`;
  }

  function viewHome() {
    const biz = S.business;
    const { docs, training, counts } = summary(biz.id);
    const needDocs = docs.filter(x => x.st.key === "action" || x.st.key === "soon");
    const gapCount = training.list.length;
    const needCount = counts.action + counts.soon;
    const emps = activeEmployees(biz.id);

    let trainingItem = "";
    if (!emps.length) {
      trainingItem = `
        <li class="item">
          <span class="sq-ico c-navy">${ICON.people}</span>
          <div class="item-body">
            <div class="item-title">Crew safety training</div>
            <div class="item-sub">Add your crew to track heat and hazard training.</div>
            <button class="btn" data-tab="employees">Add your crew</button>
          </div>
        </li>`;
    } else if (gapCount) {
      const worst = training.counts.expired + training.counts.none ? "action" : "soon";
      trainingItem = `
        <li class="item">
          <span class="sq-ico ${STATE_COLOR[worst]}">${ICON.badge}</span>
          <div class="item-body">
            <div class="item-title">Crew safety training</div>
            ${pill(worst)}
            <div class="item-sub">${plural(gapCount, "knowledge check")} to do across ${plural(emps.length, "employee")}</div>
            <button class="btn ${needDocs.length ? "" : "btn-primary"}" data-tab="training">Open training</button>
          </div>
        </li>`;
    }

    const latest = S.updates.filter(u => u.business_id === biz.id).sort(byNewest)[0];
    const hello = biz.contact_name ? `Welcome back, ${esc(biz.contact_name)}` : "Welcome back";

    return `
      <h1>${hello}</h1>
      <p class="kicker">Business File for ${esc(biz.name)}</p>
      <p class="lede">${needCount ? `${plural(needCount, "item")} need${needCount === 1 ? "s" : ""} you. Everything else, we're watching.` : "Nothing needs you right now. We're watching the rest."}</p>
      <div class="tiles">
        ${tile("c-red", ICON.alert, counts.action, "Action needed")}
        ${tile("c-orange", ICON.clock, counts.soon, "Renew soon")}
        ${tile("c-blue", ICON.eye, counts.review, "Under review")}
        ${tile("c-green", ICON.check, counts.current, "Current")}
      </div>
      ${needDocs.length || trainingItem ? `
        <p class="section-label">What we need from you</p>
        <ul class="items needs">${needDocs.map((x, i) => docItem(x, i === 0)).join("")}${trainingItem}</ul>` : ""}
      <button class="btn btn-block btn-soft" data-action="upload-doc">Upload a different document</button>
      <div class="panel" style="margin-top: 16px;">
        <div class="doc-head">
          <h2>Latest from your NBW team</h2>
          <button class="btn-link" data-tab="updates">See all updates ›</button>
        </div>
        ${latest ? `<ul class="updates">${updateItem(latest)}</ul>` : `<p class="kicker">No updates yet. We'll post here when we check your documents.</p>`}
      </div>`;
  }

  function viewDocuments() {
    const docs = sortedDocs(S.business.id);
    return `
      <h1>Documents</h1>
      <p class="lede">Everything NBW keeps on file for you. Upload a new copy whenever one renews.</p>
      ${docs.length ? `<ul class="items docs">${docs.map(x => docItem(x, false)).join("")}</ul>`
        : `<div class="panel"><p class="kicker">No documents yet. Start with your licenses and insurance certificates.</p></div>`}
      <button class="btn btn-block btn-soft" style="margin-top: 16px;" data-action="upload-doc">Upload a different document</button>`;
  }

  function viewUpdates() {
    const list = S.updates.filter(u => u.business_id === S.business.id).sort(byNewest);
    return `
      <h1>Updates</h1>
      <p class="lede">Messages from your NBW team.</p>
      <div class="panel">
        ${list.length ? `<ul class="updates">${list.map(updateItem).join("")}</ul>` : `<p class="kicker">No updates yet.</p>`}
      </div>`;
  }

  function viewEmployees() {
    const mine = S.employees.filter(e => e.business_id === S.business.id);
    const list = mine.filter(e => S.showArchived || e.active);
    const archivedCount = mine.filter(e => !e.active).length;
    return `
      <h1>Your crew</h1>
      <p class="lede">Add everyone who needs safety training.</p>
      <div class="panel">
        <h2>Add an employee</h2>
        <form id="employeeForm" class="row" style="margin-top: 12px; align-items: flex-end;">
          <label class="field" style="flex: 2 1 200px;">Full name
            <input type="text" name="full_name" required maxlength="80" autocomplete="off" value="${esc(S.draft.full_name)}">
          </label>
          <label class="field" style="flex: 1 1 160px;">Job title (optional)
            <input type="text" name="job_title" maxlength="80" autocomplete="off" value="${esc(S.draft.job_title)}">
          </label>
          <button type="submit" class="btn btn-primary">Add</button>
        </form>
        ${S.pageMsg ? `<div class="msg msg-err" role="alert" style="margin-top: 12px;">${esc(S.pageMsg)}</div>` : ""}
      </div>
      <div class="panel">
        <h2>Crew list</h2>
        <p class="fine">Employees are archived, not deleted, so their training history stays on file.</p>
        ${list.length ? `
          <div class="table-wrap"><table>
            <thead><tr><th>Name</th><th>Job title</th><th>Status</th><th></th></tr></thead>
            <tbody>${list.map(e => `
              <tr>
                <td data-label="Name">${esc(e.full_name)}</td>
                <td data-label="Job title">${esc(e.job_title || "—")}</td>
                <td data-label="Status">${e.active ? `<span class="pill pill-ok">Active</span>` : `<span class="pill pill-muted">Archived</span>`}</td>
                <td><button class="btn btn-small" data-action="toggle-employee" data-id="${esc(e.id)}">${e.active ? "Archive" : "Restore"}</button></td>
              </tr>`).join("")}
            </tbody>
          </table></div>` : `<p class="kicker" style="margin-top: 12px;">No employees yet.</p>`}
        ${archivedCount ? `<p style="margin-top: 12px;"><button class="btn-link" data-action="toggle-archived">${S.showArchived ? "Hide" : "Show"} archived (${archivedCount})</button></p>` : ""}
      </div>`;
  }

  function viewTraining() {
    const emps = activeEmployees(S.business.id);
    const cards = S.courses.map(c => {
      const src = safeUrl(c.source_url);
      return `
        <div class="panel doc-card">
          <div class="doc-head" style="flex-wrap: nowrap; justify-content: flex-start;">
            <span class="sq-ico c-navy">${COURSE_ICON[c.id] || ICON.doc}</span>
            <div>
              <h3>${esc(c.title)}</h3>
              <div class="kicker">${esc(c.required_for)}${src ? ` · <a href="${esc(src)}" target="_blank" rel="noopener">${esc(c.source_label)}</a>` : ""} · renew every ${esc(c.renew_months)} months</div>
            </div>
          </div>
          ${c.jha_note ? `<div class="note"><strong>Job hazard analysis (JHA):</strong> ${esc(c.jha_note)}</div>` : ""}
          ${emps.length ? `
            <div class="table-wrap"><table>
              <thead><tr><th>Employee</th><th>Status</th><th>Last</th><th>Due</th><th></th></tr></thead>
              <tbody>${emps.map(e => {
                const st = standing(e.id, c);
                return `
                  <tr>
                    <td data-label="Employee">${esc(e.full_name)}</td>
                    <td data-label="Status">${trainingPill(st.key)}</td>
                    <td data-label="Last">${esc(fmtDate(st.last) || "—")}</td>
                    <td data-label="Due">${esc(fmtDate(st.due) || "—")}</td>
                    <td><button class="btn btn-small" data-action="launch-quiz" data-course="${esc(c.id)}" data-employee="${esc(e.id)}">Take check</button></td>
                  </tr>`;
              }).join("")}
              </tbody>
            </table></div>` : `<p class="kicker" style="margin-top: 8px;">Add employees to record checks.</p>`}
        </div>`;
    }).join("");

    return `
      <h1>Safety training</h1>
      <p class="lede">Hand the phone to the employee for their knowledge check. Keep a signed training record for each session as well.</p>
      ${cards}
      ${viewTrainingFiles(emps)}
      <button class="btn btn-block btn-soft" data-action="export-csv">Download training records (CSV)</button>`;
  }

  function viewTrainingFiles(emps) {
    return `
      <div class="panel">
        <h2>Training files</h2>
        <p class="kicker">Signed rosters and completion certificates. PDF, PNG or JPG, up to 10 MB.</p>
        <form id="uploadForm" class="stack" style="margin-top: 12px;">
          ${S.pageMsg ? `<div class="msg msg-err" role="alert">${esc(S.pageMsg)}</div>` : ""}
          <div class="row">
            <label class="field" style="flex: 1 1 200px;">Training
              <select name="course_id" required>
                ${S.courses.map(c => `<option value="${esc(c.id)}"${S.draft.course_id === c.id ? " selected" : ""}>${esc(c.title)}</option>`).join("")}
              </select>
            </label>
            <label class="field" style="flex: 1 1 200px;">Who it covers
              <select name="employee_id">
                <option value="">Whole crew (roster)</option>
                ${emps.map(e => `<option value="${esc(e.id)}"${S.draft.employee_id === e.id ? " selected" : ""}>${esc(e.full_name)}</option>`).join("")}
              </select>
            </label>
          </div>
          <input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg" required>
          <div><button type="submit" class="btn btn-primary">${ICON.upload}Upload</button></div>
        </form>
        ${S.files.length ? `
          <div class="table-wrap" style="margin-top: 16px;"><table>
            <thead><tr><th>File</th><th>Training</th><th>Covers</th><th>Added</th><th></th></tr></thead>
            <tbody>${S.files.map(f => `
              <tr>
                <td data-label="File">${esc(f.file_name)} <span class="fine">${esc(fmtSize(f.size_bytes))}</span></td>
                <td data-label="Training">${esc(courseTitle(f.course_id))}</td>
                <td data-label="Covers">${f.employee_id ? esc(employeeName(f.employee_id)) : "Whole crew"}</td>
                <td data-label="Added">${esc(fmtDate(f.created_at))}</td>
                <td class="row">
                  <button class="btn btn-small" data-action="download-file" data-kind="training" data-id="${esc(f.id)}">Download</button>
                  <button class="btn btn-small" data-action="delete-file" data-id="${esc(f.id)}">Delete</button>
                </td>
              </tr>`).join("")}
            </tbody>
          </table></div>` : `<p class="kicker" style="margin-top: 16px;">No training files yet.</p>`}
      </div>`;
  }

  // ==========================================================================
  // VIEWS: NBW staff
  // ==========================================================================
  function viewStaffClients() {
    const rows = S.businesses.map(b => ({ b, s: summary(b.id) }))
      .sort((x, y) => y.s.counts.review - x.s.counts.review || y.s.counts.action - x.s.counts.action || x.b.name.localeCompare(y.b.name));
    const waiting = rows.reduce((n, r) => n + r.s.counts.review, 0);
    return `
      <h1>Clients</h1>
      <p class="lede">${waiting ? `${plural(waiting, "document")} waiting for review.` : "Nothing waiting for review."}</p>
      ${rows.length ? `<ul class="items clients">${rows.map(({ b, s }) => `
        <li class="item">
          <span class="sq-ico c-navy">${ICON.folder}</span>
          <div class="item-body">
            <div class="item-title">${esc(b.name)}</div>
            <div class="item-sub">${esc(b.contact_name || "No contact name")} · ${plural(activeEmployees(b.id).length, "employee")}</div>
            <div class="row">
              ${s.counts.review ? `<span class="pill pill-info">${s.counts.review} to review</span>` : ""}
              ${s.counts.action ? `<span class="pill pill-err">${s.counts.action} action needed</span>` : ""}
              ${s.counts.soon ? `<span class="pill pill-warn">${s.counts.soon} renew soon</span>` : ""}
            </div>
            <button class="btn ${s.counts.review ? "btn-primary" : ""}" data-action="open-client" data-id="${esc(b.id)}">Open file</button>
          </div>
        </li>`).join("")}</ul>` : `<div class="panel"><p class="kicker">No clients yet.</p></div>`}`;
  }

  function viewStaffClient() {
    const b = S.businesses.find(x => x.id === S.clientId);
    if (!b) { S.clientId = null; return viewStaffClients(); }
    const { docs, training } = summary(b.id);
    const emps = activeEmployees(b.id);
    const updates = S.updates.filter(u => u.business_id === b.id).sort(byNewest);
    const statusLabels = { requested: "Requested", under_review: "Under review", current: "Current (checked)", rejected: "Can't accept" };

    const docCards = docs.map(({ d, st }) => `
      <div class="panel review-card" data-doc="${esc(d.id)}">
        <div class="doc-head" style="flex-wrap: nowrap; justify-content: flex-start;">
          <span class="sq-ico ${STATE_COLOR[st.key]}">${ICON[docType(d.type_id).icon] || ICON.doc}</span>
          <div class="item-body">
            <div class="item-title">${esc(docTitle(d))}</div>
            ${pill(st.key)}
            <div class="item-sub">Client sees: ${esc(st.text)}</div>
          </div>
        </div>
        ${fileLinks(d.id, "doc") || `<p class="fine" style="margin-top: 8px;">No files yet.</p>`}
        <form class="review-form stack" data-id="${esc(d.id)}" style="margin-top: 12px;">
          <div class="row">
            <label class="field" style="flex: 1 1 160px;">Status
              <select name="status">
                ${Object.keys(statusLabels).map(k => `<option value="${k}"${d.status === k ? " selected" : ""}>${statusLabels[k]}</option>`).join("")}
              </select>
            </label>
            <label class="field" style="flex: 1 1 160px;">Expires
              <input type="date" name="expires_on" value="${esc(d.expires_on || "")}">
            </label>
          </div>
          <label class="field">Note to client (shown for requested or rejected)
            <input type="text" name="note" maxlength="500" value="${esc(d.note || "")}">
          </label>
          <div><button type="submit" class="btn btn-primary">Save review</button></div>
        </form>
      </div>`).join("");

    return `
      <p><button class="btn-link" data-action="close-client">‹ All clients</button></p>
      <h1>${esc(b.name)}</h1>
      <p class="kicker">${esc(b.contact_name || "No contact name")} · ${plural(emps.length, "employee")} · ${plural(training.list.length, "training item")} open</p>
      ${S.pageMsg ? `<div class="msg msg-err" role="alert" style="margin-top: 12px;">${esc(S.pageMsg)}</div>` : ""}

      <p class="section-label">Documents</p>
      ${docCards || `<div class="panel"><p class="kicker">No documents yet.</p></div>`}

      <div class="panel">
        <h2>Request a document</h2>
        <form id="requestForm" class="stack" style="margin-top: 10px;">
          <div class="row">
            <label class="field" style="flex: 1 1 200px;">Document
              <select name="type_id" required>
                ${S.docTypes.map(t => `<option value="${esc(t.id)}">${esc(t.title)}</option>`).join("")}
              </select>
            </label>
            <label class="field" style="flex: 1 1 160px;">Detail (optional)
              <input type="text" name="label" maxlength="80" placeholder="C-15, North Las Vegas…">
            </label>
          </div>
          <label class="field">Note to client
            <input type="text" name="note" maxlength="500" value="We don't have a copy yet. Requested by NBW.">
          </label>
          <div><button type="submit" class="btn btn-primary">Send request</button></div>
        </form>
      </div>

      <div class="panel">
        <h2>Post an update</h2>
        <form id="updateForm" class="stack" style="margin-top: 10px;">
          <textarea name="body" required maxlength="2000" rows="3" placeholder="Got your North Las Vegas license. We're checking it against the city's records."></textarea>
          <div><button type="submit" class="btn btn-primary">Post update</button></div>
        </form>
        ${updates.length ? `<ul class="updates" style="margin-top: 16px;">${updates.map(updateItem).join("")}</ul>` : ""}
      </div>

      <div class="panel">
        <h2>Crew training</h2>
        ${S.courses.map(c => {
          const current = emps.filter(e => standing(e.id, c).key === "valid").length;
          return `<div class="course-row"><div class="doc-head"><strong>${esc(c.title)}</strong><span class="kicker">${current} of ${emps.length} current</span></div></div>`;
        }).join("")}
      </div>`;
  }

  // ==========================================================================
  // SHEETS (modals)
  // ==========================================================================
  function quizSheet(courseId, employeeId, error) {
    const course = S.courses.find(c => c.id === courseId);
    const qs = (S.questions[courseId] || []).slice().sort((a, b) => a.position - b.position);
    return {
      title: `${course ? course.title : courseId}: knowledge check`,
      content: `
        <form id="quizForm" class="stack" data-course="${esc(courseId)}" data-employee="${esc(employeeId)}">
          <p><strong>Employee:</strong> ${esc(employeeName(employeeId))}</p>
          <p class="fine">Answer every question correctly to record this check. It is a review, not a certification.</p>
          ${error ? `<div class="msg msg-err" role="alert">${esc(error)}</div>` : ""}
          ${qs.map((q, qi) => `
            <fieldset>
              <legend>${qi + 1}. ${esc(q.prompt)}</legend>
              ${(q.options || []).map((opt, oi) => `
                <label class="opt"><input type="radio" name="q${esc(q.position)}" value="${oi}" required> ${esc(opt)}</label>
              `).join("")}
            </fieldset>`).join("")}
          <div><button type="submit" class="btn btn-primary">Submit</button></div>
        </form>`
    };
  }

  function docUploadSheet(docId, error, draft) {
    const d = docId && S.documents.find(x => x.id === docId);
    const v = draft || {};
    return {
      title: d ? `Upload: ${docTitle(d)}` : "Upload a document",
      content: `
        <form id="docUploadForm" class="stack" data-id="${esc(docId || "")}">
          ${error ? `<div class="msg msg-err" role="alert">${esc(error)}</div>` : ""}
          ${d ? "" : `
            <label class="field">What is it?
              <select name="type_id" required>
                ${S.docTypes.map(t => `<option value="${esc(t.id)}"${v.type_id === t.id ? " selected" : ""}>${esc(t.title)}</option>`).join("")}
              </select>
            </label>
            <label class="field">Detail (optional)
              <input type="text" name="label" maxlength="80" placeholder="License class or city" value="${esc(v.label)}">
            </label>`}
          <label class="field">Expiration date, if it has one
            <input type="date" name="expires_on" value="${esc(v.expires_on)}">
          </label>
          <label class="field">File (PDF, PNG or JPG, up to 10 MB)
            <input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg" required>
          </label>
          <p class="fine">NBW checks every document before it counts as current.</p>
          <div><button type="submit" class="btn btn-primary">${ICON.upload}Send to NBW</button></div>
        </form>`
    };
  }

  function infoSheet(title, text) {
    return { title, content: `<div class="msg msg-ok" role="status">${esc(text)}</div>` };
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================
  let lastFocus = null;

  function sheetHtml() {
    return S.sheet ? `
      <div class="modal-overlay" data-action="overlay">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
          <div class="modal-header">
            <h3 id="sheetTitle">${esc(S.sheet.title)}</h3>
            <button class="btn" data-action="close-sheet" aria-label="Close">✕</button>
          </div>
          ${S.sheet.content}
        </div>
      </div>` : "";
  }

  function render() {
    const app = document.getElementById("app");

    if (!sb) { app.innerHTML = viewNotConfigured(); return; }
    document.body.classList.toggle("signed-out", !S.session || S.authMode === "recovery" || (!S.business && !S.isStaff));
    if (S.authMode === "recovery" || !S.session) { app.innerHTML = viewAuth(); return; }
    if (S.loading) { app.innerHTML = appbar(false) + `<div class="wrap"><p class="kicker">Loading…</p></div>`; return; }
    if (S.loadError) {
      app.innerHTML = appbar(true) + `
        <div class="wrap"><div class="panel narrow">
          <div class="msg msg-err" role="alert">${esc(S.loadError)}</div>
          <p class="row" style="margin-top: 12px;">
            <button class="btn btn-primary" data-action="reload">Try again</button>
          </p>
        </div></div>`;
      return;
    }

    if (S.isStaff) {
      app.innerHTML = appbar(true) + `<main class="wrap">${S.clientId ? viewStaffClient() : viewStaffClients()}</main>` + sheetHtml();
      return;
    }
    if (!S.business) { app.innerHTML = viewSetup(); return; }

    const views = { home: viewHome, documents: viewDocuments, training: viewTraining, employees: viewEmployees, updates: viewUpdates };
    const s = summary(S.business.id);
    const tabs = [
      ["home", "Home", ICON.home, 0],
      ["documents", "Documents", ICON.folder, s.docAction],
      ["training", "Training", ICON.badge, s.training.list.length],
      ["employees", "Crew", ICON.people, 0],
      ["updates", "Updates", ICON.chat, 0]
    ];

    app.innerHTML = appbar(true) + `
      <main class="wrap">${(views[S.tab] || viewHome)()}</main>
      <nav class="tabbar" aria-label="Sections"><div class="tabbar-in">
        ${tabs.map(([id, label, icon, n]) => `
          <button class="tab ${S.tab === id ? "active" : ""}" data-tab="${id}" ${S.tab === id ? 'aria-current="page"' : ""}>
            ${icon}<span>${label}</span>
            ${n ? `<span class="badge" aria-label="${n} need attention">${n > 99 ? "99+" : n}</span>` : ""}
          </button>`).join("")}
      </div></nav>
      ${sheetHtml()}`;

    if (S.sheet) {
      const target = app.querySelector(".modal input, .modal select, .modal [data-action='close-sheet']");
      if (target) target.focus();
    }
  }

  function openSheet(sheet) {
    if (!S.sheet) lastFocus = document.activeElement;
    S.sheet = sheet;
    render();
  }

  function closeSheet() {
    S.sheet = null;
    render();
    const d = lastFocus && lastFocus.dataset;
    if (d && d.action && d.course && d.employee) {
      const again = document.querySelector(`[data-action="${d.action}"][data-course="${CSS.escape(d.course)}"][data-employee="${CSS.escape(d.employee)}"]`);
      if (again) again.focus();
    }
  }

  // Disables a form's buttons while a request runs
  async function busy(form, fn) {
    const buttons = form ? form.querySelectorAll("button") : [];
    buttons.forEach(b => { b.disabled = true; });
    try { await fn(); } finally { buttons.forEach(b => { b.disabled = false; }); }
  }

  function checkFile(file) {
    if (!file || !file.name || !file.size) return "Choose a file first.";
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!FILE_TYPES[ext]) return "Use a PDF, PNG or JPG file.";
    if (file.size > MAX_FILE_BYTES) return "That file is over 10 MB.";
    return null;
  }
  function storagePath(folder, file) {
    const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-100);
    return `${S.business.id}/${folder}/${crypto.randomUUID()}/${safeName}`;
  }
  function contentType(file) {
    return FILE_TYPES[(file.name.split(".").pop() || "").toLowerCase()];
  }

  // ==========================================================================
  // ACTIONS: account
  // ==========================================================================
  async function submitAuth(form) {
    const data = new FormData(form);
    const email = String(data.get("email") || "").trim();
    if (email) S.authEmail = email;
    const password = String(data.get("password") || "");
    let res;

    if (S.authMode === "signin") {
      res = await sb.auth.signInWithPassword({ email, password });
      if (res.error) S.authMsg = { kind: "err", text: errText(res.error) };
    } else if (S.authMode === "signup") {
      res = await sb.auth.signUp({ email, password, options: { emailRedirectTo: PAGE_URL } });
      if (res.error) S.authMsg = { kind: "err", text: errText(res.error) };
      else if (!res.data.session) {
        S.authMode = "signin";
        S.authMsg = { kind: "ok", text: "Check your email for a confirmation link, then sign in." };
      }
    } else if (S.authMode === "reset") {
      res = await sb.auth.resetPasswordForEmail(email, { redirectTo: PAGE_URL });
      S.authMsg = res.error
        ? { kind: "err", text: errText(res.error) }
        : { kind: "ok", text: "If that email has an account, a reset link is on its way." };
    } else if (S.authMode === "recovery") {
      res = await sb.auth.updateUser({ password });
      if (res.error) S.authMsg = { kind: "err", text: errText(res.error) };
      else { S.authMode = "signin"; S.authMsg = null; return loadAll(); }
    }
    render();
  }

  async function createBusiness(form) {
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const contact_name = String(data.get("contact_name") || "").trim() || null;
    const { error } = await sb.from("businesses").insert({ name, contact_name });
    S.pageMsg = error ? errText(error) : null;
    if (error) return render();
    await loadAll();
  }

  // ==========================================================================
  // ACTIONS: owner
  // ==========================================================================
  async function addEmployee(form) {
    const data = new FormData(form);
    const full_name = String(data.get("full_name") || "").trim();
    const job_title = String(data.get("job_title") || "").trim() || null;
    if (!full_name) return;
    const { data: row, error } = await sb.from("employees")
      .insert({ business_id: S.business.id, full_name, job_title }).select().single();
    S.pageMsg = error ? errText(error) : null;
    S.draft = error ? { full_name, job_title } : {};
    if (!error) {
      S.employees.push(row);
      S.employees.sort((a, b) => a.full_name.localeCompare(b.full_name));
    }
    render();
    const input = document.querySelector("#employeeForm input[name=full_name]");
    if (input && !error) input.focus();
  }

  async function toggleEmployee(id) {
    const emp = S.employees.find(e => e.id === id);
    if (!emp) return;
    const { error } = await sb.from("employees").update({ active: !emp.active }).eq("id", id);
    S.pageMsg = error ? errText(error) : null;
    if (!error) emp.active = !emp.active;
    render();
  }

  async function submitQuiz(form) {
    const courseId = form.dataset.course;
    const employeeId = form.dataset.employee;
    const data = new FormData(form);
    const qs = (S.questions[courseId] || []).slice().sort((a, b) => a.position - b.position);
    const answers = qs.map(q => Number(data.get("q" + q.position)));

    const { data: result, error } = await sb.rpc("submit_check", {
      p_employee_id: employeeId, p_course_id: courseId, p_answers: answers
    });
    if (error) return openSheet(quizSheet(courseId, employeeId, errText(error)));
    if (!result.passed) {
      const n = result.wrong;
      return openSheet(quizSheet(courseId, employeeId,
        `${n} answer${n > 1 ? "s are" : " is"} not right. Review the material and try again.`));
    }

    S.attestations.unshift({ employee_id: employeeId, course_id: courseId, completed_on: result.completed_on });
    openSheet(infoSheet("Check recorded",
      `${employeeName(employeeId)} passed the ${courseTitle(courseId)} knowledge check on ${fmtDate(result.completed_on)}. Due again ${fmtDate(result.due_on)}. Keep a signed training record as well.`));
  }

  async function uploadTrainingFile(form) {
    const data = new FormData(form);
    const file = data.get("file");
    const course_id = String(data.get("course_id") || "");
    const employee_id = String(data.get("employee_id") || "") || null;
    const fail = text => { S.pageMsg = text; S.draft = { course_id, employee_id }; render(); };

    const bad = checkFile(file);
    if (bad) return fail(bad);
    const path = storagePath("training", file);

    const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: contentType(file), upsert: false });
    if (up.error) return fail(errText(up.error));

    const { data: row, error } = await sb.from("training_files").insert({
      business_id: S.business.id, employee_id, course_id,
      storage_path: path, file_name: file.name.slice(0, 200), size_bytes: file.size
    }).select().single();
    if (error) {
      await sb.storage.from(BUCKET).remove([path]);
      return fail(errText(error));
    }

    S.files.unshift(row);
    S.pageMsg = null;
    S.draft = {};
    render();
  }

  async function uploadDocument(form) {
    const docId = form.dataset.id || null;
    const data = new FormData(form);
    const file = data.get("file");
    const draft = {
      type_id: String(data.get("type_id") || ""),
      label: String(data.get("label") || "").trim(),
      expires_on: String(data.get("expires_on") || "")
    };
    const fail = text => openSheet(docUploadSheet(docId, text, draft));

    const bad = checkFile(file);
    if (bad) return fail(bad);
    const path = storagePath("docs", file);

    const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: contentType(file), upsert: false });
    if (up.error) return fail(errText(up.error));

    const { error } = await sb.rpc("submit_document", {
      p_document_id: docId,
      p_type_id: docId ? null : draft.type_id,
      p_label: docId ? null : draft.label,
      p_expires_on: draft.expires_on || null,
      p_storage_path: path,
      p_file_name: file.name.slice(0, 200),
      p_size_bytes: file.size
    });
    if (error) return fail(errText(error));

    await reloadDocuments();
    openSheet(infoSheet("Sent to NBW", `We got ${file.name}. We'll check it and update your file. It shows as under review until then.`));
  }

  async function downloadFile(kind, id) {
    const list = kind === "doc" ? S.docFiles : S.files;
    const f = list.find(x => x.id === id);
    if (!f) return;
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(f.storage_path, 60, { download: f.file_name });
    const url = !error && data && safeUrl(data.signedUrl);
    if (!url) { S.pageMsg = errText(error); return render(); }
    location.href = url;
  }

  async function deleteTrainingFile(id) {
    const f = S.files.find(x => x.id === id);
    if (!f || !confirm(`Delete ${f.file_name}? This can't be undone.`)) return;
    const st = await sb.storage.from(BUCKET).remove([f.storage_path]);
    if (st.error) { S.pageMsg = errText(st.error); return render(); }
    const { error } = await sb.from("training_files").delete().eq("id", id);
    S.pageMsg = error ? errText(error) : null;
    if (!error) S.files = S.files.filter(x => x.id !== id);
    render();
  }

  function exportCsv() {
    // Prefix cells that spreadsheets would run as formulas
    const cell = v => {
      let s = String(v == null ? "" : v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const labels = { valid: "Current", soon: "Due soon", expired: "Overdue", none: "No record" };
    const rows = [["Employee", "Job title", "Employee status", "Training", "Last completed", "Due again", "Standing"]];
    S.employees.forEach(e => S.courses.forEach(c => {
      const st = standing(e.id, c);
      rows.push([e.full_name, e.job_title || "", e.active ? "Active" : "Archived", c.title, st.last || "", st.due || "", labels[st.key]]);
    }));
    const csv = rows.map(r => r.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `training-records-${today()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ==========================================================================
  // ACTIONS: NBW staff
  // ==========================================================================
  async function saveReview(form) {
    const id = form.dataset.id;
    const data = new FormData(form);
    const changes = {
      status: String(data.get("status")),
      expires_on: String(data.get("expires_on") || "") || null,
      note: String(data.get("note") || "").trim() || null
    };
    const { error } = await sb.from("documents").update(changes).eq("id", id);
    S.pageMsg = error ? errText(error) : null;
    if (!error) Object.assign(S.documents.find(d => d.id === id) || {}, changes);
    render();
  }

  async function requestDocument(form) {
    const data = new FormData(form);
    const { data: row, error } = await sb.from("documents").insert({
      business_id: S.clientId,
      type_id: String(data.get("type_id")),
      label: String(data.get("label") || "").trim() || null,
      status: "requested",
      note: String(data.get("note") || "").trim() || null
    }).select().single();
    S.pageMsg = error ? errText(error) : null;
    if (!error) S.documents.unshift(row);
    render();
  }

  async function postUpdate(form) {
    const body = String(new FormData(form).get("body") || "").trim();
    if (!body) return;
    const { data: row, error } = await sb.from("updates").insert({ business_id: S.clientId, body }).select().single();
    S.pageMsg = error ? errText(error) : null;
    if (!error) S.updates.unshift(row);
    render();
  }

  // ==========================================================================
  // EVENTS
  // ==========================================================================
  document.addEventListener("click", e => {
    const tabBtn = e.target.closest("[data-tab]");
    if (tabBtn) {
      S.tab = tabBtn.dataset.tab;
      S.pageMsg = null;
      S.draft = {};
      render();
      scrollTo(0, 0);
      return;
    }

    const modeBtn = e.target.closest("[data-auth-mode]");
    if (modeBtn) {
      S.authMode = modeBtn.dataset.authMode;
      S.authMsg = null;
      render();
      return;
    }

    if (e.target.closest("[data-action='close-sheet']") || e.target.matches("[data-action='overlay']")) {
      closeSheet();
      return;
    }

    const act = e.target.closest("[data-action]");
    if (!act) return;
    const id = act.dataset.id;
    switch (act.dataset.action) {
      case "sign-out": sb.auth.signOut(); break;
      case "reload": loadAll(); break;
      case "toggle-archived": S.showArchived = !S.showArchived; render(); break;
      case "toggle-employee": toggleEmployee(id); break;
      case "launch-quiz": openSheet(quizSheet(act.dataset.course, act.dataset.employee)); break;
      case "upload-doc": openSheet(docUploadSheet(id || null)); break;
      case "download-file": downloadFile(act.dataset.kind, id); break;
      case "delete-file": deleteTrainingFile(id); break;
      case "export-csv": exportCsv(); break;
      case "open-client": S.clientId = id; S.pageMsg = null; render(); scrollTo(0, 0); break;
      case "close-client": S.clientId = null; S.pageMsg = null; render(); break;
    }
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && S.sheet) closeSheet();
  });

  const FORMS = {
    authForm: submitAuth,
    setupForm: createBusiness,
    employeeForm: addEmployee,
    quizForm: submitQuiz,
    uploadForm: uploadTrainingFile,
    docUploadForm: uploadDocument,
    requestForm: requestDocument,
    updateForm: postUpdate
  };
  document.addEventListener("submit", e => {
    const form = e.target;
    const handler = FORMS[form.id] || (form.classList.contains("review-form") ? saveReview : null);
    if (!handler) return;
    e.preventDefault();
    busy(form, () => handler(form)).catch(err => {
      S.pageMsg = errText(err);
      S.authMsg = { kind: "err", text: errText(err) };
      render();
    });
  });

  // ==========================================================================
  // START
  // ==========================================================================
  if (!sb) { render(); return; }

  sb.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") { S.authMode = "recovery"; S.authMsg = null; }
    const userChanged = (session && session.user.id) !== (S.session && S.session.user.id);
    S.session = session;
    if (userChanged) {
      Object.assign(S, { tab: "home", sheet: null, pageMsg: null, clientId: null, isStaff: false });
      if (session) S.authMsg = null;
    }
    // Token refreshes for the same user must not re-render, or forms in
    // progress would be wiped. Defer: Supabase calls made inside this
    // callback can deadlock.
    if (userChanged || S.loading) setTimeout(loadAll, 0);
    else if (event === "PASSWORD_RECOVERY") render();
  });
})();
