// Disposable local PostgreSQL rehearsal. No remote connection string is accepted.
import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const psql = process.env.QA_PSQL || "psql";
const port = process.env.QA_PG_PORT || "55439";
if (!/^\d+$/.test(port)) throw Error("Invalid local port");
const database = "autolister_photo_qa_" + process.pid;
const args = ["-X", "-h", "127.0.0.1", "-p", port, "-v", "ON_ERROR_STOP=1", "-At"];
const exec = promisify(execFile);
const query = (sql, db = database) => execFileSync(psql, [...args, "-d", db, "-c", sql], {encoding:"utf8"});
const literal = value => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
const owner = "00000000-0000-4000-8000-000000000001";
const rpcSql = (action, data, user = owner) => "select listing_photo_mutate('" + user + "','" + action + "'," + literal(data) + ")";
const rpc = (action, data, user) => JSON.parse(query(rpcSql(action, data, user)).trim() || "null");
query('CREATE DATABASE "' + database + '"', "postgres");
try {
  console.log("PostgreSQL " + query("show server_version").trim());
  // Supabase-owned roles and storage metadata are represented locally.
  query("DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;");
  query("CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); CREATE TABLE daily_stats(date date primary key,estimated_cost numeric); CREATE TABLE profiles(id uuid primary key,subscription_status text,subscription_tier text,paid_access_expires_at timestamptz);");
  // PostgreSQL 12 lacks the core UUID helper. This local-only fixture is not deployed.
  if (query("select to_regprocedure('gen_random_uuid()')").trim() === "") {
    query("CREATE FUNCTION public.gen_random_uuid() RETURNS uuid LANGUAGE sql VOLATILE AS $$ SELECT md5(random()::text || clock_timestamp()::text)::uuid $$");
  }
  query("CREATE TABLE qa_reservations(id uuid primary key,status text); CREATE FUNCTION reserve_generation_request(uuid,text,text,integer,integer,integer,integer,boolean) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE r uuid:=gen_random_uuid(); BEGIN INSERT INTO qa_reservations VALUES(r,'pending'); RETURN jsonb_build_object('allowed',true,'reservationId',r); END $$; CREATE FUNCTION commit_generation_reservation(uuid) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN UPDATE qa_reservations SET status='committed' WHERE id=$1; RETURN true; END $$; CREATE FUNCTION refund_generation_reservation(uuid,text) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN UPDATE qa_reservations SET status='refunded' WHERE id=$1 AND status='pending'; RETURN true; END $$;");
  query(readFileSync("migrations/2026-11-01_user_models.sql","utf8"));
  query(readFileSync("migrations/2026-11-01_listing_model_photos.sql","utf8"));
  query("INSERT INTO auth.users VALUES('" + owner + "'); INSERT INTO profiles VALUES('" + owner + "','active','starter',NULL); INSERT INTO user_model_settings(user_id,enabled) VALUES('" + owner + "',true); INSERT INTO user_models(user_id,preferences,seed,scene,scene_fingerprint,prompt_version,catalog_version,state,object_key) VALUES('" + owner + "','{}','seed','{}','x',1,1,'ready','front.jpg')");
  assert.equal(query("select bool_and(NOT public) from storage.buckets").trim(), "t");
  for (const role of ["anon","authenticated"]) {
    assert.throws(() => query("SET ROLE " + role + "; SELECT * FROM listing_photo_jobs"), /permission denied/);
    assert.throws(() => query("SET ROLE " + role + "; " + rpcSql("get", {})), /permission denied/);
  }
  console.log("PASS private buckets and denied client table/RPC access");
  const admission = {fingerprint:"admission",sources:["original"],limits:{effectiveTier:"starter"}};
  const admitted = rpc("admit", admission);
  assert.equal(rpc("admit",admission).id,admitted.id);
  assert.equal(query("select count(*) from qa_reservations").trim(),"1");
  assert.equal(rpc("get",{id:admitted.id},"00000000-0000-4000-8000-000000000002"),null);
  await Promise.all(["past_due","unpaid"].map(async status => {
    // Separate accounts avoid shared fixture mutation during parallel callers.
    const u = status === "past_due" ? "00000000-0000-4000-8000-000000000003" : "00000000-0000-4000-8000-000000000004";
    query("insert into profiles values('" + u + "','" + status + "','starter',NULL)");
    const result = JSON.parse(query("select reserve_generation_request_for_current_status('" + u + "','v2','starter',100,10,5,5,false)").trim());
    assert.equal(result.code,"payment_required");
  }));
  query("update profiles set paid_access_expires_at=now()-interval '1 second' where id='" + owner + "'");
  assert.equal(JSON.parse(query("select reserve_generation_request_for_current_status('" + owner + "','v2','starter',100,10,5,5,false)").trim()).code,"payment_required");
  query("update profiles set paid_access_expires_at=NULL where id='" + owner + "'");
  console.log("PASS reuse, account isolation and current payment-expiry guard");
  const jobs = ["one","two","three"].map(fingerprint => rpc("create",{fingerprint,generationId:"admitted"}));
  const claims = await Promise.all(jobs.map(j => exec(psql,[...args,"-d",database,"-c",rpcSql("claim",{id:j.id})]).then(r=>JSON.parse(r.stdout.trim() || "null"))));
  assert.equal(claims.filter(Boolean).length,2);
  const running = claims.find(Boolean);
  assert.equal(rpc("claim",{id:running.id}),null);
  const attempt = rpc("stage",{id:running.id,lease:running.lease_token,stage:"primary",objectKey:"out.jpg"});
  query("update listing_photo_jobs set lease_until=now()-interval '1 second' where id='" + running.id + "'");
  assert.equal(rpc("claim",{id:running.id}),null);
  assert.equal(rpc("get",{id:running.id}).state,"failed");
  assert.equal(rpc("save",{id:running.id,lease:running.lease_token,state:"ready"}),null);
  const retried = rpc("retry",{id:running.id});
  assert.equal(retried.retry_count,1);
  console.log("PASS concurrent two-job limit, duplicate claim, uncertain outcome and stale lease fence");
  query("update listing_photo_jobs set state='failed' where state='running'");
  query("insert into daily_stats values(current_date,100)");
  assert.throws(() => rpc("claim",{id:jobs[2].id}), /photo_budget/);
  assert.equal(JSON.parse(query("select reserve_generation_request_for_current_status('" + owner + "','v2','starter',100,10,5,5,false)").trim()).code,"service_unavailable");
  query("delete from daily_stats");
  rpc("cancel",{id:admitted.id});
  assert.equal(query("select status from qa_reservations where id='" + admitted.generation_id + "'").trim(),"refunded");
  const expires = rpc("admit",{...admission,fingerprint:"expires"});
  query("update listing_photo_jobs set source_expires_at=now()-interval '1 second' where id='" + expires.id + "'; select listing_photo_cleanup()");
  assert.equal(rpc("get",{id:expires.id}).payload.sources,undefined);
  assert.equal(query("select status from qa_reservations where id='" + expires.generation_id + "'").trim(),"refunded");
  console.log("PASS shared cost protection, cancellation refund and 24-hour source cleanup");
  query("delete from auth.users where id='" + owner + "'");
  assert.equal(query("select count(*) from user_models").trim(),"0");
  assert.equal(query("select count(*) from listing_photo_jobs").trim(),"0");
  assert.equal(query("select (job_id IS NULL AND user_id IS NULL AND object_key='out.jpg') from listing_photo_attempts where id='" + attempt.id + "'").trim(),"t");
  console.log("PASS account cascade and retained object-cleanup tombstone");
  console.log("PASS local PostgreSQL rehearsal; remote storage/API deployment remains separate");
} finally {
  query('DROP DATABASE "' + database + '"', "postgres");
}
