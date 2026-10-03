// Browser walkthrough of business-file-demo.html (no Supabase involved).
// Run from the repo root: node supabase/tests/demo.test.mjs
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
const tmp = mkdtempSync(join(tmpdir(), "demotest-"));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".ico": "image/x-icon", ".jpg": "image/jpeg" };
const server = createServer((req, res) => {
  const p = join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
}).listen(0);

const browser = await chromium.launch(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {});
const results = [];
const ok = (cond, what) => { assert.ok(cond, what); results.push(what); console.log("ok:", what); };

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const errors = [];
  const requests = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("request", r => { if (!r.url().startsWith(`http://127.0.0.1:${server.address().port}/`) && !r.url().startsWith("blob:")) requests.push(r.url()); });
  page.on("dialog", d => d.accept());
  const text = async sel => (await page.textContent(sel)) || "";

  await page.goto(`http://127.0.0.1:${server.address().port}/business-file-demo.html`);
  await page.waitForSelector("text=Welcome back, Marco");
  ok((await text("main .kicker")) === "Business File for Desert Ridge Roofing LLC", "opens on the example client");
  ok((await text(".needs .item:first-child .item-title")) === "NSCB contractor license · C-15", "expired license first");
  ok((await text(".needs .item:first-child .item-sub")).includes("6 days past due"), "6 days past due, as in the design");
  ok((await text(".needs")).includes("19 days left") && (await text(".needs")).includes("Written heat illness prevention plan"), "renewals and requested plan listed");
  ok((await text(".updates")).includes("North Las Vegas license"), "latest team update shown");
  ok((await text(".tile:has-text('Under review') strong")) === "1", "one document under review");
  await page.screenshot({ path: join(tmp, "1-home.png") });

  // open a sample file
  await page.click("[data-tab=documents]");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("button:has-text('NSCB License C-15.pdf')")]);
  const pdfPath = join(tmp, "sample.pdf");
  await dl.saveAs(pdfPath);
  const pdfText = execSync(`pdftotext "${pdfPath}" -`).toString();
  ok(pdfText.includes("Sample document") && pdfText.includes("NSCB License C-15.pdf"), "sample files open as real PDFs");
  ok(page.url().endsWith("business-file-demo.html"), "downloading doesn't leave the app");

  // client sends the requested heat plan
  await page.click("[data-tab=home]");
  await page.click(".needs .item:has-text('heat illness prevention plan') [data-action=upload-doc]");
  await page.setInputFiles("#docUploadForm input[type=file]", { name: "Heat Plan.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 demo") });
  await page.click("#docUploadForm button[type=submit]");
  await page.waitForSelector(".modal .msg-ok");
  await page.click("[data-action=close-sheet]");
  ok((await text(".tile:has-text('Under review') strong")) === "2", "uploaded plan goes under review");

  // NBW reviews it
  await page.click("[data-demo-view=staff]");
  await page.waitForSelector("text=Clients");
  ok((await text(".lede")) === "3 documents waiting for review.", "staff queue includes the new upload");
  await page.screenshot({ path: join(tmp, "2-staff.png") });
  await page.click(".clients .item:has-text('Desert Ridge') [data-action=open-client]");
  const card = ".review-card:has-text('heat illness prevention plan')";
  ok((await text(card)).includes("Heat Plan.pdf"), "staff see the client's file");
  await page.selectOption(`${card} select[name=status]`, "current");
  await page.click(`${card} button[type=submit]`);
  await page.waitForSelector(`${card}:has-text("Client sees: On file")`);
  await page.fill("#updateForm textarea", "Your heat plan looks good. It's on file.");
  await page.click("#updateForm button[type=submit]");
  await page.waitForSelector("text=Your heat plan looks good");
  ok(true, "staff approve the plan and post an update");

  // back to the client
  await page.click("[data-demo-view=owner]");
  await page.waitForSelector("text=Welcome back, Marco");
  ok(!(await text(".needs")).includes("heat illness prevention plan"), "plan no longer needs the client");
  ok((await text(".updates")).includes("Your heat plan looks good"), "client sees the new update");

  // crew training
  await page.click("[data-tab=training]");
  const samRow = "div.doc-card:has-text('Heat Illness') tr:has-text('Sam Patel')";
  ok((await text("div.doc-card:has-text('Heat Illness') tr:has-text('Luis Ortega')")).includes("Due soon"), "Luis's heat training due soon");
  await page.click(`${samRow} [data-action=launch-quiz]`);
  for (const [p, v] of [[1, 1], [2, 0], [3, 1], [4, 1]]) await page.check(`input[name=q${p}][value="${v}"]`);
  await page.click("#quizForm button[type=submit]");
  await page.waitForSelector(".modal .msg-ok");
  await page.click("[data-action=close-sheet]");
  ok((await text(samRow)).includes("Current"), "knowledge check works in the demo");

  // order the Heat Plan through the app, NBW confirms it
  await page.click(".tab[data-tab=home]");
  await page.click(".offer [data-tab=packages]");
  await page.click(".package[data-package=heat_plan] [data-action=order-package]");
  await page.click("#orderForm button[type=submit]");
  await page.waitForSelector(".modal .msg-ok");
  ok((await text(".modal .msg-ok")).includes("invoice for $510"), "client orders the Heat Plan at the client price");
  await page.click("[data-action=close-sheet]");
  await page.screenshot({ path: join(tmp, "3-packages.png"), fullPage: true });
  await page.click("[data-demo-view=staff]");
  await page.waitForSelector("text=Clients");
  ok((await text(".lede")).includes("1 new order to confirm"), "staff see the new order");
  await page.click(".clients .item:has-text('Desert Ridge') [data-action=open-client]");
  await page.selectOption(".order-form select[name=status]", "confirmed");
  await page.fill(".order-form input[name=staff_note]", "Invoice sent. We'll call to schedule the walkthrough.");
  await page.click(".order-form button[type=submit]");
  await page.waitForSelector(".order:has-text('Confirmed')");
  await page.click("[data-demo-view=owner]");
  await page.waitForSelector("text=Welcome back, Marco");
  ok((await text(".offer")).includes("Confirmed") && (await text(".offer")).includes("schedule the walkthrough"), "client sees the confirmed order");

  for (const tab of ["home", "documents", "training", "employees", "updates"]) {
    await page.click(`[data-tab=${tab}]`);
    ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `no sideways scroll on ${tab}`);
  }

  await page.click("[data-demo-reset]");
  await page.waitForSelector("text=Welcome back, Marco");
  ok((await text(".tile:has-text('Under review') strong")) === "1", "Start over resets the demo");
  ok(requests.length === 0, "demo makes no outside requests: " + requests.join(", "));
  ok(errors.length === 0, "no page errors: " + errors.join(" | "));
  console.log(`\nALL ${results.length} DEMO TESTS PASSED (screenshots in ${tmp})`);
} finally {
  await browser.close();
  server.close();
}
