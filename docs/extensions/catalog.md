---
title: "Extension Catalog"
summary: "Full list of all 42 built-in OpenClaw extensions, grouped by category"
read_when:
  - You want to know which extensions exist
  - You are choosing a channel or provider extension
---

# Extension catalog

All 42 built-in extensions shipped with OpenClaw, grouped by category.

## Channel extensions

Channel extensions call `api.registerChannel()` to add a messaging surface.

| Extension id | Description |
|---|---|
| `bluebubbles` | BlueBubbles server (macOS iMessage alternative) |
| `discord` | Discord bot |
| `feishu` | Feishu (Lark) |
| `googlechat` | Google Chat |
| `imessage` | iMessage (iOS/macOS, via AppleScript or BlueBubbles) |
| `irc` | IRC |
| `line` | LINE Messenger |
| `matrix` | Matrix protocol |
| `mattermost` | Mattermost |
| `msteams` | Microsoft Teams |
| `nextcloud-talk` | Nextcloud Talk |
| `nostr` | Nostr decentralised protocol |
| `signal` | Signal |
| `slack` | Slack |
| `synology-chat` | Synology Chat |
| `talk-voice` | Voice conversation channel |
| `telegram` | Telegram bot |
| `tlon` | Tlon/Urbit |
| `twitch` | Twitch chat |
| `voice-call` | Voice call channel |
| `whatsapp` | WhatsApp (web protocol) |
| `zalo` | Zalo official bot API |
| `zalouser` | Zalo user-side (personal account) |

## Authentication / provider extensions

Provider extensions call `api.registerProvider()` to add an AI provider with an OAuth or API-key authentication flow.

| Extension id | Provider | Auth kind |
|---|---|---|
| `copilot-proxy` | GitHub Copilot | proxy / token |
| `google-antigravity-auth` | Google (Anti-gravity) | OAuth device code |
| `google-gemini-cli-auth` | Google Gemini CLI | OAuth device code |
| `minimax-portal-auth` | MiniMax Portal | OAuth device code |
| `qwen-portal-auth` | Alibaba Qwen Portal | OAuth device code |

## Memory extensions

Memory extensions set `kind: "memory"` and register agent tools for memory search/retrieval. Only one memory extension is active at a time (selected by `plugins.slots.memory`).

| Extension id | Backend | Default? |
|---|---|---|
| `memory-core` | File-backed search | Yes (`memory-core`) |
| `memory-lancedb` | LanceDB vector database | No |

## Service and command extensions

These extensions register background services (`api.registerService()`) and/or slash commands (`api.registerCommand()`) that bypass the LLM.

| Extension id | Service | Command |
|---|---|---|
| `phone-control` | Expiry timer (checks arm state every 15 s) | `/phone arm\|disarm\|status` |

## Tool and CLI extensions

| Extension id | Registers | Description |
|---|---|---|
| `diffs` | tool | File diff comparison |
| `llm-task` | tool | LLM sub-task scheduling |
| `open-prose` | tool | Text processing |
| `memory-core` | tool + CLI | Memory search + `openclaw memory` CLI |

## Core / infrastructure extensions

| Extension id | Description |
|---|---|
| `acpx` | ACP Extended protocol support |
| `device-pair` | Device pairing management |
| `diagnostics-otel` | OpenTelemetry distributed tracing |
| `lobster` | CLI terminal colour palette |
| `thread-ownership` | Conversation ownership tracking |

## Test and development extensions

| Extension id | Description |
|---|---|
| `shared` | Shared test helpers (not loaded at runtime) |
| `test-utils` | Test utility collection |
