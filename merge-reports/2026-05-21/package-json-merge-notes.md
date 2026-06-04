# package.json 合并说明（2026-05-20）

## 策略

- **基底：** upstream `main`（`a002c416c7`）
- **保留 fork：** `electron:*`、`ui:react:*` scripts；fork 独有 `dependencies` / `devDependencies`
- **未回加：** `@mariozechner/pi-*`（upstream 已迁至 `@earendil-works/pi-*`）
- **版本号：** 暂保留 fork `2026.5.17`（upstream 为 `2026.5.19`）

## 从 fork 补回的 scripts

位于 `scripts` 末尾、`ui:install` 之后（与 `ui:react:*` 成组，便于查找）：

| Script | 用途 |
|--------|------|
| `electron:build` / `electron:dev` / `electron:dev:static` | 桌面壳（`dev:static` 对应 `apps/electron` 的 `dev:static`） |
| `electron:package` / `electron:package:local` | 打包 |
| `ui:react:build` / `ui:react:dev` | 主 UI |

## 从 fork 补回的 dependencies（upstream 根 package 无）

`@aws-sdk/client-bedrock`, `@buape/carbon`, `@discordjs/voice`, `@larksuiteoapi/node-sdk`, `@line/bot-sdk`, `@slack/bolt`, `@slack/web-api`, `@whiskeysockets/baileys`, `cli-highlight`, `discord-api-types`, `hono`, `https-proxy-agent`, `isbinaryfile`, `long`, `mammoth`, `opusscript`, `osc-progress`, `pdf-parse`, `pptxgenjs`, `qrcode-terminal`, `radix-ui`, `xlsx`

## 从 fork 补回的 devDependencies

`@types/pdf-parse`, `@types/qrcode-terminal`

## 刻意未补回

| 项 | 原因 |
|----|------|
| `@mariozechner/pi-*` | 已由 `@earendil-works/pi-*` 替代 |
| `@sinclair/typebox` | upstream 使用 `typebox` |
| `sharp` / `sqlite-vec` | upstream 在 `optionalDependencies` |
| `typescript` (dev) | upstream 根 dev 使用 TS 6 |

## pnpm-workspace.yaml

- upstream 配置 + fork 的 `ui-react`、`apps/electron`、`!extensions/tlon`
- `allowBuilds.electron: true`

## 后续

波次 0 其余：`pnpm-lock.yaml` 在其它根文件就绪后 `pnpm install` 重生。
