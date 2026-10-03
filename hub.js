// Compliance Hub: business owners track employee safety training.
// Data lives in Supabase (see supabase/schema.sql); knowledge checks are graded
// on the server, so this file never sees the answer key.
(function () {
  "use strict";

  const BUCKET = "training-files";
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
    return dateStr ? shortDate.format(new Date(dateStr + "T00:00:00Z")) : "";
  }
  function fmtSize(bytes) {
    const kb = Math.max(1, Math.round(bytes / 1024));
    return kb >= 1024 ? (kb / 1024).toFixed(1) + " MB" : kb + " KB";
  }
  function errText(error) {
    return (error && (error.message || error.error_description)) || "Something went wrong. Try again.";
  }

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
    business: null,
    employees: [],
    courses: [],
    questions: {},        // course_id -> [{ position, prompt, options }]
    attestations: [],
    files: [],
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
  async function loadAll() {
    if (!S.session) {
      Object.assign(S, { loading: false, business: null, employees: [], attestations: [], files: [] });
      render();
      return;
    }
    S.loading = true;
    S.loadError = null;
    render();

    const biz = await sb.from("businesses").select("*").maybeSingle();
    if (biz.error) return loadFailed(biz.error);
    S.business = biz.data;

    if (S.business) {
      const [emp, crs, qs, att, fil] = await Promise.all([
        sb.from("employees").select("*").order("full_name"),
        sb.from("courses").select("*").order("sort"),
        sb.from("course_questions").select("*").order("position"),
        sb.from("attestations").select("*").order("completed_on", { ascending: false }),
        sb.from("training_files").select("*").order("created_at", { ascending: false })
      ]);
      const failed = [emp, crs, qs, att, fil].find(r => r.error);
      if (failed) return loadFailed(failed.error);
      S.employees = emp.data;
      S.courses = crs.data;
      S.attestations = att.data;
      S.files = fil.data;
      S.questions = {};
      qs.data.forEach(q => { (S.questions[q.course_id] = S.questions[q.course_id] || []).push(q); });
    }
    S.loading = false;
    render();
  }

  function loadFailed(error) {
    S.loading = false;
    S.loadError = errText(error);
    render();
  }

  function activeEmployees() { return S.employees.filter(e => e.active); }
  function employeeName(id) {
    const e = S.employees.find(x => x.id === id);
    return e ? e.full_name : "Unknown";
  }
  function courseTitle(id) {
    const c = S.courses.find(x => x.id === id);
    return c ? c.title : id;
  }

  // Status is always derived from the latest attestation, never stored
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

  const svg = body => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  const ICON = {
    alert: svg('<path d="M12 7v6"/><path d="M12 17h.01"/>'),
    clock: svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'),
    people: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 4.5a3.5 3.5 0 010 7"/><path d="M18 14a6.5 6.5 0 013.5 6"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    flask: svg('<path d="M9 3h6"/><path d="M10 3v6l-5.5 9.5A1.7 1.7 0 006 21h12a1.7 1.7 0 001.5-2.5L14 9V3"/><path d="M7.5 15h9"/>'),
    doc: svg('<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/>'),
    home: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>'),
    badge: svg('<path d="M12 3l2.4 1.8 3 .1.9 2.9 2.4 1.8-.9 2.9.9 2.9-2.4 1.8-.9 2.9-3 .1L12 21l-2.4-1.8-3-.1-.9-2.9-2.4-1.8.9-2.9-.9-2.9 2.4-1.8.9-2.9 3-.1z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
    folder: svg('<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>')
  };
  const COURSE_ICON = { heat: ICON.sun, hazcom: ICON.flask };

  function appbar(withSignOut) {
    return `
      <header class="appbar">
        <div class="appbar-in">
          <img src="assets/logo.jpg" alt="Nevada Business Watch" width="146" height="40">
          ${withSignOut ? `<button class="btn-ghost" data-action="sign-out">Sign out</button>` : ""}
        </div>
      </header>`;
  }

  const PILLS = {
    valid: ["pill-ok", "Current"],
    soon: ["pill-warn", "Due soon"],
    expired: ["pill-err", "Overdue"],
    none: ["pill-err", "No record"]
  };
  function pill(key) {
    const [cls, text] = PILLS[key];
    return `<span class="pill ${cls}">${text}</span>`;
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
        <p class="kicker" style="margin-bottom: 16px;">Safety training records for your crew</p>
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
        <h2>Set up your business</h2>
        <p class="kicker" style="margin-bottom: 16px;">One business per login. You can add employees next.</p>
        <form id="setupForm" class="stack">
          ${S.pageMsg ? `<div class="msg msg-err" role="alert">${esc(S.pageMsg)}</div>` : ""}
          <label class="field">Business name
            <input type="text" name="name" required maxlength="120" autocomplete="organization">
          </label>
          <button type="submit" class="btn btn-primary">Continue</button>
        </form>
      </div></div>`;
  }

  // ==========================================================================
  // VIEWS: signed in
  // ==========================================================================
  // Every active employee x course pair that isn't current, worst first
  function gaps() {
    const out = [];
    const counts = { valid: 0, soon: 0, expired: 0, none: 0 };
    S.courses.forEach(c => activeEmployees().forEach(e => {
      const st = standing(e.id, c);
      counts[st.key]++;
      if (st.key !== "valid") out.push({ e, c, st });
    }));
    const order = { expired: 0, none: 1, soon: 2 };
    out.sort((x, y) => order[x.st.key] - order[y.st.key] || (x.st.due || "").localeCompare(y.st.due || "") || x.e.full_name.localeCompare(y.e.full_name));
    return { list: out, counts };
  }

  function gapDetail(st) {
    const t = today();
    if (st.key === "none") return "No knowledge check on file yet";
    const n = Math.abs(daysBetween(t, st.due));
    if (st.key === "expired") return `Expired ${fmtDate(st.due)} · ${n} day${n === 1 ? "" : "s"} past due`;
    return `Due ${fmtDate(st.due)} · ${n} day${n === 1 ? "" : "s"} left`;
  }

  function viewHome() {
    const emps = activeEmployees();
    const welcome = `
      <h1>${esc(S.business.name)}</h1>
      <p class="kicker">Business File · ${esc(S.session.user.email || "")}</p>`;

    if (!emps.length) {
      return welcome + `
        <p class="lede">Add your crew to start tracking their safety training.</p>
        <div class="panel">
          <h2>Get started</h2>
          <p class="kicker">Add your employees first. Then record their knowledge checks and training files.</p>
          <p style="margin-top: 14px;"><button class="btn btn-primary" data-tab="employees">Add employees</button></p>
        </div>`;
    }

    const { list, counts } = gaps();
    const need = counts.expired + counts.none;
    const total = list.length;
    const tile = (color, icon, n, label) => `
      <div class="tile">
        <span class="dot-ico ${color}">${icon}</span>
        <strong>${n}</strong>
        <span class="label">${label}</span>
      </div>`;
    const color = { expired: "c-red", none: "c-red", soon: "c-orange" };

    const items = list.map(({ e, c, st }, i) => `
      <li class="item">
        <span class="sq-ico ${color[st.key]}">${COURSE_ICON[c.id] || ICON.doc}</span>
        <div class="item-body">
          <div class="item-title">${esc(e.full_name)} · ${esc(c.title)}</div>
          ${pill(st.key)}
          <div class="item-sub">${esc(gapDetail(st))}</div>
          <button class="btn ${i === 0 ? "btn-primary" : ""}" data-action="launch-quiz" data-course="${esc(c.id)}" data-employee="${esc(e.id)}">${i === 0 ? "Do this first" : "Take check"}</button>
        </div>
      </li>`).join("");

    const courses = S.courses.map(c => {
      const current = emps.filter(e => standing(e.id, c).key === "valid").length;
      return `
        <div class="course-row">
          <div class="doc-head">
            <strong>${esc(c.title)}</strong>
            <span class="course-count kicker">${current} of ${emps.length} current</span>
          </div>
          <div class="progress" role="img" aria-label="${current} of ${emps.length} current"><span style="width: ${Math.round(100 * current / emps.length)}%"></span></div>
        </div>`;
    }).join("");

    return welcome + `
      <p class="lede">${total ? `${total} item${total === 1 ? "" : "s"} need${total === 1 ? "s" : ""} you. Everything else is current.` : "Everyone is current. Nice work."}</p>
      <div class="tiles">
        ${tile("c-red", ICON.alert, need, "Action needed")}
        ${tile("c-orange", ICON.clock, counts.soon, "Renew soon")}
        ${tile("c-blue", ICON.people, emps.length, "Employees")}
        ${tile("c-green", ICON.check, counts.valid, "Current")}
      </div>
      ${total ? `<p class="section-label">What needs you</p><ul class="items needs">${items}</ul>` : ""}
      <p class="section-label">By training</p>
      <div class="panel">${courses}</div>
      <button class="btn btn-block" data-action="export-csv">Download records (CSV)</button>`;
  }

  function viewEmployees() {
    const list = S.employees.filter(e => S.showArchived || e.active);
    const archivedCount = S.employees.length - activeEmployees().length;
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
    const emps = activeEmployees();
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
                    <td data-label="Status">${pill(st.key)}</td>
                    <td data-label="Last">${esc(st.last || "—")}</td>
                    <td data-label="Due">${esc(st.due || "—")}</td>
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
      ${cards}`;
  }

  function viewFiles() {
    const emps = activeEmployees();
    return `
      <h1>Training files</h1>
      <p class="lede">Signed rosters and completion certificates. PDF, PNG or JPG, up to 10 MB. Only you can open them.</p>
      <div class="panel">
        <h2>Upload a file</h2>
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
          <div><button type="submit" class="btn btn-primary">Upload</button></div>
        </form>
        ${S.files.length ? `
          <div class="table-wrap" style="margin-top: 16px;"><table>
            <thead><tr><th>File</th><th>Training</th><th>Covers</th><th>Added</th><th></th></tr></thead>
            <tbody>${S.files.map(f => `
              <tr>
                <td data-label="File">${esc(f.file_name)} <span class="fine">${esc(fmtSize(f.size_bytes))}</span></td>
                <td data-label="Training">${esc(courseTitle(f.course_id))}</td>
                <td data-label="Covers">${f.employee_id ? esc(employeeName(f.employee_id)) : "Whole crew"}</td>
                <td data-label="Added">${esc(String(f.created_at).slice(0, 10))}</td>
                <td class="row">
                  <button class="btn btn-small" data-action="download-file" data-id="${esc(f.id)}">Download</button>
                  <button class="btn btn-small" data-action="delete-file" data-id="${esc(f.id)}">Delete</button>
                </td>
              </tr>`).join("")}
            </tbody>
          </table></div>` : `<p class="kicker" style="margin-top: 16px;">No files yet.</p>`}
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

  function infoSheet(title, text) {
    return { title, content: `<div class="msg msg-ok" role="status">${esc(text)}</div>` };
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================
  let lastFocus = null;

  function render() {
    const app = document.getElementById("app");

    if (!sb) { app.innerHTML = viewNotConfigured(); return; }
    if (S.authMode === "recovery" || !S.session) { app.innerHTML = viewAuth(); return; }
    document.body.classList.toggle("signed-out", !S.session || S.authMode === "recovery" || !S.business);
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
    if (!S.business) { app.innerHTML = viewSetup(); return; }

    const views = { home: viewHome, employees: viewEmployees, training: viewTraining, files: viewFiles };
    const need = gaps().list.length;
    const tabs = [["home", "Home", ICON.home, 0], ["employees", "Crew", ICON.people, 0], ["training", "Training", ICON.badge, need], ["files", "Files", ICON.folder, 0]];

    app.innerHTML = appbar(true) + `
      <main class="wrap">${(views[S.tab] || viewHome)()}</main>
      <nav class="tabbar" aria-label="Sections"><div class="tabbar-in">
        ${tabs.map(([id, label, icon, n]) => `
          <button class="tab ${S.tab === id ? "active" : ""}" data-tab="${id}" ${S.tab === id ? 'aria-current="page"' : ""}>
            ${icon}<span>${label}</span>
            ${n ? `<span class="badge" aria-label="${n} need attention">${n > 99 ? "99+" : n}</span>` : ""}
          </button>`).join("")}
      </div></nav>
      ${S.sheet ? `
        <div class="modal-overlay" data-action="overlay">
          <div class="modal" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
            <div class="modal-header">
              <h3 id="sheetTitle">${esc(S.sheet.title)}</h3>
              <button class="btn" data-action="close-sheet" aria-label="Close">✕</button>
            </div>
            ${S.sheet.content}
          </div>
        </div>` : ""}
    `;

    if (S.sheet) {
      const target = app.querySelector(".modal input, .modal [data-action='close-sheet']");
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

  // ==========================================================================
  // ACTIONS
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
    const name = String(new FormData(form).get("name") || "").trim();
    const { error } = await sb.from("businesses").insert({ name });
    S.pageMsg = error ? errText(error) : null;
    if (error) return render();
    await loadAll();
  }

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
      `${employeeName(employeeId)} passed the ${courseTitle(courseId)} knowledge check on ${result.completed_on}. Due again ${result.due_on}. Keep a signed training record as well.`));
  }

  async function uploadFile(form) {
    const data = new FormData(form);
    const file = data.get("file");
    const course_id = String(data.get("course_id") || "");
    const employee_id = String(data.get("employee_id") || "") || null;
    const fail = text => { S.pageMsg = text; S.draft = { course_id, employee_id }; render(); };

    if (!file || !file.name || !file.size) return fail("Choose a file first.");
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!FILE_TYPES[ext]) return fail("Use a PDF, PNG or JPG file.");
    if (file.size > MAX_FILE_BYTES) return fail("That file is over 10 MB.");

    const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-100);
    const path = `${S.business.id}/${crypto.randomUUID()}/${safeName}`;

    const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: FILE_TYPES[ext], upsert: false });
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

  async function downloadFile(id) {
    const f = S.files.find(x => x.id === id);
    if (!f) return;
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(f.storage_path, 60, { download: f.file_name });
    const url = !error && data && safeUrl(data.signedUrl);
    if (!url) { S.pageMsg = errText(error); return render(); }
    location.href = url;
  }

  async function deleteFile(id) {
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
  // EVENTS
  // ==========================================================================
  document.addEventListener("click", e => {
    const tabBtn = e.target.closest("[data-tab]");
    if (tabBtn) {
      S.tab = tabBtn.dataset.tab;
      S.pageMsg = null;
      S.draft = {};
      render();
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
      case "download-file": downloadFile(id); break;
      case "delete-file": deleteFile(id); break;
      case "export-csv": exportCsv(); break;
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
    uploadForm: uploadFile
  };
  document.addEventListener("submit", e => {
    const handler = FORMS[e.target.id];
    if (!handler) return;
    e.preventDefault();
    busy(e.target, () => handler(e.target)).catch(err => {
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
      S.tab = "home";
      S.sheet = null;
      S.pageMsg = null;
      if (session) S.authMsg = null;
    }
    // Token refreshes for the same user must not re-render, or forms in
    // progress would be wiped. Defer: Supabase calls made inside this
    // callback can deadlock.
    if (userChanged || S.loading) setTimeout(loadAll, 0);
    else if (event === "PASSWORD_RECOVERY") render();
  });
})();
