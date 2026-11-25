"use strict";

/**
 * Proximity-based furniture interactions for the 2.5D room.
 *
 * There are deliberately no mouse-click hotspots. tianbao has to walk close
 * to a piece of furniture; the app then shows an "E" prompt and the owner
 * chooses to interact from the keyboard.
 *
 * Coordinates use the same percentage space as World25D (x/y in %). Anchors
 * sit in front of the visible furniture so they remain reachable inside the
 * room's movement bounds.
 */

export const ISO_FURNITURE_INTERACTIONS = [
  {
    id: "sofa",
    label: "沙发",
    prompt: "和 tianbao 一起窝在沙发上",
    x: 72,
    y: 78,
    radius: 10,
  },
  {
    id: "lamp",
    label: "落地灯",
    prompt: "打开 / 关小落地灯",
    x: 82,
    y: 60,
    radius: 9,
  },
  {
    id: "plant",
    label: "绿植",
    prompt: "给绿植浇水",
    x: 19,
    y: 80,
    radius: 9,
  },
  {
    id: "media",
    label: "唱片机",
    prompt: "一起听一小段唱片",
    x: 49,
    y: 53,
    radius: 10,
  },
  {
    id: "table",
    label: "茶几",
    prompt: "和 tianbao 喝杯热茶",
    x: 72,
    y: 84,
    radius: 10,
  },
];

/**
 * Return the closest nearby interaction, or null.
 * @param {number} x
 * @param {number} y
 * @param {Array} interactions
 * @returns {null | {id:string,label:string,prompt:string,x:number,y:number,radius:number,distance:number}}
 */
export function nearestIsoInteraction(
  x,
  y,
  interactions = ISO_FURNITURE_INTERACTIONS,
) {
  const px = Number(x);
  const py = Number(y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;

  let best = null;
  for (const item of interactions) {
    const distance = Math.hypot(px - item.x, py - item.y);
    if (distance > item.radius) continue;
    if (!best || distance < best.distance) {
      best = { ...item, distance };
    }
  }
  return best;
}

/** Active prompt text for a nearby piece, used by the debug status line. */
export function nearbyInteractionLabel(interaction) {
  if (!interaction) return "附近交互：无";
  return `附近交互：${interaction.label} · 按 E`;
}
