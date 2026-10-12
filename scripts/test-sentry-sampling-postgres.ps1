param([string]$PostgresBin = 'C:\Program Files\PostgreSQL\12\bin',
  [string]$MigrationPath = (Join-Path $PSScriptRoot '../migrations/2026-10-12_sentry_capture_sampling.sql'))
$ErrorActionPreference = 'Stop'
$root = Join-Path ([IO.Path]::GetTempPath()) ('autolister-sentry-test-' + [guid]::NewGuid().ToString('N'))
$data = Join-Path $root 'data'
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start(); $port = $listener.LocalEndpoint.Port; $listener.Stop()
$psql = Join-Path $PostgresBin 'psql.exe'
$pgctl = Join-Path $PostgresBin 'pg_ctl.exe'
$started = $false
function Control([string]$operation) {
  $arguments = "-D `"$data`" -l `"$(Join-Path $root 'server.log')`" -o `"-h 127.0.0.1 -p $port`" -w $operation"
  $ctl = Start-Process -FilePath $pgctl -ArgumentList $arguments -WindowStyle Hidden -PassThru
  $ctl.WaitForExit()
  if ($ctl.ExitCode -ne 0) { throw "pg_ctl $operation failed" }
}
function QueryStart([string]$sql) {
  $info = [Diagnostics.ProcessStartInfo]::new()
  $info.FileName = $psql
  $info.Arguments = "-X -q -A -t -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d postgres"
  $info.UseShellExecute = $false; $info.CreateNoWindow = $true
  $info.RedirectStandardInput = $true; $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
  $p = [Diagnostics.Process]::Start($info)
  $p.StandardInput.WriteLine($sql); $p.StandardInput.Close(); return $p
}
function QueryFinish($p) {
  $output = $p.StandardOutput.ReadToEnd(); $errorText = $p.StandardError.ReadToEnd()
  $p.WaitForExit(); $code = $p.ExitCode; $p.Dispose()
  if ($code -ne 0) { throw $errorText }; return $output.Trim()
}
function Query([string]$sql) { QueryFinish (QueryStart $sql) }
function Flood([string]$call, [int]$count) {
  $accepted = 0
  for ($offset=0; $offset -lt $count; $offset+=16) {
    $size = [Math]::Min(16,$count-$offset)
    $jobs = @(1..$size | ForEach-Object { QueryStart "SELECT $call;" })
    $accepted += @($jobs | ForEach-Object { QueryFinish $_ } | Where-Object { $_ -eq 't' }).Count
  }
  return $accepted
}
try {
  New-Item -ItemType Directory -Path $root | Out-Null
  & (Join-Path $PostgresBin 'initdb.exe') -D $data -U postgres -A trust --no-locale | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
  Control 'start'; $started = $true
  Query @'
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE incident_groups(id uuid PRIMARY KEY, severity text);
CREATE TABLE incident_daily_budgets(day date PRIMARY KEY, sentry integer DEFAULT 0);
CREATE FUNCTION incident_reserve_sentry() RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE allowed boolean; BEGIN
INSERT INTO incident_daily_budgets(day) VALUES((now() AT TIME ZONE 'UTC')::date) ON CONFLICT DO NOTHING;
UPDATE incident_daily_budgets SET sentry=sentry+1 WHERE day=(now() AT TIME ZONE 'UTC')::date AND sentry<100 RETURNING true INTO allowed;
RETURN coalesce(allowed,false); END $$;
INSERT INTO incident_groups VALUES ('00000000-0000-4000-8000-000000000001','transient'),('00000000-0000-4000-8000-000000000002','blocking');
'@ | Out-Null
  if ((Flood 'incident_reserve_sentry()' 110) -ne 100) { throw 'baseline reproduction failed' }
  if ((Query 'SELECT incident_reserve_sentry();') -ne 'f') { throw 'baseline cap not reproduced' }
  Query 'DELETE FROM incident_daily_budgets;' | Out-Null
  $migration = Get-Content -LiteralPath $MigrationPath -Raw
  Query $migration | Out-Null
  for ($round = 1; $round -le 3; $round++) {
    Query 'DELETE FROM incident_daily_budgets;' | Out-Null
    if ((Flood "incident_reserve_sentry('00000000-0000-4000-8000-000000000001')" 60) -ne 3) { throw 'concurrent sample ceiling failed' }
    Query "INSERT INTO incident_groups SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'transient' FROM generate_series(3,30)n ON CONFLICT DO NOTHING; SELECT incident_reserve_sentry(id) FROM incident_groups WHERE severity='transient';" | Out-Null
    if ((Query 'SELECT sentry||'',''||sentry_transient FROM incident_daily_budgets;') -ne '20,20') { throw 'aggregate transient ceiling failed' }
    if ((Flood "incident_reserve_sentry('00000000-0000-4000-8000-000000000002')" 90) -ne 80) { throw 'critical reserve/global ceiling failed' }
    Query $migration | Out-Null
    if ((Query 'SELECT sentry FROM incident_daily_budgets;') -ne '100') { throw 'reapply reset budget' }
    Write-Output "Round $round passed: 60 parallel repeats -> 3 captures, transient total 20, critical capacity 80."
  }
  Query 'DROP FUNCTION incident_reserve_sentry(uuid); ALTER TABLE incident_daily_budgets DROP COLUMN sentry_transient, DROP COLUMN sentry_samples;' | Out-Null
  if ((Query 'SELECT incident_reserve_sentry();') -ne 'f') { throw 'rollback lost total budget' }
  Write-Output 'Baseline starvation reproduced; atomic concurrency, migration reapply and rollback passed.'
} finally {
  if ($started) { Control '-m fast stop' }
  $resolved = [IO.Path]::GetFullPath($root)
  if ($resolved.StartsWith([IO.Path]::GetTempPath()) -and (Split-Path $resolved -Leaf).StartsWith('autolister-sentry-test-')) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
