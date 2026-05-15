# Electron 桌面客户端构建命令
# 用法: make <target>
#
# 快速开始:
#   make dev          本地开发（热重载）
#   make package      签名打包当前平台 macOS（需配置 .env）
#   make package-fast 本地测试打包（无签名，速度快）
#   make clear        删除上次构建产物（release/、dist/）；make release 会在打包前自动执行

SHELL := /bin/bash
.DEFAULT_GOAL := help

# ── 路径 ──────────────────────────────────────────────
# Windows Git Bash 下 pwd 返回 /d/... 格式，需要转换为 Windows 路径
ELECTRON_DIR := $(shell pwd -W 2>/dev/null || pwd)
ROOT_DIR     := $(shell cd ../.. && pwd -W 2>/dev/null || pwd)
SCRIPTS_DIR  := $(ELECTRON_DIR)/scripts

# Subcommands: make version patch | make version beta | make version major
VERSION_KIND :=
ifeq ($(findstring version,$(MAKECMDGOALS)),version)
ifeq ($(findstring major,$(MAKECMDGOALS)),major)
VERSION_KIND := major
else
ifeq ($(findstring beta,$(MAKECMDGOALS)),beta)
VERSION_KIND := beta
else
ifeq ($(findstring patch,$(MAKECMDGOALS)),patch)
VERSION_KIND := patch
endif
endif
endif
endif

# ── 自动加载 .env（若存在）────────────────────────────
# 使变量如 R2_BUCKET_NAME / APP_STORE_CONNECT_* 在 make 目标中可用
-include $(ELECTRON_DIR)/.env
export

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

.PHONY: icons icons-all icons-ico
icons: ## 从 icon.png 生成 .icns（macOS，默认）
	bash $(SCRIPTS_DIR)/generate-icons.sh

icons-all: ## 同时生成 .icns 与 .ico（更换 icon.png 后）
	bash $(SCRIPTS_DIR)/generate-icons.sh --all

icons-ico: ## 仅生成 .ico（Windows）
	bash $(SCRIPTS_DIR)/generate-icons.sh --ico-only

# ─────────────────────────────────────────────────────
##@ 打包（macOS）
# ─────────────────────────────────────────────────────

.PHONY: package
package: ## 完整打包 macOS（签名 + 公证，需配置 .env）
	@echo "🚀 正式打包 macOS (ARCH=$(ARCH))..."
	ARCH=$(ARCH) bash $(SCRIPTS_DIR)/package-electron.sh

.PHONY: package-fast
package-fast: ## 快速打包 macOS（无签名；仍 pnpm build，跳过 Lit ui:build）
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
package-win-fast: ## 快速打包 Windows（仍 pnpm build，跳过 Lit ui:build）
	LOCAL_FAST=1 ARCH=x64 bash $(SCRIPTS_DIR)/package-electron-win.sh

# ─────────────────────────────────────────────────────
##@ 发布（上传到 Cloudflare R2）
# ─────────────────────────────────────────────────────

.PHONY: version
version: ## 同步根目录 + apps/electron 的 version（默认今日 YYYY.M.DD；make version patch|beta|major）
	@if [ -n "$(VERSION)" ]; then \
		echo "📍 使用指定版本：$(VERSION)"; \
		node "$(SCRIPTS_DIR)/bump-version-sync.mjs" "$(VERSION)"; \
	else \
		echo "🔍 计算版本号（默认对齐今日日期）…"; \
		TODAY=$$(date +'%Y.%-m.%-d'); \
		CURRENT_VERSION=$$(node -p "require('./package.json').version"); \
		if echo "$$CURRENT_VERSION" | grep -qE "^$$TODAY(-|$$)"; then \
			SUFFIX=$$(echo "$$CURRENT_VERSION" | sed -n "s/^$$TODAY-\(.*\)$$/\1/p"); \
			if [ "$(VERSION_KIND)" = "major" ]; then \
				NEXT_VERSION="$$TODAY"; \
				echo "ℹ️  强制主版本（今日）：$$NEXT_VERSION"; \
			elif [ "$(VERSION_KIND)" = "beta" ]; then \
				if [ -z "$$SUFFIX" ]; then \
					NEXT_VERSION="$$TODAY-beta.1"; \
				elif echo "$$SUFFIX" | grep -qE '^beta\.[0-9]+$$'; then \
					BETA_NUM=$$(echo "$$SUFFIX" | sed 's/beta\.//'); \
					NEXT_BETA=$$((BETA_NUM + 1)); \
					NEXT_VERSION="$$TODAY-beta.$$NEXT_BETA"; \
				else \
					NEXT_VERSION="$$TODAY-beta.1"; \
				fi; \
				echo "ℹ️  Beta：$$NEXT_VERSION"; \
			elif [ "$(VERSION_KIND)" = "patch" ]; then \
				if [ -z "$$SUFFIX" ]; then \
					NEXT_VERSION="$$TODAY-patch.1"; \
				elif echo "$$SUFFIX" | grep -qE '^patch\.[0-9]+$$'; then \
					PATCH_NUM=$$(echo "$$SUFFIX" | sed 's/patch\.//'); \
					NEXT_PATCH=$$((PATCH_NUM + 1)); \
					NEXT_VERSION="$$TODAY-patch.$$NEXT_PATCH"; \
				else \
					NEXT_VERSION="$$TODAY-patch.1"; \
				fi; \
				echo "ℹ️  Patch：$$NEXT_VERSION"; \
			else \
				if [ -z "$$SUFFIX" ]; then \
					echo "⚠️  今日基础版本已存在：$$CURRENT_VERSION（与 $$TODAY 对齐）。"; \
					echo "    同日再发请使用：make version patch   或   make version beta   或   make version major"; \
					exit 1; \
				elif echo "$$SUFFIX" | grep -qE '^beta\.[0-9]+$$'; then \
					BETA_NUM=$$(echo "$$SUFFIX" | sed 's/beta\.//'); \
					NEXT_BETA=$$((BETA_NUM + 1)); \
					NEXT_VERSION="$$TODAY-beta.$$NEXT_BETA"; \
					echo "ℹ️  检测到 beta.$$BETA_NUM，递增至：$$NEXT_VERSION"; \
				elif echo "$$SUFFIX" | grep -qE '^patch\.[0-9]+$$'; then \
					PATCH_NUM=$$(echo "$$SUFFIX" | sed 's/patch\.//'); \
					NEXT_PATCH=$$((PATCH_NUM + 1)); \
					NEXT_VERSION="$$TODAY-patch.$$NEXT_PATCH"; \
					echo "ℹ️  检测到 patch.$$PATCH_NUM，递增至：$$NEXT_VERSION"; \
				else \
					echo "⚠️  今日版本格式非常规 ($$CURRENT_VERSION)，请手动：make version VERSION=$$TODAY-patch.2"; \
					exit 1; \
				fi; \
			fi; \
		else \
			if [ "$(VERSION_KIND)" = "beta" ]; then \
				NEXT_VERSION="$$TODAY-beta.1"; \
				echo "ℹ️  新日历日 + beta：$$NEXT_VERSION"; \
			elif [ "$(VERSION_KIND)" = "patch" ]; then \
				NEXT_VERSION="$$TODAY-patch.1"; \
				echo "ℹ️  新日历日 + patch：$$NEXT_VERSION"; \
			else \
				NEXT_VERSION="$$TODAY"; \
				echo "ℹ️  使用今日日期版本：$$NEXT_VERSION"; \
			fi; \
		fi; \
		node "$(SCRIPTS_DIR)/bump-version-sync.mjs" "$$NEXT_VERSION"; \
	fi

# Pair with `make version patch` etc. — no-op when `version` is also a goal.
.PHONY: patch beta major
patch: ## 与 version 合用：make version patch；单独运行等价于 make version patch
	$(if $(filter-out patch,$(MAKECMDGOALS)),@:,@$(MAKE) version patch)

beta: ## 与 version 合用：make version beta；单独运行等价于 make version beta
	$(if $(filter-out beta,$(MAKECMDGOALS)),@:,@$(MAKE) version beta)

major: ## 与 version 合用：make version major；单独运行等价于 make version major
	$(if $(filter-out major,$(MAKECMDGOALS)),@:,@$(MAKE) version major)

.PHONY: release-with-version
release-with-version: version ## 一键发布 macOS（先改版本再 release；用法: make release-with-version VERSION=2026.3.31）
	$(MAKE) release

.PHONY: release-win-with-version
release-win-with-version: version ## 一键发布 Windows（先改版本再 release-win；用法: make release-win-with-version VERSION=2026.3.31）
	$(MAKE) release-win

# R2 配置可放在 .env 中，或直接导出环境变量：
#   R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT / R2_BUCKET_NAME
R2_DEST ?= r2:$(R2_BUCKET_NAME)/bossim/releases
RELEASE_DIR := $(ELECTRON_DIR)/release

.PHONY: r2-check
r2-check: ## 检查 rclone 是否已安装并已配置 r2
	@command -v rclone >/dev/null 2>&1 || { echo "❌ rclone 未安装，请运行: winget install Rclone.Rclone (Windows) 或 brew install rclone (macOS)"; exit 1; }
	@rclone listremotes | grep -q '^r2:' || { echo "❌ rclone 未配置 r2 remote，请运行: make r2-setup"; exit 1; }
	@echo "✅ rclone r2 remote 已就绪"

.PHONY: r2-setup
r2-setup: ## 交互式配置 rclone r2 remote（首次使用时运行）
	@command -v rclone >/dev/null 2>&1 || { \
		echo "📥 安装 rclone..."; \
		if command -v winget >/dev/null 2>&1; then \
			winget install Rclone.Rclone; \
		elif command -v brew >/dev/null 2>&1; then \
			brew install rclone; \
		else \
			echo "❌ 请手动安装 rclone: https://rclone.org/downloads/"; exit 1; \
		fi; \
	}
	@echo "🔧 配置 rclone r2 remote（需要 R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT）"
	@if [ -z "$(R2_ACCESS_KEY_ID)" ] || [ -z "$(R2_SECRET_ACCESS_KEY)" ] || [ -z "$(R2_ENDPOINT)" ]; then \
		echo "❌ 请先在 .env 或环境变量中设置 R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT"; exit 1; \
	fi
	rclone config create r2 s3 \
		provider=Cloudflare \
		access_key_id=$(R2_ACCESS_KEY_ID) \
		secret_access_key=$(R2_SECRET_ACCESS_KEY) \
		endpoint=$(R2_ENDPOINT) \
		acl=private
	@echo "✅ rclone r2 remote 配置完成"

.PHONY: upload-r2
upload-r2: r2-check ## 上传 release/ 产物到 R2（先传包，最后传 yml）
	@if [ -z "$(R2_BUCKET_NAME)" ]; then \
		echo "❌ R2_BUCKET_NAME 未设置，请在 .env 或环境变量中配置"; exit 1; \
	fi
	@if [ -z "$$(ls $(RELEASE_DIR)/*.dmg 2>/dev/null)" ] && [ -z "$$(ls $(RELEASE_DIR)/*.zip 2>/dev/null)" ]; then \
		echo "❌ release/ 下未找到 DMG/ZIP，请先运行 make package"; exit 1; \
	fi
	@echo "📤 上传安装包到 $(R2_DEST)..."
	rclone copy $(RELEASE_DIR) $(R2_DEST) \
		--include "*.dmg" \
		--include "*.zip" \
		--include "*.blockmap" \
		--s3-no-check-bucket \
		--no-update-modtime \
		-v
	@echo "📤 上传更新描述文件 (latest-mac.yml)..."
	rclone copy $(RELEASE_DIR) $(R2_DEST) \
		--include "*.yml" \
		--max-depth 1 \
		--s3-no-check-bucket \
		--no-update-modtime \
		-v
	@echo "✅ 上传完成"
	@echo "🔗 更新地址: https://files.aiverser.com/bossim/releases/"

.PHONY: upload-r2-win
upload-r2-win: r2-check ## 上传 Windows 产物到 R2（exe + zip + yml）
	@if [ -z "$(R2_BUCKET_NAME)" ]; then \
		echo "❌ R2_BUCKET_NAME 未设置，请在 .env 或环境变量中配置"; exit 1; \
	fi
	@if [ -z "$$(ls $(RELEASE_DIR)/*.exe 2>/dev/null)" ] && [ -z "$$(ls $(RELEASE_DIR)/*.zip 2>/dev/null)" ]; then \
		echo "❌ release/ 下未找到 EXE/ZIP，请先运行 make package-win"; exit 1; \
	fi
	@echo "📤 上传 Windows 安装包到 $(R2_DEST)..."
	rclone copy $(RELEASE_DIR) $(R2_DEST) \
		--filter "- win-unpacked/**" \
		--filter "+ *.exe" \
		--filter "+ *.zip" \
		--filter "+ *.blockmap" \
		--s3-no-check-bucket \
		--no-update-modtime \
		-v
	@echo "📤 上传 Windows 更新描述文件 (latest.yml)..."
	rclone copy $(RELEASE_DIR) $(R2_DEST) \
		--filter "- win-unpacked/**" \
		--filter "+ *.yml" \
		--max-depth 1 \
		--s3-no-check-bucket \
		--no-update-modtime \
		-v
	@echo "✅ Windows 上传完成"
	@echo "🔗 更新地址: https://files.aiverser.com/bossim/releases/"

.PHONY: upload-r2-verify
upload-r2-verify: ## 验证 macOS latest-mac.yml 是否可公开访问
	@echo "🔍 验证 latest-mac.yml 可访问性..."
	curl -fsSL "https://files.aiverser.com/bossim/releases/latest-mac.yml" | head -10
	@echo "✅ latest-mac.yml 可正常访问"

.PHONY: upload-r2-verify-win
upload-r2-verify-win: ## 验证 Windows latest.yml 是否可公开访问
	@echo "🔍 验证 latest.yml 可访问性..."
	curl -fsSL "https://files.aiverser.com/bossim/releases/latest.yml" | head -10
	@echo "✅ latest.yml 可正常访问"

.PHONY: release
release: ## 一键完整发布：macOS 双架构打包 + 上传 R2 + 验证（构建前会 clear）
	@echo "🚀 开始完整发布流程..."
	$(MAKE) clear
	$(MAKE) package-arm64
	# $(MAKE) package-x64
	$(MAKE) upload-r2
	$(MAKE) upload-r2-verify
	@echo "🎉 发布完成！"

.PHONY: release-win
release-win: ## 一键完整发布 Windows：打包 + 上传 R2 + 验证（构建前会 clear）
	@echo "🚀 开始 Windows 发布流程..."
	$(MAKE) clear
	$(MAKE) package-win
	$(MAKE) upload-r2-win
	$(MAKE) upload-r2-verify-win
	@echo "🎉 Windows 发布完成！"

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

.PHONY: clear
clear: ## 删除上次构建产物（release/、dist/）
	@echo "🧹 清除上次构建产物..."
	rm -rf $(ELECTRON_DIR)/release $(ELECTRON_DIR)/dist
	@echo "✅ 已清除 release/ 与 dist/"

.PHONY: clean
clean: clear ## 清理构建产物（同 clear，供 clean-all 链式使用）

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
