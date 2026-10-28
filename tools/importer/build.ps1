# Builds the Compass CSV importer with the JDK only (no Maven or Gradle).
#   ./tools/importer/build.ps1          compile everything and run the tests
#   ./tools/importer/build.ps1 build    compile the importer only, ready for:
#       java -cp tools/importer/out dev.compass.importer.Main --help
param([string]$Mode = "test")

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$out = Join-Path $root "out"

if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force $out | Out-Null

$folders = @("src")
if ($Mode -eq "test") { $folders += "test" }
$sources = $folders | ForEach-Object {
    Get-ChildItem -Recurse -Filter *.java (Join-Path $root $_) | ForEach-Object { $_.FullName }
}

javac -encoding UTF-8 -d $out @sources
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($Mode -eq "test") {
    java -cp $out dev.compass.importer.TestRunner
    exit $LASTEXITCODE
}
Write-Output "Built. Run: java -cp $out dev.compass.importer.Main --help"
