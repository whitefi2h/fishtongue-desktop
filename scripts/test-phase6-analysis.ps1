$ErrorActionPreference = "Stop"
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$buildPython = Join-Path $projectRoot "fishtongue-analysis\.venv-build\Scripts\python.exe"

if (Test-Path -LiteralPath $buildPython) {
  $python = $buildPython
} else {
  $pythonCommand = Get-Command python -ErrorAction Stop
  $python = $pythonCommand.Source
}

& $python -m unittest (Join-Path $projectRoot "fishtongue-analysis\test_analysis_sidecar.py")
if ($LASTEXITCODE -ne 0) { throw "Analysis protocol tests failed." }
