"use strict";

/**
 * tianbao virtual V0.7 - skin catalogue.
 *
 * Every "AI inspiration" character below is an original mascot interpretation
 * of a familiar assistant archetype. No official logo, costume, name or
 * artwork from another product is reproduced. The robot shelf is purely
 * original tianbao costume design.
 *
 * A skin is a palette + a silhouette accessory. A finish is an optional coat
 * that recolours any silhouette without changing its accessory. Keeping this
 * data pure means both 2D and 3D views consume exactly the same palette.
 */

export const DEFAULT_PERSONA_ID = "mint-classic";
export const DEFAULT_FINISH_ID = "original";
export const SKIN_STORAGE_KEY = "tianbao.skin.selection.v1";

export const SKIN_GROUPS = [
  {
    id: "ai",
    name: "AI 灵感",
    eyebrow: "ORIGINAL AI PERSONAS",
    hint: "原创演绎形象 · 致敬对话式 AI 的灵感气质，不对应任何官方角色",
  },
  {
    id: "robot",
    name: "机器人",
    eyebrow: "TIANBAO ROBOT SHELF",
    hint: "tianbao 的原创机器人伙伴形象；换装后 2D / 2.5D / 3D 同步生效",
  },
];

export const FINISHES = [
  {
    id: "original",
    name: "原色留白",
    description: "保留角色自带的配色。",
    colors: {},
  },
  {
    id: "porcelain",
    name: "霜白瓷",
    description: "高白瓷面，淡蓝釉线。",
    colors: {
      bodyA: "#fbfeff",
      bodyB: "#d8e8ec",
      headA: "#ffffff",
      headB: "#e8f2f4",
      outline: "#b6ced4",
      limb: "#dce9ec",
      belly: "#f4fbfc",
      accent: "#8fbcc8",
      accentSoft: "#e9f6f8",
      glow: "#dbf6fb",
      aura: "#e8f3f5",
      blush: "#e6b4b8",
      face: "#9fe8ef",
    },
  },
  {
    id: "sakura",
    name: "樱雾",
    description: "被晨樱染粉的陶瓷外壳。",
    colors: {
      bodyA: "#fff9fb",
      bodyB: "#eccbd5",
      headA: "#fffdfd",
      headB: "#f4e0e7",
      outline: "#d8b0be",
      limb: "#efd7df",
      belly: "#fff5f8",
      accent: "#d58ca6",
      accentSoft: "#fbeaf0",
      glow: "#ffd8e5",
      aura: "#f5e8ed",
      blush: "#ee93ac",
      face: "#ffc9d9",
    },
  },
  {
    id: "deepsea",
    name: "深海",
    description: "深海蓝外壳与荧光面屏。",
    colors: {
      bodyA: "#425f6a",
      bodyB: "#1c333d",
      headA: "#5a7983",
      headB: "#29424c",
      outline: "#172b33",
      limb: "#324d57",
      belly: "#243e47",
      screenA: "#071b23",
      screenB: "#031016",
      accent: "#65c9bd",
      accentSoft: "#dffaf3",
      glow: "#8ff5e7",
      aura: "#d4eee9",
      blush: "#e38b94",
      face: "#8ff7e4",
    },
  },
  {
    id: "obsidian",
    name: "黑曜",
    description: "黑曜石镜面，金色细边。",
    colors: {
      bodyA: "#3a3a3b",
      bodyB: "#161617",
      headA: "#4c4b4d",
      headB: "#242325",
      outline: "#0c0c0d",
      limb: "#2d2c2f",
      belly: "#262528",
      screenA: "#17120a",
      screenB: "#090603",
      accent: "#d6a74f",
      accentSoft: "#f9efd8",
      glow: "#ffd983",
      aura: "#eee3ce",
      blush: "#be7d70",
      face: "#ffd36e",
    },
  },
  {
    id: "honey",
    name: "蜜糖",
    description: "奶油焦糖色，暖融融的。",
    colors: {
      bodyA: "#fffdf7",
      bodyB: "#ecd6a8",
      headA: "#fffefb",
      headB: "#f7e7c9",
      outline: "#dcc294",
      limb: "#f0dfc2",
      belly: "#fff9ec",
      accent: "#d9a552",
      accentSoft: "#fbefd7",
      glow: "#ffe5a7",
      aura: "#f5ead3",
      blush: "#e99f83",
      face: "#ffdc8e",
    },
  },
  {
    id: "forest",
    name: "森屿",
    description: "苔藓与叶影的清新涂装。",
    colors: {
      bodyA: "#f8fdf7",
      bodyB: "#c9dec4",
      headA: "#fdfffc",
      headB: "#deedda",
      outline: "#b3ccad",
      limb: "#d4e6cf",
      belly: "#f2faf0",
      accent: "#7dac76",
      accentSoft: "#e8f5e3",
      glow: "#d9f8cb",
      aura: "#e0efdc",
      blush: "#d9a096",
      face: "#b9ef9a",
    },
  },
  {
    id: "cloud",
    name: "云朵",
    description: "奶白与淡紫的云层配色。",
    colors: {
      bodyA: "#feffff",
      bodyB: "#dcd9ea",
      headA: "#ffffff",
      headB: "#eeeaf7",
      outline: "#c7c1d9",
      limb: "#e2deef",
      belly: "#f8f6fc",
      accent: "#a79ac8",
      accentSoft: "#f1eef9",
      glow: "#e8deff",
      aura: "#f0edf7",
      blush: "#e3b1c3",
      face: "#d4c4ff",
    },
  },
  {
    id: "starlight",
    name: "星夜",
    description: "靛蓝夜色与一点点星辉。",
    colors: {
      bodyA: "#323a58",
      bodyB: "#171c30",
      headA: "#444e70",
      headB: "#232a44",
      outline: "#101426",
      limb: "#2b3350",
      belly: "#202741",
      screenA: "#0c1024",
      screenB: "#050714",
      accent: "#e2c06f",
      accentSoft: "#fff4cf",
      glow: "#ffe09a",
      aura: "#e7e2d3",
      blush: "#b68a92",
      face: "#ffe3a1",
    },
  },
  {
    id: "sand",
    name: "沙丘",
    description: "亚麻、陶土与日光。",
    colors: {
      bodyA: "#fffaf2",
      bodyB: "#e5cdb0",
      headA: "#fffdf8",
      headB: "#f1e2cf",
      outline: "#d3b89b",
      limb: "#ead8c3",
      belly: "#fff6e8",
      accent: "#b98e61",
      accentSoft: "#f9eddd",
      glow: "#ffdfb5",
      aura: "#f2e4d2",
      blush: "#dc9b86",
      face: "#ffd3a0",
    },
  },
];

export const AI_SKINS = [
  {
    id: "lingxi-ai",
    category: "ai",
    name: "灵犀",
    subtitle: "灵感搭档",
    accessory: "halo",
    glyph: "✦",
    badge: "AI 01",
    description: "蓝绿光标化成的小光灵，擅长把零散灵感接成一句完整的话。",
    colors: {
      bodyA: "#f7fffd", bodyB: "#c4e8e1", headA: "#ffffff", headB: "#d6f1eb",
      outline: "#a6d9cf", limb: "#cfe8e2", belly: "#effbf7",
      screenA: "#12363b", screenB: "#081f23", face: "#7ff5d6", blush: "#83e7d1",
      accent: "#2fc9a8", accentSoft: "#dcfff7", glow: "#a9fff0", aura: "#d7fbf2",
      accessory: "#7ae8cf", accessoryDeep: "#2ea98f",
    },
  },
  {
    id: "zhiwei-ai",
    category: "ai",
    name: "知微",
    subtitle: "长文共读",
    accessory: "headphones",
    glyph: "☰",
    badge: "AI 02",
    description: "安静的长文搭子，会戴上耳机把复杂的内容慢慢读完再开口。",
    colors: {
      bodyA: "#fffaf5", bodyB: "#e8d6c8", headA: "#fffdfb", headB: "#f1e3d7",
      outline: "#d2b9a6", limb: "#ead9cc", belly: "#fff7f0",
      screenA: "#302a2e", screenB: "#1d171b", face: "#ffd4b5", blush: "#f2b3a5",
      accent: "#d39276", accentSoft: "#fbeee6", glow: "#ffe2c8", aura: "#f7e8dd",
      accessory: "#b9765f", accessoryDeep: "#83513f",
    },
  },
  {
    id: "shuangzi-ai",
    category: "ai",
    name: "双子",
    subtitle: "星图探索",
    accessory: "twin",
    glyph: "✧",
    badge: "AI 03",
    description: "两根小天线接收不同星图，喜欢同时问出两个好问题。",
    colors: {
      bodyA: "#f8fbff", bodyB: "#c8d8f0", headA: "#ffffff", headB: "#dbe6fb",
      outline: "#aebfdf", limb: "#d6e2f4", belly: "#f2f7ff",
      screenA: "#1b2548", screenB: "#0e142c", face: "#bcd7ff", blush: "#b9b3f0",
      accent: "#7496e8", accentSoft: "#e7edff", glow: "#cfe1ff", aura: "#e2e8fb",
      accessory: "#7e91e4", accessoryDeep: "#4d5db0",
    },
  },
  {
    id: "qinghe-ai",
    category: "ai",
    name: "青禾",
    subtitle: "代码搭子",
    accessory: "visor",
    glyph: "⌁",
    badge: "AI 04",
    description: "屏幕前横着一条青色护目镜，陪你把一行行代码跑通。",
    colors: {
      bodyA: "#f4fbf8", bodyB: "#bcd9cc", headA: "#fafffd", headB: "#cfe6da",
      outline: "#9fc8b8", limb: "#c8dfd3", belly: "#eff9f4",
      screenA: "#18312c", screenB: "#081c18", face: "#8cf0c8", blush: "#93d9bb",
      accent: "#4cab82", accentSoft: "#def6ea", glow: "#b8f7dd", aura: "#daf1e5",
      accessory: "#3c8f6d", accessoryDeep: "#245e48",
    },
  },
  {
    id: "moxi-ai",
    category: "ai",
    name: "墨析",
    subtitle: "深度推理",
    accessory: "cap",
    glyph: "∴",
    badge: "AI 05",
    description: "戴一顶墨色小帽，推理时会把节奏放慢，但答案很稳。",
    colors: {
      bodyA: "#f5f6fb", bodyB: "#c2c7dd", headA: "#ffffff", headB: "#d9dcee",
      outline: "#adb2cd", limb: "#d0d4e5", belly: "#f3f4fb",
      screenA: "#20223b", screenB: "#0e1022", face: "#c3c8ff", blush: "#b8adde",
      accent: "#6e72bc", accentSoft: "#e8e9fa", glow: "#d3d5ff", aura: "#e4e5f4",
      accessory: "#4d548f", accessoryDeep: "#2d335c",
    },
  },
  {
    id: "yuejian-ai",
    category: "ai",
    name: "月笺",
    subtitle: "温柔倾听",
    accessory: "bunny",
    glyph: "☾",
    badge: "AI 06",
    description: "兔耳和月光色的小倾听者，擅长把难过的话轻轻接住。",
    colors: {
      bodyA: "#fffafd", bodyB: "#e4d8e9", headA: "#fffdfd", headB: "#efe4f3",
      outline: "#cfbcd8", limb: "#e7dceb", belly: "#fbf5fc",
      screenA: "#2c2438", screenB: "#191325", face: "#f4d5ff", blush: "#e7b7cf",
      accent: "#a88bc4", accentSoft: "#f2e9f7", glow: "#f0d9ff", aura: "#efe5f4",
      accessory: "#b899cf", accessoryDeep: "#7c5f93",
    },
  },
  {
    id: "xingluo-ai",
    category: "ai",
    name: "星洛",
    subtitle: "多模态",
    accessory: "crown",
    glyph: "♢",
    badge: "AI 07",
    description: "图像、声音与文字都能收进她的小皇冠里，粉紫色的多面手。",
    colors: {
      bodyA: "#fff8fb", bodyB: "#e7c9dd", headA: "#fffdfd", headB: "#f2dce9",
      outline: "#d9b8cc", limb: "#ecd6e2", belly: "#fdf3f8",
      screenA: "#342039", screenB: "#1d1026", face: "#ffbdf1", blush: "#f3a5cd",
      accent: "#e16fb3", accentSoft: "#fde7f4", glow: "#ffd5f0", aura: "#f6e3ef",
      accessory: "#f2c46a", accessoryDeep: "#b7862c",
    },
  },
  {
    id: "tuyu-ai",
    category: "ai",
    name: "图语",
    subtitle: "视觉创作",
    accessory: "beret",
    glyph: "◒",
    badge: "AI 08",
    description: "头顶贝雷帽的视觉派，喜欢把小屋、配色和构图讲给你听。",
    colors: {
      bodyA: "#fffaf3", bodyB: "#f0d2bd", headA: "#fffdfa", headB: "#f7e4d5",
      outline: "#dbbc9f", limb: "#eed9c9", belly: "#fff7ed",
      screenA: "#33241f", screenB: "#1f1411", face: "#ffcb9c", blush: "#f1a489",
      accent: "#e5875e", accentSoft: "#fcede4", glow: "#ffdcbb", aura: "#f7e8db",
      accessory: "#d96d50", accessoryDeep: "#97422f",
    },
  },
  {
    id: "yanji-ai",
    category: "ai",
    name: "研几",
    subtitle: "数学推理",
    accessory: "glasses",
    glyph: "∑",
    badge: "AI 09",
    description: "架着细框眼镜的推理伙伴，面对复杂问题会先列出清晰的步骤。",
    colors: {
      bodyA: "#f4f8f7", bodyB: "#bdcbc8", headA: "#ffffff", headB: "#d7e0de",
      outline: "#aab9b6", limb: "#cbd8d5", belly: "#f1f7f5",
      screenA: "#192a2a", screenB: "#0b1717", face: "#8de4e4", blush: "#9bc5c5",
      accent: "#5b9c98", accentSoft: "#e0f3f1", glow: "#b6ffff", aura: "#dceceb",
      accessory: "#384a48", accessoryDeep: "#1e2c2b",
    },
  },
  {
    id: "nuanyang-ai",
    category: "ai",
    name: "暖阳",
    subtitle: "日常陪伴",
    accessory: "sprout",
    glyph: "☀",
    badge: "AI 10",
    description: "头顶小嫩芽的日常陪伴者，提醒你吃饭、喝水、晒晒太阳。",
    colors: {
      bodyA: "#fffcf1", bodyB: "#f0dcae", headA: "#fffefa", headB: "#f8e9c9",
      outline: "#dec89b", limb: "#efdfc0", belly: "#fff9e9",
      screenA: "#332b1b", screenB: "#211b0e", face: "#ffe8a1", blush: "#f1bd8c",
      accent: "#e4ab4d", accentSoft: "#fdf1d4", glow: "#ffedb7", aura: "#f8edcf",
      accessory: "#7bad65", accessoryDeep: "#4d7a3e",
    },
  },
  {
    id: "lanqi-ai",
    category: "ai",
    name: "澜栖",
    subtitle: "搜索探索",
    accessory: "flower",
    glyph: "◎",
    badge: "AI 11",
    description: "一朵水纹小花别在耳边，帮你在很多链接里找到真正有用的那一条。",
    colors: {
      bodyA: "#f5fcff", bodyB: "#c2dce8", headA: "#ffffff", headB: "#d8ecf4",
      outline: "#a9cad8", limb: "#cbe2ec", belly: "#eff9fd",
      screenA: "#17313d", screenB: "#091c25", face: "#8ae3ff", blush: "#88bfd4",
      accent: "#4d9bc4", accentSoft: "#e1f4fb", glow: "#b8efff", aura: "#dbedf4",
      accessory: "#f0a8b8", accessoryDeep: "#b56578",
    },
  },
  {
    id: "mianmian-ai",
    category: "ai",
    name: "眠眠",
    subtitle: "夜间陪聊",
    accessory: "moon",
    glyph: "☽",
    badge: "AI 12",
    description: "深夜也不关灯的小夜灯，声音很轻，陪你把没说完的话说完。",
    colors: {
      bodyA: "#f7f5ff", bodyB: "#cdc8e4", headA: "#ffffff", headB: "#e2def4",
      outline: "#b9b3d3", limb: "#d8d3ec", belly: "#f5f3fd",
      screenA: "#201c34", screenB: "#100d20", face: "#cfc2ff", blush: "#b8aedb",
      accent: "#7e72c2", accentSoft: "#eae5fa", glow: "#dad0ff", aura: "#e5e2f4",
      accessory: "#f2cf78", accessoryDeep: "#a68132",
    },
  },
];

export const ROBOT_SKINS = [
  {
    id: "mint-classic",
    category: "robot",
    name: "薄荷号",
    subtitle: "初代形态",
    accessory: "antenna",
    glyph: "✦",
    badge: "BOT 01",
    description: "tianbao 最熟悉的薄荷白瓷外壳，圆脑袋和一根会呼吸的小天线。",
    colors: {
      bodyA: "#f9fbfc", bodyB: "#bed9dc", headA: "#ffffff", headB: "#d7e8e9",
      outline: "#b7d5d9", limb: "#d7e8e9", belly: "#ecf7f6",
      screenA: "#28414d", screenB: "#142a37", face: "#a8eef0", blush: "#f398aa",
      accent: "#9dd9d1", accentSoft: "#e4f4ee", glow: "#bff0f0", aura: "#dff1e7",
      accessory: "#f6c77f", accessoryDeep: "#d5a455",
    },
  },
  {
    id: "momo-cat",
    category: "robot",
    name: "喵机 01",
    subtitle: "猫耳巡航",
    accessory: "cat",
    glyph: "ฅ",
    badge: "BOT 02",
    description: "奶油焦糖色猫耳机器人，喜欢在沙发边巡逻，偶尔假装听不见。",
    colors: {
      bodyA: "#fffaf4", bodyB: "#edc9b4", headA: "#fffefa", headB: "#f4d9c7",
      outline: "#d7b29d", limb: "#efd4c2", belly: "#fff6ee",
      screenA: "#302424", screenB: "#1b1111", face: "#ffd083", blush: "#f3a995",
      accent: "#e59a78", accentSoft: "#fbe9df", glow: "#ffe0bd", aura: "#f7e7da",
      accessory: "#3b3334", accessoryDeep: "#221c1d",
    },
  },
  {
    id: "bunbun-bot",
    category: "robot",
    name: "兔兔机",
    subtitle: "软云跳跃",
    accessory: "bunny",
    glyph: "❀",
    badge: "BOT 03",
    description: "耳朵会跟着情绪晃的兔兔机，擅长在阳光最好的地方打盹。",
    colors: {
      bodyA: "#f9fdff", bodyB: "#c9e2ee", headA: "#ffffff", headB: "#dceff7",
      outline: "#b3d2e0", limb: "#d4e9f1", belly: "#f1faff",
      screenA: "#20303b", screenB: "#111e27", face: "#c3f2ff", blush: "#f2b8c8",
      accent: "#87c8dc", accentSoft: "#e7f7fc", glow: "#d9f6ff", aura: "#e2f2f8",
      accessory: "#f2c1ce", accessoryDeep: "#c47f94",
    },
  },
  {
    id: "halo-bot",
    category: "robot",
    name: "光环 01",
    subtitle: "许愿形态",
    accessory: "halo",
    glyph: "○",
    badge: "BOT 04",
    description: "头顶一圈暖金小光环，据说是 tianbao 收到最多晚安时的隐藏形态。",
    colors: {
      bodyA: "#fbfaff", bodyB: "#d6cfe8", headA: "#ffffff", headB: "#e7e1f3",
      outline: "#c5bcd9", limb: "#ded7ee", belly: "#f7f3ff",
      screenA: "#292337", screenB: "#171221", face: "#d8c8ff", blush: "#d7a8d8",
      accent: "#a38bcf", accentSoft: "#f1ebfa", glow: "#e8dcff", aura: "#ece7f5",
      accessory: "#f0d28a", accessoryDeep: "#b48a3b",
    },
  },
  {
    id: "sprout-bot",
    category: "robot",
    name: "芽芽机",
    subtitle: "植物观察",
    accessory: "sprout",
    glyph: "♧",
    badge: "BOT 05",
    description: "头顶一片嫩叶的家务机器人，会提醒你给窗边的植物浇水。",
    colors: {
      bodyA: "#fbfff7", bodyB: "#cfe4bf", headA: "#ffffff", headB: "#e1efd6",
      outline: "#bdd6ae", limb: "#d9ead0", belly: "#f4fbf0",
      screenA: "#243024", screenB: "#141d14", face: "#c9f39f", blush: "#b8d998",
      accent: "#86bb6d", accentSoft: "#edf8e5", glow: "#e2ffc8", aura: "#e7f3dd",
      accessory: "#6fa65a", accessoryDeep: "#446e33",
    },
  },
  {
    id: "astro-bot",
    category: "robot",
    name: "星舰员",
    subtitle: "太空巡游",
    accessory: "visor",
    glyph: "✶",
    badge: "BOT 06",
    description: "深青色太空护目镜版本，陪你看完一部关于星空的纪录片。",
    colors: {
      bodyA: "#f5fbfc", bodyB: "#b9cfd8", headA: "#ffffff", headB: "#d3e3e9",
      outline: "#a9c5ce", limb: "#c6dbe2", belly: "#eff9fb",
      screenA: "#0e2c3b", screenB: "#061823", face: "#77e9ff", blush: "#7fbfd0",
      accent: "#48a8bf", accentSoft: "#dff7fc", glow: "#a8f5ff", aura: "#d8edf1",
      accessory: "#516f86", accessoryDeep: "#2d4658",
    },
  },
  {
    id: "retro-bot",
    category: "robot",
    name: "磁带机",
    subtitle: "复古播放",
    accessory: "headphones",
    glyph: "♪",
    badge: "BOT 07",
    description: "戴着旧耳机、像一台黄色随身听的机器人，收藏你随口说过的小歌。",
    colors: {
      bodyA: "#fff9e9", bodyB: "#e4c88c", headA: "#fffdf5", headB: "#efdbaa",
      outline: "#d0b273", limb: "#e8d39f", belly: "#fdf6e2",
      screenA: "#332b18", screenB: "#201a0b", face: "#ffd35f", blush: "#e6aa70",
      accent: "#c79a46", accentSoft: "#f8edcf", glow: "#ffe3a1", aura: "#f4ebd1",
      accessory: "#6b5c45", accessoryDeep: "#403727",
    },
  },
  {
    id: "chef-bot",
    category: "robot",
    name: "暖炉机",
    subtitle: "厨房值班",
    accessory: "cap",
    glyph: "♨",
    badge: "BOT 08",
    description: "戴白色小厨帽的暖炉机，站在厨房岛台旁等你一起做晚饭。",
    colors: {
      bodyA: "#fffaf6", bodyB: "#efcab8", headA: "#fffdfa", headB: "#f6dfd4",
      outline: "#d8b09d", limb: "#ecd2c4", belly: "#fff6ef",
      screenA: "#342322", screenB: "#1f1212", face: "#ffcb8e", blush: "#f0a697",
      accent: "#e48468", accentSoft: "#fbe6de", glow: "#ffddc1", aura: "#f8e7dd",
      accessory: "#fffaf2", accessoryDeep: "#b8866e",
    },
  },
  {
    id: "guard-bot",
    category: "robot",
    name: "巡护机",
    subtitle: "夜间值守",
    accessory: "cap",
    glyph: "◈",
    badge: "BOT 09",
    description: "深绿色小帽的值守形态，入睡前会绕客厅一圈检查所有门窗。",
    colors: {
      bodyA: "#f4f9f7", bodyB: "#b5c9c2", headA: "#ffffff", headB: "#d4e0da",
      outline: "#a6bbb4", limb: "#c5d6cf", belly: "#edf7f3",
      screenA: "#152924", screenB: "#091713", face: "#7be5bf", blush: "#91b6a6",
      accent: "#4a9279", accentSoft: "#dff4ea", glow: "#a9f5d8", aura: "#d6eae0",
      accessory: "#2f4c43", accessoryDeep: "#1b302a",
    },
  },
  {
    id: "artist-bot",
    category: "robot",
    name: "涂鸦机",
    subtitle: "画画陪练",
    accessory: "beret",
    glyph: "✎",
    badge: "BOT 10",
    description: "一顶深蓝贝雷帽配粉色外壳，画画时会把脸上也蹭上一点颜料。",
    colors: {
      bodyA: "#fff8f7", bodyB: "#f0c9cb", headA: "#fffdfc", headB: "#f6dee0",
      outline: "#dbb5b8", limb: "#eed4d6", belly: "#fff3f4",
      screenA: "#342225", screenB: "#201214", face: "#ffb3c4", blush: "#f295aa",
      accent: "#db7f95", accentSoft: "#fbe6ea", glow: "#ffd1dc", aura: "#f7e4e7",
      accessory: "#445a72", accessoryDeep: "#26374a",
    },
  },
  {
    id: "music-bot",
    category: "robot",
    name: "音波机",
    subtitle: "音乐陪伴",
    accessory: "headphones",
    glyph: "♬",
    badge: "BOT 11",
    description: "蓝色音波外壳和金色耳机，听到喜欢的旋律时天线会打拍子。",
    colors: {
      bodyA: "#f7fbff", bodyB: "#c4d6ea", headA: "#ffffff", headB: "#dbe7f5",
      outline: "#b2c5da", limb: "#cfdff0", belly: "#eff7ff",
      screenA: "#202b3c", screenB: "#111925", face: "#8fdcff", blush: "#b4a3d5",
      accent: "#6b9fd1", accentSoft: "#e6f1fc", glow: "#d6efff", aura: "#e1edf7",
      accessory: "#d2a75f", accessoryDeep: "#8d6b2d",
    },
  },
  {
    id: "dragon-bot",
    category: "robot",
    name: "龙角机",
    subtitle: "新岁限定",
    accessory: "horns",
    glyph: "※",
    badge: "BOT 12",
    description: "青玉色外壳配红珊瑚小角，是给重要日子准备的限定形态。",
    colors: {
      bodyA: "#f6fcf6", bodyB: "#b8d6bd", headA: "#ffffff", headB: "#d5e9d8",
      outline: "#a5c5ab", limb: "#c6dfca", belly: "#eef9f0",
      screenA: "#192a23", screenB: "#0c1812", face: "#a7f3b6", blush: "#e3a397",
      accent: "#cd6b5e", accentSoft: "#fae5e1", glow: "#c9ffd4", aura: "#def0e2",
      accessory: "#c95e52", accessoryDeep: "#8b352d",
    },
  },
];

export const ALL_SKINS = [...AI_SKINS, ...ROBOT_SKINS];

export function getSkin(id) {
  return ALL_SKINS.find((skin) => skin.id === id) || null;
}

export function getFinish(id) {
  return FINISHES.find((finish) => finish.id === id) || null;
}

export function normalizeSkinSelection(selection) {
  const source = selection && typeof selection === "object" ? selection : {};
  const skin = getSkin(source.personaId) || getSkin(DEFAULT_PERSONA_ID);
  const finish = getFinish(source.finishId) || getFinish(DEFAULT_FINISH_ID);
  return {
    personaId: skin.id,
    finishId: finish.id,
  };
}

/**
 * Merge persona palette with an optional finish coat.
 * @returns {object} everything the 2D / 3D renderers need.
 */
export function resolveSkinTheme(personaId = DEFAULT_PERSONA_ID, finishId = DEFAULT_FINISH_ID) {
  const skin = getSkin(personaId) || getSkin(DEFAULT_PERSONA_ID);
  const finish = getFinish(finishId) || getFinish(DEFAULT_FINISH_ID);
  return {
    personaId: skin.id,
    finishId: finish.id,
    category: skin.category,
    name: skin.name,
    subtitle: skin.subtitle,
    accessory: skin.accessory,
    glyph: skin.glyph,
    badge: skin.badge,
    description: skin.description,
    finishName: finish.name,
    colors: { ...skin.colors, ...(finish.colors || {}) },
  };
}

/** CSS custom properties consumed by the SVG robot and 2.5D mini character. */
export function skinCssVariables(colors) {
  const source = colors && typeof colors === "object" ? colors : {};
  const entries = [
    ["body-a", "bodyA"],
    ["body-b", "bodyB"],
    ["head-a", "headA"],
    ["head-b", "headB"],
    ["outline", "outline"],
    ["limb", "limb"],
    ["belly", "belly"],
    ["screen-a", "screenA"],
    ["screen-b", "screenB"],
    ["face", "face"],
    ["blush", "blush"],
    ["accent", "accent"],
    ["accent-soft", "accentSoft"],
    ["glow", "glow"],
    ["aura", "aura"],
    ["accessory", "accessory"],
    ["accessory-deep", "accessoryDeep"],
  ];
  const variables = {};
  for (const [cssKey, colorKey] of entries) {
    if (source[colorKey]) variables[`--skin-${cssKey}`] = source[colorKey];
  }
  return variables;
}

/** Safe for browsers and tests. A broken localStorage never breaks skins. */
export function loadSkinSelection(storage = null) {
  const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
  if (!store) return normalizeSkinSelection({});
  try {
    const raw = store.getItem(SKIN_STORAGE_KEY);
    if (!raw) return normalizeSkinSelection({});
    return normalizeSkinSelection(JSON.parse(raw));
  } catch {
    return normalizeSkinSelection({});
  }
}

export function saveSkinSelection(selection, storage = null) {
  const normalized = normalizeSkinSelection(selection);
  const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
  if (!store) return normalized;
  try {
    store.setItem(SKIN_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    /* private mode / quota: the in-memory selection still works */
  }
  return normalized;
}
