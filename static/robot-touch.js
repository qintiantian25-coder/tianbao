"use strict";

/**
 * tianbao virtual V0.5 - head touch controller.
 *
 * Hold duration is used as a stand-in for touch pressure: it is NOT a real
 * pressure sensor. One press produces exactly one callback on release, which
 * the app controller turns into exactly one POST /api/touch request.
 */

export const MAX_HOLD_MS = 2500;
export const KEYBOARD_TOUCH_AMOUNT = 15;

/** 0-0.5s light, 0.5-1.5s medium, 1.5s+ affectionate. */
export function touchLevelFor(elapsedMs) {
  const ms = Number(elapsedMs) || 0;
  if (ms < 500) return "light";
  if (ms < 1500) return "medium";
  return "affectionate";
}

/**
 * Map hold time to the backend's 1-30 amount.
 * 0-0.5s -> 1-10, 0.5-1.5s -> 11-20, 1.5-2.5s -> 21-30.
 * After 2.5s the amount stays at the maximum; the animation may continue.
 */
export function touchAmountFor(elapsedMs) {
  const ms = Math.max(0, Math.min(MAX_HOLD_MS, Number(elapsedMs) || 0));
  if (ms < 500) return 1 + Math.floor((ms / 500) * 9.999);
  if (ms < 1500) return 11 + Math.floor(((ms - 500) / 1000) * 9.999);
  return 21 + Math.floor(((ms - 1500) / 1000) * 9.999);
}

export class TouchController {
  constructor({ stage, hotzone, hand, onHoverChange, onPointerMove,
    onTouchStart, onTouchLevel, onTouchEnd, onTouchCancel, onFocusChange }) {
    this.stage = stage;
    this.hotzone = hotzone;
    this.hand = hand;
    this.callbacks = {
      onHoverChange: onHoverChange || (() => {}),
      onPointerMove: onPointerMove || (() => {}),
      onTouchStart: onTouchStart || (() => {}),
      onTouchLevel: onTouchLevel || (() => {}),
      onTouchEnd: onTouchEnd || (() => {}),
      onTouchCancel: onTouchCancel || (() => {}),
      onFocusChange: onFocusChange || (() => {}),
    };

    this.activePointerId = null;
    this.pressed = false;
    this.hovering = false;
    this.keyboardActive = false;
    this.lastPointerType = "mouse";
    this.startTime = 0;
    this.currentLevel = null;
    this.levelTimers = [];
    this.keyboardTimer = null;

    this.bind();
  }

  bind() {
    this.hotzone.addEventListener("pointerenter", this.handlePointerEnter);
    this.hotzone.addEventListener("pointerleave", this.handlePointerLeave);
    this.hotzone.addEventListener("pointerdown", this.handlePointerDown);
    this.hotzone.addEventListener("pointermove", this.handlePointerMove);
    this.hotzone.addEventListener("pointerup", this.handlePointerUp);
    this.hotzone.addEventListener("pointercancel", this.handlePointerCancel);
    this.hotzone.addEventListener("lostpointercapture", this.handleLostCapture);
    this.hotzone.addEventListener("contextmenu", this.handleContextMenu);
    this.hotzone.addEventListener("keydown", this.handleKeyDown);
    this.hotzone.addEventListener("focus", this.handleFocus);
    this.hotzone.addEventListener("blur", this.handleBlur);
    this.hotzone.addEventListener("dragstart", (event) => event.preventDefault());

    window.addEventListener("blur", this.handleWindowBlur);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    document.addEventListener("keydown", this.handleDocumentKeyDown);
  }

  /* ---------------- pointer hover ---------------- */

  handlePointerEnter = (event) => {
    if (event.pointerType === "touch") return;
    this.lastPointerType = event.pointerType || "mouse";
    this.hovering = true;
    this.syncHandVisibility();
    this.updateHandPosition(event.clientX, event.clientY);
    this.emitGaze(event.clientX);
    this.callbacks.onHoverChange(true);
  };

  handlePointerLeave = (event) => {
    if (event.pointerType === "touch") return;
    this.hovering = false;
    if (!this.pressed) {
      this.syncHandVisibility();
      this.callbacks.onHoverChange(false);
    }
  };

  handlePointerMove = (event) => {
    if (event.pointerType === "touch") return;
    this.lastPointerType = event.pointerType || "mouse";
    this.updateHandPosition(event.clientX, event.clientY);
    this.syncHandVisibility();
    if (this.hovering) this.emitGaze(event.clientX);
  };

  /* ---------------- press / hold / release ---------------- */

  handlePointerDown = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (this.pressed || this.keyboardActive) return;
    if (this.activePointerId !== null) return;

    event.preventDefault();
    this.activePointerId = event.pointerId;
    this.pressed = true;
    this.startTime = performance.now();
    this.currentLevel = "light";
    this.lastPointerType = event.pointerType || "mouse";
    this.stage.classList.add("is-touching");
    this.syncHandVisibility();
    this.updateHandPosition(event.clientX, event.clientY);

    try {
      this.hotzone.setPointerCapture(event.pointerId);
    } catch {
      /* pointer capture is best-effort */
    }

    this.callbacks.onTouchStart({ level: "light", source: this.lastPointerType });
    this.startLevelTimers();
  };

  handlePointerUp = (event) => {
    if (event.pointerId !== this.activePointerId) return;
    event.preventDefault();
    this.finishPress(true, event);
  };

  handlePointerCancel = () => {
    this.finishPress(false, null);
  };

  handleLostCapture = () => {
    // We release capture ourselves in finishPress; this only catches an
    // unexpected browser-side capture loss (e.g. window switch).
    if (this.pressed) this.finishPress(false, null);
  };

  startLevelTimers() {
    this.clearLevelTimers();
    this.levelTimers.push(window.setTimeout(() => this.setLevel("medium"), 500));
    this.levelTimers.push(window.setTimeout(() => this.setLevel("affectionate"), 1500));
  }

  setLevel(level) {
    if (!this.pressed || this.currentLevel === level) return;
    this.currentLevel = level;
    this.callbacks.onTouchLevel(level);
  }

  clearLevelTimers() {
    for (const timer of this.levelTimers) clearTimeout(timer);
    this.levelTimers = [];
  }

  finishPress(sendEvent, event) {
    if (!this.pressed) return;

    const elapsed = performance.now() - this.startTime;
    const level = touchLevelFor(elapsed);
    const amount = touchAmountFor(elapsed);

    this.pressed = false;
    this.clearLevelTimers();
    this.stage.classList.remove("is-touching");
    this.currentLevel = null;

    const pointerId = this.activePointerId;
    this.activePointerId = null;
    if (pointerId !== null) {
      try {
        this.hotzone.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }
    }

    if (event) {
      this.hovering = this.isPointInside(event.clientX, event.clientY);
    }
    if (!this.hovering && event) this.callbacks.onHoverChange(false);
    this.syncHandVisibility();
    this.hand.classList.remove("is-patting");

    if (!sendEvent) {
      this.callbacks.onTouchCancel();
      return;
    }

    this.callbacks.onTouchEnd({
      amount,
      durationMs: Math.round(elapsed),
      level,
      source: this.lastPointerType,
    });
  }

  /* ---------------- keyboard accessibility ---------------- */

  handleKeyDown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (event.repeat || this.keyboardActive || this.pressed) return;

    this.keyboardActive = true;
    this.stage.classList.add("is-touching");
    this.callbacks.onTouchStart({ level: "medium", source: "keyboard" });
    this.keyboardTimer = window.setTimeout(() => this.endKeyboardTouch(), 900);
  };

  endKeyboardTouch() {
    if (!this.keyboardActive) return;
    this.keyboardActive = false;
    if (this.keyboardTimer) {
      clearTimeout(this.keyboardTimer);
      this.keyboardTimer = null;
    }
    this.stage.classList.remove("is-touching");
    this.callbacks.onTouchEnd({
      amount: KEYBOARD_TOUCH_AMOUNT,
      durationMs: 900,
      level: "medium",
      source: "keyboard",
    });
  }

  cancelKeyboardTouch() {
    if (!this.keyboardActive) return;
    this.keyboardActive = false;
    if (this.keyboardTimer) {
      clearTimeout(this.keyboardTimer);
      this.keyboardTimer = null;
    }
    this.stage.classList.remove("is-touching");
    this.callbacks.onTouchCancel();
  }

  handleFocus = () => this.callbacks.onFocusChange(true);
  handleBlur = () => {
    this.callbacks.onFocusChange(false);
    this.cancelKeyboardTouch();
  };

  /* ---------------- safety resets ---------------- */

  handleContextMenu = (event) => event.preventDefault();

  handleWindowBlur = () => {
    if (this.pressed) this.finishPress(false, null);
    this.cancelKeyboardTouch();
    this.hovering = false;
    this.syncHandVisibility();
    this.callbacks.onHoverChange(false);
    this.hand.classList.remove("is-patting");
  };

  handleVisibilityChange = () => {
    if (document.hidden) {
      if (this.pressed) this.finishPress(false, null);
      this.cancelKeyboardTouch();
      this.hovering = false;
      this.syncHandVisibility();
      this.callbacks.onHoverChange(false);
    }
  };

  handleDocumentKeyDown = (event) => {
    if (event.key !== "Escape") return;
    if (this.pressed) this.finishPress(false, null);
    this.cancelKeyboardTouch();
  };

  /* ---------------- hand + gaze helpers ---------------- */

  isPointInside(clientX, clientY) {
    const rect = this.hotzone.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right
      && clientY >= rect.top && clientY <= rect.bottom;
  }

  emitGaze(clientX) {
    const rect = this.hotzone.getBoundingClientRect();
    if (!rect.width) return;
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.callbacks.onPointerMove({ x: Math.max(-1, Math.min(1, nx)) });
  }

  updateHandPosition(clientX, clientY) {
    if (this.lastPointerType === "touch") return;
    this.hand.style.left = `${clientX}px`;
    this.hand.style.top = `${clientY}px`;
  }

  syncHandVisibility() {
    const isMouseLike = this.lastPointerType !== "touch";
    const visible = isMouseLike && (this.hovering || this.pressed);
    this.hand.classList.toggle("is-visible", visible);
    this.hand.classList.toggle("is-patting", visible && this.pressed);
  }
}
