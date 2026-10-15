#!/bin/sh
# A personal agent in Pi's terminal UI, for any company that supports the Personal Agent Protocol.
# AGENT_NAME and POPPY_SITE configure it (see extension/poppy.ts). For the web UI, run: node server.mjs
cd "$(dirname "$0")" && exec pi --model "${AGENT_MODEL:-openai/gpt-6.1-sol}" -e ./extension --tools 'poppy_*' --no-context-files --no-skills --name "${AGENT_NAME:-Personal agent}" "$@"
