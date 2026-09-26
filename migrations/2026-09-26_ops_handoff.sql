-- Assisted and manual handoff records never imply a live marketplace listing.
CREATE TABLE ops_handoff_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  item_id uuid NOT NULL,
  listing_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  request_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('prepared','filled')),
  channel text NOT NULL CHECK (channel IN ('manual','extension')),
  actor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,request_id,state),
  FOREIGN KEY(workspace_id,item_id) REFERENCES ops_items(workspace_id,id),
  FOREIGN KEY(workspace_id,listing_id) REFERENCES ops_listings(workspace_id,id),
  FOREIGN KEY(workspace_id,revision_id) REFERENCES ops_listing_revisions(workspace_id,id)
);
ALTER TABLE ops_handoff_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY ops_handoff_read ON ops_handoff_events FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=ops_handoff_events.workspace_id AND user_id=auth.uid() AND active AND role IN ('owner','manager','lister')));
GRANT SELECT ON ops_handoff_events TO authenticated;

CREATE FUNCTION ops_ack_handoff(p_workspace_id uuid,p_item_id uuid,p_listing_id uuid,p_revision_id uuid,p_request_id uuid,p_state text,p_channel text,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_listing ops_listings%ROWTYPE; v_revision ops_listing_revisions%ROWTYPE; v_item ops_items%ROWTYPE; v_previous ops_command_results%ROWTYPE; v_hash text; v_result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN ('owner','manager','lister')) THEN RAISE EXCEPTION 'Handoff denied' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL OR p_request_id IS NULL OR p_state NOT IN ('prepared','filled') OR p_channel NOT IN ('manual','extension') OR (p_state='filled' AND p_channel<>'extension') THEN RAISE EXCEPTION 'Invalid handoff' USING ERRCODE='22023'; END IF;
  v_hash:=encode(digest(jsonb_build_object('item',p_item_id,'listing',p_listing_id,'revision',p_revision_id,'request',p_request_id,'state',p_state,'channel',p_channel)::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_listing_id::text,0));
  SELECT * INTO v_previous FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_previous.operation<>'handoff.ack' OR v_previous.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='23505'; END IF;
    RETURN v_previous.result;
  END IF;
  SELECT * INTO v_listing FROM ops_listings WHERE workspace_id=p_workspace_id AND id=p_listing_id FOR UPDATE;
  SELECT * INTO v_revision FROM ops_listing_revisions WHERE workspace_id=p_workspace_id AND id=p_revision_id;
  SELECT * INTO v_item FROM ops_items WHERE workspace_id=p_workspace_id AND id=p_item_id;
  IF v_listing.id IS NULL OR v_revision.id IS NULL OR v_item.id IS NULL OR v_listing.status<>'ready' OR v_listing.item_id<>p_item_id OR v_listing.approved_revision_id<>p_revision_id OR v_revision.listing_id<>p_listing_id OR v_revision.item_id<>p_item_id OR v_revision.capture_revision<>v_item.capture_revision OR v_revision.fact_revision<>(SELECT revision FROM ops_item_facts WHERE workspace_id=p_workspace_id AND item_id=p_item_id) THEN RAISE EXCEPTION 'Approval changed before handoff' USING ERRCODE='40001'; END IF;
  INSERT INTO ops_handoff_events(workspace_id,item_id,listing_id,revision_id,request_id,state,channel,actor_user_id)
    VALUES(p_workspace_id,p_item_id,p_listing_id,p_revision_id,p_request_id,p_state,p_channel,v_user)
    ON CONFLICT(workspace_id,request_id,state) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM ops_handoff_events WHERE workspace_id=p_workspace_id AND request_id=p_request_id AND state=p_state AND item_id=p_item_id AND listing_id=p_listing_id AND revision_id=p_revision_id AND channel=p_channel) THEN RAISE EXCEPTION 'Handoff request conflict' USING ERRCODE='23505'; END IF;
  v_result:=jsonb_build_object('itemId',p_item_id,'listingId',p_listing_id,'revisionId',p_revision_id,'requestId',p_request_id,'state',p_state,'channel',p_channel,'marketplaceStatus','unverified');
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result) VALUES(p_workspace_id,p_key,v_user,'handoff.ack',v_hash,v_result);
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION ops_ack_handoff(uuid,uuid,uuid,uuid,uuid,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops_ack_handoff(uuid,uuid,uuid,uuid,uuid,text,text,uuid) TO authenticated;
