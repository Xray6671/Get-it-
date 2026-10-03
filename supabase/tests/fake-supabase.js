// Test-only stand-in for business-file-config.js: an in-memory Supabase client
// covering the calls business-file.js and staff.js make, with the same access
// rules as schema.sql (checked for real in rls_test.sql). Sign-in codes are
// always 123456.
window.NBW_CONFIG = { supabaseUrl: "https://fake.supabase.co", supabaseAnonKey: "test", contactPhone: "(702) 555-0100", contactEmail: "test@example.com" };
window.supabase.createClient = function () {
  const uuid = () => crypto.randomUUID();
  const now = () => new Date().toISOString();
  const day = n => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const USERS = {
    "marco@roof.example": "u-marco",
    "team@nbw.example": "u-staff",
    "nofile@example.com": "u-nofile",
    "office@roof.example": "u-office"
  };
  const STAFF = ["u-staff"];
  const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
  const db = {
    clients: [
      { id: A, business_name: "Desert Ridge Roofing LLC", contact_first: "Marco", plan: "Contractor Watch", price_text: "$199 / month", discount_pct: 15, created_at: now() },
      { id: B, business_name: "Blue Pool <i>Service</i>", contact_first: null, plan: null, price_text: null, discount_pct: 0, created_at: now() }
    ],
    client_users: [{ user_id: "u-marco", client_id: A }],
    documents: [
      { id: "d-nscb", client_id: A, name_en: "NSCB contractor license C-15", name_es: "Licencia de contratista NSCB C-15", category: "license", expires_on: day(-6), in_review: false, requested: false, created_at: now() },
      { id: "d-heat", client_id: A, name_en: "Written heat illness prevention plan", name_es: "Plan escrito contra el calor", category: "safety", expires_on: null, in_review: false, requested: true, created_at: now() },
      { id: "d-nlv", client_id: A, name_en: "City of North Las Vegas business license", name_es: null, category: "license", expires_on: day(140), in_review: true, requested: false, created_at: now() },
      { id: "d-gl", client_id: A, name_en: "General liability certificate", name_es: null, category: "insurance", expires_on: day(200), in_review: false, requested: false, created_at: now() },
      { id: "d-pool", client_id: B, name_en: "Pool license", name_es: null, category: "license", expires_on: day(90), in_review: false, requested: false, created_at: now() }
    ],
    document_events: [
      { id: "e-nlv", client_id: A, document_id: "d-nlv", kind: "uploaded", file_name: "NLV-license.pdf", storage_path: A + "/d-nlv/1-NLV-license.pdf", note: "Renewed online", created_at: now() }
    ],
    updates: [{ id: "u1", client_id: A, body_en: "Welcome to your file.", body_es: "Bienvenido a su expediente.", author_id: "u-staff", created_at: now() }],
    packages: [
      { id: "heat", title: "Heat Plan", price_cents: 120000, billing: "one_time", done_for_you: true, active: true, sort: 1 },
      { id: "full", title: "Full Safety Program + Heat Plan", price_cents: 240000, billing: "one_time", done_for_you: true, active: true, sort: 2 },
      { id: "ready", title: "Stay Ready", price_cents: 20000, billing: "monthly", done_for_you: true, active: true, sort: 3 },
      { id: "review", title: "Kit + Expert Review", price_cents: 39900, billing: "one_time", done_for_you: false, active: true, sort: 4 },
      { id: "kit", title: "DIY Compliance Kit", price_cents: 19900, billing: "one_time", done_for_you: false, active: true, sort: 5 }
    ],
    orders: [{ id: "o-pool", client_id: B, package_id: "kit", status: "requested", price_cents: 19900, deposit_cents: 19900, notes: "Please send in Spanish", staff_note: null, created_at: now() }]
  };
  const storage = {};
  let session = null;
  let pendingEmail = null;
  const listeners = [];
  const emit = ev => listeners.forEach(cb => cb(ev, session));
  const uid = () => session && session.user.id;
  const isStaff = () => STAFF.includes(uid());
  const member = cid => db.client_users.some(r => r.user_id === uid() && r.client_id === cid);
  window.__fake = { db, storage, calls: [] };

  const visible = (table, r) => {
    if (!session) return false;
    if (isStaff()) return true;
    if (table === "packages") return true;
    if (table === "client_users") return r.user_id === uid();
    if (table === "clients") return member(r.id);
    return member(r.client_id);
  };
  const denied = { message: "permission denied" };

  function builder(table) {
    const q = { op: "select", filters: [], order: null, returning: false, single: null, limit: null };
    const run = () => {
      window.__fake.calls.push(`${table}:${q.op}`);
      if (q.op === "insert") {
        const row = Object.assign({ id: uuid(), created_at: now() }, q.values);
        const ok = isStaff() && ["clients", "updates"].includes(table) && (table !== "updates" || row.author_id === uid());
        if (!ok) return { data: null, error: denied };
        db[table].push(row);
        return q.returning ? { data: structuredClone(row), error: null } : { data: null, error: null };
      }
      let rows = db[table].filter(r => visible(table, r) && q.filters.every(([c, v]) => r[c] === v));
      if (q.op === "update") {
        if (!isStaff() || table !== "orders") rows = [];
        rows.forEach(r => Object.assign(r, q.values, { handled_by: uid(), handled_at: now() }));
      }
      rows = rows.slice();
      if (q.order) { const [c, asc] = q.order; rows.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1)); }
      if (q.limit != null) rows = rows.slice(0, q.limit);
      rows = structuredClone(rows);
      if (q.single) return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: "not found" } };
      return { data: rows, error: null };
    };
    const b = {
      select() { if (q.op !== "select") q.returning = true; return b; },
      insert(v) { q.op = "insert"; q.values = v; return b; },
      update(v) { q.op = "update"; q.values = v; return b; },
      eq(c, v) { q.filters.push([c, v]); return b; },
      order(c, o) { q.order = [c, !o || o.ascending !== false]; return b; },
      limit(n) { q.limit = n; return b; },
      single() { q.single = true; return b; },
      then(res, rej) { return new Promise(r => setTimeout(r, 30)).then(run).then(res, rej); }
    };
    return b;
  }

  const rpcs = {
    is_staff: () => isStaff(),
    submit_upload(a) {
      if (!member(a.p_client_id)) throw denied;
      if (!a.p_files.length) throw { message: "Choose at least one file" };
      if (a.p_files.some(f => !f.path.startsWith(a.p_client_id + "/"))) throw denied;
      let doc = a.p_document_id && db.documents.find(d => d.id === a.p_document_id && d.client_id === a.p_client_id);
      if (a.p_document_id && !doc) throw denied;
      if (!doc) { doc = { id: uuid(), client_id: a.p_client_id, name_en: a.p_new_name || "Document", name_es: null, category: "other", expires_on: a.p_expires_on, in_review: true, requested: false, created_at: now() }; db.documents.push(doc); }
      else Object.assign(doc, { in_review: true, requested: false, expires_on: a.p_expires_on || doc.expires_on, reviewed_at: null });
      a.p_files.forEach(f => db.document_events.push({ id: uuid(), client_id: a.p_client_id, document_id: doc.id, kind: "uploaded", file_name: f.name, storage_path: f.path, note: a.p_note, created_at: now() }));
      return doc.id;
    },
    order_package(a) {
      if (!member(a.p_client_id)) throw denied;
      const p = db.packages.find(x => x.id === a.p_package_id && x.active);
      if (!p) throw { message: "That package is not available" };
      if (db.orders.some(o => o.client_id === a.p_client_id && o.package_id === p.id && ["requested", "confirmed", "in_progress"].includes(o.status))) throw { message: "You already have this order open" };
      const pct = db.clients.find(c => c.id === a.p_client_id).discount_pct;
      const price = Math.round(p.price_cents * (100 - pct) / 10000) * 100;
      const o = { id: uuid(), client_id: a.p_client_id, package_id: p.id, status: "requested", price_cents: price,
        deposit_cents: p.done_for_you && p.billing === "one_time" ? Math.round(price / 200) * 100 : price, notes: a.p_notes, staff_note: null, created_by: uid(), created_at: now() };
      db.orders.push(o);
      return o.id;
    },
    review_document(a) {
      if (!isStaff()) throw denied;
      const d = db.documents.find(x => x.id === a.p_document_id);
      Object.assign(d, { in_review: false, requested: !a.p_accept, expires_on: a.p_accept ? (a.p_expires_on || d.expires_on) : d.expires_on, reviewed_by: uid(), reviewed_at: now() });
      db.document_events.push({ id: uuid(), client_id: d.client_id, document_id: d.id, kind: a.p_accept ? "reviewed" : "requested", note: a.p_note, created_at: now() });
    },
    request_document(a) {
      if (!isStaff()) throw denied;
      const d = { id: uuid(), client_id: a.p_client_id, name_en: a.p_name_en, name_es: a.p_name_es, category: a.p_category, expires_on: null, in_review: false, requested: true, created_at: now() };
      db.documents.push(d);
      db.document_events.push({ id: uuid(), client_id: d.client_id, document_id: d.id, kind: "requested", note: a.p_note, created_at: now() });
      return d.id;
    },
    grant_access(a) {
      if (!isStaff()) throw denied;
      const user = USERS[String(a.p_email).trim().toLowerCase()];
      if (!user) return false;
      if (!db.client_users.some(r => r.user_id === user && r.client_id === a.p_client_id)) db.client_users.push({ user_id: user, client_id: a.p_client_id });
      return true;
    }
  };

  return {
    from: builder,
    async rpc(name, args) {
      window.__fake.calls.push("rpc:" + name);
      await new Promise(r => setTimeout(r, 30));
      try { return { data: rpcs[name](args || {}), error: null }; }
      catch (e) { return { data: null, error: e }; }
    },
    storage: {
      from() {
        return {
          async upload(path, file) {
            const cid = path.split("/")[0];
            if (!member(cid)) return { data: null, error: denied };
            storage[path] = file.size;
            return { data: { path }, error: null };
          },
          async createSignedUrl(path) {
            if (!(isStaff() || member(path.split("/")[0]))) return { data: null, error: denied };
            return { data: { signedUrl: "https://fake.supabase.co/signed/" + encodeURIComponent(path) }, error: null };
          }
        };
      }
    },
    auth: {
      async getSession() { return { data: { session }, error: null }; },
      onAuthStateChange(cb) { listeners.push(cb); setTimeout(() => cb("INITIAL_SESSION", session), 0); return { data: { subscription: { unsubscribe() {} } } }; },
      async signInWithOtp({ email }) { pendingEmail = email.trim().toLowerCase(); return { data: {}, error: null }; },
      async verifyOtp({ email, token }) {
        const id = USERS[String(email).trim().toLowerCase()];
        if (!id || token !== "123456") return { data: {}, error: { message: "Token has expired or is invalid", status: 403 } };
        session = { user: { id, email } };
        emit("SIGNED_IN");
        return { data: { session }, error: null };
      },
      async signOut() { session = null; emit("SIGNED_OUT"); return { error: null }; }
    }
  };
};
