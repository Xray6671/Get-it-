// Demo data for business-file-demo.html. Stands in for Supabase so hub.js runs
// unchanged with an example client: nothing is sent anywhere, uploads stay in
// this browser tab, and reloading the page starts over.
(function () {
  "use strict";

  window.HUB_CONFIG = { supabaseUrl: "demo", supabaseAnonKey: "demo" };

  const nv = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
  const TODAY = nv.format(new Date());
  function day(offset) {
    const d = new Date(TODAY + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  }
  const stamp = offset => day(offset) + "T16:00:00.000Z";
  const uuid = () => crypto.randomUUID();
  const clone = v => JSON.parse(JSON.stringify(v));

  const OWNER = { id: "demo-owner", email: "marco@desertridgeroofing.example" };
  const STAFF = { id: "demo-staff", email: "team@nevadabusinesswatch.example" };

  // A one-page PDF, so sample files open like real ones
  function samplePdf(title, lines) {
    const pdfEsc = t => String(t).replace(/[\\()]/g, m => "\\" + m).replace(/[^\x20-\x7e]/g, "");
    const text = [`BT /F1 20 Tf 72 720 Td (${pdfEsc(title)}) Tj ET`]
      .concat(lines.map((l, i) => `BT /F1 12 Tf 72 ${684 - i * 20} Td (${pdfEsc(l)}) Tj ET`)).join("\n");
    const objs = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
      `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
    ];
    let out = "%PDF-1.4\n";
    const offsets = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map(o => String(o).padStart(10, "0") + " 00000 n \n").join("");
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return new Blob([out], { type: "application/pdf" });
  }

  // ---------------------------------------------------------------------------
  // Example data
  // ---------------------------------------------------------------------------
  const ROOF = "b-desert-ridge";
  const POOL = "b-blue-pool";
  const db = {
    businesses: [
      { id: ROOF, owner_id: OWNER.id, name: "Desert Ridge Roofing LLC", contact_name: "Marco", created_at: stamp(-90) },
      { id: POOL, owner_id: "demo-owner-2", name: "Blue Pool Service", contact_name: "Ana", created_at: stamp(-40) }
    ],
    employees: [
      { id: "e-maria", business_id: ROOF, full_name: "Maria Chen", job_title: "Crew lead", active: true, created_at: stamp(-90) },
      { id: "e-luis", business_id: ROOF, full_name: "Luis Ortega", job_title: "Roofer", active: true, created_at: stamp(-90) },
      { id: "e-sam", business_id: ROOF, full_name: "Sam Patel", job_title: "Laborer", active: true, created_at: stamp(-12) },
      { id: "e-jo", business_id: POOL, full_name: "Jo Rivera", job_title: "Pool tech", active: true, created_at: stamp(-40) }
    ],
    attestations: [
      { id: uuid(), employee_id: "e-maria", course_id: "heat", completed_on: day(-60) },
      { id: uuid(), employee_id: "e-maria", course_id: "hazcom", completed_on: day(-60) },
      { id: uuid(), employee_id: "e-luis", course_id: "heat", completed_on: day(-345) },
      { id: uuid(), employee_id: "e-luis", course_id: "hazcom", completed_on: day(-120) }
    ],
    training_files: [],
    courses: [
      { id: "heat", title: "Heat Illness Prevention", lesson: ["Drink water often, before you feel thirsty. Your employer must give you drinkable water.", "Take rest breaks in shade or a cool area, and take one right away if you feel signs of heat illness.", "Early signs: heavy sweating, cramps, headache, dizziness, nausea or weakness. Stop, cool down, drink water and tell your supervisor.", "Severe signs: confusion, slurred speech, fainting, collapse or a seizure. Call 911 right away and start cooling the person.", "New and returning workers need shorter first days to get used to the heat.", "Your workplace has a designated person who watches conditions and calls emergency services if someone gets sick. Know who it is.", "When most workers in a job are in the heat more than 30 minutes of any 60, not counting breaks, the employer needs a written job hazard analysis, judged as if workers had no water, rest or shade."], lesson_url: "https://nevadabusinesswatch.com/lessons.html#s7l1", required_for: "Employees in jobs covered by the heat rule", source_label: "Regulation R131-24", source_url: "https://www.leg.state.nv.us/Register/2024Register/R131-24AP.pdf", renew_months: 12, jha_note: "A written job hazard analysis is required when most workers in a job are in the heat more than 30 minutes of any 60, not counting breaks. Judge conditions as if workers had no water, rest or shade.", sort: 1 },
      { id: "hazcom", title: "Hazard Communication", lesson: ["You have a right to know about the hazardous chemicals you work with.", "Safety Data Sheets (SDS) explain each chemical's hazards and how to protect yourself. They must be available to you during every shift.", "Shipped chemical containers are labeled with the product identifier, a signal word, hazard statements and pictograms.", "Read the label before you use a chemical. Do not use anything from an unlabeled container: ask your supervisor.", "Wear the protective equipment the SDS calls for, and know where to find first aid steps for each chemical."], lesson_url: null, required_for: "Employees who work with hazardous chemicals", source_label: "29 CFR 1910.1200", source_url: "https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.1200", renew_months: 12, jha_note: null, sort: 2 }
    ],
    course_questions: [
      { course_id: "heat", position: 1, prompt: "When does a job need heat provisions and a written job hazard analysis?", options: ["Only when it is over 105°F", "When most workers in the job are in the heat more than 30 minutes of any 60, not counting breaks", "Whenever any worker is outdoors for more than 10 minutes"] },
      { course_id: "heat", position: 2, prompt: "When you write the job hazard analysis, how should you judge conditions?", options: ["As if workers had no water, rest or shade", "Based on the coolest part of the shift", "Based on how workers say they feel"] },
      { course_id: "heat", position: 3, prompt: "What is the designated person's job?", options: ["Sign the training roster each year", "Monitor conditions and call emergency services if a worker gets sick", "Decide which workers can skip breaks"] },
      { course_id: "heat", position: 4, prompt: "A worker shows signs of severe heat illness (confusion, collapse). What do you do?", options: ["Have them rest in the shade until the shift ends", "Call 911 right away and start cooling them", "Give them water and send them home to recover"] },
      { course_id: "hazcom", position: 1, prompt: "When must Safety Data Sheets be available to employees?", options: ["Only on request, within 30 days", "During every shift, for the chemicals in their work area", "Only during the yearly training"] },
      { course_id: "hazcom", position: 2, prompt: "Which of these must appear on a shipped chemical container's label?", options: ["Product identifier, signal word, hazard statements and pictograms", "Only the brand name", "The purchase date and price"] }
    ],
    document_types: [
      { id: "nscb_license", title: "NSCB contractor license", icon: "id", sort: 1 },
      { id: "state_license", title: "Nevada State Business License", icon: "id", sort: 2 },
      { id: "local_license", title: "City or county business license", icon: "id", sort: 3 },
      { id: "general_liability", title: "General liability certificate", icon: "shield", sort: 4 },
      { id: "workers_comp", title: "Workers' comp policy", icon: "hardhat", sort: 5 },
      { id: "heat_plan", title: "Written heat illness prevention plan", icon: "sun", sort: 6 },
      { id: "safety_program", title: "Written workplace safety program", icon: "doc", sort: 7 },
      { id: "other", title: "Other document", icon: "doc", sort: 99 }
    ],
    documents: [
      { id: "d-nscb", business_id: ROOF, type_id: "nscb_license", label: "C-15", status: "current", expires_on: day(-6), note: null, reviewed_at: stamp(-79), created_at: stamp(-80) },
      { id: "d-heat", business_id: ROOF, type_id: "heat_plan", label: null, status: "requested", expires_on: null, note: "We don't have a copy yet. Requested by NBW.", created_at: stamp(-20) },
      { id: "d-gl", business_id: ROOF, type_id: "general_liability", label: null, status: "current", expires_on: day(19), note: null, reviewed_at: stamp(-79), created_at: stamp(-80) },
      { id: "d-wc", business_id: ROOF, type_id: "workers_comp", label: null, status: "current", expires_on: day(46), note: null, reviewed_at: stamp(-79), created_at: stamp(-80) },
      { id: "d-nlv", business_id: ROOF, type_id: "local_license", label: "North Las Vegas", status: "under_review", expires_on: day(270), note: null, created_at: stamp(-1) },
      { id: "d-state", business_id: ROOF, type_id: "state_license", label: null, status: "current", expires_on: day(210), note: null, reviewed_at: stamp(-79), created_at: stamp(-80) },
      { id: "d-pool-gl", business_id: POOL, type_id: "general_liability", label: null, status: "under_review", expires_on: day(330), note: null, created_at: stamp(-2) }
    ],
    document_files: [
      { id: "f-nscb", document_id: "d-nscb", business_id: ROOF, storage_path: ROOF + "/docs/s1/NSCB_License_C-15.pdf", file_name: "NSCB License C-15.pdf", size_bytes: 182000, created_at: stamp(-80) },
      { id: "f-gl", document_id: "d-gl", business_id: ROOF, storage_path: ROOF + "/docs/s2/GL_Certificate.pdf", file_name: "GL Certificate.pdf", size_bytes: 96000, created_at: stamp(-80) },
      { id: "f-wc", document_id: "d-wc", business_id: ROOF, storage_path: ROOF + "/docs/s3/Workers_Comp.pdf", file_name: "Workers Comp Policy.pdf", size_bytes: 240000, created_at: stamp(-80) },
      { id: "f-nlv", document_id: "d-nlv", business_id: ROOF, storage_path: ROOF + "/docs/s4/NLV_Business_License.pdf", file_name: "North Las Vegas Business License.pdf", size_bytes: 120000, created_at: stamp(-1) },
      { id: "f-state", document_id: "d-state", business_id: ROOF, storage_path: ROOF + "/docs/s5/State_Business_License.pdf", file_name: "State Business License.pdf", size_bytes: 88000, created_at: stamp(-80) },
      { id: "f-pool", document_id: "d-pool-gl", business_id: POOL, storage_path: POOL + "/docs/s6/Liability_Certificate.pdf", file_name: "Liability Certificate.pdf", size_bytes: 101000, created_at: stamp(-2) }
    ],
    updates: [
      { id: "u1", business_id: ROOF, author_id: STAFF.id, body: "Got your North Las Vegas license. We're checking it against the city's records and will add it to your file.", created_at: stamp(-1) },
      { id: "u2", business_id: ROOF, author_id: STAFF.id, body: "Your heat illness rule applies to roofing crews. Please send us your written heat plan when you can.", created_at: stamp(-20) }
    ]
  };
  db.orders = [];
  db.packages = [
    { id: "heat_plan", title: "Heat Plan", summary: "For 11 to 25 employees. We do your hazard analysis, write your heat plan, set up your designated person and train one crew.", price_cents: 120000, client_price_cents: 102000, billing: "one_time", done_for_you: true, max_employees: 25, active: true, sort: 1 },
    { id: "full_program", title: "Full Safety Program + Heat Plan", summary: "Everything in the Heat Plan, plus a complete written safety program, injury reporting steps, safety committee setup (26+ employees) and two trainings.", price_cents: 240000, client_price_cents: 204000, billing: "one_time", done_for_you: true, max_employees: null, active: true, sort: 2 },
    { id: "stay_ready", title: "Stay Ready", summary: "A spring review before summer, yearly refresher training, new-hire materials and updates when Nevada rules change.", price_cents: 20000, client_price_cents: 17000, billing: "monthly", done_for_you: true, max_employees: null, active: true, sort: 3 },
    { id: "extra_training", title: "Extra training session", summary: "One more crew training session, in English or Spanish.", price_cents: 30000, client_price_cents: 25500, billing: "per_session", done_for_you: true, max_employees: null, active: true, sort: 4 },
    { id: "kit_review", title: "Kit + Expert Review", summary: "Our fill-in safety program and heat plan kit, plus we review your finished draft and walk you through fixes.", price_cents: 39900, client_price_cents: 33900, billing: "one_time", done_for_you: false, max_employees: null, active: true, sort: 5 },
    { id: "diy_kit", title: "DIY Compliance Kit", summary: "Fill-in safety program and heat plan, hazard worksheet, forms, English and Spanish handouts and step-by-step instructions.", price_cents: 19900, client_price_cents: 16900, billing: "one_time", done_for_you: false, max_employees: null, active: true, sort: 6 }
  ];
  const ANSWERS = { heat: [1, 0, 1, 1], hazcom: [1, 0] };
  const blobs = {};  // storage path -> uploaded file

  // ---------------------------------------------------------------------------
  // Client
  // ---------------------------------------------------------------------------
  let session = { user: clone(OWNER) };
  const listeners = [];
  const emit = ev => listeners.forEach(cb => cb(ev, session));
  const isStaff = () => !!session && session.user.id === STAFF.id;
  const myBusiness = () => session && db.businesses.find(b => b.owner_id === session.user.id);

  function builder(table) {
    const q = { op: "select", filters: [], orderBy: null, returning: false, single: null };
    function run() {
      let rows = db[table];
      // Mirror the database's access rules closely enough for the demo
      if (!isStaff() && session) {
        const biz = myBusiness();
        const bid = biz && biz.id;
        if (table === "businesses") rows = rows.filter(r => r.owner_id === session.user.id);
        else if (table === "attestations") rows = rows.filter(r => db.employees.some(e => e.id === r.employee_id && e.business_id === bid));
        else if (rows.length && "business_id" in rows[0]) rows = rows.filter(r => r.business_id === bid);
      }
      const match = r => q.filters.every(([c, v]) => r[c] === v);
      let out;
      if (q.op === "insert") {
        const row = Object.assign({ id: uuid(), created_at: new Date().toISOString() }, q.values);
        if (table === "businesses") row.owner_id = session.user.id;
        if (table === "employees" && row.active === undefined) row.active = true;
        if (table === "updates") row.author_id = session.user.id;
        db[table].push(row);
        out = [row];
        if (!q.returning) return { data: null, error: null };
      } else if (q.op === "update") {
        out = rows.filter(match);
        out.forEach(r => Object.assign(r, q.values));
        // Mirror the database's review stamps
        if (isStaff() && table === "documents") out.forEach(r => { r.reviewed_by = session.user.id; r.reviewed_at = new Date().toISOString(); });
        if (isStaff() && table === "orders") out.forEach(r => { r.handled_by = session.user.id; r.handled_at = new Date().toISOString(); });
      } else if (q.op === "delete") {
        out = rows.filter(match);
        db[table] = db[table].filter(r => !out.includes(r));
      } else {
        out = rows.filter(match).slice();
        if (q.orderBy) {
          const [c, asc] = q.orderBy;
          out.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1));
        }
      }
      out = clone(out);
      if (q.single === "maybe") return { data: out[0] || null, error: null };
      if (q.single === "one") return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: "Not found" } };
      return { data: out, error: null };
    }
    const b = {
      select() { if (q.op !== "select") q.returning = true; return b; },
      insert(v) { q.op = "insert"; q.values = v; return b; },
      update(v) { q.op = "update"; q.values = v; return b; },
      delete() { q.op = "delete"; return b; },
      eq(c, v) { q.filters.push([c, v]); return b; },
      order(c, o) { q.orderBy = [c, !o || o.ascending !== false]; return b; },
      maybeSingle() { q.single = "maybe"; return b; },
      single() { q.single = "one"; return b; },
      then(res, rej) { return new Promise(r => setTimeout(r, 120)).then(run).then(res, rej); }
    };
    return b;
  }

  const client = {
    from: builder,
    async rpc(name, args) {
      if (name === "is_staff") return { data: isStaff(), error: null };
      if (name === "submit_check") {
        if (!(args.p_signed_name || "").trim()) return { data: null, error: { message: "The employee must type their name to sign" } };
        const key = ANSWERS[args.p_course_id];
        const wrong = key.filter((a, i) => args.p_answers[i] !== a).length;
        if (wrong) return { data: { passed: false, wrong }, error: null };
        db.attestations.push({ id: uuid(), employee_id: args.p_employee_id, course_id: args.p_course_id, completed_on: TODAY, signed_name: args.p_signed_name.trim() });
        const due = new Date(TODAY + "T12:00:00Z");
        due.setUTCFullYear(due.getUTCFullYear() + 1);
        return { data: { passed: true, wrong: 0, completed_on: TODAY, due_on: due.toISOString().slice(0, 10) }, error: null };
      }
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
        const biz = myBusiness();
        let doc = args.p_document_id && db.documents.find(d => d.id === args.p_document_id && d.business_id === biz.id);
        if (doc) {
          doc.status = "under_review";
          doc.reviewed_by = null;
          doc.reviewed_at = null;
          if (args.p_expires_on) doc.expires_on = args.p_expires_on;
        } else {
          doc = { id: uuid(), business_id: biz.id, type_id: args.p_type_id, label: (args.p_label || "").trim() || null, status: "under_review", expires_on: args.p_expires_on, note: null, created_at: new Date().toISOString() };
          db.documents.push(doc);
        }
        db.document_files.push({ id: uuid(), document_id: doc.id, business_id: biz.id, storage_path: args.p_storage_path, file_name: args.p_file_name, size_bytes: args.p_size_bytes, created_at: new Date().toISOString() });
        return { data: doc.id, error: null };
      }
      return { data: null, error: { message: "Not available in the demo" } };
    },
    storage: {
      from() {
        return {
          async upload(path, file) { blobs[path] = file; return { data: { path }, error: null }; },
          async createSignedUrl(path) {
            const file = db.document_files.concat(db.training_files).find(f => f.storage_path === path);
            const blob = blobs[path] || samplePdf("Sample document", [
              file ? file.file_name : "Example file",
              "This is a placeholder in the Nevada Business Watch demo.",
              "In the real Business File, this is the client's uploaded copy."
            ]);
            return { data: { signedUrl: URL.createObjectURL(blob) }, error: null };
          },
          async remove(paths) { paths.forEach(p => delete blobs[p]); return { data: [], error: null }; }
        };
      }
    },
    auth: {
      onAuthStateChange(cb) { listeners.push(cb); setTimeout(() => cb("INITIAL_SESSION", session), 0); return { data: { subscription: { unsubscribe() {} } } }; },
      async signInWithPassword({ email }) {
        session = { user: clone(/nbw|nevadabusinesswatch/i.test(email) ? STAFF : OWNER) };
        emit("SIGNED_IN");
        return { data: { session }, error: null };
      },
      async signUp() { return { data: { user: null, session: null }, error: { message: "Sign-up is turned off in the demo. Sign in with any email and password." } }; },
      async signOut() { session = null; emit("SIGNED_OUT"); return { error: null }; },
      async resetPasswordForEmail() { return { data: {}, error: null }; },
      async updateUser() { return { data: {}, error: null }; }
    }
  };

  window.supabase = { createClient: () => client };

  // ---------------------------------------------------------------------------
  // Demo bar: switch between the client's and NBW's view
  // ---------------------------------------------------------------------------
  function viewAs(role) {
    session = { user: clone(role === "staff" ? STAFF : OWNER) };
    emit("SIGNED_IN");
    syncBar();
    scrollTo(0, 0);
  }
  function syncBar() {
    document.querySelectorAll("[data-demo-view]").forEach(btn => {
      const on = session && (btn.dataset.demoView === "staff") === isStaff();
      btn.classList.toggle("on", !!on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  document.addEventListener("click", e => {
    const v = e.target.closest("[data-demo-view]");
    if (v) { viewAs(v.dataset.demoView); return; }
    if (e.target.closest("[data-demo-reset]")) location.reload();
  });
  // Signing out and back in changes who is viewing, so keep the bar in step
  client.auth.onAuthStateChange(() => setTimeout(syncBar, 0));

  // Hosted previews that block downloads and confirm() dialogs set
  // window.DEMO_SANDBOX before this file loads.
  if (window.DEMO_SANDBOX) {
    window.confirm = () => true;  // the demo resets on reload, so deletes are harmless
    let toastTimer = null;
    document.addEventListener("click", e => {
      if (!e.target.closest("[data-action='download-file'], [data-action='export-csv']")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      let toast = document.querySelector(".demo-toast");
      if (!toast) {
        toast = document.createElement("div");
        toast.className = "demo-toast";
        toast.setAttribute("role", "status");
        document.body.appendChild(toast);
      }
      toast.textContent = "Downloads are off in this preview. In the Business File, this saves the file.";
      toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
    }, true);
  }
})();
