param([string]$PayloadLine)
& {
  $ErrorActionPreference = 'Stop'
  function Emit([hashtable]$Value) { $Value.schema = 'agent-control.repository-snapshot-result/v1'; [Console]::Out.WriteLine(($Value | ConvertTo-Json -Depth 12 -Compress)) }
  function Fail([string]$Code) { Emit @{ ok = $false; error = $Code }; exit 0 }
  try {
    $request = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($PayloadLine)) | ConvertFrom-Json
    if ([string]$request.operation -ne 'freezeGitRepository') { Fail 'repository_snapshot_operation_not_allowed' }
    if ([string]$request.nodeId -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$') { Fail 'repository_snapshot_node_invalid' }
    $repository = [IO.Path]::GetFullPath([string]$request.repository)
    $roots = @($request.allowedRoots | ForEach-Object { [IO.Path]::GetFullPath([string]$_).TrimEnd('\') })
    if ($roots.Count -eq 0 -or -not @($roots | Where-Object { $repository -ieq $_ -or $repository.StartsWith($_ + '\', [StringComparison]::OrdinalIgnoreCase) }).Count) { Fail 'repository_path_outside_policy' }
    if (-not (Test-Path -LiteralPath $repository -PathType Container)) { Fail 'repository_missing' }
    $ref = [string]$request.requestedRef
    if ($ref -notmatch '^(?!-)(?!.*(?:\.\.|@\{|\\|\s|[~^:?*\[]))[A-Za-z0-9._/-]+$') { Fail 'repository_ref_invalid' }
    $reviewedSha = (& git -C $repository rev-parse --verify ($ref + '^{commit}') 2>$null | Select-Object -First 1).Trim()
    if ($LASTEXITCODE -ne 0 -or $reviewedSha -notmatch '^[0-9a-f]{40,64}$') { Fail 'repository_ref_unresolved' }
    $tracked = @(& git -C $repository ls-tree -r --name-only $reviewedSha)
    if ($LASTEXITCODE -ne 0) { Fail 'repository_snapshot_failed' }
    $sensitive = '(^|/)(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|id_(?:rsa|dsa|ecdsa|ed25519)|[^/]*\.(?:pem|p12|pfx|key)|(?:credentials?|secrets?)(?:\.[^/]*)?)(?:$|/)'
    if (@($tracked | Where-Object { $_ -match $sensitive }).Count -gt 0) { Fail 'repository_snapshot_sensitive_path_forbidden' }
    $status = @(& git -C $repository status --porcelain=v1 --untracked-files=normal)
    $dirtyText = $status -join "`n"
    $utf8 = New-Object Text.UTF8Encoding($false)
    $dirtyFingerprint = if ([string]::IsNullOrWhiteSpace($dirtyText)) { $null } else { $sha = [Security.Cryptography.SHA256]::Create(); try { ([BitConverter]::ToString($sha.ComputeHash($utf8.GetBytes($dirtyText)))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() } }
    $temporary = Join-Path ([IO.Path]::GetTempPath()) ('agent-control-repository-' + [Guid]::NewGuid().ToString('N') + '.tar')
    try {
      & git -C $repository archive --format=tar --output=$temporary $reviewedSha
      if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $temporary -PathType Leaf)) { Fail 'repository_snapshot_failed' }
      $archiveBytes = (Get-Item -LiteralPath $temporary).Length
      if ($archiveBytes -le 0 -or $archiveBytes -gt 49283072) { Fail 'repository_snapshot_archive_too_large' }
      $archiveSha256 = (Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash.ToLowerInvariant()
      $archiveBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($temporary))
      $identityText = ([string]$request.nodeId) + "`n" + $repository.ToLowerInvariant()
      $identityHash = [Security.Cryptography.SHA256]::Create()
      try { $sourceIdentity = ([BitConverter]::ToString($identityHash.ComputeHash($utf8.GetBytes($identityText)))).Replace('-', '').ToLowerInvariant() } finally { $identityHash.Dispose() }
      Emit @{ ok = $true; nodeId = [string]$request.nodeId; sourceIdentity = $sourceIdentity; reviewedSha = $reviewedSha; dirty = -not [string]::IsNullOrWhiteSpace($dirtyText); dirtyFingerprint = $dirtyFingerprint; archiveSha256 = $archiveSha256; archiveBase64 = $archiveBase64; createdAt = [DateTime]::UtcNow.ToString('o') }
    } finally { Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue }
  } catch { Fail 'repository_snapshot_failed' }
}
