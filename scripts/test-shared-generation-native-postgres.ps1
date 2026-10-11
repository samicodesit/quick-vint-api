param(
  [string]$PostgresBin = 'C:\Program Files\PostgreSQL\12\bin',
  [string]$RepoRoot = (Join-Path $PSScriptRoot '..'),
  [string]$MetadataPath = (Join-Path $PSScriptRoot '..\docs\qa\browser-drafts\release-readiness.json')
)
$ErrorActionPreference = 'Stop'
$repo = (Get-Item -LiteralPath $RepoRoot).FullName
$metadata = Get-Content -LiteralPath $MetadataPath -Raw | ConvertFrom-Json
$root = Join-Path ([System.IO.Path]::GetTempPath()) ('autolister-generation-postgres-' + [guid]::NewGuid().ToString('N'))
$data = Join-Path $root 'data'
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
$psql = Join-Path $PostgresBin 'psql.exe'
$pgctl = Join-Path $PostgresBin 'pg_ctl.exe'
$database = 'autolister_release_test'
$started = $false

function Start-TestQuery([string]$statement) {
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $psql
  $startInfo.Arguments = "-X -q -A -t -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d $database"
  $startInfo.UseShellExecute = $false
  $startInfo.WorkingDirectory = $root
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $process = [System.Diagnostics.Process]::Start($startInfo)
  $process.StandardInput.WriteLine($statement)
  $process.StandardInput.Close()
  return $process
}
function Complete-TestQuery($process) {
  $output = $process.StandardOutput.ReadToEnd()
  $errorOutput = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  $exitCode = $process.ExitCode
  $process.Dispose()
  if ($exitCode -ne 0) { throw "Isolated PostgreSQL query failed: $errorOutput" }
  return $output.Trim()
}
function Invoke-TestQuery([string]$statement) { Complete-TestQuery (Start-TestQuery $statement) }

try {
  New-Item -ItemType Directory -Path $root | Out-Null
  Push-Location $root
  & (Join-Path $PostgresBin 'initdb.exe') -D $data -A trust -U postgres -E UTF8 --no-locale | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not initialize isolated PostgreSQL' }
  $serverOptions = '"-h 127.0.0.1 -p ' + $port + '"'
  $start = Start-Process -FilePath $pgctl -WorkingDirectory $root -ArgumentList @('-D', $data, '-l', (Join-Path $root 'server.log'), '-o', $serverOptions, '-w', 'start') -WindowStyle Hidden -PassThru
  if (-not $start.WaitForExit(30000)) { throw 'PostgreSQL startup timed out' }
  if ($start.ExitCode -ne 0) { throw 'Could not start isolated PostgreSQL' }
  $started = $true
  & (Join-Path $PostgresBin 'createdb.exe') -h 127.0.0.1 -p $port -U postgres $database
  if ($LASTEXITCODE -ne 0) { throw 'Could not create isolated test database' }
  if ((Invoke-TestQuery 'SELECT current_database();') -ne $database) { throw 'Database identity check failed' }

  $bootstrap = 'CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN; CREATE EXTENSION pgcrypto;'
  $allowedTypes = @('uuid','text','integer','bigint','boolean','date','timestamp with time zone','timestamp without time zone','character varying','jsonb','numeric','double precision','real','smallint')
  foreach ($table in @('profiles','rate_limits','daily_stats','system_settings','credit_ledger')) {
    $columns = @()
    foreach ($column in $metadata.baselineColumns.$table) {
      if ($column.name -notmatch '^[a-z_][a-z0-9_]*$' -or $column.type -notin $allowedTypes) { throw 'Unexpected schema metadata identifier/type' }
      $definition = '"' + $column.name + '" ' + $column.type
      if ($column.name -eq 'id') {
        if ($column.type -eq 'uuid') { $definition += ' PRIMARY KEY DEFAULT gen_random_uuid()' }
        elseif ($column.type -eq 'integer') { $definition = 'id serial PRIMARY KEY' }
        else { throw 'Unexpected primary key type' }
      }
      if (($table -eq 'daily_stats' -and $column.name -eq 'date') -or ($table -eq 'system_settings' -and $column.name -eq 'key')) { $definition += ' UNIQUE' }
      $columns += $definition
    }
    if ($columns.Count -eq 0) { throw "Missing production metadata for $table" }
    $bootstrap += ' CREATE TABLE public.' + $table + '(' + ($columns -join ',') + ');'
  }
  Invoke-TestQuery $bootstrap | Out-Null
  foreach ($migration in @('2026-06-20_atomic_generation_reservation.sql','2026-08-23_paid_entitlement_reservation.sql','2026-08-24_suspend_delinquent_generation.sql','2026-09-23_mobile_web_generation_idempotency.sql')) {
    Invoke-TestQuery (Get-Content -LiteralPath (Join-Path $repo "migrations\$migration") -Raw) | Out-Null
  }
  $probe = "SELECT reserve_and_bind_mobile_generation_reservation(NULL,NULL,NULL,'extension','00000000-0000-4000-8000-000000000000',repeat('0',64),'current','free',0,0,0,0,false);"
  $before = Invoke-TestQuery $probe | ConvertFrom-Json
  if ($before.code -ne 'idempotency_bind_failed') { throw 'Old migration did not reject extension client' }
  Invoke-TestQuery (Get-Content -LiteralPath (Join-Path $repo 'migrations\2026-10-11_shared_generation_retry_protection.sql') -Raw) | Out-Null
  $after = Invoke-TestQuery $probe | ConvertFrom-Json
  if ($after.code -ne 'service_unavailable' -or $after.allowed -ne $false) { throw 'Shared migration did not accept client before rejecting NULL profile' }
  $acceptance = Invoke-TestQuery (Get-Content -LiteralPath (Join-Path $repo 'scripts\shared-generation-native-postgres.sql') -Raw) | ConvertFrom-Json

  # Independent native connections actually overlap and contend on row locks.
  $ownerId = '00000000-0000-4000-8000-000000000020'
  $requestId = [guid]::NewGuid().ToString()
  $claim = "BEGIN; SELECT claim_mobile_generation_idempotency('$ownerId','extension','$requestId',repeat('a',64)); SELECT pg_sleep(0.2); COMMIT;"
  $claims = @((Start-TestQuery $claim), (Start-TestQuery $claim))
  $claimResults = @($claims | ForEach-Object { Complete-TestQuery $_ })
  if (@($claimResults | Where-Object { $_ -match '"kind": "new"' }).Count -ne 1 -or @($claimResults | Where-Object { $_ -match '"kind": "in_progress"' }).Count -ne 1) { throw 'Concurrent claim did not yield one new and one in_progress result' }
  $operation = Invoke-TestQuery "SELECT json_build_object('id',id,'attempt',attempt_id) FROM mobile_generation_idempotency WHERE request_id='$requestId';" | ConvertFrom-Json
  $reserve = "SELECT reserve_and_bind_mobile_generation_reservation('$ownerId','$($operation.id)','$($operation.attempt)','extension','$requestId',repeat('a',64),'current','pro',500,50,20,5,false);"
  $reservations = @(1..8 | ForEach-Object { Start-TestQuery $reserve })
  $reservationResults = @($reservations | ForEach-Object { Complete-TestQuery $_ | ConvertFrom-Json })
  if (@($reservationResults | Where-Object { $_.allowed -eq $true }).Count -ne 1) { throw 'Concurrent reserve did not produce exactly one debit' }
  if ((Invoke-TestQuery "SELECT api_calls_this_month FROM profiles WHERE id='$ownerId';") -ne '1') { throw 'Concurrent reserve changed monthly usage more than once' }
  $report = [ordered]@{ checkedAt = [DateTime]::UtcNow.ToString('o'); database = 'isolated native PostgreSQL 12'; baseline = 'column names/types from production OpenAPI metadata, local constraints/defaults'; reservationFunctions = 'actual repository production migrations, no reservation stubs'; oldClientRejected = $true; sharedClientAccepted = $true; acceptance = $acceptance; concurrentClaimConnections = 2; concurrentReservationConnections = 8; concurrentDebits = 1; limitation = 'Production function bodies and deployed grants still require database catalog access.' }
  $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $repo 'docs\qa\browser-drafts\native-postgres-acceptance.json') -Encoding UTF8
  $report | ConvertTo-Json -Depth 8
} finally {
  if ($started) { & $pgctl -D $data -m fast -w stop | Out-Null }
  # This cluster is task-owned and stopped. Preserve it if cleanup is rejected;
  # never target another PostgreSQL installation or a shared database.
  Write-Output "Stopped test cluster: $root"
  Pop-Location
}
