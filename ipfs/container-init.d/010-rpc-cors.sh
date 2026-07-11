#!/bin/sh
# Lets the dev frontend publish argument content through the RPC API from the browser.
# The Origin allowlist is the unauthenticated RPC API's CSRF defense: allow ONLY the
# dev app origins (vite dev server and vite preview), never "*" - any website open in
# the developer's browser could otherwise drive the node. kubo's RPC is POST-only.
set -eu

ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin \
  '["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["POST"]'
