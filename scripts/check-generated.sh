#!/usr/bin/env bash
# Staleness gate for everything generated from image-tools/series.json and images/.
#
# Re-runs the generator and fails if the result differs from what is committed.
# Exact by construction — a hand-written field-by-field comparison goes stale the
# moment series.json grows a field.
#
# Lives in a script rather than inline in ci.yml so `npm test` runs the same gate:
# otherwise the local suite is green on precisely the change this was added to catch.
set -euo pipefail

node image-tools/generate-gallery.js > /dev/null

if ! git diff --exit-code -- js/gallery-data.json js/series-data.json; then
    echo
    echo "The committed manifests are not what generate-gallery.js produces."
    echo "Run \`npm run build:gallery\` and commit the result."
    exit 1
fi

untracked="$(git status --porcelain -- images/optimized)"
if [ -n "$untracked" ]; then
    echo "generate-gallery.js produced derivatives that are not committed:"
    echo "$untracked"
    exit 1
fi

echo "Generated files match the generator."
