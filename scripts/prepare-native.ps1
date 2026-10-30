$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$buildPath = Join-Path $repoRoot '.build'
$binPath = Join-Path $repoRoot 'bin'
New-Item -ItemType Directory -Path $buildPath, $binPath -Force | Out-Null
$archive = Join-Path $buildPath 'codesnap-cli-v0.14.0-windows-x64.zip'
$url = 'https://github.com/codesnap-rs/codesnap/releases/download/v0.14.0/codesnap-cli_v0.14.0_x86_64-pc-windows-msvc.zip'
$expectedHash = 'bc0f031c96cfc7512e1f56f7db31c36fa14461816445b69e43b914b3302fd8c7'
if (-not (Test-Path -LiteralPath $archive)) { Invoke-WebRequest -Uri $url -OutFile $archive }
$actualHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash) { throw 'Native renderer archive checksum mismatch. Delete the archive in .build and try again.' }
$extractedPath = Join-Path $buildPath 'codesnap-cli-v0.14.0'
Expand-Archive -LiteralPath $archive -DestinationPath $extractedPath -Force
Copy-Item -LiteralPath (Join-Path $extractedPath 'codesnap.exe') -Destination (Join-Path $binPath 'codesnap.exe') -Force
Write-Output 'Verified CodeSnap CLI v0.14.0 is ready in bin/codesnap.exe.'
