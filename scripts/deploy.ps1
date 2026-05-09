param(
  [string]$Message = "",
  [switch]$SkipSync
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-CheckedCommand {
  param(
    [string]$Label,
    [scriptblock]$Command
  )

  Write-Host ""
  Write-Host "==> $Label"
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

function Sync-Directory {
  param(
    [string]$Source,
    [string]$Destination
  )

  if (!(Test-Path -LiteralPath $Source)) {
    throw "Missing source directory: $Source"
  }

  robocopy $Source $Destination /MIR /XD node_modules .git | Out-Null
  if ($LASTEXITCODE -gt 7) {
    throw "robocopy failed for $Source -> $Destination with exit code $LASTEXITCODE"
  }
  $global:LASTEXITCODE = 0
}

$DeployRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$WorkspaceRoot = Split-Path $DeployRoot -Parent
$SourceRoot = Join-Path $WorkspaceRoot "pbdocs-node"

Push-Location $DeployRoot
try {
  if (!$SkipSync -and (Test-Path -LiteralPath $SourceRoot) -and ((Resolve-Path $SourceRoot).Path -ne $DeployRoot.Path)) {
    Write-Host "==> Sync pbdocs-node into pbdocs-deploy"
    foreach ($dir in @("data", "public", "scripts", "src")) {
      Sync-Directory (Join-Path $SourceRoot $dir) (Join-Path $DeployRoot $dir)
    }

    foreach ($file in @("package.json", "package-lock.json", "README.md", "server.js", "start-pbdocs.cmd", "start-pbdocs.ps1")) {
      $sourceFile = Join-Path $SourceRoot $file
      if (Test-Path -LiteralPath $sourceFile) {
        Copy-Item -LiteralPath $sourceFile -Destination $DeployRoot -Force
      }
    }
  }

  Invoke-CheckedCommand "Install dependencies" { npm install }
  Invoke-CheckedCommand "Run release checks" { npm run check }

  Invoke-CheckedCommand "Stage changes" { git add -A }

  git diff --cached --quiet
  if ($LASTEXITCODE -eq 0) {
    Write-Host "No changes to commit."
  } else {
    $global:LASTEXITCODE = 0
    if ([string]::IsNullOrWhiteSpace($Message)) {
      $Message = "Deploy PowerBuilder docs $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    }
    Invoke-CheckedCommand "Commit changes" { git commit -m $Message }
  }

  Invoke-CheckedCommand "Push to origin/main" { git push origin main }
  Write-Host ""
  Write-Host "Deploy completed."
} finally {
  Pop-Location
}
