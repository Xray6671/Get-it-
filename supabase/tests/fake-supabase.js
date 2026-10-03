// Test-only stand-in for hub-config.js: an in-memory Supabase client covering
// just the calls hub.js makes. Access rules are tested separately in rls_test.sql.
window.HUB_CONFIG = { supabaseUrl: "https://fake.supabase.co", supabaseAnonKey: "test" };
window.supabase.createClient = function () {
  const nv = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
  const today = () => nv.format(new Date());
  const uuid = () => crypto.randomUUID();
  const KEY = { heat: [1, 0, 1, 1], hazcom: [1, 0] };
  const db = {
    businesses: [], employees: [], attestations: [], training_files: [],
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

  function builder(table) {
    const q = { op: "select", filters: [], orderBy: null, returning: false, single: null };
    const run = () => {
      window.__fake.calls.push(table + ":" + q.op);
      let rows = db[table];
      const match = r => q.filters.every(([c, v]) => r[c] === v);
      let out;
      if (q.op === "insert") {
        const now = new Date().toISOString();
        const row = Object.assign({ id: uuid(), created_at: now }, q.values);
        if (table === "businesses") row.owner_id = session.user.id;
        if (table === "employees" && row.active === undefined) row.active = true;
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
