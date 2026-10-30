$ErrorActionPreference = 'Stop'
python (Join-Path $PSScriptRoot 'prepare-native.py') @args
if ($LASTEXITCODE -ne 0) { throw 'Native renderer preparation failed.' }
