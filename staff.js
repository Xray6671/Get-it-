// NBW staff page for My Business File: review uploads, request documents,
// post updates, confirm orders, add clients and give people access.
// Everything here is also enforced by the database: a signed-in client who
// opens this page sees "staff only" and can't read anyone else's data.
(function () {
  "use strict";

  const CFG = window.NBW_CONFIG || {};
  const sb = CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase
    ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey) : null;
  const DAY = 864e5;
  const PAGE_URL = location.origin + location.pathname;
  const CATS = { license: "License", insurance: "Insurance", wc: "Workers' comp", registration: "Registration", safety: "Safety & Heat", other: "Other" };
  const ORDER = { requested: "Requested", confirmed: "Confirmed", in_progress: "In progress", delivered: "Delivered", cancelled: "Cancelled" };

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const fmt = s => s ? new Date(String(s).slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
  const money = c => c == null ? "Quote" : "$" + (c / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const errText = e => (e && e.message) || "Something went wrong. Try again.";

  const S = {
    session: null, staff: null, loading: true, error: null, step: "email", email: "", msg: "",
    clients: [], users: [], docs: [], events: [], updates: [], orders: [], packages: [],
    open: null, note: null
  };

  // Same rules as the client app: requested or no date or expired = action
  // needed, 60 days or less = renew soon
  function docState(d) {
    if (d.in_review) return "review";
    if (d.requested || !d.expires_on) return "need";
    const left = Math.round((new Date(d.expires_on + "T00:00:00") - today()) / DAY);
    return left < 0 ? "need" : left <= 60 ? "soon" : "ok";
  }
  const PILL = { review: ["p-review", "Under review"], need: ["p-need", "Action needed"], soon: ["p-soon", "Renew soon"], ok: ["p-ok", "Current"] };
  const pill = k => `<span class="pill ${PILL[k][0]}">${PILL[k][1]}</span>`;
  const pkgTitle = id => (S.packages.find(p => p.id === id) || { title: id }).title;

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------
  async function load() {
    S.loading = true; S.error = null; render();
    try {
      const { data: { session } } = await sb.auth.getSession();
      S.session = session;
      if (!session) { S.loading = false; return render(); }
      const st = await sb.rpc("is_staff");
      if (st.error) throw st.error;
      S.staff = st.data === true;
      if (S.staff) {
        const q = await Promise.all([
          sb.from("clients").select("*").order("business_name"),
          sb.from("client_users").select("*"),
          sb.from("documents").select("*"),
          sb.from("document_events").select("*").order("created_at", { ascending: false }),
          sb.from("updates").select("*").order("created_at", { ascending: false }),
          sb.from("orders").select("*").order("created_at", { ascending: false }),
          sb.from("packages").select("*").order("sort")
        ]);
        const bad = q.find(r => r.error);
        if (bad) throw bad.error;
        [S.clients, S.users, S.docs, S.events, S.updates, S.orders, S.packages] = q.map(r => r.data);
      }
    } catch (e) {
      S.error = errText(e);
    }
    S.loading = false;
    render();
  }

  function counts(cid) {
    const docs = S.docs.filter(d => d.client_id === cid);
    return {
      review: docs.filter(d => d.in_review).length,
      need: docs.filter(d => docState(d) === "need").length,
      orders: S.orders.filter(o => o.client_id === cid && o.status === "requested").length,
      people: S.users.filter(u => u.client_id === cid).length
    };
  }

  // ---------------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------------
  const header = signedIn => `<header class="app"><div class="bar"><strong style="color:var(--bar-tint);font-size:1.0625rem">NBW Staff · My Business File</strong>
    ${signedIn ? `<button class="menu-btn" data-act="signout">Sign out</button>` : ""}</div></header>`;
  const msg = () => S.note ? `<p class="${S.note.err ? "err" : "kicker"}" role="${S.note.err ? "alert" : "status"}" style="margin:0">${esc(S.note.text)}</p>` : "";

  function viewSignin() {
    return `<main><div class="signin">
      <h1>Staff sign-in</h1><p>We'll email you a one-time code.</p>
      ${S.step === "email" ? `<form id="f-email" class="stack" style="width:100%">
        <label class="f" for="s-email">Email<input id="s-email" type="email" required autocomplete="email" value="${esc(S.email)}"></label>
        <button class="btn btn-primary btn-lg" type="submit">Email me a code</button></form>`
      : `<form id="f-code" class="stack" style="width:100%">
        <label class="f" for="s-code">Code sent to ${esc(S.email)}<input id="s-code" type="text" inputmode="numeric" autocomplete="one-time-code" required maxlength="10"></label>
        <button class="btn btn-primary btn-lg" type="submit">Sign in</button>
        <button class="link" type="button" data-act="restart">Use a different email</button></form>`}
      <p id="s-msg" aria-live="polite">${esc(S.msg)}</p></div></main>`;
  }

  function viewList() {
    const rows = S.clients.map(c => ({ c, n: counts(c.id) }))
      .sort((a, b) => (b.n.review + b.n.orders) - (a.n.review + a.n.orders) || b.n.need - a.n.need || a.c.business_name.localeCompare(b.c.business_name));
    const review = rows.reduce((t, r) => t + r.n.review, 0), orders = rows.reduce((t, r) => t + r.n.orders, 0);
    const queue = [review ? plural(review, "upload") + " to review" : "", orders ? plural(orders, "new order") + " to confirm" : ""].filter(Boolean);
    return `<main><div class="stack">
      <div><h1>Clients</h1><p class="lead">${queue.length ? esc(queue.join(" · ")) + "." : "Nothing waiting for review."}</p></div>
      ${msg()}
      <section class="panel"><ul class="list" id="clients">${rows.length ? rows.map(({ c, n }) => `
        <li class="doc"><button class="doc-main" data-open="${esc(c.id)}">
          <span class="ico c-license">${c.business_name.slice(0, 1).toUpperCase()}</span>
          <span class="doc-text"><span class="n">${esc(c.business_name)}</span>
            <span class="m">${esc(c.contact_first || "No contact")} · ${esc(c.plan || "No plan")} · ${plural(n.people, "person")} with access</span>
            <span style="display:flex;flex-wrap:wrap;gap:6px">${n.review ? `<span class="pill p-review">${n.review} to review</span>` : ""}${n.orders ? `<span class="pill p-soon">${plural(n.orders, "new order")}</span>` : ""}${n.need ? `<span class="pill p-need">${n.need} action needed</span>` : ""}</span>
          </span></button></li>`).join("") : `<li class="empty">No clients yet. Add the first one below.</li>`}</ul></section>
      <h2 class="section-h">Add a client</h2>
      <section class="panel" style="padding:16px"><form id="f-client" class="stack">
        <label class="f" for="c-name">Business name<input id="c-name" type="text" required maxlength="120"></label>
        <label class="f" for="c-first">Contact's first name<input id="c-first" type="text" maxlength="60"></label>
        <label class="f" for="c-plan">Plan<select id="c-plan"><option value="">No plan</option><option>Business Watch</option><option>Contractor Watch</option></select></label>
        <label class="f" for="c-price">Plan price as shown to the client<input id="c-price" type="text" maxlength="60" placeholder="$199 / month"></label>
        <p class="fine" style="padding:0">Clients on a plan get 15% off Safety &amp; Heat packages.</p>
        <button class="btn btn-primary" type="submit">Add client</button></form></section>
    </div></main>`;
  }

  function viewClient() {
    const c = S.clients.find(x => x.id === S.open);
    if (!c) { S.open = null; return viewList(); }
    const n = counts(c.id);
    const docs = S.docs.filter(d => d.client_id === c.id)
      .sort((a, b) => ["review", "need", "soon", "ok"].indexOf(docState(a)) - ["review", "need", "soon", "ok"].indexOf(docState(b)) || a.name_en.localeCompare(b.name_en));
    const orders = S.orders.filter(o => o.client_id === c.id);
    const updates = S.updates.filter(u => u.client_id === c.id);
    const files = id => S.events.filter(e => e.document_id === id && e.kind === "uploaded" && e.storage_path);

    const docCard = d => {
      const st = docState(d), f = files(d.id);
      return `<li class="req doc-card" data-doc="${esc(d.id)}" style="grid-template-columns:minmax(0,1fr)">
        <div><div class="n">${esc(d.name_en)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:4px">${pill(st)}<span class="m" style="margin:0">${esc(CATS[d.category] || d.category)} · Expires ${fmt(d.expires_on)}${d.reviewed_at ? " · Reviewed " + fmt(d.reviewed_at) : ""}</span></div>
          ${f.length ? `<ul class="files" style="margin-top:8px">${f.map(e => `<li><span>${esc(e.file_name)}${e.note ? ` · “${esc(e.note)}”` : ""} · ${fmt(e.created_at)}</span><button class="link" data-file="${esc(e.id)}">Open</button></li>`).join("")}</ul>` : ""}
          ${d.in_review ? `<form class="review stack" data-id="${esc(d.id)}" style="margin-top:10px">
            <label class="f" for="x-${esc(d.id)}">Expiration date<input id="x-${esc(d.id)}" name="expires" type="date" value="${esc(d.expires_on || "")}"></label>
            <label class="f" for="n-${esc(d.id)}">Note (shown to the client if you send it back)<input id="n-${esc(d.id)}" name="note" type="text" maxlength="1000"></label>
            <p class="err" aria-live="polite"></p>
            <div style="display:flex;flex-wrap:wrap;gap:8px"><button class="btn btn-primary" name="accept" value="1" type="submit">Accept</button><button class="btn btn-line" name="accept" value="0" type="submit">Send back</button></div>
          </form>` : ""}
        </div></li>`;
    };

    const orderCard = o => `<li class="req order-card" data-order="${esc(o.id)}" style="grid-template-columns:minmax(0,1fr)">
      <div><div class="n">${esc(pkgTitle(o.package_id))}</div>
        <div class="m">Ordered ${fmt(o.created_at)} · ${money(o.price_cents)}${o.deposit_cents != null && o.deposit_cents !== o.price_cents ? ` · ${money(o.deposit_cents)} to start` : ""}${o.handled_at ? ` · Updated ${fmt(o.handled_at)}` : ""}</div>
        ${o.notes ? `<div class="m">Client's note: ${esc(o.notes)}</div>` : ""}
        <form class="order stack" data-id="${esc(o.id)}" style="margin-top:10px">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
            <label class="f">Status<select name="status">${Object.keys(ORDER).map(k => `<option value="${k}"${o.status === k ? " selected" : ""}>${ORDER[k]}</option>`).join("")}</select></label>
            <label class="f">Price ($)<input name="price" type="text" inputmode="decimal" value="${o.price_cents == null ? "" : o.price_cents / 100}"></label>
            <label class="f">To start ($)<input name="deposit" type="text" inputmode="decimal" value="${o.deposit_cents == null ? "" : o.deposit_cents / 100}"></label>
          </div>
          <label class="f">Note to client<input name="note" type="text" maxlength="1000" value="${esc(o.staff_note || "")}" placeholder="Invoice sent to your email"></label>
          <p class="err" aria-live="polite"></p>
          <div><button class="btn btn-primary" type="submit">Save order</button></div>
        </form></div></li>`;

    return `<main><div class="stack">
      <div><button class="link" data-act="back">‹ All clients</button><h1>${esc(c.business_name)}</h1>
        <div class="kicker">${esc(c.contact_first || "No contact")} · ${esc(c.plan || "No plan")}${c.discount_pct ? ` · ${c.discount_pct}% off packages` : ""} · ${plural(n.people, "person")} with access</div></div>
      ${msg()}
      ${orders.length ? `<h2 class="section-h">Orders</h2><section class="panel"><ul class="reqs">${orders.map(orderCard).join("")}</ul></section>` : ""}
      <h2 class="section-h">Documents</h2>
      <section class="panel"><ul class="reqs">${docs.length ? docs.map(docCard).join("") : `<li class="empty">No documents yet.</li>`}</ul></section>
      <h2 class="section-h">Request a document</h2>
      <section class="panel" style="padding:16px"><form id="f-request" class="stack">
        <label class="f" for="r-en">Document name<input id="r-en" type="text" required maxlength="160" placeholder="Workers' comp policy"></label>
        <label class="f" for="r-es">Name in Spanish (optional)<input id="r-es" type="text" maxlength="160" placeholder="Póliza de compensación laboral"></label>
        <label class="f" for="r-cat">Type<select id="r-cat">${Object.keys(CATS).map(k => `<option value="${k}">${CATS[k]}</option>`).join("")}</select></label>
        <label class="f" for="r-note">Note (optional)<input id="r-note" type="text" maxlength="1000"></label>
        <button class="btn btn-primary" type="submit">Send request</button></form></section>
      <h2 class="section-h">Post an update</h2>
      <section class="panel" style="padding:16px"><form id="f-update" class="stack">
        <label class="f" for="u-en">Message<textarea id="u-en" required maxlength="2000"></textarea></label>
        <label class="f" for="u-es">Spanish version (optional; shown when the client reads in Spanish)<textarea id="u-es" maxlength="2000"></textarea></label>
        <button class="btn btn-primary" type="submit">Post update</button></form>
        ${updates.length ? `<ul class="feed" style="margin-top:12px">${updates.map(u => `<li><time>${fmt(u.created_at)}</time><div>${esc(u.body_en)}</div></li>`).join("")}</ul>` : ""}</section>
      <h2 class="section-h">Give someone access</h2>
      <section class="panel" style="padding:16px"><form id="f-access" class="stack">
        <label class="f" for="a-email">Their email<input id="a-email" type="email" required></label>
        <p class="fine" style="padding:0">They need an account first: in Supabase, open Authentication → Users and add or invite them.</p>
        <button class="btn btn-primary" type="submit">Give access</button></form></section>
    </div></main>`;
  }

  function render() {
    const app = document.getElementById("app");
    if (!sb) { app.innerHTML = header(false) + `<main><div class="signin"><h1>Not set up yet</h1><p>Add the Supabase project URL and key to business-file-config.js.</p></div></main>`; return; }
    if (S.loading) { app.innerHTML = header(false) + `<main><p class="lead">Loading…</p></main>`; return; }
    if (S.error) { app.innerHTML = header(!!S.session) + `<main><div class="signin"><p class="err" role="alert">${esc(S.error)}</p><button class="btn btn-primary" data-act="reload">Try again</button></div></main>`; return; }
    if (!S.session) { app.innerHTML = header(false) + viewSignin(); return; }
    if (!S.staff) { app.innerHTML = header(true) + `<main><div class="signin"><h1>Staff only</h1><p>This page is for the NBW team. Clients use My Business File.</p><a class="btn btn-primary" href="business-file.html">Open My Business File</a></div></main>`; return; }
    app.innerHTML = header(true) + (S.open ? viewClient() : viewList());
  }

  const note = (text, err) => { S.note = { text, err: !!err }; };
  // A problem with what was typed: say so next to the form without redrawing
  // the page, so nothing the person entered is lost
  const formError = (form, text) => { const el = form.querySelector(".err"); el.textContent = text; el.focus && el.setAttribute("tabindex", "-1"); el.focus(); };
  const cents = v => { const t = String(v || "").replace(/[$,\s]/g, ""); if (!t) return null; const n = Math.round(parseFloat(t) * 100); return isNaN(n) || n < 0 ? NaN : n; };
  async function run(form, fn) {
    form.querySelectorAll("button").forEach(b => { b.disabled = true; });
    try { await fn(); } catch (e) { note(errText(e), true); }
    render();
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------
  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-open],[data-act],[data-file]");
    if (!b) return;
    if (b.dataset.open) { S.open = b.dataset.open; S.note = null; render(); scrollTo(0, 0); return; }
    if (b.dataset.file) {
      const ev = S.events.find(x => x.id === b.dataset.file);
      const { data, error } = await sb.storage.from("client-files").createSignedUrl(ev.storage_path, 120, { download: ev.file_name });
      if (error || !data) { note(errText(error), true); return render(); }
      const a = document.createElement("a"); a.href = data.signedUrl; a.download = ev.file_name; a.rel = "noopener";
      document.body.appendChild(a); a.click(); a.remove();
      return;
    }
    const act = b.dataset.act;
    if (act === "back") { S.open = null; S.note = null; render(); }
    if (act === "reload") load();
    if (act === "restart") { S.step = "email"; S.msg = ""; render(); }
    if (act === "signout") { await sb.auth.signOut(); }
  });

  document.addEventListener("submit", e => {
    const f = e.target;
    e.preventDefault();
    const val = id => document.getElementById(id).value.trim();

    if (f.id === "f-email") {
      S.email = val("s-email");
      return run(f, async () => {
        const { error } = await sb.auth.signInWithOtp({ email: S.email, options: { shouldCreateUser: false, emailRedirectTo: PAGE_URL } });
        // Same answer either way, so the form can't be used to find accounts
        S.step = "code";
        S.msg = error && error.status === 429 ? "Too many tries. Wait a minute, then try again." : `If ${S.email} has an account, we emailed a code to it.`;
      });
    }
    if (f.id === "f-code") {
      return run(f, async () => {
        const { error } = await sb.auth.verifyOtp({ email: S.email, token: val("s-code"), type: "email" });
        if (error) { S.msg = "That code didn't work. Check the newest email, or start over."; return; }
        S.msg = ""; S.step = "email";
      });
    }
    if (f.id === "f-client") {
      return run(f, async () => {
        const plan = val("c-plan") || null;
        const { data, error } = await sb.from("clients").insert({
          business_name: val("c-name"), contact_first: val("c-first") || null, plan,
          price_text: val("c-price") || null, discount_pct: plan ? 15 : 0
        }).select().single();
        if (error) throw error;
        S.clients.push(data);
        S.clients.sort((a, b) => a.business_name.localeCompare(b.business_name));
        S.open = data.id;
        note(`Added ${data.business_name}. Next, give the owner access below.`);
      });
    }
    if (f.id === "f-access") {
      return run(f, async () => {
        const email = val("a-email");
        const { data, error } = await sb.rpc("grant_access", { p_client_id: S.open, p_email: email });
        if (error) throw error;
        if (!data) return note(`There's no account for ${email} yet. Add or invite them under Authentication → Users in Supabase, then try again.`, true);
        const users = await sb.from("client_users").select("*");
        if (!users.error) S.users = users.data;
        note(`${email} can now open this file.`);
      });
    }
    if (f.id === "f-request") {
      return run(f, async () => {
        const { error } = await sb.rpc("request_document", { p_client_id: S.open, p_name_en: val("r-en"), p_name_es: val("r-es") || null, p_category: val("r-cat"), p_note: val("r-note") || null });
        if (error) throw error;
        await refresh();
        note("Request sent. The client sees it as action needed.");
      });
    }
    if (f.id === "f-update") {
      return run(f, async () => {
        const { data, error } = await sb.from("updates").insert({ client_id: S.open, body_en: val("u-en"), body_es: val("u-es") || null, author_id: S.session.user.id }).select().single();
        if (error) throw error;
        S.updates.unshift(data);
        note("Update posted.");
      });
    }
    if (f.classList.contains("review")) {
      const accept = e.submitter && e.submitter.value === "1";
      const fd = new FormData(f);
      const expires = fd.get("expires") || null, text = String(fd.get("note") || "").trim();
      if (accept && !expires) return formError(f, "Add the expiration date before accepting, so the client gets renewal reminders.");
      if (!accept && !text) return formError(f, "Add a note telling the client what's wrong before sending it back.");
      return run(f, async () => {
        const { error } = await sb.rpc("review_document", { p_document_id: f.dataset.id, p_accept: accept, p_expires_on: expires, p_note: text || null });
        if (error) throw error;
        await refresh();
        note(accept ? "Accepted. The document is current." : "Sent back. The client is asked for a new copy.");
      });
    }
    if (f.classList.contains("order")) {
      const fd = new FormData(f);
      const price = cents(fd.get("price")), deposit = cents(fd.get("deposit"));
      if (Number.isNaN(price) || Number.isNaN(deposit)) return formError(f, "Enter prices as dollar amounts, like 1020 or 510.50.");
      return run(f, async () => {
        const { data, error } = await sb.from("orders").update({ status: fd.get("status"), price_cents: price, deposit_cents: deposit, staff_note: String(fd.get("note") || "").trim() || null })
          .eq("id", f.dataset.id).select().single();
        if (error) throw error;
        S.orders = S.orders.map(o => (o.id === data.id ? data : o));
        note("Order saved.");
      });
    }
  });

  // Reload this client's documents and history after a staff change
  async function refresh() {
    const [d, ev] = await Promise.all([
      sb.from("documents").select("*"),
      sb.from("document_events").select("*").order("created_at", { ascending: false })
    ]);
    if (d.error) throw d.error;
    if (ev.error) throw ev.error;
    S.docs = d.data; S.events = ev.data;
  }

  if (!sb) { render(); return; }
  sb.auth.onAuthStateChange(ev => {
    if (["INITIAL_SESSION", "SIGNED_IN", "SIGNED_OUT"].includes(ev)) setTimeout(() => { if (ev === "SIGNED_OUT") { S.open = null; S.staff = null; S.note = null; } load(); }, 0);
  });
})();
