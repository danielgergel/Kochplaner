import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import * as firestore from "../vendor/firebase/firebase-firestore.js";

function names(block){
  return block.split(",").map(s => s.trim()).filter(Boolean);
}

test("initFirebase übergibt nur importierte Firestore-Funktionen", () => {
  const src = fs.readFileSync(new URL("../js/sync.js", import.meta.url), "utf8");
  const imported = src.match(/const \{([^}]+)\} = await import\("\.\.\/vendor\/firebase\/firebase-firestore\.js"\)/);
  const assigned = src.match(/FB = \{([^}]+)\}/);
  assert.ok(imported && assigned);
  const have = new Set(names(imported[1]));
  const init = src.slice(src.indexOf("export async function initFirebase"));
  assert.match(init, /console\.error/);
  assert.doesNotMatch(init, /catch \(e\) \{\s*\}/);
  for (const name of names(assigned[1])) {
    if (name === "db") continue;
    assert.ok(have.has(name), name + " steht auf FB, wird aber nicht importiert");
    assert.equal(typeof firestore[name], "function", name);
  }
  const share = fs.readFileSync(new URL("../js/share.js", import.meta.url), "utf8");
  const used = new Set([...share.matchAll(/\bfb\.([A-Za-z]+)/g)].map(m => m[1]));
  const provided = new Set(names(assigned[1]));
  for (const name of used) {
    assert.ok(provided.has(name), "share.js nutzt fb." + name);
  }
  for (const file of ["js/sync.js", "js/share.js"]) {
    const check = spawnSync(process.execPath, ["--check", file], { cwd: new URL("..", import.meta.url) });
    assert.equal(check.status, 0, file + "\n" + check.stderr);
  }
});
