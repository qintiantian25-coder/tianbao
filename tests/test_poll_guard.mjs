import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCompanionPollResults,
  isInvitationStillRelevant,
} from "../static/poll-guard.js";

const fulfilled = (value) => ({ status: "fulfilled", value });
const rejected = (reason) => ({ status: "rejected", reason });

test("stale poll cannot overwrite a newer session interaction count", () => {
  let session = { is_active: true, interaction_count: 3 };
  const requestUpdates = [];
  const sessionUpdates = [];

  const applied = applyCompanionPollResults({
    epochAtStart: 2,
    currentEpoch: 3,
    requestResult: fulfilled({
      request: { id: 1, action: "interact", status: "responded" },
    }),
    sessionResult: fulfilled({
      is_active: true,
      interaction_count: 2,
    }),
    updateRequest: (data) => requestUpdates.push(data),
    updateSession: (data) => {
      sessionUpdates.push(data);
      session = data;
    },
  });

  assert.equal(applied, false);
  assert.deepEqual(requestUpdates, []);
  assert.deepEqual(sessionUpdates, []);
  assert.equal(session.interaction_count, 3);
});

test("stale poll cannot turn a responded invitation back to pending", () => {
  let request = { id: 1, action: "interact", status: "responded" };
  const requestUpdates = [];

  const applied = applyCompanionPollResults({
    epochAtStart: 4,
    currentEpoch: 5,
    requestResult: fulfilled({
      request: { id: 1, action: "interact", status: "pending" },
    }),
    sessionResult: null,
    updateRequest: (data) => {
      requestUpdates.push(data);
      request = data.request;
    },
    updateSession: () => {},
  });

  assert.equal(applied, false);
  assert.deepEqual(requestUpdates, []);
  assert.equal(request.status, "responded");
});

test("same-epoch poll still applies request and session updates", () => {
  const requestUpdates = [];
  const sessionUpdates = [];

  const applied = applyCompanionPollResults({
    epochAtStart: 6,
    currentEpoch: 6,
    requestResult: fulfilled({
      request: { id: 2, action: "interact", status: "pending" },
    }),
    sessionResult: fulfilled({
      is_active: true,
      interaction_count: 3,
    }),
    updateRequest: (data) => requestUpdates.push(data),
    updateSession: (data) => sessionUpdates.push(data),
  });

  assert.equal(applied, true);
  assert.equal(requestUpdates.length, 1);
  assert.equal(sessionUpdates.length, 1);
  assert.equal(sessionUpdates[0].interaction_count, 3);
});

test("a rejected result does not block the other same-epoch update", () => {
  const requestUpdates = [];
  const sessionUpdates = [];

  const applied = applyCompanionPollResults({
    epochAtStart: 8,
    currentEpoch: 8,
    requestResult: rejected(new Error("network")),
    sessionResult: fulfilled({
      is_active: true,
      interaction_count: 4,
    }),
    updateRequest: (data) => requestUpdates.push(data),
    updateSession: (data) => sessionUpdates.push(data),
  });

  assert.equal(applied, true);
  assert.deepEqual(requestUpdates, []);
  assert.equal(sessionUpdates.length, 1);
  assert.equal(sessionUpdates[0].interaction_count, 4);
});

test("new request applies while old invitation filtering stays correct", () => {
  let request = { id: 1, action: "interact", status: "responded" };

  const applied = applyCompanionPollResults({
    epochAtStart: 9,
    currentEpoch: 9,
    requestResult: fulfilled({
      request: { id: 2, action: "interact", status: "pending" },
    }),
    sessionResult: null,
    updateRequest: (data) => {
      request = data.request;
    },
    updateSession: () => {},
  });

  assert.equal(applied, true);
  assert.equal(request.id, 2);
  assert.equal(request.status, "pending");

  assert.equal(isInvitationStillRelevant("interact", 1, request), false);
  assert.equal(isInvitationStillRelevant("interact", 2, request), true);
  assert.equal(isInvitationStillRelevant("seek_comfort", 2, request), false);
  assert.equal(isInvitationStillRelevant("rest", null, request), true);

  request = { ...request, status: "responded" };
  assert.equal(isInvitationStillRelevant("interact", 2, request), false);
});
