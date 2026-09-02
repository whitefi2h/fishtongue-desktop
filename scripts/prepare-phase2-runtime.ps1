param(
  [string]$EngineRoot = "",
  [string]$EngineJar = ""
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $EngineRoot) {
  $EngineRoot = Join-Path (Split-Path -Parent $workspace) "fishtongue-engine"
}
if (-not $EngineJar) {
  $EngineJar = Join-Path $EngineRoot "desktop-api\build\libs\desktop-api-all.jar"
}
$lockPath = Join-Path $workspace "engine\engine-lock.json"
$lock = Get-Content -Raw -LiteralPath $lockPath | ConvertFrom-Json
$cache = Join-Path $workspace ".engine-cache"
$archive = Join-Path $cache $lock.runtime.jdkArchive
$expanded = Join-Path $cache "temurin-21"
$resourceRoot = Join-Path $workspace "src-tauri\resources\lexurgy"
$runtime = Join-Path $resourceRoot "runtime"

function Get-Sha256Hex([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = $algorithm.ComputeHash($stream)
    return ([System.BitConverter]::ToString($bytes)).Replace("-", "")
  }
  finally {
    $algorithm.Dispose()
    $stream.Dispose()
  }
}

New-Item -ItemType Directory -Force -Path $cache | Out-Null

if (-not (Test-Path -LiteralPath $archive)) {
  Write-Host "Downloading locked Eclipse Temurin archive..."
  Invoke-WebRequest -Uri $lock.runtime.jdkUrl -OutFile $archive
}

$jdkHash = (Get-Sha256Hex $archive).ToLowerInvariant()
if ($jdkHash -ne $lock.runtime.jdkSha256.ToLowerInvariant()) {
  throw "Temurin SHA-256 mismatch. Expected $($lock.runtime.jdkSha256), got $jdkHash."
}

if (-not (Test-Path -LiteralPath $EngineJar)) {
  throw "Engine JAR not found: $EngineJar"
}
$jarHash = (Get-Sha256Hex $EngineJar).ToUpperInvariant()
if ($jarHash -ne $lock.fatJarSha256.ToUpperInvariant()) {
  throw "Engine JAR SHA-256 mismatch. Rebuild and update engine-lock.json intentionally."
}

if (-not (Test-Path -LiteralPath $expanded)) {
  New-Item -ItemType Directory -Force -Path $expanded | Out-Null
  Expand-Archive -LiteralPath $archive -DestinationPath $expanded
}
$jdk = Get-ChildItem -LiteralPath $expanded -Directory | Select-Object -First 1
if (-not $jdk) { throw "Temurin archive did not contain a JDK directory." }
$jlink = Join-Path $jdk.FullName "bin\jlink.exe"
if (-not (Test-Path -LiteralPath $jlink)) { throw "jlink.exe is missing from the verified JDK." }

$resolvedResources = [System.IO.Path]::GetFullPath($resourceRoot)
$expectedPrefix = [System.IO.Path]::GetFullPath((Join-Path $workspace "src-tauri\resources"))
if (-not $resolvedResources.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to replace a runtime outside src-tauri\resources."
}
if (Test-Path -LiteralPath $resourceRoot) {
  Remove-Item -LiteralPath $resourceRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $resourceRoot | Out-Null

$modules = $lock.runtime.modules -join ","
& $jlink `
  --module-path (Join-Path $jdk.FullName "jmods") `
  --add-modules $modules `
  --output $runtime `
  --strip-debug `
  --no-header-files `
  --no-man-pages `
  --compress=2
if ($LASTEXITCODE -ne 0) { throw "jlink failed with exit code $LASTEXITCODE." }
if (-not (Test-Path -LiteralPath (Join-Path $runtime "legal"))) {
  throw "Generated runtime is missing its legal directory."
}

Copy-Item -LiteralPath $EngineJar -Destination (Join-Path $resourceRoot "fishtongue-engine.jar")
Copy-Item -LiteralPath (Join-Path $workspace "engine\THIRD_PARTY_NOTICES.md") -Destination $resourceRoot
Copy-Item -LiteralPath $lockPath -Destination $resourceRoot
Copy-Item -LiteralPath (Join-Path $EngineRoot "LICENSE") -Destination (Join-Path $resourceRoot "LEXURGY_LICENSE")
Copy-Item -LiteralPath (Join-Path $EngineRoot "FISHTONGUE_BUILD.md") -Destination $resourceRoot
Copy-Item -LiteralPath (Join-Path $EngineRoot "ENGINE_VERSION.json") -Destination $resourceRoot
Copy-Item -LiteralPath (Join-Path $EngineRoot "build\reports\bom.json") -Destination (Join-Path $resourceRoot "sbom.cyclonedx.json")
Copy-Item -LiteralPath (Join-Path $EngineRoot "build\reports\bom.xml") -Destination (Join-Path $resourceRoot "sbom.cyclonedx.xml")

$manifest = [ordered]@{
  engineVersion = $lock.engineVersion
  protocolVersion = $lock.protocolVersion
  upstreamCommit = $lock.upstreamCommit
  engineJarSha256 = $jarHash
  runtimeVersion = $lock.runtime.version
  runtimeArchiveSha256 = $jdkHash
  modules = $lock.runtime.modules
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $resourceRoot "runtime-manifest.json") -Encoding utf8

Write-Host "Phase 2 runtime prepared at $resourceRoot"
