import test from "node:test";
import assert from "node:assert/strict";

import {
  ALL_SKINS,
  AI_SKINS,
  ROBOT_SKINS,
  FINISHES,
  SKIN_GROUPS,
  SKIN_STORAGE_KEY,
  DEFAULT_PERSONA_ID,
  DEFAULT_FINISH_ID,
  resolveSkinTheme,
  skinCssVariables,
  normalizeSkinSelection,
  loadSkinSelection,
  saveSkinSelection,
} from "../static/skins.js";

const COLOR_KEYS = [
  "bodyA", "bodyB", "headA", "headB", "outline", "limb", "belly",
  "screenA", "screenB", "face", "blush", "accent", "accentSoft",
  "glow", "aura", "accessory", "accessoryDeep",
];

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
}

test("skin shelf contains 12 AI personas, 12 robots and a finish rack", () => {
  assert.equal(AI_SKINS.length, 12);
  assert.equal(ROBOT_SKINS.length, 12);
  assert.equal(ALL_SKINS.length, 24);
  assert.ok(FINISHES.length >= 8);

  const ids = ALL_SKINS.map((skin) => skin.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(
    SKIN_GROUPS.map((group) => group.id),
    ["ai", "robot"],
  );
});

test("every persona has a valid, complete palette and an accessory", () => {
  for (const skin of ALL_SKINS) {
    assert.ok(["ai", "robot"].includes(skin.category), skin.id);
    assert.ok(skin.name && skin.subtitle, skin.id);
    assert.ok(skin.accessory, skin.id);
    for (const key of COLOR_KEYS) {
      assert.match(skin.colors[key] || "", /^#[0-9a-f]{6}$/i, `${skin.id}.${key}`);
    }
  }
  for (const finish of FINISHES) {
    for (const [key, value] of Object.entries(finish.colors)) {
      assert.ok(COLOR_KEYS.includes(key), `${finish.id}.${key}`);
      assert.match(value, /^#[0-9a-f]{6}$/i, `${finish.id}.${key}`);
    }
  }
});

test("defaults always resolve to a real skin and finish", () => {
  const theme = resolveSkinTheme("not-a-skin", "not-a-finish");
  assert.equal(theme.personaId, DEFAULT_PERSONA_ID);
  assert.equal(theme.finishId, DEFAULT_FINISH_ID);
  assert.equal(theme.accessory, "antenna");

  const normalized = normalizeSkinSelection({ personaId: "momo-cat" });
  assert.deepEqual(normalized, {
    personaId: "momo-cat",
    finishId: DEFAULT_FINISH_ID,
  });
});

test("a finish recolours without stealing the chosen silhouette", () => {
  const theme = resolveSkinTheme("momo-cat", "deepsea");
  assert.equal(theme.accessory, "cat");
  assert.equal(theme.name, "喵机 01");
  assert.equal(theme.finishName, "深海");
  assert.equal(theme.colors.bodyA, "#425f6a");
  assert.equal(theme.colors.accessory, "#3b3334");
});

test("palette maps to the CSS custom properties used by 2D and mini robot", () => {
  const theme = resolveSkinTheme("lingxi-ai", "original");
  const vars = skinCssVariables(theme.colors);
  assert.equal(vars["--skin-body-a"], "#f7fffd");
  assert.equal(vars["--skin-face"], "#7ff5d6");
  assert.equal(vars["--skin-accessory-deep"], "#2ea98f");
  assert.equal(Object.keys(vars).length, COLOR_KEYS.length);
});

test("selection survives a reload and invalid saved data falls back safely", () => {
  const storage = new MemoryStorage();
  const saved = saveSkinSelection({ personaId: "dragon-bot", finishId: "obsidian" }, storage);
  assert.deepEqual(saved, { personaId: "dragon-bot", finishId: "obsidian" });
  assert.deepEqual(loadSkinSelection(storage), saved);

  storage.setItem(SKIN_STORAGE_KEY, "{broken json");
  assert.deepEqual(loadSkinSelection(storage), {
    personaId: DEFAULT_PERSONA_ID,
    finishId: DEFAULT_FINISH_ID,
  });

  storage.setItem(SKIN_STORAGE_KEY, JSON.stringify({ personaId: "gone", finishId: "gone" }));
  assert.deepEqual(loadSkinSelection(storage), {
    personaId: DEFAULT_PERSONA_ID,
    finishId: DEFAULT_FINISH_ID,
  });
});
