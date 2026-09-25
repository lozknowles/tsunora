param(
  [ValidateSet('check','install')][string]$Mode='check',
  [ValidateSet('control','worker')][string]$Role='control',
  [string]$Target=(Get-Location).Path,
  [string]$Repository=''
)
$ErrorActionPreference='Stop'
foreach($required in @('git','node','npm')) { if(-not (Get-Command $required -ErrorAction SilentlyContinue)) { throw "required_prerequisite_missing:$required" } }
if(-not (Test-Path -LiteralPath $Target -PathType Container)) {
  if($Mode -ne 'install' -or [string]::IsNullOrWhiteSpace($Repository)) { throw 'target_missing_no_changes_made' }
  & git clone -- $Repository $Target
}
& git -C $Target rev-parse --is-inside-work-tree *> $null
if($LASTEXITCODE -ne 0) { throw 'repository_not_git' }
$dirty=& git -C $Target status --porcelain
if($dirty) { throw 'repository_dirty_no_changes_made' }
& git -C $Target rev-parse --verify HEAD | Out-Null
if($LASTEXITCODE -ne 0) { throw 'repository_head_unavailable' }
$dashboard=$(if(Test-Path -LiteralPath (Join-Path $Target 'assets/dashboard/index.html') -PathType Leaf){'available'}else{'missing'})
if($dashboard -ne 'available') { throw 'dashboard_missing_no_changes_made' }
$dependencyState='unchecked'
if($Mode -eq 'install') {
  if(Test-Path -LiteralPath (Join-Path $Target 'package-lock.json') -PathType Leaf) {
    & npm --prefix $Target ci --ignore-scripts --no-audit --no-fund
    $dependencyState='installed-locked'
  } else {
    & npm --prefix $Target install --ignore-scripts --no-package-lock
    $dependencyState='installed-no-lock'
  }
  if($LASTEXITCODE -ne 0) { throw 'dependency_install_failed' }
  & npm --prefix $Target run init
  if($LASTEXITCODE -ne 0) { throw 'configuration_initialization_failed' }
}
[ordered]@{
  schema='agent-control.bootstrap/v1'
  mode=$Mode
  role=$Role
  repository='verified'
  dependencies=$dependencyState
  configuration=$(if($Mode -eq 'install'){'initialized-or-preserved'}else{'unchecked'})
  dashboard=$dashboard
  next='npm run check, then npm run web'
} | ConvertTo-Json -Compress
