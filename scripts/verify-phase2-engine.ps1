param(
  [string]$EngineRoot = ""
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $EngineRoot) {
  $EngineRoot = Join-Path (Split-Path -Parent $workspace) "fishtongue-engine"
}

$gradle = Join-Path $EngineRoot "gradlew.bat"
if (-not (Test-Path -LiteralPath $gradle)) {
  throw "FishTongue engine repository not found: $EngineRoot"
}

$env:GRADLE_USER_HOME = if ($env:GRADLE_USER_HOME) {
  $env:GRADLE_USER_HOME
} else {
  Join-Path (Split-Path -Parent $workspace) ".gradle-fishtongue-engine"
}

Push-Location $EngineRoot
try {
  & $gradle test desktop-api:buildFatJar cyclonedxBom --console=plain
  if ($LASTEXITCODE -ne 0) {
    throw "Lexurgy upstream or desktop protocol tests failed."
  }
} finally {
  Pop-Location
}

& (Join-Path $PSScriptRoot "prepare-phase2-runtime.ps1") -EngineRoot $EngineRoot
if ($LASTEXITCODE -ne 0) {
  throw "The verified engine runtime could not be staged."
}
