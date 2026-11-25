import test from "node:test";
import assert from "node:assert/strict";

import {
  ISO_FURNITURE_INTERACTIONS,
  nearestIsoInteraction,
  nearbyInteractionLabel,
} from "../static/furniture-interactions.js";

test("the 2.5D interaction set contains the five furniture pieces", () => {
  assert.deepEqual(
    ISO_FURNITURE_INTERACTIONS.map((item) => item.id),
    ["sofa", "lamp", "plant", "media", "table"],
  );
  for (const item of ISO_FURNITURE_INTERACTIONS) {
    assert.ok(item.label && item.prompt);
    assert.ok(item.radius > 0);
    assert.ok(item.x >= 10 && item.x <= 90);
    assert.ok(item.y >= 46 && item.y <= 92);
  }
});

test("walking away from every piece yields no interaction prompt", () => {
  assert.equal(nearestIsoInteraction(50, 74), null);
  assert.equal(nearestIsoInteraction(35, 65), null);
  assert.equal(nearestIsoInteraction(NaN, 50), null);
});

test("walking close to a piece selects exactly that interaction", () => {
  assert.equal(nearestIsoInteraction(72, 78)?.id, "sofa");
  assert.equal(nearestIsoInteraction(82, 60)?.id, "lamp");
  assert.equal(nearestIsoInteraction(19, 80)?.id, "plant");
  assert.equal(nearestIsoInteraction(49, 53)?.id, "media");
  assert.equal(nearestIsoInteraction(72, 84)?.id, "table");
});

test("overlapping interaction radii use the closest anchor", () => {
  const nearSofa = nearestIsoInteraction(72, 81);
  assert.equal(nearSofa.id, "sofa");
  const nearTable = nearestIsoInteraction(72, 84.1);
  assert.equal(nearTable.id, "table");
  assert.ok(nearTable.distance < nearSofa.distance);
});

test("prompt text stays explicit about the E key", () => {
  const item = nearestIsoInteraction(72, 78);
  assert.match(nearbyInteractionLabel(item), /按 E/);
  assert.match(nearbyInteractionLabel(null), /无/);
});
