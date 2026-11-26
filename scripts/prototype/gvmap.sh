#!/usr/bin/env bash
# Step 0 spike: render the spec reference graph with Graphviz GMap (sfdp + gvmap).
# Needs graphviz with gvmap (e.g. `brew install graphviz` or `dnf install graphviz`)
# and the cache from `npm run fetch` + `npm run graph`.
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p data/prototype
node -e '
const g = require("./data/build/graph.json");
const specs = new Set(g.nodes.filter(n => n.type === "spec").map(n => n.id));
const q = s => JSON.stringify(s);
console.log("graph wwm {");
for (const n of g.nodes) if (specs.has(n.id)) console.log(`  ${q(n.id)} [label=${q(n.label)}];`);
for (const e of g.edges) if (specs.has(e.source) && specs.has(e.target)) console.log(`  ${q(e.source)} -- ${q(e.target)} [weight=${e.weight}];`);
console.log("}");
' > data/prototype/specs.dot
sfdp -Goverlap=prism -Gsplines=false data/prototype/specs.dot \
  | gvmap -e -s -4 > data/prototype/gvmap.gv
neato -n2 -Ecolor="#55555522" -Tsvg data/prototype/gvmap.gv > data/prototype/gvmap.svg
neato -n2 -Ecolor="#55555522" -Gsize='14,14!' -Gdpi=100 -Tpng data/prototype/gvmap.gv > data/prototype/gvmap.png
echo "wrote data/prototype/gvmap.svg and gvmap.png"
