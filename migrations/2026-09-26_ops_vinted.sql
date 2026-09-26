-- Vinted Pro events are evidence for reconciliation, not direct stock mutations.
CREATE TABLE ops_vinted_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('sandbox','production')),
  webhook_id uuid UNIQUE,
  contract_version text NOT NULL,
  contract_sha256 text NOT NULL,
  verified_at timestamptz,
  read_items_verified boolean NOT NULL DEFAULT false,
  read_orders_verified boolean NOT NULL DEFAULT false,
  labels_verified boolean NOT NULL DEFAULT false,
  publish_verified boolean NOT NULL DEFAULT false,
  slot_limit integer,
  active_slots integer,
  last_reconciled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ops_vinted_connections_workspace ON ops_vinted_connections(workspace_id);

CREATE TABLE ops_vinted_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES ops_vinted_connections(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id) ON DELETE CASCADE,
  webhook_id uuid NOT NULL,
  body_sha256 text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  reconciled_at timestamptz,
  UNIQUE(connection_id,body_sha256)
);
CREATE INDEX ops_vinted_events_pending ON ops_vinted_events(connection_id,received_at) WHERE reconciled_at IS NULL;

CREATE TABLE ops_vinted_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES ops_vinted_connections(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES ops_items(id),
  listing_revision_id uuid NOT NULL REFERENCES ops_listing_revisions(id),
  reference text NOT NULL,
  provider_item_id uuid,
  state text NOT NULL CHECK(state IN ('pending_confirmation','live','uncertain','failed')),
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(connection_id,reference)
);

ALTER TABLE ops_vinted_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_vinted_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_vinted_publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY ops_vinted_connections_read ON ops_vinted_connections FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM ops_memberships m WHERE m.workspace_id=ops_vinted_connections.workspace_id AND m.user_id=auth.uid() AND m.active AND m.role IN ('owner','manager')));
CREATE POLICY ops_vinted_events_read ON ops_vinted_events FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM ops_memberships m WHERE m.workspace_id=ops_vinted_events.workspace_id AND m.user_id=auth.uid() AND m.active AND m.role IN ('owner','manager')));
CREATE POLICY ops_vinted_publications_read ON ops_vinted_publications FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM ops_memberships m WHERE m.workspace_id=ops_vinted_publications.workspace_id AND m.user_id=auth.uid() AND m.active AND m.role IN ('owner','manager','lister')));
CREATE POLICY ops_vinted_connections_service ON ops_vinted_connections FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE POLICY ops_vinted_events_service ON ops_vinted_events FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE POLICY ops_vinted_publications_service ON ops_vinted_publications FOR ALL TO service_role USING(true) WITH CHECK(true);
GRANT SELECT ON ops_vinted_connections,ops_vinted_events,ops_vinted_publications TO authenticated;
GRANT SELECT,INSERT,UPDATE ON ops_vinted_connections,ops_vinted_events,ops_vinted_publications TO service_role;
