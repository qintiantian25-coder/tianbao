import test from "node:test";
import assert from "node:assert/strict";

import {
  HOME_LAYOUT,
  layoutSummary,
  roomArea,
  roomCenter,
  roomAt,
  createNavigationGrid,
  findPath,
  chargingStateFor,
  distance2D,
} from "../static/home-layout.js";

test("the flat is exactly 200 m² with a horizontal hall and the requested rooms", () => {
  const summary = layoutSummary();
  assert.equal(summary.width, 16);
  assert.equal(summary.depth, 12.5);
  assert.equal(summary.footprint, 200);
  assert.equal(summary.grossArea, 200);
  assert.equal(summary.roomArea, 200);
  assert.equal(summary.bedrooms, 3);
  assert.equal(summary.bathrooms, 2);
  assert.equal(summary.kitchens, 1);
  assert.equal(summary.rooms, 15);
  assert.match(summary.name, /横厅/);
});

test("rooms tile the footprint without overlaps", () => {
  const rooms = HOME_LAYOUT.rooms;
  const area = rooms.reduce((sum, room) => sum + roomArea(room), 0);
  assert.equal(Math.round(area * 100) / 100, 200);

  for (let i = 0; i < rooms.length; i += 1) {
    for (let j = i + 1; j < rooms.length; j += 1) {
      const a = rooms[i];
      const b = rooms[j];
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapZ = Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z);
      assert.ok(
        overlapX <= 0.0001 || overlapZ <= 0.0001,
        `${a.id} overlaps ${b.id}`,
      );
    }
  }
});

test("every room, the charging pad and every piece of furniture is in bounds", () => {
  for (const room of HOME_LAYOUT.rooms) {
    assert.ok(room.x >= 0 && room.z >= 0);
    assert.ok(room.x + room.w <= HOME_LAYOUT.width);
    assert.ok(room.z + room.d <= HOME_LAYOUT.depth);
  }

  const pad = HOME_LAYOUT.charging;
  assert.ok(pad.x > 0 && pad.x < HOME_LAYOUT.width);
  assert.ok(pad.z > 0 && pad.z < HOME_LAYOUT.depth);
  assert.equal(roomAt(pad.x, pad.z)?.id, "living");

  for (const item of HOME_LAYOUT.furniture) {
    assert.equal(
      roomAt(item.x, item.z)?.id,
      item.room,
      `${item.id} should be inside ${item.room}`,
    );
    assert.ok(item.x - item.w / 2 >= 0, `${item.id} west edge`);
    assert.ok(item.x + item.w / 2 <= HOME_LAYOUT.width, `${item.id} east edge`);
    assert.ok(item.z - item.d / 2 >= 0, `${item.id} north edge`);
    assert.ok(item.z + item.d / 2 <= HOME_LAYOUT.depth, `${item.id} south edge`);
  }
});

test("every room is reachable from tianbao's spawn through the door gaps", () => {
  const grid = createNavigationGrid(HOME_LAYOUT);
  for (const room of HOME_LAYOUT.rooms) {
    const target = roomCenter(room);
    const path = findPath(grid, HOME_LAYOUT.robotSpawn, target);
    assert.ok(path && path.length > 0, `no path into ${room.id}`);
  }

  const toCharger = findPath(grid, HOME_LAYOUT.robotSpawn, HOME_LAYOUT.charging);
  assert.ok(toCharger && toCharger.length > 1);
  assert.ok(
    distance2D(
      toCharger[toCharger.length - 1].x,
      toCharger[toCharger.length - 1].z,
      HOME_LAYOUT.charging.x,
      HOME_LAYOUT.charging.z,
    ) < 1.2,
  );
});

test("charging state labels cover approach, docked, charging and full", () => {
  assert.equal(chargingStateFor({ energy: 18 }).phase, "low");
  assert.equal(chargingStateFor({ energy: 18, docked: true }).phase, "docked");
  assert.equal(
    chargingStateFor({ energy: 52, docked: true, charging: true }).phase,
    "charging",
  );
  assert.equal(
    chargingStateFor({ energy: 100, docked: true, charging: true }).phase,
    "full",
  );
  assert.equal(chargingStateFor({ energy: 67 }).percent, 67);
});
