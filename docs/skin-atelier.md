# tianbao 换肤系统（V0.7）

## 内容

- 12 个 **AI 灵感形象**：均为主观原创演绎（灵犀、知微、双子、青禾、墨析、月笺、
  星洛、图语、研几、暖阳、澜栖、眠眠），不使用或复刻任何官方角色、Logo 或服装。
- 12 个 **机器人形象**：薄荷号、喵机 01、兔兔机、光环 01、芽芽机、星舰员、磁带机、
  暖炉机、巡护机、涂鸦机、音波机、龙角机。
- 10 套 **涂装**：原色留白、霜白瓷、樱雾、深海、黑曜、蜜糖、森屿、云朵、星夜、沙丘。
  涂装只覆盖配色，保留当前形象的天线 / 猫耳 / 光环等轮廓。

## 数据与渲染

`static/skins.js` 是唯一的皮肤数据源，导出：

- `ALL_SKINS` / `AI_SKINS` / `ROBOT_SKINS` / `FINISHES`。
- `resolveSkinTheme(personaId, finishId)`：合并形象与涂装，供 2D、2.5D、3D 共用。
- `skinCssVariables(colors)`：把调色板转成 `--skin-*` CSS 变量。
- `loadSkinSelection` / `saveSkinSelection`：容错的 localStorage 持久化。

`static/app.js` 在启动时读取选择，并把 CSS 变量写到 `document.documentElement`。
2D SVG 与 2.5D mini 机器人通过 CSS 变量重新着色；轮廓配件由
`html[data-skin-accessory="…"]` 控制显隐。3D 模块的 `Home3D.applyTheme()` 会同步
机器人材质、脸部 Canvas 和配件组。

## 添加一个形象

1. 在 `static/skins.js` 的 `AI_SKINS` 或 `ROBOT_SKINS` 里追加对象：
   `id / category / name / subtitle / accessory / glyph / badge / description / colors`。
2. `colors` 必须包含 `bodyA, bodyB, headA, headB, outline, limb, belly,
   screenA, screenB, face, blush, accent, accentSoft, glow, aura, accessory,
   accessoryDeep` 全部 17 个字段。
3. 如果使用新的 `accessory`，需要同时在 `templates/index.html` 的 2D 机器人、
   2.5D mini 机器人和 `static/home3d.js` 的 `buildRobotAccessories()` 中补上轮廓。
4. 运行 `node --test tests/test_skins.mjs`。

## UI

换肤按钮位于顶栏，面板默认收起（`hidden` + `inert`）。面板有三类标签：
AI 形象 / 机器人 / 涂装。选择会立即生效、写入 localStorage，并在 2D、2.5D、
3D 之间共享。`Escape`、点击面板外部和“收起”都会关闭面板。
