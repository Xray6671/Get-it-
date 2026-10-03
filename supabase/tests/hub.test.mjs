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

  // ---- auth ----
  await page.waitForSelector("#authForm");
  await page.click("[data-auth-mode=signup]");
  await page.fill("input[name=email]", "owner@example.com");
  await page.fill("input[name=password]", "longpassword");
  await page.click("#authForm button[type=submit]");
  await page.waitForSelector(".msg-ok");
  ok((await text(".msg-ok")).includes("Check your email"), "sign-up asks for email confirmation");

  await page.fill("input[name=email]", "owner@example.com");
  await page.fill("input[name=password]", "wrongpassword");
  await page.click("#authForm button[type=submit]");
  await page.waitForSelector(".msg-err");
  ok((await text(".msg-err")).includes("Invalid login"), "wrong password shows error");

  ok((await page.inputValue("input[name=email]")) === "owner@example.com", "email kept after failed sign-in");
  await page.fill("input[name=password]", "longpassword");
  await page.click("#authForm button[type=submit]");
  await page.waitForSelector("#setupForm");
  ok(true, "sign-in leads to business setup");

  await page.fill("input[name=name]", "Desert Sun <b>Ops</b>");
  await page.click("#setupForm button[type=submit]");
  await page.waitForSelector("text=Get started");
  ok((await text("h1")) === "Desert Sun <b>Ops</b>", "business name shown as plain text");

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
  const heatRow = "div.doc:has-text('Heat Illness') tr:has-text('Ana Lopez')";
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

  const hazRow = "div.doc:has-text('Hazard Communication') tr:has-text('Ana Lopez')";
  await page.click(`${hazRow} [data-action=launch-quiz]`);
  ok((await page.$$("#quizForm fieldset")).length === 2, "hazcom check shows its own 2 questions");
  await page.click("[data-action=close-sheet]");

  // ---- dashboard ----
  await page.click("[data-tab=home]");
  ok((await text(".stat:has-text('Heat Illness') strong")).trim() === "1 / 3", "dashboard counts heat 1 of 3");
  ok((await page.$$("text=Needs attention >> xpath=.. >> tbody tr")).length === 5, "five gaps listed");

  const [csvDl] = await Promise.all([page.waitForEvent("download"), page.click("[data-action=export-csv]")]);
  const csv = readFileSync(await csvDl.path(), "utf8");
  ok(csv.includes(`"'=HYPERLINK(""http://evil"")"`), "CSV neutralizes formulas");
  ok(csv.split("\r\n").length === 7 && csv.includes('"Ana Lopez","Pool tech","Active","Heat Illness Prevention"'), "CSV has a row per employee and training");

  // ---- files ----
  await page.click("[data-tab=files]");
  await page.selectOption("select[name=employee_id]", { label: "Ana Lopez" });
  await page.setInputFiles("input[type=file]", { name: "virus.exe", mimeType: "application/octet-stream", buffer: Buffer.from("x") });
  await page.click("#uploadForm button[type=submit]");
  await page.waitForSelector("#uploadForm .msg-err");
  ok((await text("#uploadForm .msg-err")).includes("PDF, PNG or JPG"), "wrong file type rejected");
  ok((await page.$eval("select[name=employee_id]", s => s.selectedOptions[0].text)) === "Ana Lopez", "employee choice kept after error");

  await page.setInputFiles("input[type=file]", { name: "heat roster.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(3000, 1) });
  await page.click("#uploadForm button[type=submit]");
  await page.waitForSelector("tr:has-text('heat roster.pdf')");
  const stored = await page.evaluate(() => Object.keys(window.__fake.storage));
  const bizId = await page.evaluate(() => window.__fake.db.businesses[0].id);
  ok(stored.length === 1 && stored[0].startsWith(bizId + "/") && stored[0].endsWith("/heat_roster.pdf"), "file stored in business folder");
  ok((await text("tr:has-text('heat roster.pdf')")).includes("Ana Lopez"), "file linked to employee");

  const [fileDl] = await Promise.all([page.waitForEvent("download"), page.click("[data-action=download-file]")]);
  ok(fileDl.url().startsWith("https://fake.supabase.co/signed/"), "download uses a signed link");

  await page.click("[data-action=delete-file]");
  await page.waitForSelector("text=No files yet.");
  ok(page.dialogs.some(d => d.includes("Delete heat roster.pdf")) && (await page.evaluate(() => Object.keys(window.__fake.storage).length)) === 0, "delete confirms and removes stored file");

  // ---- token refresh keeps forms intact ----
  await page.click("[data-tab=employees]");
  await page.fill("#employeeForm input[name=full_name]", "Typing in progress");
  await page.evaluate(() => window.__fakeClientEmit("TOKEN_REFRESHED"));
  await page.waitForTimeout(50);
  ok((await page.inputValue("#employeeForm input[name=full_name]")) === "Typing in progress", "form survives");

  // ---- layout + sign out ----
  for (const tab of ["home", "employees", "training", "files"]) {
    await page.click(`[data-tab=${tab}]`);
    ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `no sideways scroll on ${tab} at phone width`);
    await page.screenshot({ path: join(tmp, `hub-${tab}.png`), fullPage: true });
  }
  await page.click("header [data-action=sign-out]");
  await page.waitForSelector("#authForm");
  ok(true, "sign out returns to sign-in");
  ok(page.errors.length === 0, "no page errors: " + page.errors.join(" | "));

  console.log(`\nALL ${results.length} HUB TESTS PASSED (screenshots in ${tmp})`);
} finally {
  await browser.close();
  server.close();
}
