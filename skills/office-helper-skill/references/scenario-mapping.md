# 场景 → 默认参数映射表

当用户选择场景后，Agent 从以下表格自动读取推荐参数，不逐项询问用户。

---

## html-ppt 默认参数

| 场景 ID | 推荐主题（T 键备选列表） | 推荐模板 | 动画强度 |
|---------|----------------------|---------|---------|
| `tech-sharing` | `tokyo-night,dracula,nord,terminal-green` | `tech-sharing` | 克制 |
| `vc-pitch` | `pitch-deck-vc,neo-brutalism,corporate-clean` | `pitch-deck` | 适中 |
| `corporate-report` | `corporate-clean,minimal-white,swiss-grid` | `weekly-report` | 克制 |
| `academic` | `editorial-serif,academic-paper,solarized-light` | `course-module` | 克制 |
| `product-launch` | `glassmorphism,aurora,rainbow-gradient` | `product-launch` | 适中 |
| `training` | `soft-pastel,catppuccin-latte,nord` | `course-module` | 克制 |
| `social-media` | `xiaohongshu-white,magazine-bold,memphis-pop` | `xhs-post` | 丰富 |
| `other` | `corporate-clean,minimal-white,tokyo-night` | 从布局拼接 | 克制 |

### 动画强度说明

| 强度 | CSS 动画 | Canvas FX | 适用场景 |
|------|---------|-----------|---------|
| 克制 | `fade-up` + `stagger-list`（默认） | 无 | 正式汇报、学术、培训 |
| 适中 | 封面 `blur-in`，数据页 `counter-up` | 无 | 路演、产品发布 |
| 丰富 | 全量 CSS + Canvas FX（`particle-burst`、`confetti-cannon`） | 有 | 社交媒体、庆祝 |

### 语言默认

默认 `中文`（仅当用户明确要求英文时切换）。

---

## pptx-generator 默认参数

| 场景 ID | 推荐色板 | 推荐风格 | 推荐字体 |
|---------|---------|---------|---------|
| `tech-sharing` | #15 Pure Tech Blue | Sharp & Compact | Consolas + Calibri |
| `vc-pitch` | #14 Luxury & Mysterious | Pill & Airy | Georgia + Calibri |
| `corporate-report` | #2 Business & Authority | Sharp & Compact | Calibri + Calibri Light |
| `academic` | #4 Vintage & Academic | Soft & Balanced | Cambria + Calibri |
| `product-launch` | #7 Vibrant & Tech | Rounded & Spacious | Arial Black + Arial |
| `training` | #10 Education & Charts | Soft & Balanced | Trebuchet MS + Calibri |
| `social-media` | #5 Soft & Creative | Rounded & Spacious | Palatino + Garamond |
| `other` | #10 Education & Charts | Soft & Balanced | Calibri + Calibri Light |

### 色板 theme 对象映射

Agent 需要将色板编号转换为 `theme` 对象的 5 个 key：

| 色板编号 | `primary` | `secondary` | `accent` | `light` | `bg` |
|---------|-----------|------------|---------|--------|------|
| #2 Business & Authority | `2b2d42` | `8d99ae` | `ef233c` | `d90429` | `edf2f4` |
| #4 Vintage & Academic | `780000` | `003049` | `669bbc` | `c1121f` | `fdf0d5` |
| #5 Soft & Creative | `cdb4db` | `ffc8dd` | `ffafcc` | `bde0fe` | `a2d2ff` |
| #7 Vibrant & Tech | `023047` | `219ebc` | `ffb703` | `fb8500` | `8ecae6` |
| #10 Education & Charts | `264653` | `2a9d8f` | `e9c46a` | `f4a261` | `e76f51` |
| #14 Luxury & Mysterious | `22223b` | `4a4e69` | `9a8c98` | `c9ada7` | `f2e9e4` |
| #15 Pure Tech Blue | `03045e` | `0077b6` | `00b4d8` | `90e0ef` | `caf0f8` |

> 注意：以上列出了本映射表引用的色板。完整 18 个色板定义见 `@skills/pptx-generator/references/design-system.md`。

### 语言默认

默认 `中文`（中文字体固定 Microsoft YaHei；仅当用户明确要求英文时切换字体）。
