#!/bin/sh
# Installs the test-only browser (chrome-headless-shell) outside the repo. Safe to run twice.
# Same folder as the Deck's, so one install serves both repos.
set -e
DIR="${DECK_TEST_BROWSER_DIR:-$HOME/.cache/deck-test-browser}"
mkdir -p "$DIR"
npx --yes @puppeteer/browsers install chrome-headless-shell@stable --path "$DIR"
