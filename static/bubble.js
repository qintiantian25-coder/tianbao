"use strict";

/**
 * tianbao virtual V0.5 - temporary speech bubble with a cancellable typing
 * effect. User text is always written with textContent (never innerHTML).
 * Typing is Unicode-aware (Array.from iterates code points).
 */

const MAX_CHARS = 200;
const PUNCTUATION_PAUSE = new Set([
  "，", "。", "！", "？", "、", "；", "：", "…", "~",
  ",", ".", "!", "?", ";", ":", " ",
]);

/** Split by grapheme when the browser supports it, so emoji stay intact. */
function splitGraphemes(text) {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), (part) => part.segment);
  }
  return Array.from(text);
}

export class SpeechBubble {
  constructor(root) {
    this.root = root;
    this.labelEl = root.querySelector("#bubbleLabel");
    this.textEl = root.querySelector("#bubbleText");
    this.closeBtn = root.querySelector("#bubbleClose");

    this.token = 0;
    this.hideTimer = null;
    this.onClose = null;
    this.onUpdate = null;

    this.motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    this.closeBtn.addEventListener("click", () => {
      this.token += 1;
      this.hide();
      this.closeBtn.blur();
      if (typeof this.onClose === "function") this.onClose();
    });
  }

  get isVisible() {
    return this.root.classList.contains("is-visible");
  }

  get reducedMotion() {
    return this.motionQuery.matches;
  }

  show() {
    this.root.classList.add("is-visible");
    this.root.setAttribute("aria-hidden", "false");
    this.emit();
  }

  hide() {
    this.token += 1;
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.root.classList.remove("is-visible");
    this.root.setAttribute("aria-hidden", "true");
    this.emit();
  }

  setLabel(label) {
    const text = String(label || "").trim();
    this.labelEl.textContent = text;
    this.labelEl.hidden = !text;
    this.emit();
  }

  emit() {
    if (typeof this.onUpdate !== "function") return;
    this.onUpdate({
      label: this.labelEl.textContent,
      text: this.textEl.textContent,
      visible: this.isVisible,
    });
  }

  /**
   * Type a message. Returns true when fully typed, false if cancelled by a
   * newer message / hide.
   *
   * @param {object} options
   * @param {string} options.label   small speaker chip, e.g. "仔仔"
   * @param {string} options.text    body text (plain text only)
   * @param {number} options.charDelay ms per character
   * @param {number} options.autoHideMs hide after typing completes (0 = keep)
   */
  async type({ label = "", text = "", charDelay = 45, autoHideMs = 0 } = {}) {
    const token = ++this.token;
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    this.setLabel(label);
    this.textEl.textContent = "";
    this.show();

    const chars = splitGraphemes(String(text ?? ""));
    const truncated = chars.length > MAX_CHARS;
    const visibleChars = truncated ? chars.slice(0, MAX_CHARS) : chars;

    if (this.reducedMotion) {
      this.textEl.textContent = visibleChars.join("") + (truncated ? "…" : "");
      this.emit();
      this.armAutoHide(token, autoHideMs);
      return true;
    }

    for (let i = 0; i < visibleChars.length; i += 1) {
      if (token !== this.token) return false;
      const char = visibleChars[i];
      this.textEl.textContent += char;
      this.textEl.scrollTop = this.textEl.scrollHeight;
      this.emit();

      let delay = charDelay;
      if (PUNCTUATION_PAUSE.has(char)) delay += 120;
      if (char === "\n") delay += 120;
      await this.sleep(delay);
    }

    if (token !== this.token) return false;
    if (truncated) {
      this.textEl.textContent += "…";
      this.emit();
    }

    this.armAutoHide(token, autoHideMs);
    return true;
  }

  armAutoHide(token, autoHideMs) {
    if (!autoHideMs || autoHideMs <= 0) return;
    this.hideTimer = window.setTimeout(() => {
      if (token !== this.token) return;
      this.hide();
    }, autoHideMs);
  }

  sleep(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }
}
