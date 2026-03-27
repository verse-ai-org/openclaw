# Electron 桌面客户端构建命令
# 用法: make <target>
#
# 快速开始:
#   make dev          本地开发（热重载）
#   make package      签名打包当前平台 macOS（需配置 .env）
#   make package-fast 本地测试打包（无签名，速度快）

SHELL := /bin/bash
.DEFAULT_GOAL := help

# ── 路径 ──────────────────────────────────────────────
ELECTRON_DIR := $(shell pwd)
ROOT_DIR     := $(shell cd ../.. && pwd)
SCRIPTS_DIR  := $(ELECTRON_DIR)/scripts

# ── 架构检测（可覆盖：ARCH=x64 make package）────────
ARCH ?= $(shell uname -m | sed 's/x86_64/x64/')

# ─────────────────────────────────────────────────────
##@ 开发
# ─────────────────────────────────────────────────────

.PHONY: dev
dev: ## 启动开发模式（Electron + React UI 热重载）
	pnpm dev

.PHONY: dev-static
dev-static: ## 启动开发模式（仅静态 UI，不启动 Vite dev server）
	pnpm dev:static

# ─────────────────────────────────────────────────────
##@ 构建
# ─────────────────────────────────────────────────────

.PHONY: build
build: ## 构建所有产物（CLI + UI + Electron 主进程）
	@echo "📦 构建 openclaw CLI..."
	(cd $(ROOT_DIR) && pnpm build)
	@echo "🖥  构建 Control UI..."
	(cd $(ROOT_DIR) && node scripts/ui.js build)
	@echo "⚛️  构建 React Control UI..."
	(cd $(ROOT_DIR) && pnpm --filter openclaw-control-ui-react build)
	@echo "🔨 构建 Electron 主进程..."
	pnpm build
	@echo "✅ 构建完成"

.PHONY: build-electron
build-electron: ## 仅构建 Electron 主进程（tsdown）
	pnpm build

# ─────────────────────────────────────────────────────
##@ 打包（macOS）
# ─────────────────────────────────────────────────────

.PHONY: package
package: ## 完整打包 macOS（签名 + 公证，需配置 .env）
	@echo "🚀 正式打包 macOS (ARCH=$(ARCH))..."
	ARCH=$(ARCH) bash $(SCRIPTS_DIR)/package-electron.sh

.PHONY: package-fast
package-fast: ## 快速打包 macOS（无签名，用于本地验证安装流程）
	@echo "⚡ 快速打包 macOS（无签名）..."
	LOCAL_FAST=1 ARCH=$(ARCH) bash $(SCRIPTS_DIR)/package-electron.sh

.PHONY: package-arm64
package-arm64: ## 打包 macOS arm64（Apple Silicon）
	ARCH=arm64 bash $(SCRIPTS_DIR)/package-electron.sh

.PHONY: package-x64
package-x64: ## 打包 macOS x64（Intel）
	ARCH=x64 bash $(SCRIPTS_DIR)/package-electron.sh

# ─────────────────────────────────────────────────────
##@ 打包（Windows，需在 macOS/Linux 上交叉编译）
# ─────────────────────────────────────────────────────

.PHONY: package-win
package-win: ## 打包 Windows x64
	@echo "🪟 打包 Windows x64..."
	ARCH=x64 bash $(SCRIPTS_DIR)/package-electron-win.sh

.PHONY: package-win-fast
package-win-fast: ## 快速打包 Windows（跳过构建，复用现有产物）
	LOCAL_FAST=1 ARCH=x64 bash $(SCRIPTS_DIR)/package-electron-win.sh

# ─────────────────────────────────────────────────────
##@ 工具
# ─────────────────────────────────────────────────────

.PHONY: setup
setup: ## 初次设置：复制 .env 模板（如果 .env 不存在）
	@if [ ! -f $(ELECTRON_DIR)/.env ]; then \
		cp $(ELECTRON_DIR)/.env.example $(ELECTRON_DIR)/.env; \
		echo "✅ 已创建 .env，请编辑填入签名所需的 API Key 信息"; \
		echo "   文件路径: $(ELECTRON_DIR)/.env"; \
	else \
		echo "ℹ️  .env 已存在，跳过"; \
	fi

.PHONY: clean
clean: ## 清理构建产物（release/ 和 dist/）
	rm -rf $(ELECTRON_DIR)/release $(ELECTRON_DIR)/dist
	@echo "✅ 清理完成"

.PHONY: clean-all
clean-all: clean ## 深度清理（包括运行时依赖和下载的 Node 二进制）
	rm -rf $(ELECTRON_DIR)/resources/prod-node_modules
	rm -rf $(ELECTRON_DIR)/resources/node-arm64
	rm -rf $(ELECTRON_DIR)/resources/node-x64
	@echo "✅ 深度清理完成"

.PHONY: verify
verify: ## 验证签名和公证状态（需先 make package）
	@APP_PATH=$$(ls -d $(ELECTRON_DIR)/release/mac*/Bossim.app 2>/dev/null | head -1); \
	if [ -z "$$APP_PATH" ]; then \
		echo "❌ 未找到 .app，请先运行 make package"; exit 1; \
	fi; \
	echo "🔍 验证签名: $$APP_PATH"; \
	codesign --verify --deep --strict --verbose=2 "$$APP_PATH" && \
	echo "" && \
	echo "🔍 验证公证:"; \
	spctl --assess --type execute --verbose "$$APP_PATH"

# ─────────────────────────────────────────────────────
##@ 帮助
# ─────────────────────────────────────────────────────

.PHONY: help
help: ## 显示此帮助
	@awk 'BEGIN {FS = ":.*##"; printf "\n用法:\n  make \033[36m<target>\033[0m\n"} \
	/^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 } \
	/^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) }' $(MAKEFILE_LIST)
