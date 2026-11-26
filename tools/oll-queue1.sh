#!/bin/bash
# Phase-1 local-model queue: content packs, then the economy module. Serial (oll.py holds the shared GPU lock).
cd "$(dirname "$0")/.." || exit 1
for name in resources factions shipparts; do
  python3 -I tools/oll.py --kind content --spec tools/specs/$name.md --out content/$name.js --verify "node tools/check-content.mjs content/$name.js" --tries 4
done
python3 -I tools/oll.py --kind think --spec tools/specs/economy.md --out src/sim/economy.js --ctx src/sim/rng.js --ctx tests/economy.test.js --verify "node --test tests/economy.test.js" --tries 3
