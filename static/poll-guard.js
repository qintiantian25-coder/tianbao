"use strict";

/**
 * Pure helpers for applying polled companion data.
 *
 * Keeping the epoch guard and invitation-relevance check outside the DOM and
 * network code makes out-of-order polling behavior directly testable.
 */

/**
 * Apply request/session results for one poll only if no user action happened
 * after the poll started.
 *
 * @returns {boolean} true when the results were applied.
 */
export function applyCompanionPollResults({
  epochAtStart,
  currentEpoch,
  requestResult,
  sessionResult,
  updateRequest,
  updateSession,
}) {
  if (epochAtStart !== currentEpoch) {
    // A touch (or another user action) started after this poll. Its response
    // already wrote newer request/session data; ignore these stale results.
    return false;
  }

  if (requestResult && requestResult.status === "fulfilled") {
    updateRequest(requestResult.value);
  }

  if (sessionResult && sessionResult.status === "fulfilled") {
    updateSession(sessionResult.value);
  }

  return true;
}

/**
 * Decide whether an invitation event still corresponds to the current
 * companion request. Non-invitation events are always relevant.
 */
export function isInvitationStillRelevant(action, requestId, currentRequest) {
  if (action !== "interact" && action !== "seek_comfort") return true;
  if (!Number.isInteger(requestId)) return true;
  if (!currentRequest) return true;

  const currentId = Number(currentRequest.id);
  if (!Number.isInteger(currentId)) return true;

  if (requestId < currentId) return false;   // replaced/old invitation
  if (requestId > currentId) return true;    // newer request not polled yet

  return currentRequest.status === "pending"
    && currentRequest.action === action;
}
