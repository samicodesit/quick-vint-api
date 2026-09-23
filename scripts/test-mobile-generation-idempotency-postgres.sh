#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "BLOCKED: Docker CLI is unavailable. Install Docker with a PostgreSQL-capable daemon and rerun this harness." >&2
  exit 2
fi

if ! docker info >/dev/null 2>&1; then
  echo "BLOCKED: Docker CLI is present but no local daemon is available. Start a local Docker daemon and rerun this harness." >&2
  exit 2
fi

container_name="autolister-mobile-idempotency-postgres-$$"
claim_one_file="$(mktemp)"
claim_two_file="$(mktemp)"
cleanup() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  rm -f "$claim_one_file" "$claim_two_file"
}
trap cleanup EXIT

docker run --rm --name "$container_name" \
  -e POSTGRES_PASSWORD=local-only \
  -e POSTGRES_DB=autolister_harness \
  -d postgres:16-alpine >/dev/null

until docker exec "$container_name" pg_isready -U postgres -d autolister_harness >/dev/null 2>&1; do
  sleep 1
done

docker cp "$(dirname "$0")/mobile-generation-idempotency-harness.sql" \
  "$container_name:/tmp/mobile-generation-idempotency-harness.sql"
docker cp "$(dirname "$0")/../migrations/2026-09-23_mobile_web_generation_idempotency.sql" \
  "$container_name:/tmp/2026-09-23_mobile_web_generation_idempotency.sql"
docker exec "$container_name" psql \
  -U postgres \
  -d autolister_harness \
  -v ON_ERROR_STOP=1 \
  -f /tmp/mobile-generation-idempotency-harness.sql

request_id="00000000-0000-4000-8000-000000000301"
hash_value="$(printf 'd%.0s' {1..64})"
docker exec "$container_name" psql -At -U postgres -d autolister_harness -c "SELECT public.claim_mobile_generation_idempotency('00000000-0000-4000-8000-000000000001', 'mobile_web', '$request_id', '$hash_value');" >"$claim_one_file" &
claim_one_pid=$!
docker exec "$container_name" psql -At -U postgres -d autolister_harness -c "SELECT public.claim_mobile_generation_idempotency('00000000-0000-4000-8000-000000000001', 'mobile_web', '$request_id', '$hash_value');" >"$claim_two_file" &
claim_two_pid=$!
wait "$claim_one_pid"
wait "$claim_two_pid"
claim_one="$(<"$claim_one_file")"
claim_two="$(<"$claim_two_file")"

echo "$claim_one"
echo "$claim_two"
new_count="$(printf '%s\n%s\n' "$claim_one" "$claim_two" | grep -c '"kind":"new"' || true)"
in_progress_count="$(printf '%s\n%s\n' "$claim_one" "$claim_two" | grep -c '"kind":"in_progress"' || true)"
if [[ "$new_count" -ne 1 || "$in_progress_count" -ne 1 ]]; then
  echo "Concurrent claim assertion failed: expected one new and one in_progress result." >&2
  exit 1
fi

echo "Concurrent claim assertion passed."
