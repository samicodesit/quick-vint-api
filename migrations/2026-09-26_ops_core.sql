-- Local application schema only. Apply to production only after separate release approval.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE ops_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ops_memberships (
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'manager', 'lister', 'warehouse')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE ops_bootstrap_requests (
  user_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  payload_hash text NOT NULL,
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idempotency_key)
);

CREATE TABLE ops_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  actor_user_id uuid,
  actor_service text,
  CONSTRAINT ops_audit_actor_present CHECK ((actor_user_id IS NULL) <> (actor_service IS NULL)),
  action text NOT NULL,
  aggregate_id uuid NOT NULL,
  aggregate_version integer NOT NULL CHECK (aggregate_version >= 0),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ops_audit_workspace_time ON ops_audit_events(workspace_id, occurred_at DESC);

CREATE TABLE ops_command_results (
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  idempotency_key uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  operation text NOT NULL,
  payload_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, idempotency_key)
);

CREATE FUNCTION ops_member_for_workspace(p_workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM ops_memberships
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid() AND active
  );
$$;

ALTER TABLE ops_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_bootstrap_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_command_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY ops_workspaces_member_read ON ops_workspaces
FOR SELECT TO authenticated USING (ops_member_for_workspace(id));
CREATE POLICY ops_memberships_member_read ON ops_memberships
FOR SELECT TO authenticated USING (ops_member_for_workspace(workspace_id));
CREATE POLICY ops_audit_member_read ON ops_audit_events
FOR SELECT TO authenticated USING (ops_member_for_workspace(workspace_id));

GRANT SELECT ON ops_workspaces, ops_memberships, ops_audit_events TO authenticated;
REVOKE ALL ON ops_bootstrap_requests, ops_command_results FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION ops_member_for_workspace(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops_member_for_workspace(uuid) TO authenticated;

CREATE FUNCTION ops_bootstrap_workspace(p_name text, p_key uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := auth.uid();
  v_name text := btrim(p_name);
  v_hash text;
  v_existing ops_bootstrap_requests%ROWTYPE;
  v_workspace uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE = '28000'; END IF;
  IF p_key IS NULL OR length(v_name) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Invalid workspace request' USING ERRCODE = '22023';
  END IF;
  v_hash := encode(digest(v_name, 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_key::text, 0));
  SELECT * INTO v_existing FROM ops_bootstrap_requests
    WHERE user_id = v_user AND idempotency_key = p_key;
  IF FOUND THEN
    IF v_existing.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'Idempotency key reused with different payload' USING ERRCODE = '23505';
    END IF;
    RETURN v_existing.workspace_id;
  END IF;

  INSERT INTO ops_workspaces(name, created_by) VALUES (v_name, v_user) RETURNING id INTO v_workspace;
  INSERT INTO ops_memberships(workspace_id, user_id, role) VALUES (v_workspace, v_user, 'owner');
  INSERT INTO ops_audit_events(workspace_id, actor_user_id, action, aggregate_id, aggregate_version)
    VALUES (v_workspace, v_user, 'workspace.bootstrap', v_workspace, 1);
  INSERT INTO ops_bootstrap_requests(user_id, idempotency_key, payload_hash, workspace_id)
    VALUES (v_user, p_key, v_hash, v_workspace);
  RETURN v_workspace;
END;
$$;

REVOKE ALL ON FUNCTION ops_bootstrap_workspace(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops_bootstrap_workspace(text, uuid) TO authenticated;
