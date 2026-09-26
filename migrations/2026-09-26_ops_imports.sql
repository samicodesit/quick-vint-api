-- Incremental CSV onboarding. Production application requires separate approval.
ALTER TABLE ops_items ADD COLUMN imported_title text;
ALTER TABLE ops_items ADD COLUMN imported_location_text text;
ALTER TABLE ops_items ADD COLUMN imported_sale_state text;
ALTER TABLE ops_items ADD COLUMN imported_source text;
ALTER TABLE ops_items ADD COLUMN imported_image_url text;

CREATE TABLE ops_import_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  original_name text NOT NULL,
  raw_csv text NOT NULL,
  headers jsonb NOT NULL,
  row_count integer NOT NULL CHECK (row_count BETWEEN 1 AND 20000),
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id), UNIQUE(workspace_id,sha256)
);
CREATE TABLE ops_import_file_rows (
  workspace_id uuid NOT NULL,
  file_id uuid NOT NULL,
  row_number integer NOT NULL CHECK (row_number>0),
  raw_values jsonb NOT NULL,
  PRIMARY KEY(file_id,row_number),
  FOREIGN KEY(workspace_id,file_id) REFERENCES ops_import_files(workspace_id,id)
);
CREATE TABLE ops_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  file_id uuid NOT NULL,
  mapping jsonb NOT NULL,
  mapping_hash text NOT NULL,
  account_scope text NOT NULL CHECK (length(account_scope) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'review' CHECK (status IN ('review','applying','complete')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(workspace_id,id), UNIQUE(workspace_id,file_id,mapping_hash),
  FOREIGN KEY(workspace_id,file_id) REFERENCES ops_import_files(workspace_id,id)
);
CREATE TABLE ops_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  import_id uuid NOT NULL,
  row_number integer NOT NULL,
  raw_values jsonb NOT NULL,
  mapped_values jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','imported','skipped','conflicted','unsupported','invalid')),
  reason text,
  item_id uuid,
  applied_at timestamptz,
  UNIQUE(import_id,row_number),
  FOREIGN KEY(workspace_id,import_id) REFERENCES ops_import_runs(workspace_id,id),
  FOREIGN KEY(workspace_id,item_id) REFERENCES ops_items(workspace_id,id)
);
CREATE INDEX ops_import_rows_checkpoint ON ops_import_rows(workspace_id,import_id,status,row_number);
CREATE TABLE ops_import_external_links (
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  account_scope text NOT NULL,
  external_id text NOT NULL,
  item_id uuid NOT NULL,
  first_import_row_id uuid NOT NULL REFERENCES ops_import_rows(id),
  PRIMARY KEY(workspace_id,account_scope,external_id),
  FOREIGN KEY(workspace_id,item_id) REFERENCES ops_items(workspace_id,id)
);
CREATE TABLE ops_item_field_provenance (
  workspace_id uuid NOT NULL,
  item_id uuid NOT NULL,
  field_name text NOT NULL,
  import_row_id uuid NOT NULL REFERENCES ops_import_rows(id),
  imported_value jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id,item_id,field_name),
  FOREIGN KEY(workspace_id,item_id) REFERENCES ops_items(workspace_id,id)
);
ALTER TABLE ops_import_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_import_file_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_import_external_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_item_field_provenance ENABLE ROW LEVEL SECURITY;
CREATE POLICY ops_import_files_read ON ops_import_files FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=ops_import_files.workspace_id AND user_id=auth.uid() AND active AND role IN ('owner','manager')));
CREATE POLICY ops_import_runs_read ON ops_import_runs FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=ops_import_runs.workspace_id AND user_id=auth.uid() AND active AND role IN ('owner','manager')));
CREATE POLICY ops_import_rows_read ON ops_import_rows FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=ops_import_rows.workspace_id AND user_id=auth.uid() AND active AND role IN ('owner','manager')));
GRANT SELECT ON ops_import_files,ops_import_runs,ops_import_rows TO authenticated;

CREATE FUNCTION ops_preview_import_matches(p_workspace_id uuid,p_import_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_run ops_import_runs%ROWTYPE; v_row ops_import_rows%ROWTYPE; v_ext text; v_sku text; v_ext_item uuid; v_sku_item uuid; v_match_count integer; v_conflict text; v_checked integer:=0;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN ('owner','manager')) THEN RAISE EXCEPTION 'Import preview denied' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_run FROM ops_import_runs WHERE workspace_id=p_workspace_id AND id=p_import_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Import missing' USING ERRCODE='02000'; END IF;
  FOR v_row IN SELECT * FROM ops_import_rows WHERE workspace_id=p_workspace_id AND import_id=p_import_id AND status='pending' ORDER BY row_number FOR UPDATE LOOP
    v_checked:=v_checked+1; v_conflict:=NULL; v_ext_item:=NULL; v_sku_item:=NULL; v_match_count:=0;
    v_ext:=NULLIF(btrim(v_row.mapped_values->>'externalId'),'');
    v_sku:=NULLIF(btrim(v_row.mapped_values->>'sku'),'');
    IF v_ext IS NOT NULL THEN SELECT item_id INTO v_ext_item FROM ops_import_external_links WHERE workspace_id=p_workspace_id AND account_scope=v_run.account_scope AND external_id=v_ext; END IF;
    IF v_sku IS NOT NULL THEN
      SELECT count(DISTINCT item_id),min(item_id::text)::uuid INTO v_match_count,v_sku_item FROM (
        SELECT id AS item_id FROM ops_items WHERE workspace_id=p_workspace_id AND normalized_sku=upper(v_sku)
        UNION ALL SELECT item_id FROM ops_item_identifiers WHERE workspace_id=p_workspace_id AND normalized=upper(v_sku) AND kind IN ('seller_sku','internal_sku','barcode_alias')
      ) matches;
    END IF;
    IF v_match_count>1 THEN v_conflict:='SKU identifies more than one item'; END IF;
    IF v_ext_item IS NOT NULL AND v_sku_item IS NOT NULL AND v_ext_item<>v_sku_item THEN v_conflict:='External ID and SKU identify different items'; END IF;
    UPDATE ops_import_rows SET status=CASE WHEN v_conflict IS NULL THEN status ELSE 'conflicted' END,
      reason=v_conflict,item_id=COALESCE(v_ext_item,v_sku_item) WHERE id=v_row.id;
  END LOOP;
  RETURN jsonb_build_object('importId',p_import_id,'checked',v_checked);
END; $$;

CREATE FUNCTION ops_apply_import_batch(p_workspace_id uuid,p_import_id uuid,p_key uuid,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_run ops_import_runs%ROWTYPE; v_row ops_import_rows%ROWTYPE; v_previous ops_command_results%ROWTYPE;
  v_hash text; v_result jsonb; v_ext text; v_sku text; v_ext_item uuid; v_sku_item uuid; v_match_count integer; v_item uuid; v_created boolean;
  v_cost bigint; v_currency text; v_title text; v_location text; v_sale text; v_source text; v_image text; v_current ops_items%ROWTYPE;
  v_processed integer:=0; v_conflict text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN ('owner','manager')) THEN RAISE EXCEPTION 'Import denied' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid import batch' USING ERRCODE='22023'; END IF;
  v_hash:=encode(digest(jsonb_build_object('import',p_import_id,'limit',p_limit)::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended('import:'||p_import_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||p_key::text,0));
  SELECT * INTO v_previous FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_previous.operation<>'import.apply' OR v_previous.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='23505'; END IF;
    RETURN v_previous.result;
  END IF;
  SELECT * INTO v_run FROM ops_import_runs WHERE workspace_id=p_workspace_id AND id=p_import_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Import missing' USING ERRCODE='02000'; END IF;
  FOR v_row IN SELECT * FROM ops_import_rows WHERE workspace_id=p_workspace_id AND import_id=p_import_id AND status='pending' ORDER BY row_number LIMIT p_limit FOR UPDATE LOOP
    v_processed:=v_processed+1; v_conflict:=NULL; v_item:=NULL; v_created:=false;
    v_ext:=NULLIF(btrim(v_row.mapped_values->>'externalId'),'');
    v_sku:=NULLIF(btrim(v_row.mapped_values->>'sku'),'');
    v_title:=NULLIF(btrim(v_row.mapped_values->>'title'),'');
    v_location:=NULLIF(btrim(v_row.mapped_values->>'location'),'');
    v_sale:=NULLIF(btrim(v_row.mapped_values->>'saleState'),'');
    v_source:=NULLIF(btrim(v_row.mapped_values->>'source'),'');
    v_image:=NULLIF(btrim(v_row.mapped_values->>'imageUrl'),'');
    v_cost:=NULLIF(v_row.mapped_values->>'costMinor','')::bigint;
    v_currency:=NULLIF(v_row.mapped_values->>'currency','');
    IF v_ext IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('external:'||p_workspace_id::text||':'||v_run.account_scope||':'||v_ext,0)); END IF;
    IF v_ext IS NOT NULL THEN SELECT item_id INTO v_ext_item FROM ops_import_external_links WHERE workspace_id=p_workspace_id AND account_scope=v_run.account_scope AND external_id=v_ext; ELSE v_ext_item:=NULL; END IF;
    IF v_sku IS NOT NULL THEN
      SELECT count(DISTINCT item_id),min(item_id::text)::uuid INTO v_match_count,v_sku_item FROM (
        SELECT id AS item_id FROM ops_items WHERE workspace_id=p_workspace_id AND normalized_sku=upper(v_sku)
        UNION ALL SELECT item_id FROM ops_item_identifiers WHERE workspace_id=p_workspace_id AND normalized=upper(v_sku) AND kind IN ('seller_sku','internal_sku','barcode_alias')
      ) matches;
    ELSE v_match_count:=0; v_sku_item:=NULL; END IF;
    IF v_match_count>1 THEN v_conflict:='SKU identifies more than one item'; END IF;
    IF v_ext_item IS NOT NULL AND v_sku_item IS NOT NULL AND v_ext_item<>v_sku_item THEN v_conflict:='External ID and SKU identify different items'; END IF;
    IF v_conflict IS NOT NULL THEN
      UPDATE ops_import_rows SET status='conflicted',reason=v_conflict,applied_at=now() WHERE id=v_row.id;
      CONTINUE;
    END IF;
    v_item:=COALESCE(v_ext_item,v_sku_item);
    IF v_item IS NULL THEN
      BEGIN
        v_item:=(ops_create_item(p_workspace_id,v_sku,NULL,NULL,v_row.id))->>'itemId';
        v_created:=true;
      EXCEPTION WHEN unique_violation THEN
        UPDATE ops_import_rows SET status='conflicted',reason='SKU was claimed concurrently',applied_at=now() WHERE id=v_row.id;
        CONTINUE;
      END;
    END IF;
    SELECT * INTO v_current FROM ops_items WHERE workspace_id=p_workspace_id AND id=v_item FOR UPDATE;
    IF v_cost IS NOT NULL AND v_current.cost_minor IS NOT NULL AND (v_current.cost_minor<>v_cost OR v_current.cost_currency<>v_currency) THEN v_conflict:='Purchase cost differs from existing item'; END IF;
    IF v_cost IS NOT NULL AND v_current.cost_minor IS NULL AND EXISTS(SELECT 1 FROM ops_cost_corrections WHERE workspace_id=p_workspace_id AND item_id=v_item) THEN v_conflict:='Human cost correction must be reviewed'; END IF;
    IF v_title IS NOT NULL AND v_current.imported_title IS NOT NULL AND v_current.imported_title<>v_title THEN v_conflict:=COALESCE(v_conflict||'; ','')||'Title differs from existing item'; END IF;
    IF v_location IS NOT NULL AND v_current.imported_location_text IS NOT NULL AND v_current.imported_location_text<>v_location THEN v_conflict:=COALESCE(v_conflict||'; ','')||'Location text differs from existing item'; END IF;
    IF v_sale IS NOT NULL AND v_current.imported_sale_state IS NOT NULL AND v_current.imported_sale_state<>v_sale THEN v_conflict:=COALESCE(v_conflict||'; ','')||'Sale state differs from existing item'; END IF;
    IF v_source IS NOT NULL AND v_current.imported_source IS NOT NULL AND v_current.imported_source<>v_source THEN v_conflict:=COALESCE(v_conflict||'; ','')||'Source differs from existing item'; END IF;
    IF v_image IS NOT NULL AND v_current.imported_image_url IS NOT NULL AND v_current.imported_image_url<>v_image THEN v_conflict:=COALESCE(v_conflict||'; ','')||'Image reference differs from existing item'; END IF;
    IF v_conflict IS NOT NULL THEN
      UPDATE ops_import_rows SET status='conflicted',reason=v_conflict,item_id=v_item,applied_at=now() WHERE id=v_row.id;
      CONTINUE;
    END IF;
    UPDATE ops_items SET
      cost_minor=COALESCE(cost_minor,v_cost),cost_currency=COALESCE(cost_currency,v_currency),
      imported_title=COALESCE(imported_title,v_title),imported_location_text=COALESCE(imported_location_text,v_location),
      imported_sale_state=COALESCE(imported_sale_state,v_sale),imported_source=COALESCE(imported_source,v_source),
      imported_image_url=COALESCE(imported_image_url,v_image),updated_at=now(),version=version+1
      WHERE id=v_item AND (v_created OR (cost_minor IS NULL AND v_cost IS NOT NULL) OR (imported_title IS NULL AND v_title IS NOT NULL) OR (imported_location_text IS NULL AND v_location IS NOT NULL) OR (imported_sale_state IS NULL AND v_sale IS NOT NULL) OR (imported_source IS NULL AND v_source IS NOT NULL) OR (imported_image_url IS NULL AND v_image IS NOT NULL));
    IF v_ext IS NOT NULL THEN
      INSERT INTO ops_import_external_links(workspace_id,account_scope,external_id,item_id,first_import_row_id)
        VALUES(p_workspace_id,v_run.account_scope,v_ext,v_item,v_row.id) ON CONFLICT DO NOTHING;
      IF NOT EXISTS(SELECT 1 FROM ops_import_external_links WHERE workspace_id=p_workspace_id AND account_scope=v_run.account_scope AND external_id=v_ext AND item_id=v_item) THEN
        UPDATE ops_import_rows SET status='conflicted',reason='External ID was claimed concurrently',item_id=v_item,applied_at=now() WHERE id=v_row.id;
        CONTINUE;
      END IF;
    END IF;
    UPDATE ops_import_rows SET status=CASE WHEN v_created THEN 'imported' ELSE 'skipped' END,item_id=v_item,applied_at=now() WHERE id=v_row.id;
    INSERT INTO ops_item_field_provenance(workspace_id,item_id,field_name,import_row_id,imported_value)
      SELECT p_workspace_id,v_item,field_name,v_row.id,value FROM jsonb_each(v_row.mapped_values) fields(field_name,value)
      WHERE value IS NOT NULL AND value<>'""'::jsonb
      ON CONFLICT(workspace_id,item_id,field_name) DO NOTHING;
  END LOOP;
  UPDATE ops_import_runs SET status=CASE WHEN EXISTS(SELECT 1 FROM ops_import_rows WHERE import_id=p_import_id AND status='pending') THEN 'applying' ELSE 'complete' END,
    completed_at=CASE WHEN EXISTS(SELECT 1 FROM ops_import_rows WHERE import_id=p_import_id AND status='pending') THEN NULL ELSE now() END WHERE id=p_import_id RETURNING * INTO v_run;
  v_result:=jsonb_build_object('importId',p_import_id,'processed',v_processed,'remaining',(SELECT count(*) FROM ops_import_rows WHERE import_id=p_import_id AND status='pending'),'status',v_run.status);
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result) VALUES(p_workspace_id,p_key,v_user,'import.apply',v_hash,v_result);
  INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version) VALUES(p_workspace_id,v_user,'import.apply',p_import_id,v_processed);
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION ops_preview_import_matches(uuid,uuid),ops_apply_import_batch(uuid,uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops_preview_import_matches(uuid,uuid),ops_apply_import_batch(uuid,uuid,uuid,integer) TO authenticated;
