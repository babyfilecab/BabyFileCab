#!/usr/bin/env bash
# Start BabyFileCab in development mode (live reload).
# Dependencies are pinned in go.mod/go.sum; run `go mod tidy` yourself only
# after changing imports.
set -e
cd "$(dirname "$0")"
exec wails dev -tags webkit2_41 "$@"
