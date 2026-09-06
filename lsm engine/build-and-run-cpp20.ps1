$ErrorActionPreference = 'Stop'

$msysCompiler = 'C:\msys64\ucrt64\bin\g++.exe'
if (Test-Path -LiteralPath $msysCompiler) {
  $compiler = Get-Item -LiteralPath $msysCompiler
} else {
  $compiler = Get-Command g++ -ErrorAction SilentlyContinue
}

if (-not $compiler) {
  throw 'A C++20 compiler was not found. Install MSYS2 UCRT64 GCC or Visual Studio 2022.'
}

$msysRoot = 'C:\msys64'
if (Test-Path -LiteralPath $msysRoot) {
  $env:MSYSTEM = 'UCRT64'
  $env:MSYS2_PATH_TYPE = 'inherit'
  $env:Path = "$msysRoot\ucrt64\bin;$msysRoot\usr\bin;$env:Path"
}
Write-Host "Using compiler: $($compiler.FullName)"
& $compiler.FullName --version | Select-Object -First 1
$output = Join-Path $PSScriptRoot 'lsm_server_cpp20.exe'
$temp = Join-Path $PSScriptRoot '.cpp20-tmp'
New-Item -ItemType Directory -Force -Path $temp | Out-Null
$env:TEMP = $temp
$env:TMP = $temp
$env:TMPDIR = $temp
$env:LSM_DATA_DIR = Join-Path $PSScriptRoot 'data'
$rootEnv = Join-Path $PSScriptRoot '..\.env'
if (Test-Path -LiteralPath $rootEnv) {
  Get-Content -LiteralPath $rootEnv | ForEach-Object {
    if ($_ -match '^\s*([^#=][^=]*)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process') }
  }
}
$env:LSM_DATA_DIR = Join-Path $PSScriptRoot 'data'
$previousErrorAction = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$sources = @('src/main.cpp','src/engine.cpp','src/memtable.cpp','src/wal.cpp','src/sstable.cpp','src/http_server.cpp','src/workload.cpp') | ForEach-Object { Join-Path $PSScriptRoot $_ }
$diagnostics = & $compiler.FullName -std=c++20 -O2 -static -static-libgcc -static-libstdc++ $sources -I (Join-Path $PSScriptRoot 'include') -lws2_32 -lbcrypt -o $output 2>&1
$compileExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorAction
if ($diagnostics) { $diagnostics | ForEach-Object { Write-Host $_ } }
if ($compileExitCode -ne 0) { throw "C++20 compilation failed with exit code $compileExitCode. The old server was not started." }
if (-not (Test-Path -LiteralPath $output)) { throw "C++20 compilation completed without producing $output." }

Write-Host "Starting C++20 LSM backend at http://127.0.0.1:8080"
& $output
