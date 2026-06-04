# src/ 合并队列（待人工）
**生成：** merge 进行中 · **未合并 src 文件：** 215（UU=168，DU/UD=47）
**原则：** 逐文件 review；`git diff 841ee24340..354df8b5d0 -- <path>` 查 fork 独有改动；禁止批量 `--theirs`。
---

## 推荐顺序

| 序 | 模块 | 文件数 | Fork 关切 |
|----|------|--------|----------|
| M1 | `src/config/` | 19 | 配置 / schema、identityHints、飞书/微信 session |
| M2 | `src/gateway/protocol/` | 7 | Gateway 协议 / ui-react schema |
| M3 | `src/gateway/server-methods/` | 12 | Gateway 方法：chat、attachments、profile |
| M4 | `src/gateway/` | 20 | Gateway 核心（排除 M2/M3） |
| M5 | `src/agents/tools/` | 8 | 互动工具、message-tool、office-helper |
| M6 | `src/agents/` | 52 | Agents 核心（排除 M5） |
| M7 | `src/commands/` | 28 | onboard、minimax、ollama、channel auth |
| M8 | `src/auto-reply/` | 5 | 聊天/附件/会话 |
| M9 | `src/channels/, src/infra/` | 12 | recipient-resolver、outbound |
| M10 | `其余 src/` | 52 | cli、plugins、routing、memory、telegram 等 |

**波次 1 穿插：** 每模块内的 `UD`/`DU` 先登记 [modify-delete-decisions.md](./modify-delete-decisions.md) 再动 `UU`。

---

## M1 — 配置 / schema、identityHints、飞书/微信 session

**19 文件**（UU 16，DU/UD 3）

### `src/config/config.discord.test.ts/`

- [ ] `UD` `src/config/config.discord.test.ts`

### `src/config/config.identity-defaults.test.ts/`

- [ ] `UD` `src/config/config.identity-defaults.test.ts`

### `src/config/config.plugin-validation.test.ts/`

- [ ] `UU` `src/config/config.plugin-validation.test.ts`

### `src/config/config.schema-regressions.test.ts/`

- [ ] `UU` `src/config/config.schema-regressions.test.ts`

### `src/config/io.ts/`

- [ ] `UU` `src/config/io.ts`

### `src/config/io.write-config.test.ts/`

- [ ] `UU` `src/config/io.write-config.test.ts`

### `src/config/schema.help.quality.test.ts/`

- [ ] `UU` `src/config/schema.help.quality.test.ts`

### `src/config/schema.help.ts/`

- [ ] `UU` `src/config/schema.help.ts`

### `src/config/schema.labels.ts/`

- [ ] `UU` `src/config/schema.labels.ts`

### `src/config/sessions/`

- [ ] `UU` `src/config/sessions/metadata.ts` **← B12 identityHints**
- [ ] `UU` `src/config/sessions/types.ts`

### `src/config/types.discord.ts/`

- [ ] `UU` `src/config/types.discord.ts`

### `src/config/types.openclaw.ts/`

- [ ] `UU` `src/config/types.openclaw.ts`

### `src/config/types.tools.ts/`

- [ ] `UU` `src/config/types.tools.ts`

### `src/config/types.tts.ts/`

- [ ] `UU` `src/config/types.tts.ts`

### `src/config/zod-schema.agent-runtime.ts/`

- [ ] `UU` `src/config/zod-schema.agent-runtime.ts`

### `src/config/zod-schema.core.ts/`

- [ ] `UU` `src/config/zod-schema.core.ts`

### `src/config/zod-schema.providers-core.ts/`

- [ ] `UU` `src/config/zod-schema.providers-core.ts`

### `src/config/zod-schema.tts.test.ts/`

- [ ] `DU` `src/config/zod-schema.tts.test.ts`

## M2 — Gateway 协议 / ui-react schema

**7 文件**（UU 6，DU/UD 1）

### `src/gateway/protocol/`

- [x] `UU` `src/gateway/protocol/index.ts` — 阶段 2 ✅
- [x] `UU` `src/gateway/protocol/schema/agents-models-skills.ts` — 阶段 2 ✅
- [x] `UU` `src/gateway/protocol/schema/channels.ts` — 阶段 2 ✅
- [x] `UU` `src/gateway/protocol/schema/logs-chat.ts` — 阶段 2 ✅
- [x] `OTHER` `src/gateway/protocol/schema/plugins.ts` — 阶段 2 ✅
- [x] `UU` `src/gateway/protocol/schema/protocol-schemas.ts` — 阶段 2 ✅
- [x] `UU` `src/gateway/protocol/schema/types.ts` — 阶段 2 ✅

## M3 — Gateway 方法：chat、attachments、profile

**12 文件**（UU 12，DU/UD 0）

### `src/gateway/server-methods/`

- [x] `UU` `src/gateway/server-methods/agent.ts` — 阶段 4 ✅（theirs）
- [x] `UU` `src/gateway/server-methods/agents.ts` — 阶段 4 ✅（ours）
- [x] `UU` `src/gateway/server-methods/attachment-normalize.ts` — 阶段 4 ✅
- [x] `UU` `src/gateway/server-methods/channels.ts` — 阶段 4 ✅
- [x] `UU` `src/gateway/server-methods/chat-transcript-inject.ts` — 阶段 4 ✅
- [x] `UU` `src/gateway/server-methods/chat.directive-tags.test.ts` — 阶段 4 ✅（theirs）
- [x] `UU` `src/gateway/server-methods/chat.ts` — 阶段 4 ✅
- [x] `UU` `src/gateway/server-methods/config.ts` — 阶段 4 ✅
- [x] `UU` `src/gateway/server-methods/devices.ts` — 阶段 4 ✅（theirs）
- [x] `UU` `src/gateway/server-methods/server-methods.test.ts` — 阶段 4 ✅
- [x] `UU` `src/gateway/server-methods/skills.ts` — 阶段 4 ✅
- [x] `UU` `src/gateway/server-methods/web.ts` — 阶段 4 ✅

## M4 — Gateway 核心（排除 M2/M3）

**20 文件**（UU 19，DU/UD 1）

### `src/gateway/chat-attachments.test.ts/`

- [x] `UU` `src/gateway/chat-attachments.test.ts` — 阶段 4 ✅（ours）

### `src/gateway/chat-attachments.ts/`

- [x] `UU` `src/gateway/chat-attachments.ts` — 阶段 4 ✅（ours）

### `src/gateway/method-scopes.ts/`

- [x] `UU` `src/gateway/method-scopes.ts` — 阶段 3 ✅

### `src/gateway/server/`

- [x] `UU` `src/gateway/server/plugins-http.test.ts` — 阶段 3 ✅
- [x] `UU` `src/gateway/server/plugins-http.ts` — 阶段 3 ✅
- [x] `UU` `src/gateway/server/ws-connection/message-handler.ts` — 阶段 3 ✅

### `src/gateway/server-methods-list.ts/`

- [x] `UU` `src/gateway/server-methods-list.ts` — 阶段 3 ✅

### `src/gateway/server-methods.ts/`

- [x] `UU` `src/gateway/server-methods.ts` — 阶段 3 ✅

### `src/gateway/server-plugins.ts/`

- [x] `UU` `src/gateway/server-plugins.ts` — 阶段 3 ✅

### `src/gateway/server.auth.browser-hardening.test.ts/`

- [x] `UU` `src/gateway/server.auth.browser-hardening.test.ts` — 阶段 3 ✅

### `src/gateway/server.chat.gateway-server-chat-b.test.ts/`

- [x] `UU` `src/gateway/server.chat.gateway-server-chat-b.test.ts` — 阶段 3 ✅

### `src/gateway/server.chat.gateway-server-chat.test.ts/`

- [x] `UU` `src/gateway/server.chat.gateway-server-chat.test.ts` — 阶段 3 ✅

### `src/gateway/server.config-patch.test.ts/`

- [x] `UU` `src/gateway/server.config-patch.test.ts` — 阶段 3 ✅

### `src/gateway/server.device-token-rotate-authz.test.ts/`

- [ ] `DU` `src/gateway/server.device-token-rotate-authz.test.ts`

### `src/gateway/server.impl.ts/`

- [x] `UU` `src/gateway/server.impl.ts` — 阶段 5 ✅（upstream + `ensureBuiltinAgents`）

### `src/gateway/server.talk-config.test.ts/`

- [x] `UU` `src/gateway/server.talk-config.test.ts` — 阶段 3 ✅

### `src/gateway/session-utils.fs.ts/`

- [x] `UU` `src/gateway/session-utils.fs.ts` — 阶段 3 ✅（upstream + `cleanTranscriptText`）

### `src/gateway/session-utils.ts/`

- [x] `UU` `src/gateway/session-utils.ts` — 阶段 3 ✅

### `src/gateway/tools-invoke-http.test.ts/`

- [x] `UU` `src/gateway/tools-invoke-http.test.ts` — 阶段 3 ✅

### `src/gateway/tools-invoke-http.ts/`

- [x] `UU` `src/gateway/tools-invoke-http.ts` — 阶段 3 ✅

## M5 — 互动工具、message-tool、office-helper

**8 文件**（UU 8，DU/UD 0）

### `src/agents/tools/`

- [ ] `UU` `src/agents/tools/common.ts`
- [ ] `UU` `src/agents/tools/cron-tool.test.ts` **← B14**
- [ ] `UU` `src/agents/tools/cron-tool.ts` **← B14**
- [ ] `UU` `src/agents/tools/image-tool.test.ts`
- [ ] `UU` `src/agents/tools/message-tool.test.ts` **← B3 message-tool**
- [ ] `UU` `src/agents/tools/message-tool.ts` **← B3 message-tool**
- [ ] `UU` `src/agents/tools/sessions-helpers.ts`
- [ ] `UU` `src/agents/tools/sessions.test.ts`

## M6 — Agents 核心（排除 M5）

**52 文件**（UU 41，DU/UD 11）

### `src/agents/huggingface-models.ts/`

- [ ] `UD` `src/agents/huggingface-models.ts`

### `src/agents/live-model-errors.test.ts/`

- [ ] `UU` `src/agents/live-model-errors.test.ts`

### `src/agents/memory-search.test.ts/`

- [ ] `UU` `src/agents/memory-search.test.ts`

### `src/agents/memory-search.ts/`

- [ ] `UU` `src/agents/memory-search.ts`

### `src/agents/minimax.live.test.ts/`

- [ ] `UU` `src/agents/minimax.live.test.ts`

### `src/agents/model-fallback.ts/`

- [ ] `UU` `src/agents/model-fallback.ts`

### `src/agents/models-config.fills-missing-provider-apikey-from-env-var.test.ts/`

- [ ] `UD` `src/agents/models-config.fills-missing-provider-apikey-from-env-var.test.ts`

### `src/agents/models-config.preserves-explicit-reasoning-override.test.ts/`

- [ ] `UU` `src/agents/models-config.preserves-explicit-reasoning-override.test.ts`

### `src/agents/models-config.providers.discovery.ts/`

- [ ] `UD` `src/agents/models-config.providers.discovery.ts`

### `src/agents/models-config.providers.minimax.test.ts/`

- [ ] `UU` `src/agents/models-config.providers.minimax.test.ts`

### `src/agents/models-config.providers.static.ts/`

- [ ] `UD` `src/agents/models-config.providers.static.ts`

### `src/agents/models-config.skips-writing-models-json-no-env-token.test.ts/`

- [ ] `UU` `src/agents/models-config.skips-writing-models-json-no-env-token.test.ts`

### `src/agents/models.profiles.live.test.ts/`

- [ ] `UU` `src/agents/models.profiles.live.test.ts`

### `src/agents/openai-ws-connection.ts/`

- [ ] `UD` `src/agents/openai-ws-connection.ts`

### `src/agents/openai-ws-stream.test.ts/`

- [ ] `UD` `src/agents/openai-ws-stream.test.ts`

### `src/agents/openai-ws-stream.ts/`

- [ ] `UD` `src/agents/openai-ws-stream.ts`

### `src/agents/openclaw-tools.subagents.sessions-spawn.model.test.ts/`

- [ ] `UU` `src/agents/openclaw-tools.subagents.sessions-spawn.model.test.ts`

### `src/agents/openclaw-tools.ts/`

- [ ] `UU` `src/agents/openclaw-tools.ts`

### `src/agents/pi-embedded-helpers/`

- [ ] `UU` `src/agents/pi-embedded-helpers/failover-matches.ts`

### `src/agents/pi-embedded-helpers.isbillingerrormessage.test.ts/`

- [ ] `UU` `src/agents/pi-embedded-helpers.isbillingerrormessage.test.ts`

### `src/agents/pi-embedded-runner/`

- [ ] `UU` `src/agents/pi-embedded-runner/compact.ts`
- [ ] `UU` `src/agents/pi-embedded-runner/model.test.ts`
- [ ] `UU` `src/agents/pi-embedded-runner/model.ts`
- [ ] `UU` `src/agents/pi-embedded-runner/openai-stream-wrappers.ts`
- [ ] `UU` `src/agents/pi-embedded-runner/run.ts`
- [ ] `UD` `src/agents/pi-embedded-runner/run/attempt.spawn-workspace.test.ts`
- [ ] `UU` `src/agents/pi-embedded-runner/run/attempt.ts`
- [ ] `UU` `src/agents/pi-embedded-runner/run/history-image-prune.test.ts`
- [ ] `UU` `src/agents/pi-embedded-runner/run/history-image-prune.ts`
- [ ] `UU` `src/agents/pi-embedded-runner/run/params.ts`
- [ ] `UU` `src/agents/pi-embedded-runner/run/payloads.ts`

### `src/agents/pi-embedded-runner-extraparams.test.ts/`

- [ ] `UU` `src/agents/pi-embedded-runner-extraparams.test.ts`

### `src/agents/pi-embedded-runner.run-embedded-pi-agent.auth-profile-rotation.e2e.test.ts/`

- [ ] `UU` `src/agents/pi-embedded-runner.run-embedded-pi-agent.auth-profile-rotation.e2e.test.ts`

### `src/agents/pi-embedded-subscribe.handlers.messages.ts/`

- [ ] `UU` `src/agents/pi-embedded-subscribe.handlers.messages.ts`

### `src/agents/pi-embedded-subscribe.handlers.tools.media.test.ts/`

- [ ] `UU` `src/agents/pi-embedded-subscribe.handlers.tools.media.test.ts` **← B4 office-helper boot**

### `src/agents/pi-embedded-subscribe.handlers.tools.test.ts/`

- [ ] `UU` `src/agents/pi-embedded-subscribe.handlers.tools.test.ts` **← B4 office-helper boot**

### `src/agents/pi-embedded-subscribe.handlers.tools.ts/`

- [ ] `UU` `src/agents/pi-embedded-subscribe.handlers.tools.ts` **← B4 office-helper boot**

### `src/agents/pi-embedded-subscribe.handlers.types.ts/`

- [ ] `UU` `src/agents/pi-embedded-subscribe.handlers.types.ts`

### `src/agents/pi-embedded-subscribe.ts/`

- [ ] `UU` `src/agents/pi-embedded-subscribe.ts`

### `src/agents/pi-embedded-utils.ts/`

- [ ] `UU` `src/agents/pi-embedded-utils.ts`

### `src/agents/pi-extensions/`

- [ ] `UD` `src/agents/pi-extensions/context-pruning/pruner.test.ts`

### `src/agents/pi-hooks/`

- [ ] `UU` `src/agents/pi-hooks/context-pruning.test.ts`
- [ ] `UU` `src/agents/pi-hooks/context-pruning/pruner.ts`

### `src/agents/pi-tools.workspace-only-false.test.ts/`

- [ ] `UU` `src/agents/pi-tools.workspace-only-false.test.ts`

### `src/agents/session-tool-result-guard-wrapper.ts/`

- [ ] `UU` `src/agents/session-tool-result-guard-wrapper.ts`

### `src/agents/session-tool-result-guard.tool-result-persist-hook.test.ts/`

- [ ] `UU` `src/agents/session-tool-result-guard.tool-result-persist-hook.test.ts`

### `src/agents/skills/`

- [ ] `UU` `src/agents/skills/frontmatter.ts`

### `src/agents/tool-catalog.test.ts/`

- [ ] `DU` `src/agents/tool-catalog.test.ts`

### `src/agents/tool-policy.test.ts/`

- [ ] `UU` `src/agents/tool-policy.test.ts`

### `src/agents/tool-policy.ts/`

- [ ] `UU` `src/agents/tool-policy.ts`

### `src/agents/venice-models.ts/`

- [ ] `UD` `src/agents/venice-models.ts`

### `src/agents/workspace.ts/`

- [ ] `UU` `src/agents/workspace.ts`

## M7 — onboard、minimax、ollama、channel auth

**28 文件**（UU 19，DU/UD 9）

### `src/commands/agents.config.ts/`

- [ ] `UU` `src/commands/agents.config.ts`

### `src/commands/auth-choice-legacy.ts/`

- [ ] `UU` `src/commands/auth-choice-legacy.ts`

### `src/commands/auth-choice-options.test.ts/`

- [ ] `UU` `src/commands/auth-choice-options.test.ts`

### `src/commands/auth-choice-options.ts/`

- [ ] `UU` `src/commands/auth-choice-options.ts`

### `src/commands/auth-choice.apply.api-providers.ts/`

- [ ] `UU` `src/commands/auth-choice.apply.api-providers.ts`

### `src/commands/auth-choice.apply.minimax.test.ts/`

- [ ] `UD` `src/commands/auth-choice.apply.minimax.test.ts`

### `src/commands/auth-choice.apply.minimax.ts/`

- [ ] `UD` `src/commands/auth-choice.apply.minimax.ts`

### `src/commands/auth-choice.apply.ts/`

- [ ] `UU` `src/commands/auth-choice.apply.ts`

### `src/commands/auth-choice.preferred-provider.ts/`

- [ ] `UU` `src/commands/auth-choice.preferred-provider.ts`

### `src/commands/auth-choice.test.ts/`

- [ ] `UU` `src/commands/auth-choice.test.ts`

### `src/commands/configure.daemon.ts/`

- [ ] `UU` `src/commands/configure.daemon.ts`

### `src/commands/configure.gateway-auth.prompt-auth-config.test.ts/`

- [ ] `UU` `src/commands/configure.gateway-auth.prompt-auth-config.test.ts`

### `src/commands/message-format.ts/`

- [ ] `UU` `src/commands/message-format.ts`

### `src/commands/models/`

- [ ] `UU` `src/commands/models/list.status-command.ts`

### `src/commands/onboard-auth.config-core.ts/`

- [ ] `UD` `src/commands/onboard-auth.config-core.ts`

### `src/commands/onboard-auth.config-minimax.ts/`

- [ ] `UD` `src/commands/onboard-auth.config-minimax.ts` **← B15 minimax**

### `src/commands/onboard-auth.credentials.ts/`

- [ ] `UD` `src/commands/onboard-auth.credentials.ts`

### `src/commands/onboard-auth.models.ts/`

- [ ] `UD` `src/commands/onboard-auth.models.ts`

### `src/commands/onboard-auth.test.ts/`

- [ ] `UU` `src/commands/onboard-auth.test.ts`

### `src/commands/onboard-auth.ts/`

- [ ] `UD` `src/commands/onboard-auth.ts`

### `src/commands/onboard-custom.test.ts/`

- [ ] `UU` `src/commands/onboard-custom.test.ts`

### `src/commands/onboard-custom.ts/`

- [ ] `UU` `src/commands/onboard-custom.ts`

### `src/commands/onboard-non-interactive/`

- [ ] `UU` `src/commands/onboard-non-interactive/local/auth-choice-inference.ts`
- [ ] `UU` `src/commands/onboard-non-interactive/local/auth-choice.ts`

### `src/commands/onboard-non-interactive.provider-auth.test.ts/`

- [ ] `UD` `src/commands/onboard-non-interactive.provider-auth.test.ts`

### `src/commands/onboard-provider-auth-flags.ts/`

- [ ] `UD` `src/commands/onboard-provider-auth-flags.ts`

### `src/commands/onboard-types.ts/`

- [ ] `UU` `src/commands/onboard-types.ts`

### `src/commands/status.command.ts/`

- [ ] `UU` `src/commands/status.command.ts`

## M8 — 聊天/附件/会话

**5 文件**（UU 4，DU/UD 1）

### `src/auto-reply/reply/`

- [ ] `UU` `src/auto-reply/reply/agent-runner-execution.ts`
- [ ] `UU` `src/auto-reply/reply/agent-runner-utils.ts`
- [ ] `UU` `src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts`

### `src/auto-reply/reply.directive.directive-behavior.defaults-think-low-reasoning-capable-models-no.test.ts/`

- [ ] `UD` `src/auto-reply/reply.directive.directive-behavior.defaults-think-low-reasoning-capable-models-no.test.ts`

### `src/auto-reply/reply.directive.directive-behavior.prefers-alias-matches-fuzzy-selection-is-ambiguous.test.ts/`

- [ ] `UU` `src/auto-reply/reply.directive.directive-behavior.prefers-alias-matches-fuzzy-selection-is-ambiguous.test.ts`

## M9 — recipient-resolver、outbound

**12 文件**（UU 9，DU/UD 3）

### `src/channels/plugins/`

- [ ] `UD` `src/channels/plugins/outbound/whatsapp.sendpayload.test.ts`
- [ ] `UD` `src/channels/plugins/outbound/whatsapp.ts`

### `src/channels/registry.ts/`

- [ ] `UU` `src/channels/registry.ts`

### `src/infra/net/`

- [ ] `DU` `src/infra/net/proxy-env.test.ts`
- [ ] `UU` `src/infra/net/proxy-env.ts`
- [ ] `UU` `src/infra/net/proxy-fetch.test.ts`
- [ ] `UU` `src/infra/net/proxy-fetch.ts`
- [ ] `UU` `src/infra/net/undici-global-dispatcher.test.ts`
- [ ] `UU` `src/infra/net/undici-global-dispatcher.ts`

### `src/infra/process-respawn.test.ts/`

- [ ] `UU` `src/infra/process-respawn.test.ts`

### `src/infra/process-respawn.ts/`

- [ ] `UU` `src/infra/process-respawn.ts`

### `src/infra/provider-usage.test.ts/`

- [ ] `UU` `src/infra/provider-usage.test.ts`

## M10 — cli、plugins、routing、memory、telegram 等

**52 文件**（UU 34，DU/UD 18）

### `src/acp/translator.session-rate-limit.test.ts/`

- [ ] `UU` `src/acp/translator.session-rate-limit.test.ts`

### `src/cli/daemon-cli/`

- [ ] `UU` `src/cli/daemon-cli/lifecycle-core.config-guard.test.ts`
- [ ] `UU` `src/cli/daemon-cli/lifecycle-core.test.ts`
- [ ] `UU` `src/cli/daemon-cli/lifecycle-core.ts`

### `src/cli/devices-cli.ts/`

- [ ] `UU` `src/cli/devices-cli.ts`

### `src/cli/hooks-cli.ts/`

- [ ] `UU` `src/cli/hooks-cli.ts`

### `src/cli/nodes-cli/`

- [ ] `UU` `src/cli/nodes-cli/register.camera.ts`
- [ ] `UU` `src/cli/nodes-cli/register.pairing.ts`
- [ ] `UU` `src/cli/nodes-cli/register.status.ts`

### `src/cli/plugins-cli.ts/`

- [ ] `UU` `src/cli/plugins-cli.ts`

### `src/cli/skills-cli.format.ts/`

- [ ] `UU` `src/cli/skills-cli.format.ts`

### `src/cli/skills-cli.test.ts/`

- [ ] `UU` `src/cli/skills-cli.test.ts`

### `src/cron/isolated-agent/`

- [ ] `UU` `src/cron/isolated-agent/delivery-target.test.ts`
- [ ] `UU` `src/cron/isolated-agent/delivery-target.ts`

### `src/daemon/launchd-restart-handoff.test.ts/`

- [ ] `DU` `src/daemon/launchd-restart-handoff.test.ts`

### `src/daemon/launchd-restart-handoff.ts/`

- [ ] `DU` `src/daemon/launchd-restart-handoff.ts`

### `src/daemon/launchd.test.ts/`

- [ ] `UU` `src/daemon/launchd.test.ts`

### `src/daemon/launchd.ts/`

- [ ] `UU` `src/daemon/launchd.ts`

### `src/daemon/schtasks.ts/`

- [ ] `UU` `src/daemon/schtasks.ts`

### `src/daemon/service.ts/`

- [ ] `UU` `src/daemon/service.ts`

### `src/install-sh-version.test.ts/`

- [ ] `UU` `src/install-sh-version.test.ts`

### `src/media/mime.ts/`

- [ ] `UU` `src/media/mime.ts`

### `src/memory/embedding-model-limits.ts/`

- [ ] `UD` `src/memory/embedding-model-limits.ts`

### `src/memory/embeddings-ollama.ts/`

- [ ] `UD` `src/memory/embeddings-ollama.ts`

### `src/memory/embeddings.ts/`

- [ ] `UD` `src/memory/embeddings.ts`

### `src/memory/index.test.ts/`

- [ ] `UD` `src/memory/index.test.ts`

### `src/memory/internal.test.ts/`

- [ ] `UD` `src/memory/internal.test.ts`

### `src/memory/manager-embedding-ops.ts/`

- [ ] `UD` `src/memory/manager-embedding-ops.ts`

### `src/memory/manager.ts/`

- [ ] `UD` `src/memory/manager.ts`

### `src/memory/manager.watcher-config.test.ts/`

- [ ] `UD` `src/memory/manager.watcher-config.test.ts`

### `src/node-host/invoke-system-run-plan.test.ts/`

- [ ] `UU` `src/node-host/invoke-system-run-plan.test.ts`

### `src/node-host/invoke-system-run-plan.ts/`

- [ ] `UU` `src/node-host/invoke-system-run-plan.ts`

### `src/node-host/invoke-system-run.test.ts/`

- [ ] `UU` `src/node-host/invoke-system-run.test.ts`

### `src/plugin-sdk/status-helpers.test.ts/`

- [ ] `UU` `src/plugin-sdk/status-helpers.test.ts`

### `src/plugin-sdk/voice-call.ts/`

- [ ] `UD` `src/plugin-sdk/voice-call.ts`

### `src/plugins/discovery.test.ts/`

- [ ] `UU` `src/plugins/discovery.test.ts`

### `src/plugins/loader.ts/`

- [ ] `UU` `src/plugins/loader.ts`

### `src/plugins/registry.ts/`

- [ ] `UU` `src/plugins/registry.ts`

### `src/secrets/provider-env-vars.ts/`

- [ ] `UU` `src/secrets/provider-env-vars.ts`

### `src/telegram/bot-message-dispatch.test.ts/`

- [ ] `UD` `src/telegram/bot-message-dispatch.test.ts`

### `src/telegram/fetch.ts/`

- [ ] `UD` `src/telegram/fetch.ts`

### `src/telegram/lane-delivery-text-deliverer.ts/`

- [ ] `UD` `src/telegram/lane-delivery-text-deliverer.ts`

### `src/terminal/ansi.ts/`

- [ ] `UU` `src/terminal/ansi.ts`

### `src/terminal/table.test.ts/`

- [ ] `UU` `src/terminal/table.test.ts`

### `src/terminal/table.ts/`

- [ ] `UU` `src/terminal/table.ts`

### `src/tts/tts-core.ts/`

- [ ] `UU` `src/tts/tts-core.ts`

### `src/tts/tts.test.ts/`

- [ ] `UU` `src/tts/tts.test.ts`

### `src/tts/tts.ts/`

- [ ] `UU` `src/tts/tts.ts`

### `src/web/outbound.test.ts/`

- [ ] `UD` `src/web/outbound.test.ts`

### `src/web/outbound.ts/`

- [ ] `UD` `src/web/outbound.ts`

### `src/wizard/onboarding.finalize.ts/`

- [ ] `UD` `src/wizard/onboarding.finalize.ts`

### `src/wizard/onboarding.ts/`

- [ ] `UD` `src/wizard/onboarding.ts`

---

## Fork 关键路径速查（优先保证）

- `src/agents/pi-embedded-subscribe.handlers.tools.ts` — B4 — ⬜ 未合并
- `src/agents/tools/cron-tool.ts` — B14 — ⬜ 未合并
- `src/agents/tools/message-tool.test.ts` — B3 — ⬜ 未合并
- `src/agents/tools/message-tool.ts` — B3 — ⬜ 未合并
- `src/commands/onboard-auth.config-minimax.ts` — B15 — ⬜ 未合并
- `src/config/sessions/metadata.ts` — B12 identityHints — ⬜ 未合并
- `src/gateway/chat-attachments.ts` — B6 — ⬜ 未合并
- `src/gateway/server-methods/chat-transcript-inject.ts` — B7 — ⬜ 未合并
- `src/gateway/server-methods/profile.ts` — B8 (check path) — ✅ 已解决/无冲突
- `src/gateway/server.impl.ts` — B9 — ⬜ 未合并
- `src/infra/outbound/recipient-resolver.ts` — B13 — ✅ 已解决/无冲突
