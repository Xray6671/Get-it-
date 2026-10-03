// Browser tests for My Business File: the demo page, the live app against the
// fake Supabase client, and the staff page.
// Run from the repo root: node supabase/tests/app.test.mjs
// Needs Playwright (npm i -g playwright) and network access to npm once, to
// fetch the pinned supabase-js file the live pages load with an integrity hash.
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
const tmp = mkdtempSync(join(tmpdir(), "apptest-"));
execSync(`npm pack @supabase/supabase-js@${SB_VERSION} --silent`, { cwd: tmp, stdio: "ignore" });
execSync(`tar xzf supabase-supabase-js-${SB_VERSION}.tgz`, { cwd: tmp });
const supabaseJs = readFileSync(join(tmp, "package/dist/umd/supabase.js"));
const fakeConfig = readFileSync(join(ROOT, "supabase/tests/fake-supabase.js"));

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".ico": "image/x-icon", ".png": "image/png" };
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

async function open(path, { config = fakeConfig } = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  page.errors = [];
  page.outside = [];
  // Logged as they happen too, so a CI failure shows the cause
  page.on("pageerror", e => { page.errors.push(e.message); console.log("page error:", e.message); });
  page.on("console", m => { if (m.type() === "error") { page.errors.push(m.text()); console.log("console error:", m.text()); } });
  // The app's Inter font comes from Google Fonts by design; anything else
  // leaving the page is a failure in the demo
  page.on("request", r => { const u = r.url(); if (!u.startsWith(BASE) && !/^(blob|data):|^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u)) page.outside.push(u); });
  await page.route("https://fonts.googleapis.com/**", r => r.fulfill({ body: "", contentType: "text/css" }));
  await page.route("https://cdn.jsdelivr.net/**", r => r.fulfill({ body: supabaseJs, contentType: "text/javascript", headers: { "access-control-allow-origin": "*" } }));
  await page.route("**/business-file-config.js", r => r.fulfill({ body: config, contentType: "text/javascript" }));
  await page.route("https://fake.supabase.co/**", r => r.fulfill({ body: "file", contentType: "application/pdf", headers: { "content-disposition": "attachment" } }));
  await page.goto(BASE + "/" + path);
  page.text = async sel => (await page.textContent(sel)) || "";
  page.noSideScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  return page;
}
async function signIn(page, email) {
  await page.fill("input[type=email]", email);
  await page.click("form button[type=submit]");
  await page.waitForSelector("input[autocomplete=one-time-code]");
  await page.fill("input[autocomplete=one-time-code]", "123456");
  await page.click("form:has(input[autocomplete=one-time-code]) button[type=submit]");
}

try {
  // ======================= demo page =======================
  {
    const page = await open("business-file-demo.html");
    await page.waitForSelector("text=Welcome back, Marco");
    ok((await page.text("#demo-note")).includes("Demo with an example client"), "demo: shows the demo notice");
    await page.click("main [data-tab=safe]");
    ok((await page.text("h1")) === "Health & safety", "demo: Safety tab opens");
    const combos = { "small,no": 0, "mid,yes": 7, "big,no": 4 };
    for (const [k, n] of Object.entries(combos)) {
      const [c, h] = k.split(",");
      await page.click(`[data-crew=${c}]`); await page.click(`[data-heat=${h}]`);
      ok((await page.$$(".req")).length === n, `demo: ${k} lists ${n} requirements`);
    }
    await page.click("[data-crew=mid]"); await page.click("[data-heat=yes]");
    ok((await page.text(".pkg:has(.tag) .price")).includes("$1,020"), "demo: Heat Plan at the 15% client price");
    await page.click("[data-order=heat]");
    await page.click("#o-send");
    await page.waitForSelector(".toast");
    ok((await page.text("main")).includes("Your orders") && !(await page.$("[data-order=heat]")), "demo: order listed, can't be ordered twice");
    // crew training
    ok((await page.$$("#crew .doc")).length === 3, "demo: crew of three listed");
    ok((await page.text("#crew [data-emp=e-luis]")).includes("Heat Illness Prevention: Due soon"), "demo: Luis's heat check due soon");
    await page.click("[data-emp=e-sam]");
    ok((await page.text(".sheet")).includes("No record"), "demo: Sam has no record");
    await page.click(".sheet [data-check=heat]");
    ok((await page.$$(".sheet ol.steps li")).length === 7 && !!(await page.$(".sheet a[href*='lessons.html#s7l1']")), "demo: check opens with the key points");
    for (let q = 1; q <= 4; q++) await page.check(`.sheet input[name=q${q}][value="0"]`);
    await page.check(".sheet input[name=read]");
    await page.click(".sheet button[type=submit]");
    ok((await page.text("#chk-err")) === "", "demo: an unsigned check can't be submitted");
    await page.fill("#chk-sig", "Sam Patel");
    await page.click(".sheet button[type=submit]");
    await page.waitForFunction(() => document.getElementById("chk-err").textContent.includes("3 answers"));
    ok((await page.inputValue("#chk-sig")) === "Sam Patel" && (await page.evaluate(() => document.activeElement.id)) === "chk-err", "demo: wrong answers explained, signature kept, focus on the message");
    for (const [q, v] of [[1, 1], [2, 0], [3, 1], [4, 1]]) await page.check(`.sheet input[name=q${q}][value="${v}"]`);
    await page.check(".sheet input[name=read]");
    await page.click(".sheet button[type=submit]");
    await page.waitForSelector(".toast:has-text('Sam Patel passed Heat Illness Prevention')");
    ok(true, "demo: passing check confirmed");
    await page.click(".sheet [data-close]");
    ok((await page.text("#crew [data-emp=e-sam]")).includes("Heat Illness Prevention: Current"), "demo: Sam now current");
    await page.click("[data-addemp]");
    await page.fill("#emp-name", "Rosa Diaz");
    await page.click("#emp-form button[type=submit]");
    await page.waitForSelector("text=Rosa Diaz");
    ok((await page.$$("#crew .doc")).length === 4, "demo: employee added");
    await page.click("#crew button:has-text('Rosa Diaz')");
    await page.click(".sheet [data-archive]");
    await page.waitForSelector(".toast:has-text('Archived')");
    ok((await page.$$("#crew .doc")).length === 3, "demo: employee archived");
    // Spanish check
    await page.click("#menu"); await page.click("[data-lang=es]"); await page.click("[data-close]");
    await page.click("[data-emp=e-maria]");
    await page.click(".sheet [data-check=hazcom]");
    ok((await page.text(".sheet")).includes("¿Cuándo deben estar disponibles las Hojas de Datos de Seguridad") && (await page.text(".sheet")).includes("Lea la etiqueta antes de usar un químico"), "demo: check in Spanish");
    await page.click(".sheet [data-close]");
    await page.click("#menu"); await page.click("[data-lang=en]"); await page.click("[data-close]");
    ok(!(await page.text("nav.bottom")).includes("undefined"), "demo: tab labels complete");
    ok(await page.noSideScroll(), "demo: no sideways scroll");
    ok(page.outside.length === 0, "demo: sends nothing anywhere except the font request " + page.outside.join(", "));
    ok(page.errors.length === 0, "demo: no page errors");
    await page.close();
  }

  // ======================= live page, before setup =======================
  {
    const page = await open("business-file.html", { config: "window.NBW_CONFIG = { supabaseUrl: '', supabaseAnonKey: '' };" });
    await page.waitForSelector("text=isn't open yet");
    ok(!(await page.text("body")).includes("Marco") && (await page.evaluate(() => document.getElementById("demo-note").hidden)), "live: before setup, shows no example data");
    ok(page.errors.length === 0, "live: real supabase-js loads with its integrity hash");
    await page.close();
  }

  // ======================= live page =======================
  {
    const page = await open("business-file.html");
    await page.waitForSelector("#signin");
    await page.fill("#si-email", "marco@roof.example");
    await page.click("#signin button[type=submit]");
    await page.waitForSelector("#si-code");
    ok((await page.text("#si-msg")).includes("marco@roof.example"), "live: code step explains where the code went");
    await page.fill("#si-code", "000000");
    await page.click("#si-code-form button[type=submit]");
    await page.waitForFunction(() => document.getElementById("si-msg").textContent.includes("didn't work"));
    ok(true, "live: wrong code rejected");
    await page.fill("#si-code", "123456");
    await page.click("#si-code-form button[type=submit]");
    await page.waitForSelector("text=Welcome back, Marco");
    ok((await page.text("main .kicker")) === "Business File for Desert Ridge Roofing LLC", "live: opens the client's own file");
    ok((await page.text(".tile[data-goto=review] b")) === "1", "live: one document under review");

    // upload the requested heat plan
    await page.click("[data-up=d-heat]");
    await page.setInputFiles("#up-file", { name: "Heat Plan.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });
    await page.fill("#up-note", "Signed by owner");
    await page.click("#up-send");
    await page.waitForSelector(".toast");
    await page.waitForFunction(() => document.querySelector(".tile[data-goto=review] b").textContent === "2");
    const stored = await page.evaluate(() => Object.keys(window.__fake.storage));
    ok(stored.length === 1 && stored[0].startsWith("11111111-1111-4111-8111-111111111111/d-heat/"), "live: file stored in the client's folder");
    const ev = await page.evaluate(() => window.__fake.db.document_events.find(e => e.document_id === "d-heat"));
    ok(ev && ev.note === "Signed by owner" && ev.file_name === "Heat Plan.pdf", "live: upload recorded with its note");

    // order the Heat Plan
    await page.click("nav.bottom [data-tab=safe]");
    ok((await page.text(".pkg:has(.tag) .price")).includes("$1,020") && (await page.text(".pkg:has(.tag) .price")).includes("$1,200"), "live: client price uses the client's discount");
    await page.click("[data-order=heat]");
    ok((await page.text(".sheet")).includes("$510"), "live: deposit shown");
    await page.fill("#o-note", "Two sites");
    await page.click("#o-send");
    await page.waitForSelector(".toast");
    await page.waitForSelector("text=Your orders");
    const ord = await page.evaluate(() => window.__fake.db.orders.find(o => o.package_id === "heat"));
    ok(ord && ord.price_cents === 102000 && ord.deposit_cents === 51000 && ord.notes === "Two sites", "live: order priced by the server");
    ok(!(await page.$("[data-order=heat]")) && (await page.text("main")).includes("Requested"), "live: order shows as requested");

    // crew training, live
    ok((await page.$$("#crew .doc")).length === 1, "live: client's crew listed");
    await page.click("[data-addemp]");
    await page.fill("#emp-name", "Ana Ruiz");
    await page.fill("#emp-job", "Laborer");
    await page.click("#emp-form button[type=submit]");
    await page.waitForSelector("#crew :text('Ana Ruiz')");
    const ana = await page.evaluate(() => window.__fake.db.employees.find(e => e.full_name === "Ana Ruiz"));
    ok(ana && ana.client_id === "11111111-1111-4111-8111-111111111111", "live: employee saved to this client");
    await page.click("[data-emp=e-luis]");
    await page.click(".sheet [data-check=heat]");
    await page.check(".sheet input[name=q1][value='0']"); await page.check(".sheet input[name=q2][value='0']");
    await page.check(".sheet input[name=read]");
    await page.fill("#chk-sig", "Luis Ortega");
    await page.click(".sheet button[type=submit]");
    await page.waitForFunction(() => document.getElementById("chk-err").textContent.includes("1 answer is not right"));
    ok(true, "live: server grades the check");
    await page.check(".sheet input[name=q1][value='1']"); await page.check(".sheet input[name=q2][value='0']");
    await page.check(".sheet input[name=read]");
    await page.click(".sheet button[type=submit]");
    await page.waitForSelector(".toast:has-text('passed')");
    const att = await page.evaluate(() => window.__fake.db.attestations.find(a => a.employee_id === "e-luis"));
    ok(att && att.signed_name === "Luis Ortega", "live: signed record saved");
    await page.click(".sheet [data-close]");
    await page.click(`[data-emp="${ana.id}"]`);
    await page.click(".sheet [data-archive]");
    await page.waitForSelector(".toast:has-text('Archived')");
    ok((await page.evaluate(id => window.__fake.db.employees.find(e => e.id === id).active, ana.id)) === false, "live: employee archived, not deleted");

    // Spanish and other modes still work signed in
    await page.click("#menu"); await page.click("[data-lang=es]"); await page.click("[data-close]");
    ok((await page.text("h1")) === "Salud y seguridad" && (await page.text("main")).includes("Solicitado"), "live: Spanish, including order status");
    ok(await page.noSideScroll(), "live: no sideways scroll");
    await page.click("#menu"); await page.click("[data-lang=en]");
    await page.click("#signout");
    await page.waitForSelector("#signin");
    ok(true, "live: sign out returns to sign-in");

    // someone with an account but no file
    await page.fill("#si-email", "nofile@example.com");
    await page.click("#signin button[type=submit]");
    await page.waitForSelector("#si-code");
    await page.fill("#si-code", "123456");
    await page.click("#si-code-form button[type=submit]");
    await page.waitForSelector("text=isn't set up yet");
    ok(!(await page.text("body")).includes("Desert Ridge") && !(await page.text("body")).includes("Heat Plan"), "live: a user without a file sees nobody else's data");
    ok(page.errors.length === 0, "live: no page errors");
    await page.close();
  }

  // ======================= staff page =======================
  {
    const page = await open("staff.html");
    await page.waitForSelector("#f-email");
    await signIn(page, "marco@roof.example");
    await page.waitForSelector("text=Staff only");
    ok(true, "staff: clients are turned away");
    await page.click("[data-act=signout]");
    await page.waitForSelector("#f-email");

    await signIn(page, "team@nbw.example");
    await page.waitForSelector("text=Clients");
    ok((await page.text(".lead")) === "1 upload to review · 1 new order to confirm.", "staff: queue summary");
    ok((await page.text("#clients")).includes("Blue Pool <i>Service</i>"), "staff: names shown as plain text");
    ok((await page.text("#clients li:first-child")).includes("Desert Ridge"), "staff: client with work waiting listed first");

    await page.click("[data-open='11111111-1111-4111-8111-111111111111']");
    await page.waitForSelector("text=All clients");
    const card = ".doc-card[data-doc=d-nlv]";
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click(`${card} [data-file]`)]);
    ok(dl.url().includes(encodeURIComponent("11111111-1111-4111-8111-111111111111/d-nlv/")), "staff: can open a client's file");
    await page.fill(`${card} input[name=expires]`, "");
    await page.click(`${card} button[value='1']`);
    await page.waitForFunction(s => document.querySelector(s + " p.err").textContent.includes("expiration date"), card);
    ok(true, "staff: accepting needs an expiration date");
    await page.fill(`${card} input[name=expires]`, "2027-02-20");
    await page.click(`${card} button[value='1']`);
    await page.waitForSelector("text=Accepted. The document is current.");
    const nlv = await page.evaluate(() => window.__fake.db.documents.find(d => d.id === "d-nlv"));
    ok(!nlv.in_review && nlv.expires_on === "2027-02-20", "staff: accept makes it current with the date");

    await page.fill("#r-en", "Workers' comp policy");
    await page.selectOption("#r-cat", "wc");
    await page.click("#f-request button[type=submit]");
    await page.waitForSelector("text=Request sent");
    ok((await page.text("main")).includes("Workers' comp policy"), "staff: request appears on the file");

    await page.fill("#u-en", "Got your license. It's on file.");
    await page.click("#f-update button[type=submit]");
    await page.waitForSelector("text=Update posted.");
    ok((await page.evaluate(() => window.__fake.db.updates.filter(u => u.client_id === "11111111-1111-4111-8111-111111111111").length)) === 2, "staff: update posted to this client");

    await page.fill("#a-email", "stranger@example.com");
    await page.click("#f-access button[type=submit]");
    await page.waitForSelector("text=There's no account for stranger@example.com");
    ok(true, "staff: unknown email explained");
    await page.fill("#a-email", "office@roof.example");
    await page.click("#f-access button[type=submit]");
    await page.waitForSelector("text=office@roof.example can now open this file.");
    ok((await page.text(".kicker")).includes("2 persons with access") || (await page.text(".kicker")).includes("2 person"), "staff: access added");

    await page.click("[data-act=back]");
    await page.click("[data-open='22222222-2222-4222-8222-222222222222']");
    ok((await page.text("#crew")).includes("Jo Rivera") && (await page.text("#crew")).includes("Heat Illness Prevention: Current") && (await page.text("#crew")).includes("Hazard Communication: No record"), "staff: crew training summary");
    const order = ".order[data-id=o-pool]";
    await page.selectOption(`${order} select[name=status]`, "confirmed");
    await page.fill(`${order} input[name=price]`, "abc");
    await page.click(`${order} button[type=submit]`);
    await page.waitForSelector("text=Enter prices as dollar amounts");
    ok((await page.inputValue(`${order} select[name=status]`)) === "confirmed", "staff: a typing error keeps what was entered");
    await page.fill(`${order} input[name=price]`, "150");
    await page.fill(`${order} input[name=note]`, "Invoice sent.");
    await page.click(`${order} button[type=submit]`);
    await page.waitForSelector("text=Order saved.");
    const o = await page.evaluate(() => window.__fake.db.orders.find(x => x.id === "o-pool"));
    ok(o.status === "confirmed" && o.price_cents === 15000 && o.staff_note === "Invoice sent." && o.handled_by === "u-staff", "staff: order confirmed, repriced and stamped");

    await page.click("[data-act=back]");
    await page.fill("#c-name", "Mesa Electric");
    await page.fill("#c-first", "Rosa");
    await page.selectOption("#c-plan", "Business Watch");
    await page.click("#f-client button[type=submit]");
    await page.waitForSelector("text=Added Mesa Electric");
    const mesa = await page.evaluate(() => window.__fake.db.clients.find(c => c.business_name === "Mesa Electric"));
    ok(mesa && mesa.discount_pct === 15 && (await page.text("h1")) === "Mesa Electric", "staff: new client added with the plan discount");
    ok(await page.noSideScroll(), "staff: no sideways scroll");
    ok(page.errors.length === 0, "staff: no page errors");
    await page.close();
  }

  // the change the staff made shows up for the client
  {
    const page = await open("business-file.html");
    await page.waitForSelector("#signin");
    await page.fill("#si-email", "marco@roof.example");
    await page.click("#signin button[type=submit]");
    await page.waitForSelector("#si-code");
    await page.fill("#si-code", "123456");
    await page.click("#si-code-form button[type=submit]");
    await page.waitForSelector("text=Welcome back, Marco");
    ok(true, "fresh session signs in again");
    await page.close();
  }

  console.log(`\nALL ${results.length} APP TESTS PASSED`);
} finally {
  await browser.close();
  server.close();
}
