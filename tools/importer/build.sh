#!/bin/sh
# Builds the Compass CSV importer with the JDK only (no Maven or Gradle).
#   ./tools/importer/build.sh          compile everything and run the tests
#   ./tools/importer/build.sh build    compile the importer only, ready for:
#       java -cp tools/importer/out dev.compass.importer.Main --help
set -e
root="$(cd "$(dirname "$0")" && pwd)"
out="$root/out"
mode="${1:-test}"

rm -rf "$out"
mkdir -p "$out"

if [ "$mode" = "test" ]; then
  folders="$root/src $root/test"
else
  folders="$root/src"
fi

# shellcheck disable=SC2046,SC2086
javac -encoding UTF-8 -d "$out" $(find $folders -name '*.java')

if [ "$mode" = "test" ]; then
  java -cp "$out" dev.compass.importer.TestRunner
else
  echo "Built. Run: java -cp $out dev.compass.importer.Main --help"
fi
