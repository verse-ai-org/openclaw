# 冲突维度目录（merge 启动后自动生成）
**生成时间：** 2026-05-20  
**未合并文件总数：** 336  
**Upstream tip：** `a002c416c7`（fetch 后，较计划文档 `6b82eaa2cd` 更新）  
**状态：** merge 进行中，**未 commit**

---

## 处理策略总表

| 维度 | 数量 | 策略 | 人工强度 |
|------|------|------|----------|
| **src/ 双方修改 (UU)** | 168 | 三路合并，查 fork diff 接回 B 区逻辑 | **必须逐文件 review** |
| **src/ 改删 (DU+UD)** | 46 | 登记 modify-delete-decisions，查 upstream 是否搬家 | 逐条 |
| **ui/** | 9 | **以 upstream 为主**（`checkout --theirs`） | ✅ 已处理 |
| **ui-react/、apps/electron/** | 0 冲突 | fork 独有，merge 自动保留 | 仅适配 API 变更 |
| **extensions/** | 46 | **全部 upstream**（UU=theirs，UD=rm） | ✅ 已处理 |
| **apps/**（非 electron） | 17 | ios/macos/android 偏 upstream | 中 |
| **波次 0 根配置** | 11 | upstream 骨架 + 保留 electron/ui-react scripts | 中 |
| **波次 1 DU/UD（非 src）** | 23 | 逐条登记 | 中 |
| **docs / CI / test** | 27 | 以 upstream 为主 | 低 |

## 冲突类型统计

- **DU:** 14
- **OTHER:** 1
- **UD:** 55
- **UU:** 266

---

## 1. 核心：`src/` 双方修改 (UU) — 必须 review

共 **168** 个文件。按子模块：

### `src/gateway/server-methods/` (12)

- [ ] `src/gateway/server-methods/agent.ts`
- [ ] `src/gateway/server-methods/agents.ts`
- [ ] `src/gateway/server-methods/attachment-normalize.ts`
- [ ] `src/gateway/server-methods/channels.ts`
- [ ] `src/gateway/server-methods/chat-transcript-inject.ts`
- [ ] `src/gateway/server-methods/chat.directive-tags.test.ts`
- [ ] `src/gateway/server-methods/chat.ts`
- [ ] `src/gateway/server-methods/config.ts`
- [ ] `src/gateway/server-methods/devices.ts`
- [ ] `src/gateway/server-methods/server-methods.test.ts`
- [ ] `src/gateway/server-methods/skills.ts`
- [ ] `src/gateway/server-methods/web.ts`

### `src/agents/pi-embedded-runner/` (10)

- [ ] `src/agents/pi-embedded-runner/compact.ts`
- [ ] `src/agents/pi-embedded-runner/model.test.ts`
- [ ] `src/agents/pi-embedded-runner/model.ts`
- [ ] `src/agents/pi-embedded-runner/openai-stream-wrappers.ts`
- [ ] `src/agents/pi-embedded-runner/run.ts`
- [ ] `src/agents/pi-embedded-runner/run/attempt.ts`
- [ ] `src/agents/pi-embedded-runner/run/history-image-prune.test.ts`
- [ ] `src/agents/pi-embedded-runner/run/history-image-prune.ts`
- [ ] `src/agents/pi-embedded-runner/run/params.ts`
- [ ] `src/agents/pi-embedded-runner/run/payloads.ts`

### `src/agents/tools/` (8)

- [ ] `src/agents/tools/common.ts`
- [ ] `src/agents/tools/cron-tool.test.ts`
- [ ] `src/agents/tools/cron-tool.ts`
- [ ] `src/agents/tools/image-tool.test.ts`
- [ ] `src/agents/tools/message-tool.test.ts`
- [ ] `src/agents/tools/message-tool.ts`
- [ ] `src/agents/tools/sessions-helpers.ts`
- [ ] `src/agents/tools/sessions.test.ts`

### `src/gateway/protocol/` (6)

- [ ] `src/gateway/protocol/index.ts`
- [ ] `src/gateway/protocol/schema/agents-models-skills.ts`
- [ ] `src/gateway/protocol/schema/channels.ts`
- [ ] `src/gateway/protocol/schema/logs-chat.ts`
- [ ] `src/gateway/protocol/schema/protocol-schemas.ts`
- [ ] `src/gateway/protocol/schema/types.ts`

### `src/infra/net/` (5)

- [ ] `src/infra/net/proxy-env.ts`
- [ ] `src/infra/net/proxy-fetch.test.ts`
- [ ] `src/infra/net/proxy-fetch.ts`
- [ ] `src/infra/net/undici-global-dispatcher.test.ts`
- [ ] `src/infra/net/undici-global-dispatcher.ts`

### `src/auto-reply/reply/` (3)

- [ ] `src/auto-reply/reply/agent-runner-execution.ts`
- [ ] `src/auto-reply/reply/agent-runner-utils.ts`
- [ ] `src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts`

### `src/cli/daemon-cli/` (3)

- [ ] `src/cli/daemon-cli/lifecycle-core.config-guard.test.ts`
- [ ] `src/cli/daemon-cli/lifecycle-core.test.ts`
- [ ] `src/cli/daemon-cli/lifecycle-core.ts`

### `src/cli/nodes-cli/` (3)

- [ ] `src/cli/nodes-cli/register.camera.ts`
- [ ] `src/cli/nodes-cli/register.pairing.ts`
- [ ] `src/cli/nodes-cli/register.status.ts`

### `src/gateway/server/` (3)

- [ ] `src/gateway/server/plugins-http.test.ts`
- [ ] `src/gateway/server/plugins-http.ts`
- [ ] `src/gateway/server/ws-connection/message-handler.ts`

### `src/agents/pi-hooks/` (2)

- [ ] `src/agents/pi-hooks/context-pruning.test.ts`
- [ ] `src/agents/pi-hooks/context-pruning/pruner.ts`

### `src/commands/onboard-non-interactive/` (2)

- [ ] `src/commands/onboard-non-interactive/local/auth-choice-inference.ts`
- [ ] `src/commands/onboard-non-interactive/local/auth-choice.ts`

### `src/config/sessions/` (2)

- [ ] `src/config/sessions/metadata.ts`
- [ ] `src/config/sessions/types.ts`

### `src/cron/isolated-agent/` (2)

- [ ] `src/cron/isolated-agent/delivery-target.test.ts`
- [ ] `src/cron/isolated-agent/delivery-target.ts`

### `src/acp/translator.session-rate-limit.test.ts/` (1)

- [ ] `src/acp/translator.session-rate-limit.test.ts`

### `src/agents/live-model-errors.test.ts/` (1)

- [ ] `src/agents/live-model-errors.test.ts`

### `src/agents/memory-search.test.ts/` (1)

- [ ] `src/agents/memory-search.test.ts`

### `src/agents/memory-search.ts/` (1)

- [ ] `src/agents/memory-search.ts`

### `src/agents/minimax.live.test.ts/` (1)

- [ ] `src/agents/minimax.live.test.ts`

### `src/agents/model-fallback.ts/` (1)

- [ ] `src/agents/model-fallback.ts`

### `src/agents/models-config.preserves-explicit-reasoning-override.test.ts/` (1)

- [ ] `src/agents/models-config.preserves-explicit-reasoning-override.test.ts`

### `src/agents/models-config.providers.minimax.test.ts/` (1)

- [ ] `src/agents/models-config.providers.minimax.test.ts`

### `src/agents/models-config.skips-writing-models-json-no-env-token.test.ts/` (1)

- [ ] `src/agents/models-config.skips-writing-models-json-no-env-token.test.ts`

### `src/agents/models.profiles.live.test.ts/` (1)

- [ ] `src/agents/models.profiles.live.test.ts`

### `src/agents/openclaw-tools.subagents.sessions-spawn.model.test.ts/` (1)

- [ ] `src/agents/openclaw-tools.subagents.sessions-spawn.model.test.ts`

### `src/agents/openclaw-tools.ts/` (1)

- [ ] `src/agents/openclaw-tools.ts`

### `src/agents/pi-embedded-helpers.isbillingerrormessage.test.ts/` (1)

- [ ] `src/agents/pi-embedded-helpers.isbillingerrormessage.test.ts`

### `src/agents/pi-embedded-helpers/` (1)

- [ ] `src/agents/pi-embedded-helpers/failover-matches.ts`

### `src/agents/pi-embedded-runner-extraparams.test.ts/` (1)

- [ ] `src/agents/pi-embedded-runner-extraparams.test.ts`

### `src/agents/pi-embedded-runner.run-embedded-pi-agent.auth-profile-rotation.e2e.test.ts/` (1)

- [ ] `src/agents/pi-embedded-runner.run-embedded-pi-agent.auth-profile-rotation.e2e.test.ts`

### `src/agents/pi-embedded-subscribe.handlers.messages.ts/` (1)

- [ ] `src/agents/pi-embedded-subscribe.handlers.messages.ts`

### `src/agents/pi-embedded-subscribe.handlers.tools.media.test.ts/` (1)

- [ ] `src/agents/pi-embedded-subscribe.handlers.tools.media.test.ts`

### `src/agents/pi-embedded-subscribe.handlers.tools.test.ts/` (1)

- [ ] `src/agents/pi-embedded-subscribe.handlers.tools.test.ts`

### `src/agents/pi-embedded-subscribe.handlers.tools.ts/` (1)

- [ ] `src/agents/pi-embedded-subscribe.handlers.tools.ts`

### `src/agents/pi-embedded-subscribe.handlers.types.ts/` (1)

- [ ] `src/agents/pi-embedded-subscribe.handlers.types.ts`

### `src/agents/pi-embedded-subscribe.ts/` (1)

- [ ] `src/agents/pi-embedded-subscribe.ts`

### `src/agents/pi-embedded-utils.ts/` (1)

- [ ] `src/agents/pi-embedded-utils.ts`

### `src/agents/pi-tools.workspace-only-false.test.ts/` (1)

- [ ] `src/agents/pi-tools.workspace-only-false.test.ts`

### `src/agents/session-tool-result-guard-wrapper.ts/` (1)

- [ ] `src/agents/session-tool-result-guard-wrapper.ts`

### `src/agents/session-tool-result-guard.tool-result-persist-hook.test.ts/` (1)

- [ ] `src/agents/session-tool-result-guard.tool-result-persist-hook.test.ts`

### `src/agents/skills/` (1)

- [ ] `src/agents/skills/frontmatter.ts`

### `src/agents/tool-policy.test.ts/` (1)

- [ ] `src/agents/tool-policy.test.ts`

### `src/agents/tool-policy.ts/` (1)

- [ ] `src/agents/tool-policy.ts`

### `src/agents/workspace.ts/` (1)

- [ ] `src/agents/workspace.ts`

### `src/auto-reply/reply.directive.directive-behavior.prefers-alias-matches-fuzzy-selection-is-ambiguous.test.ts/` (1)

- [ ] `src/auto-reply/reply.directive.directive-behavior.prefers-alias-matches-fuzzy-selection-is-ambiguous.test.ts`

### `src/channels/registry.ts/` (1)

- [ ] `src/channels/registry.ts`

### `src/cli/devices-cli.ts/` (1)

- [ ] `src/cli/devices-cli.ts`

### `src/cli/hooks-cli.ts/` (1)

- [ ] `src/cli/hooks-cli.ts`

### `src/cli/plugins-cli.ts/` (1)

- [ ] `src/cli/plugins-cli.ts`

### `src/cli/skills-cli.format.ts/` (1)

- [ ] `src/cli/skills-cli.format.ts`

### `src/cli/skills-cli.test.ts/` (1)

- [ ] `src/cli/skills-cli.test.ts`

### `src/commands/agents.config.ts/` (1)

- [ ] `src/commands/agents.config.ts`

### `src/commands/auth-choice-legacy.ts/` (1)

- [ ] `src/commands/auth-choice-legacy.ts`

### `src/commands/auth-choice-options.test.ts/` (1)

- [ ] `src/commands/auth-choice-options.test.ts`

### `src/commands/auth-choice-options.ts/` (1)

- [ ] `src/commands/auth-choice-options.ts`

### `src/commands/auth-choice.apply.api-providers.ts/` (1)

- [ ] `src/commands/auth-choice.apply.api-providers.ts`

### `src/commands/auth-choice.apply.ts/` (1)

- [ ] `src/commands/auth-choice.apply.ts`

### `src/commands/auth-choice.preferred-provider.ts/` (1)

- [ ] `src/commands/auth-choice.preferred-provider.ts`

### `src/commands/auth-choice.test.ts/` (1)

- [ ] `src/commands/auth-choice.test.ts`

### `src/commands/configure.daemon.ts/` (1)

- [ ] `src/commands/configure.daemon.ts`

### `src/commands/configure.gateway-auth.prompt-auth-config.test.ts/` (1)

- [ ] `src/commands/configure.gateway-auth.prompt-auth-config.test.ts`

### `src/commands/message-format.ts/` (1)

- [ ] `src/commands/message-format.ts`

### `src/commands/models/` (1)

- [ ] `src/commands/models/list.status-command.ts`

### `src/commands/onboard-auth.test.ts/` (1)

- [ ] `src/commands/onboard-auth.test.ts`

### `src/commands/onboard-custom.test.ts/` (1)

- [ ] `src/commands/onboard-custom.test.ts`

### `src/commands/onboard-custom.ts/` (1)

- [ ] `src/commands/onboard-custom.ts`

### `src/commands/onboard-types.ts/` (1)

- [ ] `src/commands/onboard-types.ts`

### `src/commands/status.command.ts/` (1)

- [ ] `src/commands/status.command.ts`

### `src/config/config.plugin-validation.test.ts/` (1)

- [ ] `src/config/config.plugin-validation.test.ts`

### `src/config/config.schema-regressions.test.ts/` (1)

- [ ] `src/config/config.schema-regressions.test.ts`

### `src/config/io.ts/` (1)

- [ ] `src/config/io.ts`

### `src/config/io.write-config.test.ts/` (1)

- [ ] `src/config/io.write-config.test.ts`

### `src/config/schema.help.quality.test.ts/` (1)

- [ ] `src/config/schema.help.quality.test.ts`

### `src/config/schema.help.ts/` (1)

- [ ] `src/config/schema.help.ts`

### `src/config/schema.labels.ts/` (1)

- [ ] `src/config/schema.labels.ts`

### `src/config/types.discord.ts/` (1)

- [ ] `src/config/types.discord.ts`

### `src/config/types.openclaw.ts/` (1)

- [ ] `src/config/types.openclaw.ts`

### `src/config/types.tools.ts/` (1)

- [ ] `src/config/types.tools.ts`

### `src/config/types.tts.ts/` (1)

- [ ] `src/config/types.tts.ts`

### `src/config/zod-schema.agent-runtime.ts/` (1)

- [ ] `src/config/zod-schema.agent-runtime.ts`

### `src/config/zod-schema.core.ts/` (1)

- [ ] `src/config/zod-schema.core.ts`

### `src/config/zod-schema.providers-core.ts/` (1)

- [ ] `src/config/zod-schema.providers-core.ts`

### `src/daemon/launchd.test.ts/` (1)

- [ ] `src/daemon/launchd.test.ts`

### `src/daemon/launchd.ts/` (1)

- [ ] `src/daemon/launchd.ts`

### `src/daemon/schtasks.ts/` (1)

- [ ] `src/daemon/schtasks.ts`

### `src/daemon/service.ts/` (1)

- [ ] `src/daemon/service.ts`

### `src/gateway/chat-attachments.test.ts/` (1)

- [ ] `src/gateway/chat-attachments.test.ts`

### `src/gateway/chat-attachments.ts/` (1)

- [ ] `src/gateway/chat-attachments.ts`

### `src/gateway/method-scopes.ts/` (1)

- [ ] `src/gateway/method-scopes.ts`

### `src/gateway/server-methods-list.ts/` (1)

- [ ] `src/gateway/server-methods-list.ts`

### `src/gateway/server-methods.ts/` (1)

- [ ] `src/gateway/server-methods.ts`

### `src/gateway/server-plugins.ts/` (1)

- [ ] `src/gateway/server-plugins.ts`

### `src/gateway/server.auth.browser-hardening.test.ts/` (1)

- [ ] `src/gateway/server.auth.browser-hardening.test.ts`

### `src/gateway/server.chat.gateway-server-chat-b.test.ts/` (1)

- [ ] `src/gateway/server.chat.gateway-server-chat-b.test.ts`

### `src/gateway/server.chat.gateway-server-chat.test.ts/` (1)

- [ ] `src/gateway/server.chat.gateway-server-chat.test.ts`

### `src/gateway/server.config-patch.test.ts/` (1)

- [ ] `src/gateway/server.config-patch.test.ts`

### `src/gateway/server.impl.ts/` (1)

- [ ] `src/gateway/server.impl.ts`

### `src/gateway/server.talk-config.test.ts/` (1)

- [ ] `src/gateway/server.talk-config.test.ts`

### `src/gateway/session-utils.fs.ts/` (1)

- [ ] `src/gateway/session-utils.fs.ts`

### `src/gateway/session-utils.ts/` (1)

- [ ] `src/gateway/session-utils.ts`

### `src/gateway/tools-invoke-http.test.ts/` (1)

- [ ] `src/gateway/tools-invoke-http.test.ts`

### `src/gateway/tools-invoke-http.ts/` (1)

- [ ] `src/gateway/tools-invoke-http.ts`

### `src/infra/process-respawn.test.ts/` (1)

- [ ] `src/infra/process-respawn.test.ts`

### `src/infra/process-respawn.ts/` (1)

- [ ] `src/infra/process-respawn.ts`

### `src/infra/provider-usage.test.ts/` (1)

- [ ] `src/infra/provider-usage.test.ts`

### `src/install-sh-version.test.ts/` (1)

- [ ] `src/install-sh-version.test.ts`

### `src/media/mime.ts/` (1)

- [ ] `src/media/mime.ts`

### `src/node-host/invoke-system-run-plan.test.ts/` (1)

- [ ] `src/node-host/invoke-system-run-plan.test.ts`

### `src/node-host/invoke-system-run-plan.ts/` (1)

- [ ] `src/node-host/invoke-system-run-plan.ts`

### `src/node-host/invoke-system-run.test.ts/` (1)

- [ ] `src/node-host/invoke-system-run.test.ts`

### `src/plugin-sdk/status-helpers.test.ts/` (1)

- [ ] `src/plugin-sdk/status-helpers.test.ts`

### `src/plugins/discovery.test.ts/` (1)

- [ ] `src/plugins/discovery.test.ts`

### `src/plugins/loader.ts/` (1)

- [ ] `src/plugins/loader.ts`

### `src/plugins/registry.ts/` (1)

- [ ] `src/plugins/registry.ts`

### `src/secrets/provider-env-vars.ts/` (1)

- [ ] `src/secrets/provider-env-vars.ts`

### `src/terminal/ansi.ts/` (1)

- [ ] `src/terminal/ansi.ts`

### `src/terminal/table.test.ts/` (1)

- [ ] `src/terminal/table.test.ts`

### `src/terminal/table.ts/` (1)

- [ ] `src/terminal/table.ts`

### `src/tts/tts-core.ts/` (1)

- [ ] `src/tts/tts-core.ts`

### `src/tts/tts.test.ts/` (1)

- [ ] `src/tts/tts.test.ts`

### `src/tts/tts.ts/` (1)

- [ ] `src/tts/tts.ts`

---

## 2. `ui/` — 采用 upstream ✅

- [x] `ui/package.json` (UU)
- [x] `ui/src/i18n/locales/en.ts` (UU)
- [x] `ui/src/styles/layout.css` (UU)
- [x] `ui/src/ui/app-render.helpers.ts` (UU)
- [x] `ui/src/ui/app-render.ts` (UU)
- [x] `ui/src/ui/app-settings.ts` (UU)
- [x] `ui/src/ui/app-view-state.ts` (UU)
- [x] `ui/src/ui/icons.ts` (UU)
- [x] `ui/src/ui/navigation.ts` (UU)

已执行：`git checkout --theirs -- ui/ && git add ui/`（2026-05-20）

---

## 3. Fork 独有（无冲突）

- `ui-react/` — 主聊天 UI，merge 无冲突项
- `apps/electron/` — 桌面壳，merge 无冲突项
- 合并后需根据 upstream API 变化做适配性检查（见 MERGE_INVENTORY A 区）

---

## 4. 波次 1：改/删冲突 (DU/UD)

详见 [modify-delete-decisions.md](./modify-delete-decisions.md)。

- [ ] `UD	.vscode/settings.json`
- [x] `DU	apps/ios/Config/Version.xcconfig`（已随 apps/ios theirs）
- [ ] `DU	apps/macos/Sources/OpenClaw/RemoteGatewayProbe.swift`
- [ ] `DU	apps/macos/Tests/OpenClawIPCTests/OnboardingRemoteAuthPromptTests.swift`
- [ ] `UD	docs/design/kilo-gateway-integration.md`
- [ ] `UD	docs/platforms/mac/release.md`
- [ ] `UD	extensions/bluebubbles/package.json`
- [ ] `UD	extensions/google-gemini-cli-auth/package.json`
- [ ] `UD	extensions/minimax-portal-auth/index.ts`
- [ ] `UD	extensions/minimax-portal-auth/package.json`
- [ ] `UD	extensions/msteams/CHANGELOG.md`
- [ ] `UD	extensions/nostr/CHANGELOG.md`
- [ ] `UD	extensions/twitch/CHANGELOG.md`
- [ ] `UD	extensions/voice-call/CHANGELOG.md`
- [ ] `UD	extensions/voice-call/src/providers/tts-openai.ts`
- [ ] `UD	extensions/zalo/CHANGELOG.md`
- [ ] `UD	extensions/zalouser/CHANGELOG.md`
- [ ] `DU	packages/memory-host-sdk/src/host/embedding-inputs.ts`
- [ ] `DU	packages/memory-host-sdk/src/host/embedding-vectors.ts`
- [ ] `DU	packages/memory-host-sdk/src/host/multimodal.ts`
- [ ] `DU	scripts/ios-beta-prepare.sh`
- [ ] `DU	scripts/ios-write-version-xcconfig.sh`
- [ ] `UD	skills/openai-image-gen/SKILL.md`
- [ ] `UD	src/agents/huggingface-models.ts`
- [ ] `UD	src/agents/huggingface-models.ts`
- [ ] `UD	src/agents/models-config.fills-missing-provider-apikey-from-env-var.test.ts`
- [ ] `UD	src/agents/models-config.fills-missing-provider-apikey-from-env-var.test.ts`
- [ ] `UD	src/agents/models-config.providers.discovery.ts`
- [ ] `UD	src/agents/models-config.providers.discovery.ts`
- [ ] `UD	src/agents/models-config.providers.static.ts`
- [ ] `UD	src/agents/models-config.providers.static.ts`
- [ ] `UD	src/agents/openai-ws-connection.ts`
- [ ] `UD	src/agents/openai-ws-connection.ts`
- [ ] `UD	src/agents/openai-ws-stream.test.ts`
- [ ] `UD	src/agents/openai-ws-stream.test.ts`
- [ ] `UD	src/agents/openai-ws-stream.ts`
- [ ] `UD	src/agents/openai-ws-stream.ts`
- [ ] `UD	src/agents/pi-embedded-runner/run/attempt.spawn-workspace.test.ts`
- [ ] `UD	src/agents/pi-embedded-runner/run/attempt.spawn-workspace.test.ts`
- [ ] `UD	src/agents/pi-extensions/context-pruning/pruner.test.ts`
- [ ] `UD	src/agents/pi-extensions/context-pruning/pruner.test.ts`
- [ ] `DU	src/agents/tool-catalog.test.ts`
- [ ] `DU	src/agents/tool-catalog.test.ts`
- [ ] `UD	src/agents/venice-models.ts`
- [ ] `UD	src/agents/venice-models.ts`
- [ ] `UD	src/auto-reply/reply.directive.directive-behavior.defaults-think-low-reasoning-capable-models-no.test.ts`
- [ ] `UD	src/auto-reply/reply.directive.directive-behavior.defaults-think-low-reasoning-capable-models-no.test.ts`
- [ ] `UD	src/channels/plugins/outbound/whatsapp.sendpayload.test.ts`
- [ ] `UD	src/channels/plugins/outbound/whatsapp.sendpayload.test.ts`
- [ ] `UD	src/channels/plugins/outbound/whatsapp.ts`
- [ ] `UD	src/channels/plugins/outbound/whatsapp.ts`
- [ ] `UD	src/commands/auth-choice.apply.minimax.test.ts`
- [ ] `UD	src/commands/auth-choice.apply.minimax.test.ts`
- [ ] `UD	src/commands/auth-choice.apply.minimax.ts`
- [ ] `UD	src/commands/auth-choice.apply.minimax.ts`
- [ ] `UD	src/commands/onboard-auth.config-core.ts`
- [ ] `UD	src/commands/onboard-auth.config-core.ts`
- [ ] `UD	src/commands/onboard-auth.config-minimax.ts`
- [ ] `UD	src/commands/onboard-auth.config-minimax.ts`
- [ ] `UD	src/commands/onboard-auth.credentials.ts`
- [ ] `UD	src/commands/onboard-auth.credentials.ts`
- [ ] `UD	src/commands/onboard-auth.models.ts`
- [ ] `UD	src/commands/onboard-auth.models.ts`
- [ ] `UD	src/commands/onboard-auth.ts`
- [ ] `UD	src/commands/onboard-auth.ts`
- [ ] `UD	src/commands/onboard-non-interactive.provider-auth.test.ts`
- [ ] `UD	src/commands/onboard-non-interactive.provider-auth.test.ts`
- [ ] `UD	src/commands/onboard-provider-auth-flags.ts`
- [ ] `UD	src/commands/onboard-provider-auth-flags.ts`
- [ ] `UD	src/config/config.discord.test.ts`
- [ ] `UD	src/config/config.discord.test.ts`
- [ ] `UD	src/config/config.identity-defaults.test.ts`
- [ ] `UD	src/config/config.identity-defaults.test.ts`
- [ ] `DU	src/config/zod-schema.tts.test.ts`
- [ ] `DU	src/config/zod-schema.tts.test.ts`
- [ ] `DU	src/daemon/launchd-restart-handoff.test.ts`
- [ ] `DU	src/daemon/launchd-restart-handoff.test.ts`
- [ ] `DU	src/daemon/launchd-restart-handoff.ts`
- [ ] `DU	src/daemon/launchd-restart-handoff.ts`
- [ ] `DU	src/gateway/server.device-token-rotate-authz.test.ts`
- [ ] `DU	src/gateway/server.device-token-rotate-authz.test.ts`
- [ ] `DU	src/infra/net/proxy-env.test.ts`
- [ ] `DU	src/infra/net/proxy-env.test.ts`
- [ ] `UD	src/memory/embedding-model-limits.ts`
- [ ] `UD	src/memory/embedding-model-limits.ts`
- [ ] `UD	src/memory/embeddings-ollama.ts`
- [ ] `UD	src/memory/embeddings-ollama.ts`
- [ ] `UD	src/memory/embeddings.ts`
- [ ] `UD	src/memory/embeddings.ts`
- [ ] `UD	src/memory/index.test.ts`
- [ ] `UD	src/memory/index.test.ts`
- [ ] `UD	src/memory/internal.test.ts`
- [ ] `UD	src/memory/internal.test.ts`
- [ ] `UD	src/memory/manager-embedding-ops.ts`
- [ ] `UD	src/memory/manager-embedding-ops.ts`
- [ ] `UD	src/memory/manager.ts`
- [ ] `UD	src/memory/manager.ts`
- [ ] `UD	src/memory/manager.watcher-config.test.ts`
- [ ] `UD	src/memory/manager.watcher-config.test.ts`
- [ ] `UD	src/plugin-sdk/voice-call.ts`
- [ ] `UD	src/plugin-sdk/voice-call.ts`
- [ ] `UD	src/telegram/bot-message-dispatch.test.ts`
- [ ] `UD	src/telegram/bot-message-dispatch.test.ts`
- [ ] `UD	src/telegram/fetch.ts`
- [ ] `UD	src/telegram/fetch.ts`
- [ ] `UD	src/telegram/lane-delivery-text-deliverer.ts`
- [ ] `UD	src/telegram/lane-delivery-text-deliverer.ts`
- [ ] `UD	src/web/outbound.test.ts`
- [ ] `UD	src/web/outbound.test.ts`
- [ ] `UD	src/web/outbound.ts`
- [ ] `UD	src/web/outbound.ts`
- [ ] `UD	src/wizard/onboarding.finalize.ts`
- [ ] `UD	src/wizard/onboarding.finalize.ts`
- [ ] `UD	src/wizard/onboarding.ts`
- [ ] `UD	src/wizard/onboarding.ts`

---

## 5. 波次 0：根配置

- [ ] `.npmrc`
- [ ] `.oxlintrc.json`
- [ ] `CHANGELOG.md`
- [ ] `appcast.xml`
- [ ] `git-hooks/pre-commit`
- [ ] `openclaw.mjs`
- [ ] `package.json`
- [ ] `packages/memory-host-sdk/src/host/internal.ts`
- [ ] `pnpm-lock.yaml`
- [ ] `pnpm-workspace.yaml`
- [ ] `tsdown.config.ts`

---

## 6. extensions/ ✅（2026-05-20）

全部 46 项已处理：UU → `checkout --theirs`；UD → `git rm`（upstream 删除）。

**UD 已删除（11）：** `bluebubbles/package.json`、`google-gemini-cli-auth/package.json`、`minimax-portal-auth/*`、`msteams/nostr/twitch/voice-call/zalo/zalouser` 部分 CHANGELOG、`voice-call/.../tts-openai.ts`

**说明：** `extensions/feishu/package.json` 已用 upstream 版本；fork 飞书定制若 upstream 未覆盖，合并后需另 PR 接回。

<details><summary>原 checklist（已折叠）</summary>

- [x] `extensions/acpx/package.json` (UU)
- [ ] `extensions/copilot-proxy/package.json` (UU)
- [ ] `extensions/diagnostics-otel/package.json` (UU)
- [ ] `extensions/diffs/package.json` (UU)
- [ ] `extensions/discord/package.json` (UU)
- [ ] `extensions/feishu/package.json` (UU)
- [ ] `extensions/google/embedding-batch.ts` (UU)
- [ ] `extensions/google/embedding-provider.ts` (UU)
- [ ] `extensions/googlechat/package.json` (UU)
- [ ] `extensions/imessage/package.json` (UU)
- [ ] `extensions/irc/package.json` (UU)
- [ ] `extensions/line/package.json` (UU)
- [ ] `extensions/llm-task/package.json` (UU)
- [ ] `extensions/lobster/package.json` (UU)
- [ ] `extensions/matrix/CHANGELOG.md` (UU)
- [ ] `extensions/matrix/package.json` (UU)
- [ ] `extensions/mattermost/package.json` (UU)
- [ ] `extensions/memory-core/package.json` (UU)
- [ ] `extensions/memory-core/src/memory/manager-sync-ops.ts` (UU)
- [ ] `extensions/memory-lancedb/package.json` (UU)
- [ ] `extensions/msteams/package.json` (UU)
- [ ] `extensions/nextcloud-talk/package.json` (UU)
- [ ] `extensions/nostr/package.json` (UU)
- [ ] `extensions/open-prose/package.json` (UU)
- [ ] `extensions/signal/package.json` (UU)
- [ ] `extensions/slack/package.json` (UU)
- [ ] `extensions/synology-chat/package.json` (UU)
- [ ] `extensions/telegram/package.json` (UU)
- [ ] `extensions/tlon/package.json` (UU)
- [ ] `extensions/twitch/package.json` (UU)
- [ ] `extensions/voice-call/openclaw.plugin.json` (UU)
- [ ] `extensions/voice-call/package.json` (UU)
- [ ] `extensions/whatsapp/package.json` (UU)
- [ ] `extensions/zalo/package.json` (UU)
- [ ] `extensions/zalouser/package.json` (UU)

</details>

---

## 7. apps/（非 electron）

### `apps/ios/` ✅（2026-05-20，`checkout --theirs`）

- [x] `apps/ios/Config/Signing.xcconfig`、`Version.xcconfig`（DU）
- [x] `apps/ios/README.md`、`project.yml`、`Sources/*`、`fastlane/*`

### 待处理

- [ ] `UU	apps/android/app/build.gradle.kts`
- [ ] `UU	apps/macos/Sources/OpenClaw/AppState.swift`
- [ ] `UU	apps/macos/Sources/OpenClaw/NodeMode/MacNodeBrowserProxy.swift`
- [ ] `UU	apps/macos/Sources/OpenClaw/OnboardingView+Pages.swift`
- [ ] `UU	apps/macos/Sources/OpenClaw/Resources/Info.plist`
- [ ] `UU	apps/macos/Tests/OpenClawIPCTests/GatewayChannelConnectTests.swift`
- [ ] `UU	apps/macos/Tests/OpenClawIPCTests/GatewayWebSocketTestSupport.swift`
- [ ] `UU	apps/macos/Tests/OpenClawIPCTests/MacNodeBrowserProxyTests.swift`
- [ ] `UU	apps/shared/OpenClawKit/Sources/OpenClawKit/GatewayChannel.swift`
- [ ] `UU	apps/shared/OpenClawKit/Sources/OpenClawKit/GatewayErrors.swift`

---

## 8. docs / CI / test / 其他

- [ ] `OTHER	src/gateway/protocol/schema/plugins.ts`
- [x] `.github/workflows/*` ✅（2026-05-20，`checkout --theirs`，6 文件）
- [x] `auto-response.yml`、`ci.yml`、`docker-release.yml`、`install-smoke.yml`、`openclaw-npm-release.yml`、`workflow-sanity.yml`
- [ ] `UU	docs/cli/index.md`
- [ ] `UU	docs/concepts/memory.md`
- [ ] `UU	docs/concepts/model-providers.md`
- [ ] `UU	docs/docs.json`
- [ ] `UU	docs/gateway/configuration-examples.md`
- [ ] `UU	docs/gateway/configuration-reference.md`
- [ ] `UU	docs/gateway/local-models.md`
- [ ] `UU	docs/help/faq.md`
- [ ] `UU	docs/help/testing.md`
- [ ] `UU	docs/providers/minimax.md`
- [ ] `UU	docs/providers/ollama.md`
- [ ] `UU	docs/providers/synthetic.md`
- [ ] `UU	docs/providers/venice.md`
- [ ] `UU	docs/reference/wizard.md`
- [ ] `UU	docs/start/wizard-cli-reference.md`
- [ ] `UU	skills/openai-whisper-api/SKILL.md`
- [ ] `UU	skills/weather/SKILL.md`
- [ ] `UU	test/helpers/auto-reply/trigger-handling-test-harness.ts`
- [ ] `UU	test/openclaw-npm-release-check.test.ts`
- [ ] `UU	test/setup.ts`
