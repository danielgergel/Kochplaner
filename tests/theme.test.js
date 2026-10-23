import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTheme } from "../js/theme.js";

test("nur auto, hell und dunkel sind gültige Darstellung", () => {
  assert.equal(normalizeTheme("auto"), "auto");
  assert.equal(normalizeTheme("light"), "light");
  assert.equal(normalizeTheme("dark"), "dark");
  assert.equal(normalizeTheme(""), "auto");
  assert.equal(normalizeTheme("blau"), "auto");
  assert.equal(normalizeTheme(null), "auto");
});
