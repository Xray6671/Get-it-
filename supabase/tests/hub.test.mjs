// Browser test for hub.html against the fake Supabase client.
// Run from the repo root: node supabase/tests/hub.test.mjs
// Needs Playwright (npm i -g playwright) and network access to npm once,
// to fetch the pinned supabase-js file that hub.html loads with an integrity hash.
import { createRequire } from "module";
import { execSync } from "child_process";
import { createServer } from "http";
import { readFileSync, existsSync, mkdtempSync } from "fs";
import { join, extname, resolve } from "path";
import { tmpdir } from "os";
import assert from "assert/strict";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"))); }

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const SB_VERSION = "2.117.2";
const tmp = mkdtempSync(join(tmpdir(), "hubtest-"));
execSync(`npm pack @supabase/supabase-js@${SB_VERSION} --silent`, { cwd: tmp, stdio: "ignore" });
execSync(`tar xzf supabase-supabase-js-${SB_VERSION}.tgz`, { cwd: tmp });
const supabaseJs = readFileSync(join(tmp, "package/dist/umd/supabase.js"));
const fakeConfig = readFileSync(join(ROOT, "supabase/tests/fake-supabase.js"));

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".ico": "image/x-icon" };
const server = createServer((req, res) => {
  const p = join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
}).listen(0);
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {});
const results = [];
const ok = (cond, what) => { assert.ok(cond, what); results.push(what); console.log("ok:", what); };

async function newPage({ config = fakeConfig } = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, acceptDownloads: true });
  page.errors = [];
  page.dialogs = [];
  page.on("pageerror", e => page.errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") page.errors.push(m.text()); });
  page.on("dialog", d => { page.dialogs.push(d.message()); d.accept(); });
  await page.route("https://cdn.jsdelivr.net/**", r => r.fulfill({ body: supabaseJs, contentType: "text/javascript", headers: { "access-control-allow-origin": "*" } }));
  await page.route("**/hub-config.js", r => r.fulfill({ body: config, contentType: "text/javascript" }));
  await page.route("https://fake.supabase.co/**", r => r.fulfill({ body: "file", contentType: "application/pdf", headers: { "content-disposition": "attachment" } }));
  await page.goto(BASE + "/hub.html");
  return page;
}

// Helpers shared by both sessions
async function signUpAndIn(page, email) {
  await page.waitForSelector("#authForm");
  await page.click("[data-auth-mode=signup]");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "longpassword");
  await page.click("#authForm button[type=submit]");
  await page.waitForSelector(".msg-ok");
  await page.fill("input[name=password]", "longpassword");
  await page.click("#authForm button[type=submit]");
}
// Re-runs the app's data load, after seeding the fake database directly
async function reloadData(page, email) {
  await page.click("header [data-action=sign-out]");
  await page.waitForSelector("#authForm");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "longpassword");
  await page.click("#authForm button[type=submit]");
  await page.waitForSelector("main.wrap");
}
const daysFromNow = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

try {
  // ---- not configured ----
  {
    const page = await newPage({ config: "window.HUB_CONFIG = { supabaseUrl: '', supabaseAnonKey: '' };" });
    await page.waitForSelector("text=Hub not set up yet");
    ok(true, "missing config shows setup message");
    ok(page.errors.length === 0, "real supabase-js loads with matching integrity hash: " + page.errors.join(" | "));
    await page.close();
  }

  const page = await newPage();
  const text = async sel => (await page.textContent(sel)) || "";
  const OWNER = "owner@example.com";

  // ---- auth ----
  await page.waitForSelector("#authForm");
  await page.click("[data-auth-mode=signup]");
  await page.fill("input[name=email]", OWNER);
  await page.fill("input[name=password]", "longpassword");
  await page.click("#authForm button[type=submit]");
  await page.waitForSelector(".msg-ok");
  ok((await text(".msg-ok")).includes("Check your email"), "sign-up asks for email confirmation");

  await page.fill("input[name=password]", "wrongpassword");
  await page.click("#authForm button[type=submit]");
  await page.waitForSelector(".msg-err");
  ok((await text(".msg-err")).includes("Invalid login"), "wrong password shows error");
  ok((await page.inputValue("input[name=email]")) === OWNER, "email kept after failed sign-in");

  await page.fill("input[name=password]", "longpassword");
  await page.click("#authForm button[type=submit]");
  await page.waitForSelector("#setupForm");
  ok(true, "sign-in leads to business setup");

  await page.fill("input[name=name]", "Desert Sun <b>Ops</b>");
  await page.fill("input[name=contact_name]", "Marco");
  await page.click("#setupForm button[type=submit]");
  await page.waitForSelector("text=Welcome back, Marco");
  ok((await text("main .kicker")) === "Business File for Desert Sun <b>Ops</b>", "business name shown as plain text");
  ok((await text(".needs")).includes("Add your crew"), "new file prompts to add crew");

  // ---- employees ----
  await page.click("[data-tab=employees]");
  for (const [name, title] of [["Ana Lopez", "Pool tech"], ["<img src=x onerror=alert(1)>", ""], ["=HYPERLINK(\"http://evil\")", "Crew lead"]]) {
    await page.fill("#employeeForm input[name=full_name]", name);
    await page.fill("#employeeForm input[name=job_title]", title);
    await page.click("#employeeForm button[type=submit]");
    await page.waitForFunction(n => document.body.textContent.includes(n), name);
  }
  ok((await page.$$("tbody tr")).length === 3, "three employees added");
  ok(!(await page.$("img[src=x]")) && page.dialogs.length === 0, "HTML in names is not run");

  await page.click("tr:has-text('Crew lead') [data-action=toggle-employee]");
  await page.waitForSelector("text=Show archived (1)");
  ok((await page.$$("tbody tr")).length === 2, "archived employee hidden");
  await page.click("[data-action=toggle-archived]");
  ok((await page.$$("tbody tr")).length === 3, "show archived lists all");
  await page.click("tr:has-text('Crew lead') [data-action=toggle-employee]");
  await page.waitForFunction(() => !document.body.textContent.includes("Archived ("));
  ok(true, "employee restored");

  // ---- training ----
  await page.click("[data-tab=training]");
  ok(!(await page.$("a[href^='javascript']")), "javascript: source link dropped");
  const heatRow = "div.doc-card:has-text('Heat Illness') tr:has-text('Ana Lopez')";
  ok((await text(heatRow)).includes("No record"), "Ana starts with no record");

  await page.click(`${heatRow} [data-action=launch-quiz]`);
  await page.waitForSelector("#quizForm");
  ok((await page.$$("#quizForm fieldset")).length === 4, "heat check shows its 4 questions");
  await page.keyboard.press("Escape");
  ok(!(await page.$(".modal")), "Escape closes the check");

  await page.click(`${heatRow} [data-action=launch-quiz]`);
  for (let p = 1; p <= 4; p++) await page.check(`input[name=q${p}][value="0"]`);
  await page.click("#quizForm button[type=submit]");
  await page.waitForSelector("#quizForm .msg-err");
  ok((await text("#quizForm .msg-err")).includes("3 answers"), "wrong answers rejected with count");

  for (const [p, v] of [[1, 1], [2, 0], [3, 1], [4, 1]]) await page.check(`input[name=q${p}][value="${v}"]`);
  await page.click("#quizForm button[type=submit]");
  await page.waitForSelector(".modal .msg-ok");
  ok((await text(".modal .msg-ok")).includes("Ana Lopez passed"), "correct answers recorded");
  await page.click("[data-action=close-sheet]");
  ok((await text(heatRow)).includes("Current"), "Ana now current for heat");

  const hazRow = "div.doc-card:has-text('Hazard Communication') tr:has-text('Ana Lopez')";
  await page.click(`${hazRow} [data-action=launch-quiz]`);
  ok((await page.$$("#quizForm fieldset")).length === 2, "hazcom check shows its own 2 questions");
  await page.click("[data-action=close-sheet]");

  const [csvDl] = await Promise.all([page.waitForEvent("download"), page.click("[data-action=export-csv]")]);
  const csv = readFileSync(await csvDl.path(), "utf8");
  ok(csv.includes(`"'=HYPERLINK(""http://evil"")"`), "CSV neutralizes formulas");
  ok(csv.split("\r\n").length === 7 && csv.includes('"Ana Lopez","Pool tech","Active","Heat Illness Prevention"'), "CSV has a row per employee and training");

  // ---- training files ----
  await page.selectOption("#uploadForm select[name=employee_id]", { label: "Ana Lopez" });
  await page.setInputFiles("#uploadForm input[type=file]", { name: "virus.exe", mimeType: "application/octet-stream", buffer: Buffer.from("x") });
  await page.click("#uploadForm button[type=submit]");
  await page.waitForSelector("#uploadForm .msg-err");
  ok((await text("#uploadForm .msg-err")).includes("PDF, PNG or JPG"), "wrong file type rejected");
  ok((await page.$eval("#uploadForm select[name=employee_id]", s => s.selectedOptions[0].text)) === "Ana Lopez", "employee choice kept after error");

  await page.setInputFiles("#uploadForm input[type=file]", { name: "heat roster.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(3000, 1) });
  await page.click("#uploadForm button[type=submit]");
  await page.waitForSelector("tr:has-text('heat roster.pdf')");
  const bizId = await page.evaluate(() => window.__fake.db.businesses[0].id);
  let stored = await page.evaluate(() => Object.keys(window.__fake.storage));
  ok(stored.length === 1 && stored[0].startsWith(bizId + "/training/") && stored[0].endsWith("/heat_roster.pdf"), "training file stored in training folder");
  ok((await text("tr:has-text('heat roster.pdf')")).includes("Ana Lopez"), "file linked to employee");

  const [fileDl] = await Promise.all([page.waitForEvent("download"), page.click("[data-action=download-file][data-kind=training]")]);
  ok(fileDl.url().startsWith("https://fake.supabase.co/signed/"), "download uses a signed link");

  await page.click("[data-action=delete-file]");
  await page.waitForSelector("text=No training files yet.");
  ok(page.dialogs.some(d => d.includes("Delete heat roster.pdf")) && (await page.evaluate(() => Object.keys(window.__fake.storage).length)) === 0, "delete confirms and removes stored file");

  // ---- home with training only ----
  await page.click("[data-tab=home]");
  ok((await text(".needs")).includes("5 knowledge checks to do across 3 employees"), "home summarizes training gaps");
  ok((await text(".tile:has-text('Action needed') strong")) === "5" && (await text(".tile:has-text('Current') strong")) === "1", "tiles count training");
  ok((await text(".tab[data-tab=training] .badge")) === "5", "training tab shows gap badge");

  // ---- documents from NBW ----
  await page.evaluate(({ biz, expired, soon, far }) => {
    const db = window.__fake.db;
    const now = new Date().toISOString();
    db.documents.push(
      { id: "d-lic", business_id: biz, type_id: "nscb_license", label: "C-15", status: "current", expires_on: expired, note: null, created_at: now },
      { id: "d-heat", business_id: biz, type_id: "heat_plan", label: null, status: "requested", expires_on: null, note: "We don't have a copy yet. Requested by NBW.", created_at: now },
      { id: "d-gl", business_id: biz, type_id: "general_liability", label: null, status: "current", expires_on: soon, note: null, created_at: now },
      { id: "d-wc", business_id: biz, type_id: "workers_comp", label: null, status: "current", expires_on: far, note: null, created_at: now },
      { id: "d-other", business_id: "someone-else", type_id: "other", label: "Not mine", status: "requested", expires_on: null, note: null, created_at: now }
    );
    db.updates.push({ id: "u1", business_id: biz, body: "Got your <b>North Las Vegas</b> license.", created_at: now });
  }, { biz: bizId, expired: daysFromNow(-6), soon: daysFromNow(19), far: daysFromNow(200) });
  await reloadData(page, OWNER);

  ok((await page.$$(".needs .item")).length === 4, "needs list: 3 documents + training");
  ok((await text(".needs .item:first-child .item-title")) === "NSCB contractor license · C-15", "expired license listed first");
  ok((await text(".needs .item:first-child .item-sub")).includes("6 days past due"), "expired license shows days past due");
  ok((await text(".needs .item:first-child .btn-primary")).includes("Upload this first"), "most urgent item gets primary button");
  ok((await text(".needs")).includes("19 days left") && !(await text(".needs")).includes("Workers"), "renew-soon shown, far-off renewal not");
  ok(!(await text("main")).includes("Not mine"), "another business's document not shown");
  ok((await text(".lede")).startsWith("8 items need you"), "lede counts everything that needs the owner");
  ok((await text(".updates")).includes("Got your <b>North Las Vegas</b> license."), "latest update shown as plain text");
  ok((await text(".tab[data-tab=documents] .badge")) === "2", "documents tab badge counts action items");

  ok(!!(await page.$(".needs .item:has-text('heat illness prevention plan') >> text=We can write it for you")), "missing heat plan offers the done-for-you option");

  // upload to the requested heat plan
  await page.click(".needs .item:has-text('heat illness prevention plan') [data-action=upload-doc]");
  await page.waitForSelector("#docUploadForm");
  ok(!(await page.$("#docUploadForm select[name=type_id]")), "existing document skips type picker");
  await page.setInputFiles("#docUploadForm input[type=file]", { name: "Heat Plan 2026.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(5000, 1) });
  await page.click("#docUploadForm button[type=submit]");
  await page.waitForSelector(".modal .msg-ok");
  ok((await text(".modal .msg-ok")).includes("We'll check it"), "upload confirms it went to NBW");
  await page.click("[data-action=close-sheet]");
  ok((await text(".tile:has-text('Under review') strong")) === "1", "uploaded document now under review");
  stored = await page.evaluate(() => Object.keys(window.__fake.storage));
  ok(stored.some(p => p.startsWith(bizId + "/docs/")), "document stored in docs folder");

  // upload a different document, with a bad file first
  await page.click("button:has-text('Upload a different document')");
  await page.selectOption("#docUploadForm select[name=type_id]", "general_liability");
  await page.fill("#docUploadForm input[name=label]", "2027 renewal");
  await page.fill("#docUploadForm input[name=expires_on]", daysFromNow(365));
  await page.setInputFiles("#docUploadForm input[type=file]", { name: "cert.docx", mimeType: "application/msword", buffer: Buffer.from("x") });
  await page.click("#docUploadForm button[type=submit]");
  await page.waitForSelector("#docUploadForm .msg-err");
  ok((await page.inputValue("#docUploadForm select[name=type_id]")) === "general_liability" && (await page.inputValue("#docUploadForm input[name=label]")) === "2027 renewal", "upload form keeps choices after error");
  await page.setInputFiles("#docUploadForm input[type=file]", { name: "cert.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(800, 1) });
  await page.click("#docUploadForm button[type=submit]");
  await page.waitForSelector(".modal .msg-ok");
  await page.click("[data-action=close-sheet]");

  await page.click("[data-tab=documents]");
  ok((await page.$$(".docs .item")).length === 5, "documents tab lists every document");
  const newDoc = ".docs .item:has-text('2027 renewal')";
  ok((await text(newDoc)).includes("Under review") && !(await page.$(`${newDoc} [data-action=upload-doc]`)), "new document under review, no upload button");
  ok((await text(newDoc)).includes("cert.pdf"), "uploaded file listed on the document");
  const [docDl] = await Promise.all([page.waitForEvent("download"), page.click(`${newDoc} [data-action=download-file]`)]);
  ok(docDl.url().includes(encodeURIComponent(bizId + "/docs/")), "owner can download a document file");

  await page.click("[data-tab=updates]");
  ok((await page.$$(".updates .update")).length === 1, "updates tab lists team messages");

  // ---- done-for-you packages ----
  await page.click("[data-tab=home]");
  ok((await text(".offer")).includes("$1,200") && (await text(".offer")).includes("$1,020"), "home offers packages at the client price");
  await page.click(".offer [data-tab=packages]");
  await page.waitForSelector("text=Heat & safety packages");
  ok((await page.$$(".packages .package")).length === 6, "all six packages listed");
  ok(!(await page.$(".tab.active")), "packages page sits outside the tab bar");
  const heatPkg = ".package[data-package=heat_plan]";
  ok((await text(heatPkg)).includes("50% to start ($510), 50% at delivery."), "done-for-you terms match the site");

  await page.click(`${heatPkg} [data-action=order-package]`);
  await page.waitForSelector("#orderForm");
  ok((await text("#orderForm .summary-list")).includes("$510") && (await text("#orderForm")).includes("No payment now"), "order sheet shows deposit and says nothing is charged");
  await page.fill("#orderForm textarea[name=notes]", "Two sites, Spanish-speaking crew");
  await page.click("#orderForm button[type=submit]");
  await page.waitForSelector(".modal .msg-ok");
  ok((await text(".modal .msg-ok")).includes("invoice for $510"), "confirmation names the deposit");
  await page.click("[data-action=close-sheet]");
  const placed = await page.evaluate(() => window.__fake.db.orders[0]);
  ok(placed.price_cents === 102000 && placed.deposit_cents === 51000 && placed.notes === "Two sites, Spanish-speaking crew", "order stored with server price");
  ok((await text(heatPkg)).includes("You have this order open"), "ordered package can't be ordered twice");
  ok((await text(".orders .order")).includes("Requested"), "order shows as requested");

  await page.click(".package[data-package=diy_kit] [data-action=order-package]");
  await page.click("#orderForm button[type=submit]");
  await page.waitForSelector(".modal .msg-ok");
  await page.click("[data-action=close-sheet]");
  await page.click(".orders .order:has-text('DIY Compliance Kit') [data-action=cancel-order]");
  await page.waitForSelector(".orders .order:has-text('DIY Compliance Kit') >> text=Cancelled");
  ok(true, "owner can cancel an unconfirmed order");

  await page.click("[data-tab=home]");
  ok((await text(".offer")).includes("Heat Plan") && (await text(".offer")).includes("Requested"), "home shows the open order");

  // a crew over 25 gets a quote instead of a price
  await page.evaluate(biz => {
    const db = window.__fake.db;
    db.orders.forEach(o => { if (o.package_id === "heat_plan") o.status = "delivered"; });
    for (let i = 0; i < 25; i++) db.employees.push({ id: "x" + i, business_id: biz, full_name: "Worker " + i, active: true, created_at: new Date().toISOString() });
  }, bizId);
  await reloadData(page, OWNER);
  await page.click(".offer [data-tab=packages]");
  ok((await text(heatPkg)).includes("Your crew list has 28 employees") && (await text(`${heatPkg} [data-action=order-package]`)) === "Request a quote", "big crews are offered a quote");
  ok((await text(".package[data-package=full_program]")).includes("$2,040"), "other packages keep their price");
  await page.click(`${heatPkg} [data-action=order-package]`);
  await page.click("#orderForm button[type=submit]");
  await page.waitForSelector(".modal .msg-ok");
  ok((await text(".modal .msg-ok")).includes("free check and send a quote"), "quote request confirmed");
  ok((await page.evaluate(() => window.__fake.db.orders.at(-1).price_cents)) === null, "quote request has no price");
  await page.click("[data-action=close-sheet]");
  await page.evaluate(() => window.__fake.db.employees.splice(-25));
  await reloadData(page, OWNER);

  // ---- token refresh keeps forms intact ----
  await page.click("[data-tab=employees]");
  await page.fill("#employeeForm input[name=full_name]", "Typing in progress");
  await page.evaluate(() => window.__fakeClientEmit("TOKEN_REFRESHED"));
  await page.waitForTimeout(50);
  ok((await page.inputValue("#employeeForm input[name=full_name]")) === "Typing in progress", "form survives token refresh");

  // ---- layout + sign out ----
  for (const tab of ["home", "documents", "training", "employees", "updates", "packages"]) {
    if (tab === "packages") { await page.click(".tab[data-tab=home]"); await page.click(".offer [data-tab=packages]"); }
    else await page.click(`.tab[data-tab=${tab}]`);
    ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `no sideways scroll on ${tab} at phone width`);
    await page.screenshot({ path: join(tmp, `hub-${tab}.png`), fullPage: true });
  }
  await page.click("header [data-action=sign-out]");
  await page.waitForSelector("#authForm");
  ok(true, "sign out returns to sign-in");
  ok(page.errors.length === 0, "no owner page errors: " + page.errors.join(" | "));
  await page.close();

  // ---- NBW staff ----
  {
    const page = await newPage();
    const text = async sel => (await page.textContent(sel)) || "";
    await page.waitForSelector("#authForm");
    await page.evaluate(({ soon }) => {
      const db = window.__fake.db;
      const now = new Date().toISOString();
      db.businesses.push(
        { id: "b-roof", owner_id: "user-marco@example.com", name: "Desert Ridge Roofing LLC", contact_name: "Marco", created_at: now },
        { id: "b-pool", owner_id: "user-ana@example.com", name: "Blue Pool <i>Service</i>", contact_name: null, created_at: now }
      );
      db.employees.push({ id: "e1", business_id: "b-roof", full_name: "Luis", active: true, created_at: now });
      db.documents.push(
        { id: "d1", business_id: "b-roof", type_id: "nscb_license", label: "C-15", status: "under_review", expires_on: null, note: null, created_at: now },
        { id: "d2", business_id: "b-roof", type_id: "general_liability", label: null, status: "current", expires_on: soon, note: null, created_at: now }
      );
      db.document_files.push({ id: "f1", document_id: "d1", business_id: "b-roof", storage_path: "b-roof/docs/u/license.pdf", file_name: "license.pdf", size_bytes: 4000, created_at: now });
      db.orders.push({ id: "o1", business_id: "b-roof", package_id: "heat_plan", status: "requested", price_cents: 102000, deposit_cents: 51000, notes: "Before June please", staff_note: null, created_by: "user-marco@example.com", created_at: now });
    }, { soon: daysFromNow(10) });
    await signUpAndIn(page, "team@nbw.test");
    await page.waitForSelector("text=Clients");

    ok(!!(await page.$(".staff-chip")) && !(await page.$("#setupForm")) && !(await page.$(".tabbar")), "staff get the client list, not owner setup");
    ok((await text(".lede")) === "1 document waiting for review · 1 new order to confirm.", "staff see review and order queue");
    ok((await text(".clients .item:first-child .item-title")) === "Desert Ridge Roofing LLC", "client with reviews listed first");
    ok((await text(".clients")).includes("Blue Pool <i>Service</i>"), "client names shown as plain text");

    await page.click(".clients .item:first-child [data-action=open-client]");
    await page.waitForSelector("text=All clients");
    const card = ".review-card:has-text('C-15')";
    ok((await text(card)).includes("Under review") && (await text(card)).includes("license.pdf"), "staff see the document and its file");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click(`${card} [data-action=download-file]`)]);
    ok(dl.url().includes(encodeURIComponent("b-roof/docs/u/license.pdf")), "staff can download client files");

    await page.selectOption(`${card} select[name=status]`, "current");
    await page.fill(`${card} input[name=expires_on]`, daysFromNow(300));
    await page.click(`${card} button[type=submit]`);
    await page.waitForFunction(() => window.__fake.db.documents.find(d => d.id === "d1").status === "current");
    ok((await page.evaluate(() => window.__fake.db.documents.find(d => d.id === "d1").status)) === "current", "review saves status");
    ok((await text(".review-card:has-text('C-15')")).includes("Current"), "reviewed document shows current");

    const order = ".order[data-order=o1]";
    ok((await text(order)).includes("Before June please") && (await text(order)).includes("$1,020"), "staff see the order and client notes");
    await page.selectOption(`${order} select[name=status]`, "confirmed");
    await page.fill(`${order} input[name=price]`, "950");
    await page.fill(`${order} input[name=deposit]`, "475");
    await page.fill(`${order} input[name=staff_note]`, "Founding rate. Invoice sent.");
    await page.click(`${order} button[type=submit]`);
    await page.waitForFunction(() => window.__fake.db.orders[0].status === "confirmed");
    const saved = await page.evaluate(() => window.__fake.db.orders[0]);
    ok(saved.price_cents === 95000 && saved.deposit_cents === 47500 && saved.staff_note === "Founding rate. Invoice sent.", "staff confirm and reprice an order");

    await page.selectOption("#requestForm select[name=type_id]", "workers_comp");
    await page.click("#requestForm button[type=submit]");
    await page.waitForSelector(".review-card:has-text(\"Workers' comp\")");
    ok((await text(".review-card:has-text(\"Workers' comp\")")).includes("Action needed"), "request appears as action needed for the client");

    await page.fill("#updateForm textarea", "Got your license. Checking it against NSCB records.");
    await page.click("#updateForm button[type=submit]");
    await page.waitForSelector(".updates .update");
    ok((await page.evaluate(() => window.__fake.db.updates.filter(u => u.business_id === "b-roof").length)) === 1, "update posted to this client only");

    await page.click("[data-action=close-client]");
    ok((await text(".lede")) === "Nothing waiting for review.", "queue empties after review");
    ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "no sideways scroll on staff screens");
    await page.screenshot({ path: join(tmp, "hub-staff.png"), fullPage: true });
    ok(page.errors.length === 0, "no staff page errors: " + page.errors.join(" | "));
    await page.close();
  }

  console.log(`\nALL ${results.length} HUB TESTS PASSED (screenshots in ${tmp})`);
} finally {
  await browser.close();
  server.close();
}
