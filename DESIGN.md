---
name: "Lumina Reader"
colors:
  primary: "#2B5B84"
  secondary: "#6E6E73"
  tertiary: "#B57B2C"
  neutral: "#F8F8F7"
  surface: "#FFFFFF"
  on-surface: "#1D1D1F"
  border: "#E8E8E6"
  sepia-surface: "#F7F1E3"
  sepia-on-surface: "#2E261E"
  dark-surface: "#161618"
  dark-on-surface: "#E5E5E7"
  error: "#C2413B"
typography:
  headline-lg:
    fontFamily: "'Source Serif 4 Variable', Georgia, 'Source Han Serif SC', 'Noto Serif SC', 'Songti SC', serif"
    fontSize: "2.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  headline-md:
    fontFamily: "'DM Sans Variable', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  body-md:
    fontFamily: "'DM Sans Variable', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
  reading-body:
    fontFamily: "'Source Serif 4 Variable', Georgia, 'Source Han Serif SC', 'Noto Serif SC', 'Songti SC', serif"
    fontSize: "1.125rem"
    fontWeight: 420
    lineHeight: 1.8
    letterSpacing: "-0.006em"
  label-caps:
    fontFamily: "'DM Sans Variable', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.04em"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "48px"
rounded:
  none: "0px"
  sm: "6px"
  md: "10px"
  lg: "16px"
  full: "9999px"
elevation:
  flat: "0 0 0 1px #E8E8E6"
  floating: "0 8px 28px -6px rgba(29, 29, 31, 0.12), 0 0 0 1px rgba(29, 29, 31, 0.06)"
  popover: "0 18px 46px -12px rgba(29, 29, 31, 0.18), 0 0 0 1px rgba(29, 29, 31, 0.08)"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm} {spacing.md}"
  card:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  floating-toolbar:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border}"
    rounded: "{rounded.full}"
    elevation: "{elevation.floating}"
    padding: "{spacing.xs}"
  translation-popover:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
    elevation: "{elevation.popover}"
    padding: "{spacing.md}"
  input:
    backgroundColor: "{colors.neutral}"
    borderColor: "{colors.border}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm} {spacing.md}"
---

## Overview

Lumina Reader 的视觉哲学源自纸质精装书与现代数字画廊的克制美学——参考 Readwise Reader、Apple Books 与 Notion 的宁静节奏。界面尽可能退居幕后，将用户的全部注意力交还给文本本身：宽裕的留白、柔和的护眼纸张色调、清晰的视觉层级，以及在需要时悄然浮现、用完即隐的悬浮伴读工具。

## Colors

Lumina Reader 构建了一套服务于长时间深度阅读的三主题色彩系统，同时确保在任意主题下文字与背景均满足 WCAG AA（普通正文对比度 >= 4.5:1）标准：

- **Primary (`{colors.primary}`)**: 沉稳的墨蓝色（Ink Blue），用于主要行动按钮、激活状态标识、当前章节高亮与 AI 伴读引导，在白纸表面上提供约 6.9:1 的高对比度。
- **Secondary (`{colors.secondary}`)**: 温润的中性灰，用于次要信息、元数据、页码进度、辅助图标和章节索引。
- **Tertiary (`{colors.tertiary}`)**: 暖琥珀色，专用于默认暖琥珀划词高亮标记边框、阅读重点徽标与轻量暖色点缀；辅助高亮系统同时提供低饱和鼠尾草绿与雾霭蓝两种纸感高亮，适应不同主题背景下的柔和阅读笔记分类。
- **Neutral (`{colors.neutral}`) & Border (`{colors.border}`)**: 极简纸感浅灰基底，用于侧栏表面、输入框容器与 1px 细分割线。
- **Light Theme (`{colors.surface}` / `{colors.on-surface}`)**: 纯净柔和的白纸质感与深炭黑文字，避免刺眼纯黑（`#000000`）。
- **Sepia Theme (`{colors.sepia-surface}` / `{colors.sepia-on-surface}`)**: 暖黄护眼纸张底色配深棕墨水文字，适合午后或长篇文学、论文深读。
- **Dark Theme (`{colors.dark-surface}` / `{colors.dark-on-surface}`)**: 暗黑深灰夜读基底配柔和浅灰文字，杜绝纯黑强对比引起的视觉炫光；针对 PDF 阅读提供「柔和反色」与「低亮原色」双策略，保护论文彩色图表与插图不失真。
- **Error (`{colors.error}`)**: 克制的砖红色，用于 API 连接错误、文件解析失败提示与危险删除操作。

## Typography

阅读界面严格区分「界面 UI 字体」与「正文阅读字体」两套排版职责，所有可变字体均纯本地打包（不依赖外网 CDN）：

- **正文阅读（`reading-body` / `headline-lg`）**：提供三套精选阅读字体并平滑回退至系统优雅中文字体栈（`'Source Han Serif SC', 'Noto Serif SC', 'Songti SC'`），默认字号 `18px`、行高 `1.8`，统一开启 `font-feature-settings: "kern" 1, "liga" 1` 与 `font-optical-sizing: auto` 以呈现印刷级混排质感：
  - `claude-serif`（典雅书卷 · 默认）：`'Source Serif 4 Variable'`，搭配微调 `fontWeight: 420` 与 `letterSpacing: -0.006em`。
  - `editorial-serif`（现代刊物）：`'Newsreader Variable'`，适合长篇评论与精致期刊风阅读。
  - `sans`（现代无衬线）：`'DM Sans Variable'`，适合技术文档与轻快阅读节奏。
- **界面控件（`body-md` / `headline-md` / `label-caps`）**：侧栏、顶部条、悬浮工具栏、设置弹窗一律使用 `'DM Sans Variable'` 领衔的人文无衬线栈，保持与正文阅读区明确的视觉区隔。

## Layout

采用基于 `4px` / `8px` 倍率的空间体系（`{spacing.xs}` 至 `{spacing.xl}`）：

- **三栏可折叠阅读布局**:
  - 左侧栏（目录 / 笔记 / 闪卡）：宽度 `280px`，支持丝滑折叠至 `0px`。
  - 中间主阅读区：弹性居中，版心默认 `740px`（支持 `620px` 紧凑 / `740px` 标准 / `900px` 宽阔），四周保留充足呼吸感留白。
  - 右侧 AI 伴读栏：宽度 `360px`，平时默认静默收起，仅在需要深度追问、解释或总结时平滑滑出。
- **顶部极简悬浮条**: 高度 `48px`，鼠标离开阅读顶部区域且已向下滚动时平滑淡化，不打断沉浸体验。

## Elevation and Depth

界面层次以「通透平铺 + 轻量 1px 边框（`{elevation.flat}`）」为主，拒绝厚重拟物阴影与密集分割线：

- 静态区域（侧栏、首页最近阅读卡片）仅使用背景明度微差与 `1px` 细边框区分层级。
- 划词悬浮工具栏使用轻盈浮影（`{elevation.floating}`）配合高透毛玻璃背景（`backdrop-filter: blur(16px)`）。
- 原位悬浮译文卡与设置弹窗使用清晰而不沉重的浮层阴影（`{elevation.popover}`），确保浮于文字之上仍有优雅空间感。

## Shapes

保持柔和克制的几何圆角统一性：

- 矩形元素不使用生硬直角（`{rounded.none}` 仅用于基础重置和无边画布）。
- 小型图标按钮、格式标签使用 `{rounded.sm}`（`6px`）。
- 标准按钮、输入框、侧栏导航项使用 `{rounded.md}`（`10px`）。
- 原位译文卡片、文件拖放区、模态弹窗使用 `{rounded.lg}`（`16px`）。
- 划词悬浮工具胶囊条与主题切换圆点使用 `{rounded.full}`。

## Components

- **主按钮 (`button-primary`)**: 使用 `{colors.primary}` 作为填充色、白色文字与 `{rounded.md}` 圆角，悬停时轻微加深明度。
- **内容卡片 (`card`)**: 采用 `{colors.surface}` 表面色、1px `{colors.border}` 边框与 `{rounded.lg}` 圆角。
- **划词悬浮工具栏 (`floating-toolbar`)**: `{rounded.full}` 胶囊形毛玻璃浮层，第一项固定为高辨识度的「译成中文」按钮，所有工具按钮必须阻止 `mousedown` 默认行为以完整保留用户划词选区。
- **原位悬浮译文卡 (`translation-popover`)**: 在选区正下方/附近直接展开，宽度适中（`360px–420px`），流式渲染自然中文译文，底部固定三个轻量化快捷图标操作（复制译文、保存至笔记、发送到右侧追问）。
- **输入框 (`input`)**: 使用 `{colors.neutral}` 微灰底色与 `{colors.border}` 细边框，聚焦时呈现温和的 `{colors.primary}` 焦点环。

## Do's and Don'ts

- **Do** 始终通过主题 CSS 变量（映射至本文件声明的色板）编写界面样式，确保纯白、暖黄护眼与暗黑深灰三套主题切换瞬间完整生效。
- **Do** 保证主阅读区四周拥有宽敞留白，悬浮控件在非交互态下保持极低视觉侵扰。
- **Do** 保证所有文本与交互图标满足 WCAG AA 对比度规范，保持流畅的过渡动画（`180ms–260ms cubic-bezier(0.22, 1, 0.36, 1)`）。
- **Don't** 堆砌类似传统 Word / Acrobat 的顶部多排固定工具栏、标尺或花哨装饰图标。
- **Don't** 在代码中硬编码脱离设计系统的随机十六进制色值或混用风格冲突的圆角。
- **Don't** 在用户点击「译成中文」时强行弹出右侧聊天栏打断阅读流——必须优先展示原位悬浮译文卡。
