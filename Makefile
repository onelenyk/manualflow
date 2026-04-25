SHELL := /bin/bash
.DEFAULT_GOAL := help

# Config
SERVER_PORT ?= 2344
AGENT_PORT  ?= 50051
AGENT_APK   := agent/build/outputs/apk/androidTest/debug/agent-debug-androidTest.apk
AGENT_PKG   := com.maestrorecorder.agent.test
AGENT_CLASS := com.maestrorecorder.agent.RecorderInstrumentation\#startServer
SERIAL      := $(shell adb devices -l 2>/dev/null | grep 'device ' | head -1 | awk '{print $$1}')

# ──────────────────────────────────────────────
# Full stack
# ──────────────────────────────────────────────

.PHONY: build
build: typecheck build-frontend ## Type-check all packages + build frontend
	@echo "✅ Build complete"

.PHONY: typecheck
typecheck: ## Type-check TypeScript packages
	npx tsc -p packages/shared/tsconfig.json --noEmit
	npx tsc -p packages/server/tsconfig.json --noEmit
	@echo "✅ Type-check passed"

.PHONY: test
test: ## Run all tests
	npx vitest run
	@echo "✅ Tests passed"

.PHONY: setup
setup: deps build-frontend build-agent ## First-time setup: install deps, build everything
	@echo "✅ Setup complete. Run 'make start' to launch."

.PHONY: start
start: _check-device ## Start everything: server + agent on device
	@echo "→ Starting agent on $(SERIAL)..."
	@$(MAKE) agent-install agent-start --no-print-directory
	@echo "→ Starting server..."
	@$(MAKE) server --no-print-directory

.PHONY: dev
dev: _check-device ## Start server in watch mode + agent
	@echo "→ Starting agent on $(SERIAL)..."
	@$(MAKE) agent-install agent-start --no-print-directory
	@echo "→ Starting dev server (watch mode)..."
	cd packages/server && npx tsx watch src/index.ts

# ──────────────────────────────────────────────
# Server
# ──────────────────────────────────────────────

.PHONY: server
server: ## Start the server
	cd $(CURDIR) && PORT=$(SERVER_PORT) npx tsx packages/server/src/index.ts

.PHONY: server-bg
server-bg: ## Start the server in background
	@lsof -ti:$(SERVER_PORT) | xargs kill 2>/dev/null || true
	@sleep 0.5
	cd $(CURDIR) && PORT=$(SERVER_PORT) npx tsx packages/server/src/index.ts &
	@sleep 2
	@echo "✅ Server running at http://localhost:$(SERVER_PORT)"

.PHONY: server-stop
server-stop: ## Stop the server
	@lsof -ti:$(SERVER_PORT) | xargs kill 2>/dev/null && echo "✅ Server stopped" || echo "Server not running"

.PHONY: server-restart
server-restart: server-stop server-bg ## Restart server

# ──────────────────────────────────────────────
# Frontend
# ──────────────────────────────────────────────

.PHONY: build-frontend
build-frontend: ## Build frontend for production
	cd dashboard/frontend && npx vite build
	@echo "✅ Frontend built"

.PHONY: frontend-dev
frontend-dev: ## Start frontend dev server (with HMR)
	cd dashboard/frontend && npx vite --port 5173

# ──────────────────────────────────────────────
# Test App (Android Compose sample)
# ──────────────────────────────────────────────

TESTAPP_APK := testapp/build/outputs/apk/debug/testapp-debug.apk
TESTAPP_PKG := com.maestrorecorder.testapp

.PHONY: build-testapp
build-testapp: ## Build testapp debug APK
	./gradlew :testapp:assembleDebug
	@echo "✅ Testapp APK built: $(TESTAPP_APK)"

.PHONY: install-testapp
install-testapp: _check-device ## Install testapp on device
	@test -f $(TESTAPP_APK) || (echo "❌ APK not found. Run 'make build-testapp' first" && exit 1)
	adb -s $(SERIAL) install -r $(TESTAPP_APK)
	@echo "✅ Testapp installed on $(SERIAL)"

.PHONY: launch-testapp
launch-testapp: _check-device ## Launch testapp on device
	adb -s $(SERIAL) shell am start -n $(TESTAPP_PKG)/.MainActivity
	@echo "✅ Testapp launched"

.PHONY: deploy-testapp
deploy-testapp: build-testapp install-testapp launch-testapp ## Build + install + launch testapp

# ──────────────────────────────────────────────
# Agent (Android)
# ──────────────────────────────────────────────

.PHONY: build-agent
build-agent: ## Build agent APK
	./gradlew :agent:assembleDebugAndroidTest
	@echo "✅ Agent APK built: $(AGENT_APK)"

.PHONY: agent-install
agent-install: _check-device ## Install agent on device
	@test -f $(AGENT_APK) || (echo "❌ APK not found. Run 'make build-agent' first" && exit 1)
	adb -s $(SERIAL) install -r -t $(AGENT_APK)
	@echo "✅ Agent installed on $(SERIAL)"

.PHONY: agent-start
agent-start: _check-device ## Start agent on device
	@adb -s $(SERIAL) forward tcp:$(AGENT_PORT) tcp:$(AGENT_PORT)
	@adb -s $(SERIAL) shell am instrument -w \
		-e class $(AGENT_CLASS) \
		$(AGENT_PKG)/androidx.test.runner.AndroidJUnitRunner &
	@sleep 3
	@curl -sf http://127.0.0.1:$(AGENT_PORT)/device-info > /dev/null \
		&& echo "✅ Agent running and responsive" \
		|| echo "⚠️  Agent started but not responding yet"

.PHONY: agent-stop
agent-stop: _check-device ## Stop agent on device
	@adb -s $(SERIAL) shell am force-stop com.maestrorecorder.agent 2>/dev/null || true
	@adb -s $(SERIAL) forward --remove tcp:$(AGENT_PORT) 2>/dev/null || true
	@echo "✅ Agent stopped"

.PHONY: agent-restart
agent-restart: agent-stop agent-start ## Restart agent

.PHONY: agent-deploy
agent-deploy: build-agent agent-install agent-restart ## Build + install + restart agent

.PHONY: agent-logs
agent-logs: _check-device ## Tail agent logs (logcat)
	adb -s $(SERIAL) logcat -s ElementResolver:D EventCollector:D MaestroHttpServer:D

# ──────────────────────────────────────────────
# Dependencies
# ──────────────────────────────────────────────

.PHONY: deps
deps: ## Install all npm dependencies
	npm install
	@echo "✅ Dependencies installed"

# ──────────────────────────────────────────────
# Utilities
# ──────────────────────────────────────────────

.PHONY: status
status: ## Show status of all components
	@echo "── Device ──"
	@if [ -n "$(SERIAL)" ]; then echo "  Connected: $(SERIAL)"; else echo "  No device connected"; fi
	@echo ""
	@echo "── Server ──"
	@lsof -ti:$(SERVER_PORT) > /dev/null 2>&1 && echo "  Running on port $(SERVER_PORT)" || echo "  Not running"
	@echo ""
	@echo "── Agent ──"
	@curl -sf http://127.0.0.1:$(AGENT_PORT)/device-info > /dev/null 2>&1 \
		&& echo "  Responsive on port $(AGENT_PORT)" \
		|| echo "  Not responding"
	@echo ""
	@echo "── Stream ──"
	@curl -sf http://localhost:$(SERVER_PORT)/api/stream/status 2>/dev/null || echo "  Server not running"
	@echo ""

.PHONY: tree
tree: ## Dump current UI tree from device
	@curl -sf http://127.0.0.1:$(AGENT_PORT)/tree | python3 -m json.tool 2>/dev/null \
		|| echo "❌ Agent not responding. Run 'make agent-start'"

.PHONY: interactions
interactions: ## Show current recorded interactions
	@curl -sf http://localhost:$(SERVER_PORT)/api/stream/interactions/list \
		| python3 -c "import json,sys;d=json.load(sys.stdin);[print(f\"#{i['id']:3d} [{i['source']:13s}] {(i.get('touchAction') or {}).get('type','-'):10s} {(i.get('element') or {}).get('text','') or (i.get('element') or {}).get('resourceId','') or '-'}\") for i in d]" \
		2>/dev/null || echo "❌ Server not running"

.PHONY: stop
stop: ## Stop everything
	@$(MAKE) server-stop --no-print-directory 2>/dev/null || true
	@$(MAKE) agent-stop --no-print-directory 2>/dev/null || true
	@echo "✅ All stopped"

.PHONY: clean
clean: ## Clean build artifacts
	./gradlew clean
	rm -rf dashboard/frontend/node_modules/.vite
	rm -rf dist
	@echo "✅ Cleaned"

# ──────────────────────────────────────────────
# Release (QA distribution)
# ──────────────────────────────────────────────

.PHONY: release
release: ## Build a self-contained release tarball for QA (dist/manualflow-*.tar.gz)
	@bash scripts/build-release.sh

.PHONY: publish
publish: ## Build + tag + push + create GitHub release (requires `gh auth login` once)
	@bash scripts/publish.sh

# ──────────────────────────────────────────────
# Checks
# ──────────────────────────────────────────────

.PHONY: _check-device
_check-device:
	@if [ -z "$(SERIAL)" ]; then echo "❌ No Android device connected. Plug one in and enable USB debugging." && exit 1; fi

.PHONY: doctor
doctor: ## Check all prerequisites
	@echo "Checking prerequisites..."
	@echo -n "  node:    " && node --version 2>/dev/null || echo "❌ missing (install Node.js)"
	@echo -n "  npm:     " && npm --version 2>/dev/null || echo "❌ missing"
	@echo -n "  adb:     " && adb --version 2>&1 | head -1 || echo "❌ missing (install Android SDK)"
	@echo -n "  java:    " && java -version 2>&1 | head -1 || echo "❌ missing (install JDK)"
	@echo -n "  scrcpy:  " && scrcpy --version 2>/dev/null || echo "⚠️  missing (optional, for screen mirror)"
	@echo -n "  device:  " && ([ -n "$(SERIAL)" ] && echo "$(SERIAL)" || echo "❌ none connected")
	@echo ""

# ──────────────────────────────────────────────
# Help
# ──────────────────────────────────────────────

.PHONY: help
help: ## Show this help
	@echo "ManualFlow — Android test recorder"
	@echo ""
	@echo "Quick start:"
	@echo "  make setup      # first time: install deps + build"
	@echo "  make start      # launch server + agent"
	@echo "  make stop       # stop everything"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
