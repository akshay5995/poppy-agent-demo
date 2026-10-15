#!/bin/sh
# Typechecks extension/poppy.ts against the globally installed Pi, which provides its packages to extensions at runtime.
cd "$(dirname "$0")/.." || exit 1
P="$(npm root -g)/@earendil-works"
mkdir -p node_modules/@earendil-works
ln -sfn "$P/pi-coding-agent" node_modules/@earendil-works/pi-coding-agent
ln -sfn "$P/pi-coding-agent/node_modules/@earendil-works/pi-ai" node_modules/@earendil-works/pi-ai
exec npx -y -p typescript@5 tsc --noEmit --strict --module nodenext --moduleResolution nodenext --target es2022 --skipLibCheck --types node extension/poppy.ts
