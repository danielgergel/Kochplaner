import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

test("service worker precaches files that exist and bumps the cache", () => {
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.match(sw, /kochplaner-v14/);
  const block = sw.match(/const CORE = \[([\s\S]*?)\];/);
  assert.ok(block);
  const files = [...block[1].matchAll(/"([^"]+)"/g)].map(m => m[1]).filter(f => f !== "./");
  assert.ok(files.includes("vendor/tesseract/deu.traineddata.gz"));
  assert.ok(files.includes("vendor/firebase/firebase-firestore.js"));
  for (const f of files) assert.ok(fs.existsSync(path.join(root, f)), f);
});

test("app shell does not depend on Google fonts or the old CDNs", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic|jsdelivr|firebasejs/);
  const ocr = fs.readFileSync(path.join(root, "js/ocr.js"), "utf8");
  assert.doesNotMatch(ocr, /jsdelivr|gstatic/);
  assert.match(ocr, /vendor\/tesseract\//);
  const scanner = fs.readFileSync(path.join(root, "js/scanner.js"), "utf8");
  assert.doesNotMatch(scanner, /jsdelivr/);
  assert.match(scanner, /Keine Verbindung zu Open Food Facts/);
  const sync = fs.readFileSync(path.join(root, "js/sync.js"), "utf8");
  assert.doesNotMatch(sync, /gstatic\.com\/firebasejs/);
  assert.match(sync, /persistentLocalCache/);
  const css = fs.readFileSync(path.join(root, "css/app.css"), "utf8");
  assert.match(css, /@font-face/);
  assert.match(css, /barlow-condensed-700\.woff2/);
});
