#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) RIT Services and contributors
#
# Pre-publish secret scan. Run from anywhere; scans the repo tree with the
# default gitleaks ruleset plus .gitleaks.toml (which skips gitignored and
# generated paths). Exits non-zero if anything is found — treat that as a
# hard stop before any public push.
#
#   ./scripts/secret-scan.sh
#
# Requires Docker (no local gitleaks install needed). --redact keeps found
# values out of your terminal/scrollback.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Git Bash (MSYS) rewrites container paths like /repo into C:/Program Files/…
# — disable that conversion and hand Docker a native Windows host path.
# Both are inert on Linux/macOS.
if command -v cygpath >/dev/null 2>&1; then ROOT="$(cygpath -w "$ROOT")"; fi
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'

docker run --rm -v "$ROOT:/repo" ghcr.io/gitleaks/gitleaks:latest \
  detect --source /repo --no-git --config /repo/.gitleaks.toml --redact --verbose

echo "gitleaks: clean — no secrets found."
