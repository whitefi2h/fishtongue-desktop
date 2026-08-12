$ErrorActionPreference = "Stop"
$analysisRoot = Join-Path $PSScriptRoot "..\fishtongue-analysis"
$venvRoot = Join-Path $analysisRoot ".venv-build"
$resourceRoot = Join-Path $PSScriptRoot "..\src-tauri\resources\fishtongue-analysis"

if (-not (Test-Path (Join-Path $venvRoot "Scripts\python.exe"))) {
  $pythonVersion = python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
  if ($pythonVersion -ne "3.12") { throw "Phase 6 analysis release requires Python 3.12." }
  python -m venv $venvRoot
  if ($LASTEXITCODE -ne 0) { throw "Unable to create the isolated analysis build environment." }
}
$python = Join-Path $venvRoot "Scripts\python.exe"
& $python -m pip install --disable-pip-version-check -r (Join-Path $analysisRoot "requirements.lock")
if ($LASTEXITCODE -ne 0) { throw "Unable to install the locked analysis dependencies." }
$env:FISHTONGUE_REQUIRE_PANPHON = "1"
& $python -m unittest (Join-Path $analysisRoot "test_analysis_sidecar.py")
if ($LASTEXITCODE -ne 0) { throw "Analysis protocol tests failed." }
Remove-Item Env:FISHTONGUE_REQUIRE_PANPHON
& $python (Join-Path $analysisRoot "generate_release_metadata.py")
if ($LASTEXITCODE -ne 0) { throw "Unable to generate the analysis SBOM and licenses." }
Push-Location $analysisRoot
try {
  & $python -m PyInstaller --clean --noconfirm analysis_sidecar.spec
  if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed to build the analysis sidecar." }
} finally {
  Pop-Location
}
if (Test-Path $resourceRoot) { Remove-Item -LiteralPath $resourceRoot -Recurse -Force }
New-Item -ItemType Directory -Path $resourceRoot | Out-Null
Copy-Item -Path (Join-Path $analysisRoot "dist\fishtongue-analysis\*") -Destination $resourceRoot -Recurse
Copy-Item -LiteralPath (Join-Path $analysisRoot "README.md") -Destination $resourceRoot
Copy-Item -LiteralPath (Join-Path $analysisRoot "THIRD_PARTY_NOTICES.md") -Destination $resourceRoot
Copy-Item -Path (Join-Path $analysisRoot "release-metadata\*") -Destination $resourceRoot -Recurse
