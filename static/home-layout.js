"use strict";

/**
 * Pure data + geometry helpers for tianbao's 200 m² home.
 *
 * Coordinates are in metres, with x running west -> east and z running
 * north -> south. The renderer and the navigation grid both consume the same
 * layout, so room labels, camera presets, furniture and walkable space cannot
 * drift apart.
 *
 * All rooms tile the 16 × 12.5 m footprint exactly. The gross footprint is
 * 200 m²; internal floor areas also sum to 200 m² (wall thickness is drawn
 * visually and ignored for the area calculation).
 */

export const HOME_LAYOUT = {
  id: "tianbao-200-flat",
  name: "横厅三室 · 200m² 大平层",
  width: 16,
  depth: 12.5,
  grossArea: 200,
  wallHeight: 2.7,
  rooms: [
    {
      id: "living",
      name: "横厅 · 客厅",
      short: "横厅",
      type: "living",
      x: 0, z: 6, w: 6.8, d: 6.5,
      floor: "#ece2d3",
      accent: "#d6c0a3",
    },
    {
      id: "dining",
      name: "横厅 · 餐区",
      short: "餐区",
      type: "dining",
      x: 6.8, z: 6, w: 3.2, d: 3.2,
      floor: "#eee5d8",
      accent: "#d8c3a6",
    },
    {
      id: "kitchen",
      name: "厨房",
      short: "厨房",
      type: "kitchen",
      x: 10, z: 6, w: 3.2, d: 3.2,
      floor: "#e2e8e2",
      accent: "#b9cbbd",
    },
    {
      id: "laundry",
      name: "家政间",
      short: "家政",
      type: "utility",
      x: 13.2, z: 6, w: 2.8, d: 3.2,
      floor: "#e6e6df",
      accent: "#c7c8bb",
    },
    {
      id: "family",
      name: "家庭角",
      short: "家庭角",
      type: "family",
      x: 6.8, z: 9.2, w: 3.2, d: 3.3,
      floor: "#ece3d4",
      accent: "#d7c2a7",
    },
    {
      id: "balcony",
      name: "景观阳台",
      short: "阳台",
      type: "balcony",
      x: 10, z: 9.2, w: 6, d: 3.3,
      floor: "#dde5da",
      accent: "#b5c7b4",
    },
    {
      id: "master",
      name: "主卧",
      short: "主卧",
      type: "bedroom",
      x: 0, z: 0, w: 3.4, d: 6,
      floor: "#e8dfd6",
      accent: "#cdb9a8",
    },
    {
      id: "masterBath",
      name: "主卫",
      short: "主卫",
      type: "bathroom",
      x: 3.4, z: 0, w: 1.8, d: 2.6,
      floor: "#dfe7e7",
      accent: "#b7c9c8",
    },
    {
      id: "closet",
      name: "衣帽间",
      short: "衣帽间",
      type: "closet",
      x: 3.4, z: 2.6, w: 1.8, d: 3.4,
      floor: "#e5ddd4",
      accent: "#c8b7a6",
    },
    {
      id: "bedroom2",
      name: "次卧 · 晨光",
      short: "次卧 A",
      type: "bedroom",
      x: 5.2, z: 0, w: 3.4, d: 4.8,
      floor: "#e4e5dc",
      accent: "#c5c8b7",
    },
    {
      id: "bedroom3",
      name: "次卧 · 云栖",
      short: "次卧 B",
      type: "bedroom",
      x: 8.6, z: 0, w: 3.4, d: 4.8,
      floor: "#e1e4e6",
      accent: "#bdc8cf",
    },
    {
      id: "guestBath",
      name: "客卫",
      short: "客卫",
      type: "bathroom",
      x: 12, z: 0, w: 2, d: 3,
      floor: "#dfe6e4",
      accent: "#b6c9c3",
    },
    {
      id: "storage",
      name: "储藏间",
      short: "储藏",
      type: "storage",
      x: 14, z: 0, w: 2, d: 3,
      floor: "#e7e1d7",
      accent: "#c9beaf",
    },
    {
      id: "hall",
      name: "走廊",
      short: "走廊",
      type: "hall",
      x: 5.2, z: 4.8, w: 6.8, d: 1.2,
      floor: "#e9e1d5",
      accent: "#d2c3af",
    },
    {
      id: "foyer",
      name: "玄关",
      short: "玄关",
      type: "entry",
      x: 12, z: 3, w: 4, d: 3,
      floor: "#eae2d7",
      accent: "#d0bfa9",
    },
  ],

  /**
   * Wall segments leave explicit gaps for doors. The 3D builder and the
   * navigation grid use the same list, so a doorway that looks open is also
   * walkable.
   */
  walls: [
    // Exterior shell. South side is mostly glazing.
    { x1: 0, z1: 0, x2: 16, z2: 0, kind: "wall", exterior: true },
    { x1: 0, z1: 0, x2: 0, z2: 12.5, kind: "wall", exterior: true },
    { x1: 0, z1: 12.5, x2: 0.2, z2: 12.5, kind: "wall", exterior: true },
    { x1: 0.2, z1: 12.5, x2: 6.6, z2: 12.5, kind: "glass", exterior: true },
    { x1: 6.6, z1: 12.5, x2: 7, z2: 12.5, kind: "wall", exterior: true },
    { x1: 7, z1: 12.5, x2: 9.6, z2: 12.5, kind: "glass", exterior: true },
    { x1: 9.6, z1: 12.5, x2: 10.2, z2: 12.5, kind: "wall", exterior: true },
    { x1: 10.2, z1: 12.5, x2: 15.8, z2: 12.5, kind: "glass", exterior: true },
    { x1: 15.8, z1: 12.5, x2: 16, z2: 12.5, kind: "wall", exterior: true },
    { x1: 16, z1: 0, x2: 16, z2: 4.2, kind: "wall", exterior: true },
    // East entry door gap: 4.2 -> 5.5
    { x1: 16, z1: 5.5, x2: 16, z2: 12.5, kind: "wall", exterior: true },

    // Master suite / private wing.
    { x1: 3.4, z1: 0, x2: 3.4, z2: 1.1, kind: "wall" },
    { x1: 3.4, z1: 2.1, x2: 3.4, z2: 3.9, kind: "wall" },
    { x1: 3.4, z1: 4.9, x2: 3.4, z2: 6, kind: "wall" },
    { x1: 3.4, z1: 2.6, x2: 5.2, z2: 2.6, kind: "wall" },
    { x1: 5.2, z1: 0, x2: 5.2, z2: 4.8, kind: "wall" },
    { x1: 8.6, z1: 0, x2: 8.6, z2: 4.8, kind: "wall" },
    { x1: 12, z1: 0, x2: 12, z2: 4.8, kind: "wall" },
    { x1: 14, z1: 0, x2: 14, z2: 3, kind: "wall" },

    // Hall wall with doors into both secondary bedrooms.
    { x1: 5.2, z1: 4.8, x2: 5.9, z2: 4.8, kind: "wall" },
    { x1: 6.9, z1: 4.8, x2: 9.5, z2: 4.8, kind: "wall" },
    { x1: 10.5, z1: 4.8, x2: 12, z2: 4.8, kind: "wall" },

    // South wall of the private wing: one suite door, a wide opening into
    // the horizontal living hall, kitchen door and laundry door.
    { x1: 0, z1: 6, x2: 4, z2: 6, kind: "wall" },
    { x1: 4.9, z1: 6, x2: 5.6, z2: 6, kind: "wall" },
    { x1: 9.6, z1: 6, x2: 10.4, z2: 6, kind: "wall" },
    { x1: 11.6, z1: 6, x2: 14, z2: 6, kind: "wall" },
    { x1: 15.3, z1: 6, x2: 16, z2: 6, kind: "wall" },

    // Guest bath / storage / foyer.
    { x1: 12, z1: 3, x2: 12.2, z2: 3, kind: "wall" },
    { x1: 13.4, z1: 3, x2: 14.5, z2: 3, kind: "wall" },
    { x1: 15.6, z1: 3, x2: 16, z2: 3, kind: "wall" },

    // Dining / kitchen / laundry partitions.
    { x1: 10, z1: 6, x2: 10, z2: 6.5, kind: "wall" },
    { x1: 10, z1: 7.6, x2: 10, z2: 9.2, kind: "wall" },
    { x1: 13.2, z1: 6, x2: 13.2, z2: 7.3, kind: "wall" },
    { x1: 13.2, z1: 8.4, x2: 13.2, z2: 9.2, kind: "wall" },

    // Balcony glazing with real sliding-door gaps.
    { x1: 10, z1: 9.2, x2: 10, z2: 10.2, kind: "glass" },
    { x1: 10, z1: 11.4, x2: 10, z2: 12.5, kind: "glass" },
    { x1: 10, z1: 9.2, x2: 10.2, z2: 9.2, kind: "wall" },
    { x1: 10.2, z1: 9.2, x2: 11.6, z2: 9.2, kind: "glass" },
    { x1: 12.8, z1: 9.2, x2: 15.8, z2: 9.2, kind: "glass" },
    { x1: 15.8, z1: 9.2, x2: 16, z2: 9.2, kind: "wall" },
  ],

  doors: [
    { x: 3.4, z: 1.6, orientation: "v", width: 1.0 },
    { x: 3.4, z: 4.4, orientation: "v", width: 1.0 },
    { x: 4.45, z: 6, orientation: "h", width: 0.9 },
    { x: 6.4, z: 4.8, orientation: "h", width: 1.0 },
    { x: 10, z: 4.8, orientation: "h", width: 1.0 },
    { x: 11, z: 6, orientation: "h", width: 1.2 },
    { x: 14.65, z: 6, orientation: "h", width: 1.3 },
    { x: 12.8, z: 3, orientation: "h", width: 1.2 },
    { x: 15.05, z: 3, orientation: "h", width: 1.1 },
    { x: 10, z: 7.05, orientation: "v", width: 1.1 },
    { x: 13.2, z: 7.85, orientation: "v", width: 1.1 },
    { x: 16, z: 4.85, orientation: "v", width: 1.3, entry: true },
  ],

  windows: [
    { x1: 0.8, z1: 0.03, x2: 2.6, z2: 0.03, y0: 0.85, y1: 2.2, face: "north" },
    { x1: 5.9, z1: 0.03, x2: 7.8, z2: 0.03, y0: 0.85, y1: 2.2, face: "north" },
    { x1: 9.1, z1: 0.03, x2: 11.1, z2: 0.03, y0: 0.85, y1: 2.2, face: "north" },
    { x1: 0.03, z1: 1.1, x2: 0.03, z2: 3.2, y0: 0.85, y1: 2.2, face: "west" },
    { x1: 0.03, z1: 8.1, x2: 0.03, z2: 11.2, y0: 0.4, y1: 2.35, face: "west" },
    { x1: 15.97, z1: 6.8, x2: 15.97, z2: 8.4, y0: 0.95, y1: 2.1, face: "east" },
  ],

  furniture: [
    // Living hall
    { id: "living-rug", type: "rug", room: "living", x: 3.1, z: 9.5, w: 4.6, d: 3.2, color: "#e7d5c3" },
    { id: "living-sofa", type: "sofa", room: "living", x: 3.05, z: 10.55, w: 3.2, d: 0.95, color: "#c9ddd4" },
    { id: "living-armchair", type: "armchair", room: "living", x: 5.65, z: 9.55, w: 0.85, d: 0.85, rot: Math.PI / 2, color: "#d8c9b8" },
    { id: "living-coffee", type: "coffeeTable", room: "living", x: 3.05, z: 8.95, w: 1.6, d: 0.82, h: 0.38, color: "#b99068" },
    { id: "living-tv-console", type: "consoleTable", room: "living", x: 3.1, z: 6.35, w: 2.5, d: 0.45, h: 0.5, color: "#9f8265" },
    { id: "living-tv", type: "tv", room: "living", x: 3.1, z: 6.17, w: 1.5, d: 0.08, h: 0.86, color: "#26353c" },
    { id: "living-shelf", type: "shelf", room: "living", x: 0.34, z: 8.7, w: 0.42, d: 1.5, h: 1.75, color: "#b49a7b" },
    { id: "living-lamp", type: "floorLamp", room: "living", x: 0.5, z: 11.85, w: 0.34, d: 0.34, h: 1.72, color: "#e7c98c" },
    { id: "living-plant", type: "plant", room: "living", x: 6.35, z: 7.05, w: 0.54, d: 0.54, h: 1.15, color: "#7faf8e" },

    // Dining
    { id: "dining-table", type: "diningTable", room: "dining", x: 8.4, z: 7.7, w: 1.9, d: 1.0, h: 0.75, color: "#a77d55" },
    { id: "dining-chair-1", type: "chair", room: "dining", x: 7.7, z: 7.15, w: 0.42, d: 0.42, rot: 0.12, color: "#c6ae92" },
    { id: "dining-chair-2", type: "chair", room: "dining", x: 8.4, z: 7.05, w: 0.42, d: 0.42, color: "#c6ae92" },
    { id: "dining-chair-3", type: "chair", room: "dining", x: 9.1, z: 7.15, w: 0.42, d: 0.42, rot: -0.12, color: "#c6ae92" },
    { id: "dining-chair-4", type: "chair", room: "dining", x: 7.7, z: 8.25, w: 0.42, d: 0.42, rot: Math.PI, color: "#c6ae92" },
    { id: "dining-chair-5", type: "chair", room: "dining", x: 8.4, z: 8.35, w: 0.42, d: 0.42, rot: Math.PI, color: "#c6ae92" },
    { id: "dining-chair-6", type: "chair", room: "dining", x: 9.1, z: 8.25, w: 0.42, d: 0.42, rot: Math.PI, color: "#c6ae92" },
    { id: "dining-pendant", type: "pendant", room: "dining", x: 8.4, z: 7.7, w: 0.55, d: 0.55, h: 0.4, color: "#f0c98b" },

    // Kitchen
    { id: "kitchen-counter", type: "kitchenCounter", room: "kitchen", x: 11.5, z: 6.37, w: 2.65, d: 0.62, h: 0.92, color: "#cbd8ce" },
    { id: "kitchen-island", type: "kitchenIsland", room: "kitchen", x: 11.45, z: 7.82, w: 1.9, d: 0.9, h: 0.94, color: "#b8c9bb" },
    { id: "kitchen-fridge", type: "fridge", room: "kitchen", x: 12.72, z: 6.55, w: 0.72, d: 0.88, h: 1.92, color: "#dbe2df" },
    { id: "kitchen-stool-1", type: "stool", room: "kitchen", x: 10.95, z: 8.72, w: 0.4, d: 0.4, color: "#b59878" },
    { id: "kitchen-stool-2", type: "stool", room: "kitchen", x: 11.85, z: 8.72, w: 0.4, d: 0.4, color: "#b59878" },

    // Laundry
    { id: "laundry-washer", type: "washer", room: "laundry", x: 13.78, z: 6.55, w: 0.68, d: 0.68, h: 0.95, color: "#e3e6e3" },
    { id: "laundry-dryer", type: "washer", room: "laundry", x: 14.58, z: 6.55, w: 0.68, d: 0.68, h: 0.95, color: "#d9dfdd" },
    { id: "laundry-cabinet", type: "wardrobe", room: "laundry", x: 15.62, z: 7.75, w: 0.48, d: 1.55, h: 1.9, color: "#cfc2ad" },
    { id: "laundry-basket", type: "plant", room: "laundry", x: 13.55, z: 8.65, w: 0.46, d: 0.46, h: 0.7, color: "#c8ad8e" },

    // Family corner
    { id: "family-rug", type: "rug", room: "family", x: 8.1, z: 10.75, w: 2.5, d: 1.8, color: "#dfd0bf" },
    { id: "family-desk", type: "desk", room: "family", x: 8.75, z: 9.9, w: 1.42, d: 0.58, h: 0.74, color: "#a9835e" },
    { id: "family-chair", type: "officeChair", room: "family", x: 8.75, z: 10.55, w: 0.48, d: 0.5, color: "#728d86" },
    { id: "family-reading", type: "armchair", room: "family", x: 7.48, z: 11.46, w: 0.84, d: 0.84, rot: 0.65, color: "#c9b8a3" },
    { id: "family-shelf", type: "shelf", room: "family", x: 6.93, z: 10.05, w: 0.36, d: 1.2, h: 1.6, color: "#b09272" },

    // Balcony
    { id: "balcony-lounge", type: "loungeChair", room: "balcony", x: 11.4, z: 11.05, w: 0.72, d: 1.45, rot: 0.18, color: "#b8c7b2" },
    { id: "balcony-table", type: "sideTable", room: "balcony", x: 12.25, z: 10.75, w: 0.48, d: 0.48, h: 0.48, color: "#a78b6d" },
    { id: "balcony-plant-a", type: "plant", room: "balcony", x: 15.12, z: 10.0, w: 0.62, d: 0.62, h: 1.2, color: "#6fa482" },
    { id: "balcony-plant-b", type: "plant", room: "balcony", x: 10.55, z: 12.0, w: 0.58, d: 0.58, h: 1.05, color: "#84b290" },
    { id: "balcony-planter", type: "planter", room: "balcony", x: 14.2, z: 12.1, w: 1.7, d: 0.34, h: 0.55, color: "#9cae9d" },

    // Master bedroom
    { id: "master-rug", type: "rug", room: "master", x: 1.65, z: 3.4, w: 2.6, d: 2.7, color: "#dfd0c2" },
    { id: "master-bed", type: "bed", room: "master", x: 1.65, z: 2.35, w: 2.02, d: 2.1, color: "#d7c8bc" },
    { id: "master-night-a", type: "nightstand", room: "master", x: 0.38, z: 1.2, w: 0.46, d: 0.46, color: "#a98d6f" },
    { id: "master-night-b", type: "nightstand", room: "master", x: 2.92, z: 1.2, w: 0.46, d: 0.46, color: "#a98d6f" },
    { id: "master-bench", type: "bench", room: "master", x: 1.65, z: 4.22, w: 1.45, d: 0.44, color: "#bca68f" },
    { id: "master-reading", type: "armchair", room: "master", x: 2.82, z: 5.18, w: 0.78, d: 0.78, rot: -0.6, color: "#cbb9a7" },

    // Master bath
    { id: "master-bath-tub", type: "bathtub", room: "masterBath", x: 4.55, z: 1.22, w: 0.86, d: 1.55, color: "#dfe8e7" },
    { id: "master-bath-sink", type: "sink", room: "masterBath", x: 3.85, z: 2.25, w: 0.66, d: 0.4, color: "#d3dfde" },
    { id: "master-bath-toilet", type: "toilet", room: "masterBath", x: 4.68, z: 2.3, w: 0.44, d: 0.52, color: "#e2e8e6" },

    // Walk-in closet
    { id: "closet-wardrobe-west", type: "wardrobe", room: "closet", x: 3.67, z: 3.35, w: 0.48, d: 1.2, h: 2.05, color: "#c5b29c" },
    { id: "closet-island", type: "coffeeTable", room: "closet", x: 4.55, z: 3.3, w: 0.72, d: 0.62, h: 0.85, color: "#aa8e70" },

    // Bedroom 2
    { id: "bed2-rug", type: "rug", room: "bedroom2", x: 6.42, z: 2.85, w: 1.85, d: 1.9, color: "#d8d8c9" },
    { id: "bed2-bed", type: "bed", room: "bedroom2", x: 6.32, z: 1.75, w: 1.66, d: 2.0, color: "#ccd4c3" },
    { id: "bed2-night", type: "nightstand", room: "bedroom2", x: 5.45, z: 0.7, w: 0.4, d: 0.4, color: "#b39a7a" },
    { id: "bed2-desk", type: "desk", room: "bedroom2", x: 7.82, z: 1.05, w: 0.55, d: 1.15, h: 0.74, rot: Math.PI / 2, color: "#a98a64" },
    { id: "bed2-chair", type: "officeChair", room: "bedroom2", x: 7.12, z: 1.05, w: 0.45, d: 0.45, color: "#7f9687" },
    { id: "bed2-wardrobe", type: "wardrobe", room: "bedroom2", x: 7.98, z: 3.9, w: 0.54, d: 1.12, h: 1.95, color: "#c2b39e" },

    // Bedroom 3
    { id: "bed3-rug", type: "rug", room: "bedroom3", x: 10.15, z: 2.85, w: 1.85, d: 1.9, color: "#d5dadd" },
    { id: "bed3-bed", type: "bed", room: "bedroom3", x: 10.15, z: 1.75, w: 1.66, d: 2.0, color: "#cbd2d8" },
    { id: "bed3-night-a", type: "nightstand", room: "bedroom3", x: 9.28, z: 0.7, w: 0.4, d: 0.4, color: "#b39a7a" },
    { id: "bed3-night-b", type: "nightstand", room: "bedroom3", x: 11.02, z: 0.7, w: 0.4, d: 0.4, color: "#b39a7a" },
    { id: "bed3-desk", type: "desk", room: "bedroom3", x: 11.52, z: 3.62, w: 1.12, d: 0.54, h: 0.74, color: "#a98a64" },
    { id: "bed3-chair", type: "officeChair", room: "bedroom3", x: 11.32, z: 4.3, w: 0.44, d: 0.44, color: "#839698" },
    { id: "bed3-wardrobe", type: "wardrobe", room: "bedroom3", x: 8.92, z: 3.82, w: 0.5, d: 1.16, h: 1.9, color: "#c4b39e" },

    // Guest bathroom
    { id: "guest-shower", type: "shower", room: "guestBath", x: 13.45, z: 0.78, w: 0.84, d: 1.2, h: 1.95, color: "#d7e3e1" },
    { id: "guest-sink", type: "sink", room: "guestBath", x: 12.55, z: 2.32, w: 0.72, d: 0.42, color: "#d7e2df" },
    { id: "guest-toilet", type: "toilet", room: "guestBath", x: 13.48, z: 2.33, w: 0.44, d: 0.52, color: "#e2e8e6" },

    // Storage
    { id: "storage-shelf-a", type: "shelf", room: "storage", x: 14.42, z: 0.65, w: 0.45, d: 1.2, h: 1.9, color: "#b7a58e" },
    { id: "storage-shelf-b", type: "shelf", room: "storage", x: 15.48, z: 1.55, w: 0.45, d: 1.35, h: 1.9, color: "#b7a58e" },

    // Hall + foyer
    { id: "hall-runner", type: "rug", room: "hall", x: 8.55, z: 5.38, w: 4.1, d: 0.72, color: "#d9cbb9" },
    { id: "hall-console", type: "consoleTable", room: "hall", x: 11.35, z: 5.56, w: 0.95, d: 0.3, h: 0.8, color: "#a88c6b" },
    { id: "hall-plant", type: "plant", room: "hall", x: 5.72, z: 5.55, w: 0.42, d: 0.42, h: 0.8, color: "#7aa787" },
    { id: "foyer-rug", type: "rug", room: "foyer", x: 14.0, z: 4.85, w: 1.8, d: 1.8, color: "#ddd0be" },
    { id: "foyer-console", type: "consoleTable", room: "foyer", x: 14.0, z: 5.72, w: 1.35, d: 0.34, h: 0.82, color: "#a68a68" },
    { id: "foyer-bench", type: "bench", room: "foyer", x: 12.95, z: 5.72, w: 0.85, d: 0.38, color: "#b7a188" },
    { id: "foyer-plant", type: "plant", room: "foyer", x: 12.4, z: 3.5, w: 0.46, d: 0.46, h: 0.9, color: "#79a585" },
  ],

  charging: {
    id: "living-charge-pad",
    name: "客厅 · 无线充电座",
    x: 5.85,
    z: 11.55,
    radius: 1.0,
    approach: { x: 5.85, z: 10.35 },
  },

  robotSpawn: { x: 2.55, z: 8.05 },

};


const BATHROOM_TYPES = new Set(["bathroom"]);
const BEDROOM_TYPES = new Set(["bedroom"]);
const NON_BLOCKING_FURNITURE = new Set([
  "rug",
  "pendant",
  "tv",
  "mirror",
  "wallArt",
  "planter",
]);

/** @returns {number} area of one room in m². */
export function roomArea(room) {
  return Number(room.w) * Number(room.d);
}

/** @returns {{x:number,z:number}} centre of a room. */
export function roomCenter(room) {
  return { x: room.x + room.w / 2, z: room.z + room.d / 2 };
}

/** Find the room containing a point. Boundaries belong to the lower index. */
export function roomAt(x, z, layout = HOME_LAYOUT) {
  const px = Number(x);
  const pz = Number(z);
  return layout.rooms.find((room) => (
    px >= room.x && px <= room.x + room.w
    && pz >= room.z && pz <= room.z + room.d
  )) || null;
}

export function roomById(id, layout = HOME_LAYOUT) {
  return layout.rooms.find((room) => room.id === id) || null;
}

export function layoutSummary(layout = HOME_LAYOUT) {
  const area = layout.rooms.reduce((sum, room) => sum + roomArea(room), 0);
  return {
    name: layout.name,
    width: layout.width,
    depth: layout.depth,
    footprint: layout.width * layout.depth,
    grossArea: layout.grossArea,
    roomArea: Math.round(area * 100) / 100,
    bedrooms: layout.rooms.filter((room) => BEDROOM_TYPES.has(room.type)).length,
    bathrooms: layout.rooms.filter((room) => BATHROOM_TYPES.has(room.type)).length,
    kitchens: layout.rooms.filter((room) => room.type === "kitchen").length,
    rooms: layout.rooms.length,
    chargingPad: layout.charging.name,
  };
}

export function distance2D(ax, az, bx, bz) {
  return Math.hypot(Number(ax) - Number(bx), Number(az) - Number(bz));
}

export function isInsidePlan(x, z, layout = HOME_LAYOUT) {
  return x >= 0 && x <= layout.width && z >= 0 && z <= layout.depth;
}

/**
 * Distance from a point to an axis-aligned wall segment.
 * Used by both navigation and hit-avoidance.
 */
export function distanceToSegment(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lengthSq = dx * dx + dz * dz;
  let t = 0;
  if (lengthSq > 0) {
    t = ((px - x1) * dx + (pz - z1) * dz) / lengthSq;
    t = Math.max(0, Math.min(1, t));
  }
  return Math.hypot(px - (x1 + t * dx), pz - (z1 + t * dz));
}

function furnitureBlocks(item) {
  if (NON_BLOCKING_FURNITURE.has(item.type)) return false;
  if (item.blocking === false) return false;
  return true;
}

function markRect(blocked, cols, rows, cell, x, z, w, d, padding = 0) {
  const left = Math.max(0, Math.floor((x - w / 2 - padding) / cell));
  const right = Math.min(cols - 1, Math.floor((x + w / 2 + padding) / cell));
  const top = Math.max(0, Math.floor((z - d / 2 - padding) / cell));
  const bottom = Math.min(rows - 1, Math.floor((z + d / 2 + padding) / cell));
  for (let row = top; row <= bottom; row += 1) {
    for (let col = left; col <= right; col += 1) {
      blocked[row * cols + col] = 1;
    }
  }
}

/**
 * Build a coarse navigation grid. Walls are inflated a little so tianbao's
 * body does not scrape them; furniture is included as blocked footprint.
 */
export function createNavigationGrid(layout = HOME_LAYOUT, {
  cell = 0.22,
  wallClearance = 0.1,
  furniturePadding = 0.05,
} = {}) {
  const cols = Math.floor(layout.width / cell);
  const rows = Math.floor(layout.depth / cell);
  const blocked = new Uint8Array(cols * rows);

  // Walls. Glass counts too: a sliding door gap is simply absent from walls.
  for (const wall of layout.walls) {
    const padding = (wall.thickness || 0.12) / 2 + wallClearance;
    const minX = Math.min(wall.x1, wall.x2) - padding;
    const maxX = Math.max(wall.x1, wall.x2) + padding;
    const minZ = Math.min(wall.z1, wall.z2) - padding;
    const maxZ = Math.max(wall.z1, wall.z2) + padding;
    const left = Math.max(0, Math.floor(minX / cell));
    const right = Math.min(cols - 1, Math.floor(maxX / cell));
    const top = Math.max(0, Math.floor(minZ / cell));
    const bottom = Math.min(rows - 1, Math.floor(maxZ / cell));
    for (let row = top; row <= bottom; row += 1) {
      for (let col = left; col <= right; col += 1) {
        const x = (col + 0.5) * cell;
        const z = (row + 0.5) * cell;
        if (distanceToSegment(x, z, wall.x1, wall.z1, wall.x2, wall.z2) <= padding) {
          blocked[row * cols + col] = 1;
        }
      }
    }
  }

  // Furniture footprints, except rugs / purely decorative items.
  for (const item of layout.furniture) {
    if (!furnitureBlocks(item)) continue;
    markRect(
      blocked, cols, rows, cell,
      item.x, item.z,
      item.w || 0.4,
      item.d || 0.4,
      furniturePadding,
    );
  }

  // Keep a border free of cells that fall outside the flat.
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = (col + 0.5) * cell;
      const z = (row + 0.5) * cell;
      if (!roomAt(x, z, layout)) blocked[row * cols + col] = 1;
    }
  }

  return {
    layout,
    cell,
    cols,
    rows,
    blocked,
    index(col, row) { return row * cols + col; },
    isWalkable(x, z) {
      const col = Math.floor(x / cell);
      const row = Math.floor(z / cell);
      if (col < 0 || row < 0 || col >= cols || row >= rows) return false;
      return blocked[row * cols + col] === 0;
    },
    toCell(x, z) {
      return {
        col: Math.max(0, Math.min(cols - 1, Math.floor(x / cell))),
        row: Math.max(0, Math.min(rows - 1, Math.floor(z / cell))),
      };
    },
    toWorld(col, row) {
      return { x: (col + 0.5) * cell, z: (row + 0.5) * cell };
    },
  };
}

function nearestWalkable(grid, x, z, maxRadius = 1.2) {
  if (grid.isWalkable(x, z)) return { x, z };
  const start = grid.toCell(x, z);
  let best = null;
  let bestDistance = Infinity;
  const maxCellRadius = Math.ceil(maxRadius / grid.cell);
  for (let dr = -maxCellRadius; dr <= maxCellRadius; dr += 1) {
    for (let dc = -maxCellRadius; dc <= maxCellRadius; dc += 1) {
      const col = start.col + dc;
      const row = start.row + dr;
      if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) continue;
      if (grid.blocked[row * grid.cols + col]) continue;
      const world = grid.toWorld(col, row);
      const distance = Math.hypot(world.x - x, world.z - z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = world;
      }
    }
  }
  return best;
}

const NEIGHBOURS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/** A* over the coarse grid. Returns world-space waypoints or null. */
export function findPath(grid, start, goal) {
  const from = nearestWalkable(grid, start.x, start.z);
  const to = nearestWalkable(grid, goal.x, goal.z);
  if (!from || !to) return null;

  const startCell = grid.toCell(from.x, from.z);
  const goalCell = grid.toCell(to.x, to.z);
  const startIndex = grid.index(startCell.col, startCell.row);
  const goalIndex = grid.index(goalCell.col, goalCell.row);
  if (startIndex === goalIndex) return [from, to];

  const total = grid.cols * grid.rows;
  const cost = new Float32Array(total);
  const gScore = new Float32Array(total);
  const cameFrom = new Int32Array(total);
  const visited = new Uint8Array(total);
  cost.fill(Infinity);
  gScore.fill(Infinity);
  cameFrom.fill(-1);

  const open = [];
  const heuristic = (index) => {
    const col = index % grid.cols;
    const row = Math.floor(index / grid.cols);
    return Math.hypot(col - goalCell.col, row - goalCell.row);
  };

  gScore[startIndex] = 0;
  cost[startIndex] = heuristic(startIndex);
  open.push(startIndex);

  while (open.length) {
    let bestAt = 0;
    for (let i = 1; i < open.length; i += 1) {
      if (cost[open[i]] < cost[open[bestAt]]) bestAt = i;
    }
    const current = open.splice(bestAt, 1)[0];
    if (current === goalIndex) break;
    if (visited[current]) continue;
    visited[current] = 1;

    const col = current % grid.cols;
    const row = Math.floor(current / grid.cols);

    for (const [dc, dr, step] of NEIGHBOURS) {
      const nextCol = col + dc;
      const nextRow = row + dr;
      if (nextCol < 0 || nextRow < 0 || nextCol >= grid.cols || nextRow >= grid.rows) {
        continue;
      }
      const nextIndex = grid.index(nextCol, nextRow);
      if (grid.blocked[nextIndex] || visited[nextIndex]) continue;

      // Prevent squeezing diagonally through two wall corners.
      if (dc !== 0 && dr !== 0) {
        if (grid.blocked[grid.index(col + dc, row)]
          || grid.blocked[grid.index(col, row + dr)]) {
          continue;
        }
      }

      const tentative = gScore[current] + step;
      if (tentative >= gScore[nextIndex]) continue;
      cameFrom[nextIndex] = current;
      gScore[nextIndex] = tentative;
      cost[nextIndex] = tentative + heuristic(nextIndex);
      open.push(nextIndex);
    }
  }

  if (startIndex !== goalIndex && cameFrom[goalIndex] === -1) return null;

  const cells = [];
  let cursor = goalIndex;
  while (cursor !== -1) {
    cells.push(cursor);
    if (cursor === startIndex) break;
    cursor = cameFrom[cursor];
  }
  cells.reverse();

  const points = cells.map((index) => {
    const col = index % grid.cols;
    const row = Math.floor(index / grid.cols);
    return grid.toWorld(col, row);
  });

  // Replace the final cell centre by the requested point when it is clear.
  if (grid.isWalkable(to.x, to.z)) points[points.length - 1] = to;

  return points;
}

/**
 * Simple charging helper shared by the 2D and 3D views.
 * approach -> dock -> charge; the actual energy comes from /api/charge.
 */
export function chargingStateFor({
  energy = 0,
  docked = false,
  charging = false,
} = {}) {
  const value = Math.max(0, Math.min(100, Number(energy) || 0));
  const full = value >= 99.95;
  if (charging && docked) {
    return {
      phase: full ? "full" : "charging",
      label: full ? "已充满" : "无线充电中",
      percent: value,
    };
  }
  if (docked) {
    return { phase: "docked", label: "已就位 · 等待充电", percent: value };
  }
  return {
    phase: value <= 25 ? "low" : "idle",
    label: value <= 25 ? "电量偏低 · 建议回充" : "未在充电",
    percent: value,
  };
}
