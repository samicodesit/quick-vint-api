"""Run only against the isolated, disposable local incident test database."""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import time
import uuid
from datetime import datetime, timezone

host = os.environ.get("PGHOST", "")
assert host == "/tmp/autolister-incident-postgres/socket", "Refusing a non-test database host"
command = [os.environ["INCIDENT_TEST_PSQL"], "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", host, "-p", "55432", "-d", "autolister_incident_test"]


def sql(statement):
    result = subprocess.run(command, input=statement, text=True, capture_output=True, check=True)
    return result.stdout.strip()


assert sql("SELECT current_database();") == "autolister_incident_test"
assert sql("SELECT count(*) FROM incident_groups;") == "0", "Use a fresh test database"
owner = "123e4567-e89b-42d3-a456-426614174000"
base = {"id": str(uuid.uuid4()), "event": "fields_apply_failed", "occurredAt": datetime.now(timezone.utc).isoformat(), "source": "extension_content", "release": "test", "market": "nl", "fingerprint": "parallel", "definition": {"kind": "incident", "severity": "blocking"}, "context": {"stage": "applying", "message": "Test evidence"}}


def ingest(event):
    encoded = json.dumps(event).replace("'", "''")
    return json.loads(sql(f"SELECT incident_ingest('{encoded}'::jsonb,'{owner}',true);"))


with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
    duplicates = list(pool.map(lambda _: ingest(base), range(32)))
assert sum(row["status"] == "accepted" for row in duplicates) == 1
assert sum(row["status"] == "duplicate" for row in duplicates) == 31
assert sql("SELECT occurrences FROM incident_groups WHERE fingerprint='parallel';") == "1"
assert sql("SELECT emails FROM incident_daily_budgets;") == "1"

with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
    sentry_reservations = list(pool.map(lambda _: sql("SELECT incident_reserve_sentry();"), range(120)))
assert sentry_reservations.count("t") == 100

events = [{**base, "id": str(uuid.uuid4()), "fingerprint": f"flood-{index}"} for index in range(510)]
with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
    flood = list(pool.map(ingest, events))
assert sql("SELECT count(*) FROM incident_groups;") == "500"
assert sql("SELECT emails FROM incident_daily_budgets;") == "20"
assert sql("SELECT count(*) FROM incident_groups WHERE notification_payload->>'event'='Daily automatic email limit reached';") == "1"

# Populate representative maximum row counts with bounded traces. These are
# fixtures, not calls that create customers, subscriptions or generations.
sql("""
UPDATE incident_groups g SET first_seen=now(),last_seen=now(),examples=(
  SELECT jsonb_agg(jsonb_build_object('eventId',gen_random_uuid(),'context',jsonb_build_object(
    'message',(SELECT string_agg(md5(random()::text||g.id::text||example_number::text||n::text),'') FROM generate_series(1,15) n),
    'stack',(SELECT string_agg(md5(random()::text||g.id::text||example_number::text||n::text),'') FROM generate_series(1,60) n),
    'breadcrumbs',(SELECT jsonb_agg(jsonb_build_object('stage','generation_received','message',md5(random()::text)||md5(random()::text)||md5(random()::text))) FROM generate_series(1,30)))))
  FROM generate_series(1,3) example_number);
INSERT INTO incident_flows(id,operation_id,user_id,stage,progress)
SELECT 'fixture-'||n,'fixture-'||n,'123e4567-e89b-42d3-a456-426614174000','user_review',jsonb_build_object('photoCount',10,'confirmedPhotoCount',10,'release','test','market','nl')
FROM generate_series(1,5000-(SELECT count(*) FROM incident_flows)::integer) n;
INSERT INTO incident_receipts(id,owner_key,occurred_at)
SELECT gen_random_uuid(),'fixture',now() FROM generate_series(1,25000-(SELECT count(*) FROM incident_receipts)::integer);
ANALYZE incident_groups; ANALYZE incident_flows; ANALYZE incident_receipts;
""")
health = json.loads(sql("SELECT incident_health();"))
assert health["payloadBytes"] <= 20 * 1024 * 1024
assert health["flows"] == 5000 and health["receipts"] == 25000
query = "SELECT coalesce(json_agg(q),'[]') FROM incident_list(NULL,'all',NULL,NULL,NULL) q;"
sql(query)
latencies = []
for _ in range(10):
    started = time.perf_counter()
    rows = json.loads(sql(query))
    latencies.append((time.perf_counter() - started) * 1000)
    assert len(rows) == 51
assert max(latencies) < 1000
seen = set()
while rows:
    page = rows[:50]
    assert not seen.intersection(row["id"] for row in page)
    seen.update(row["id"] for row in page)
    last = page[-1]
    rows = json.loads(sql(f"SELECT coalesce(json_agg(q),'[]') FROM incident_list(NULL,'all','{last['last_seen']}','{last['id']}',NULL) q;"))
assert len(seen) == 500

sql("UPDATE incident_groups SET expires_at=now()-interval '1 minute'; UPDATE incident_flows SET expires_at=now()-interval '1 minute'; UPDATE incident_receipts SET expires_at=now()-interval '1 minute';")
first_cleanup = json.loads(sql("SELECT incident_cleanup(500);"))
assert first_cleanup["backlog"] > 0
for _ in range(60):
    cleanup = json.loads(sql("SELECT incident_cleanup(500);"))
    if cleanup["backlog"] == 0:
        break
assert cleanup["backlog"] == 0
assert sql("SELECT (SELECT count(*) FROM incident_groups)+(SELECT count(*) FROM incident_flows)+(SELECT count(*) FROM incident_receipts);") == "0"
report = {"database": "isolated PostgreSQL 12", "concurrentRequests": 32, "accepted": 1, "duplicates": 31, "distinctFloodRequests": 510, "maxGroups": 500, "reservedEmails": 20, "overflowEmails": 1, "concurrentSentryAttempts": 120, "acceptedSentryAttempts": 100, "fixture": health, "warmPageMs": {"min": min(latencies), "max": max(latencies)}, "paginatedGroups": len(seen), "cleanupBacklog": 0}
# Exercise recovery on independent connections after the size fixture is gone.
sql("DELETE FROM incident_daily_budgets;")
phone_key = "d" * 64
phone = {**base, "id": str(uuid.uuid4()), "fingerprint": "phone-race", "source": "phone_upload_page", "phoneKey": phone_key, "operationId": "phone:" + phone_key}
encoded_phone = json.dumps(phone).replace("'", "''")


def race_phone(index):
    if index % 4 == 0:
        return sql(f"SELECT incident_register_phone('{phone_key}','{owner}');")
    return sql(f"SELECT incident_ingest('{encoded_phone}'::jsonb,NULL,false);")


with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
    list(pool.map(race_phone, range(32)))
# Retried clients now read the verified owner, including any lost-ACK request.
with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
    retried_phone = list(pool.map(lambda _: ingest(phone), range(32)))
assert all(row["status"] == "duplicate" for row in retried_phone)
assert sql("SELECT occurrences FROM incident_groups WHERE fingerprint='phone-race';") == "1"
assert sql("SELECT emails FROM incident_daily_budgets;") == "1"
assert sql(f"SELECT owner_key FROM incident_receipts WHERE id='{phone['id']}';") == owner
assert sql("SELECT identity_verified FROM incident_flows WHERE incident_id IS NOT NULL;") == "t"
report["phoneRegistrationRace"] = {"concurrentOperations": 32, "verifiedRetries": 32, "occurrences": 1, "emailReservations": 1, "ownerRecovered": True}
sql("UPDATE incident_groups SET expires_at=now()-interval '1 minute'; UPDATE incident_flows SET expires_at=now()-interval '1 minute'; UPDATE incident_receipts SET expires_at=now()-interval '1 minute'; SELECT incident_cleanup(1000);")
Path("docs/incident-postgres-acceptance.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
