// Test-only stand-in for hub-config.js: an in-memory Supabase client covering
// just the calls hub.js makes. Access rules are tested separately in rls_test.sql;
// here an email ending in @nbw.test signs in as NBW staff.
window.HUB_CONFIG = { supabaseUrl: "https://fake.supabase.co", supabaseAnonKey: "test" };
window.supabase.createClient = function () {
  const nv = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
  const today = () => nv.format(new Date());
  const uuid = () => crypto.randomUUID();
  const KEY = { heat: [1, 0, 1, 1], hazcom: [1, 0] };
  const db = {
    businesses: [], employees: [], attestations: [], training_files: [],
    documents: [], document_files: [], updates: [],
    orders: [],
    packages: [
      { id: "heat_plan", title: "Heat Plan", summary: "For 11 to 25 employees. We do your hazard analysis, write your heat plan, set up your designated person and train one crew.", price_cents: 120000, client_price_cents: 102000, billing: "one_time", done_for_you: true, max_employees: 25, active: true, sort: 1 },
      { id: "full_program", title: "Full Safety Program + Heat Plan", summary: "Everything in the Heat Plan, plus a complete written safety program, injury reporting steps, safety committee setup (26+ employees) and two trainings.", price_cents: 240000, client_price_cents: 204000, billing: "one_time", done_for_you: true, max_employees: null, active: true, sort: 2 },
      { id: "stay_ready", title: "Stay Ready", summary: "A spring review before summer, yearly refresher training, new-hire materials and updates when Nevada rules change.", price_cents: 20000, client_price_cents: 17000, billing: "monthly", done_for_you: true, max_employees: null, active: true, sort: 3 },
      { id: "extra_training", title: "Extra training session", summary: "One more crew training session, in English or Spanish.", price_cents: 30000, client_price_cents: 25500, billing: "per_session", done_for_you: true, max_employees: null, active: true, sort: 4 },
      { id: "kit_review", title: "Kit + Expert Review", summary: "Our fill-in safety program and heat plan kit, plus we review your finished draft and walk you through fixes.", price_cents: 39900, client_price_cents: 33900, billing: "one_time", done_for_you: false, max_employees: null, active: true, sort: 5 },
      { id: "diy_kit", title: "DIY Compliance Kit", summary: "Fill-in safety program and heat plan, hazard worksheet, forms, English and Spanish handouts and step-by-step instructions.", price_cents: 19900, client_price_cents: 16900, billing: "one_time", done_for_you: false, max_employees: null, active: true, sort: 6 }
    ],
    document_types: [
      { id: "nscb_license", title: "NSCB contractor license", icon: "id", sort: 1 },
      { id: "general_liability", title: "General liability certificate", icon: "shield", sort: 4 },
      { id: "workers_comp", title: "Workers' comp policy", icon: "hardhat", sort: 5 },
      { id: "heat_plan", title: "Written heat illness prevention plan", icon: "sun", sort: 6 },
      { id: "other", title: "Other document", icon: "doc", sort: 99 }
    ],
    courses: [
      { id: "heat", title: "Heat Illness Prevention", required_for: "Employees in jobs covered by the heat rule", source_label: "Regulation R131-24", source_url: "https://www.leg.state.nv.us/Register/2024Register/R131-24AP.pdf", renew_months: 12, jha_note: "A written job hazard analysis is required when most workers in a job are in the heat more than 30 minutes of any 60, not counting breaks.", sort: 1 },
      { id: "hazcom", title: "Hazard Communication", required_for: "Employees who work with hazardous chemicals", source_label: "29 CFR 1910.1200", source_url: "javascript:alert(1)", renew_months: 12, jha_note: null, sort: 2 }
    ],
    course_questions: [
      { course_id: "heat", position: 1, prompt: "Q1 heat", options: ["a", "b", "c"] },
      { course_id: "heat", position: 2, prompt: "Q2 heat", options: ["a", "b", "c"] },
      { course_id: "heat", position: 3, prompt: "Q3 heat", options: ["a", "b", "c"] },
      { course_id: "heat", position: 4, prompt: "Q4 heat", options: ["a", "b", "c"] },
      { course_id: "hazcom", position: 1, prompt: "Q1 hazcom", options: ["a", "b", "c"] },
      { course_id: "hazcom", position: 2, prompt: "Q2 hazcom", options: ["a", "b", "c"] }
    ]
  };
  const users = {};
  let session = null;
  const listeners = [];
  const emit = ev => listeners.forEach(cb => cb(ev, session));
  window.__fake = { db, storage: {}, calls: [] };
  window.__fakeClientEmit = ev => emit(ev);
  const isStaff = () => !!session && session.user.email.endsWith("@nbw.test");

  function builder(table) {
    const q = { op: "select", filters: [], orderBy: null, returning: false, single: null };
    const run = () => {
      window.__fake.calls.push(table + ":" + q.op);
      let rows = db[table];
      // Owners only ever get their own business row back
      if (table === "businesses" && q.op === "select" && !isStaff()) rows = rows.filter(r => r.owner_id === session.user.id);
      const match = r => q.filters.every(([c, v]) => r[c] === v);
      let out;
      if (q.op === "insert") {
        const now = new Date().toISOString();
        const row = Object.assign({ id: uuid(), created_at: now }, q.values);
        if (table === "businesses") row.owner_id = session.user.id;
        if (table === "employees" && row.active === undefined) row.active = true;
        if (table === "updates") row.author_id = session.user.id;
        rows.push(row);
        out = [row];
        if (!q.returning) return { data: null, error: null };
      } else if (q.op === "update") {
        out = rows.filter(match);
        out.forEach(r => Object.assign(r, q.values));
      } else if (q.op === "delete") {
        out = rows.filter(match);
        db[table] = rows.filter(r => !match(r));
      } else {
        out = rows.filter(match).slice();
        if (q.orderBy) {
          const [c, asc] = q.orderBy;
          out.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1));
        }
      }
      // Like a network response, hand back copies rather than the stored rows
      out = structuredClone(out);
      if (q.single === "maybe") return { data: out[0] || null, error: null };
      if (q.single === "one") return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: "not single" } };
      return { data: out, error: null };
    };
    const b = {
      select() { if (q.op !== "select") q.returning = true; return b; },
      insert(v) { q.op = "insert"; q.values = v; return b; },
      update(v) { q.op = "update"; q.values = v; return b; },
      delete() { q.op = "delete"; return b; },
      eq(c, v) { q.filters.push([c, v]); return b; },
      order(c, o) { q.orderBy = [c, !o || o.ascending !== false]; return b; },
      maybeSingle() { q.single = "maybe"; return b; },
      single() { q.single = "one"; return b; },
      then(res, rej) { return Promise.resolve().then(run).then(res, rej); }
    };
    return b;
  }

  return {
    from: builder,
    async rpc(name, args) {
      window.__fake.calls.push("rpc:" + name);
      if (name === "is_staff") return { data: isStaff(), error: null };
      if (name === "order_package") {
        const biz = db.businesses.find(b => b.owner_id === session.user.id);
        const p = db.packages.find(x => x.id === args.p_package_id && x.active);
        if (!biz || !p) return { data: null, error: { message: "That package is not available" } };
        const crew = db.employees.filter(e => e.business_id === biz.id && e.active).length;
        const price = p.max_employees != null && crew > p.max_employees ? null : p.client_price_cents;
        const order = { id: uuid(), business_id: biz.id, package_id: p.id, status: "requested", price_cents: price,
          deposit_cents: price == null ? null : p.done_for_you && p.billing === "one_time" ? Math.round(price / 2) : price,
          notes: (args.p_notes || "").trim() || null, staff_note: null, created_by: session.user.id, created_at: new Date().toISOString() };
        db.orders.push(order);
        return { data: order.id, error: null };
      }
      if (name === "cancel_order") {
        const biz = db.businesses.find(b => b.owner_id === session.user.id);
        const o = db.orders.find(x => x.id === args.p_order_id && biz && x.business_id === biz.id && x.status === "requested");
        if (!o) return { data: null, error: { message: "Only orders NBW hasn't confirmed yet can be cancelled here" } };
        o.status = "cancelled";
        return { data: null, error: null };
      }
      if (name === "submit_document") {
        const biz = db.businesses.find(b => b.owner_id === session.user.id);
        if (!args.p_storage_path.startsWith(biz.id + "/docs/")) return { data: null, error: { message: "File must be stored in your docs folder" } };
        let doc = args.p_document_id && db.documents.find(d => d.id === args.p_document_id && d.business_id === biz.id);
        if (args.p_document_id && !doc) return { data: null, error: { message: "Document not found" } };
        if (doc) {
          doc.status = "under_review";
          if (args.p_expires_on) doc.expires_on = args.p_expires_on;
        } else {
          doc = { id: uuid(), business_id: biz.id, type_id: args.p_type_id, label: (args.p_label || "").trim() || null, status: "under_review", expires_on: args.p_expires_on, note: null, created_at: new Date().toISOString() };
          db.documents.push(doc);
        }
        db.document_files.push({ id: uuid(), document_id: doc.id, business_id: biz.id, storage_path: args.p_storage_path, file_name: args.p_file_name, size_bytes: args.p_size_bytes, created_at: new Date().toISOString() });
        return { data: doc.id, error: null };
      }
      const key = KEY[args.p_course_id];
      const wrong = key.filter((a, i) => args.p_answers[i] !== a).length;
      if (wrong) return { data: { passed: false, wrong }, error: null };
      const d = today();
      db.attestations.push({ id: uuid(), employee_id: args.p_employee_id, course_id: args.p_course_id, completed_on: d });
      const [y, m, day] = d.split("-").map(Number);
      return { data: { passed: true, wrong: 0, completed_on: d, due_on: `${y + 1}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}` }, error: null };
    },
    storage: {
      from() {
        return {
          async upload(path, file) { window.__fake.storage[path] = file.size; return { data: { path }, error: null }; },
          async createSignedUrl(path) { return { data: { signedUrl: "https://fake.supabase.co/signed/" + encodeURIComponent(path) }, error: null }; },
          async remove(paths) { paths.forEach(p => delete window.__fake.storage[p]); return { data: [], error: null }; }
        };
      }
    },
    auth: {
      onAuthStateChange(cb) { listeners.push(cb); setTimeout(() => cb("INITIAL_SESSION", session), 0); return { data: { subscription: { unsubscribe() {} } } }; },
      async signUp({ email, password }) { users[email] = password; return { data: { user: { email }, session: null }, error: null }; },
      async signInWithPassword({ email, password }) {
        if (users[email] !== password) return { data: {}, error: { message: "Invalid login credentials" } };
        session = { user: { id: "user-" + email, email } };
        emit("SIGNED_IN");
        return { data: { session }, error: null };
      },
      async signOut() { session = null; emit("SIGNED_OUT"); return { error: null }; },
      async resetPasswordForEmail() { return { data: {}, error: null }; },
      async updateUser() { return { data: {}, error: null }; }
    }
  };
};
