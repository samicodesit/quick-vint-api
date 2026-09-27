-- Human-confirmed facts and immutable listing revisions. Apply only after release approval.
CREATE TABLE ops_item_facts (
  workspace_id uuid NOT NULL,
  item_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 0 CHECK (revision>=0),
  values jsonb NOT NULL DEFAULT '{}'::jsonb,
  confirmed_by uuid,
  confirmed_at timestamptz,
  PRIMARY KEY(workspace_id,item_id),
  FOREIGN KEY(workspace_id,item_id) REFERENCES ops_items(workspace_id,id)
);
CREATE TABLE ops_listing_templates (
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  locale text NOT NULL CHECK (locale IN ('en','nl','fr','de','pl','es','it')),
  prefix text NOT NULL DEFAULT '' CHECK (length(prefix)<=1000),
  suffix text NOT NULL DEFAULT '' CHECK (length(suffix)<=1000),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id,locale)
);
CREATE TABLE ops_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  item_id uuid NOT NULL,
  locale text NOT NULL CHECK (locale IN ('en','nl','fr','de','pl','es','it')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','queued','pending_confirmation','live','ended','failed','uncertain')),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  current_revision_id uuid,
  approved_revision_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id), UNIQUE(workspace_id,item_id),
  FOREIGN KEY(workspace_id,item_id) REFERENCES ops_items(workspace_id,id)
);
CREATE INDEX ops_listings_queue ON ops_listings(workspace_id,status,updated_at DESC);
CREATE TABLE ops_listing_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  listing_id uuid NOT NULL,
  item_id uuid NOT NULL,
  fact_revision integer NOT NULL CHECK (fact_revision>0),
  capture_revision integer NOT NULL CHECK (capture_revision>=0),
  template_version integer NOT NULL CHECK (template_version>0),
  locale text NOT NULL CHECK (locale IN ('en','nl','fr','de','pl','es','it')),
  price_minor bigint NOT NULL CHECK (price_minor>0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  human_description_override text,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 10000),
  facts jsonb NOT NULL,
  asset_ids uuid[] NOT NULL DEFAULT '{}',
  semantic_hash text NOT NULL CHECK (semantic_hash ~ '^[a-f0-9]{64}$'),
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id),
  FOREIGN KEY(workspace_id,listing_id) REFERENCES ops_listings(workspace_id,id),
  FOREIGN KEY(workspace_id,item_id) REFERENCES ops_items(workspace_id,id)
);
CREATE INDEX ops_listing_revisions_history ON ops_listing_revisions(workspace_id,listing_id,created_at DESC);
ALTER TABLE ops_item_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_listing_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_listing_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY ops_facts_read ON ops_item_facts FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=ops_item_facts.workspace_id AND user_id=auth.uid() AND active AND role IN ('owner','manager','lister')));
CREATE POLICY ops_templates_read ON ops_listing_templates FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=ops_listing_templates.workspace_id AND user_id=auth.uid() AND active AND role IN ('owner','manager','lister')));
CREATE POLICY ops_listings_read ON ops_listings FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=ops_listings.workspace_id AND user_id=auth.uid() AND active AND role IN ('owner','manager','lister')));
CREATE POLICY ops_listing_revisions_read ON ops_listing_revisions FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=ops_listing_revisions.workspace_id AND user_id=auth.uid() AND active AND role IN ('owner','manager','lister')));
GRANT SELECT ON ops_item_facts,ops_listing_templates,ops_listings,ops_listing_revisions TO authenticated;

CREATE FUNCTION ops_invalidate_listing_on_capture() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.capture_revision<>OLD.capture_revision THEN
    UPDATE ops_listings SET status='draft',approved_revision_id=NULL,version=version+1,updated_at=now()
      WHERE workspace_id=NEW.workspace_id AND item_id=NEW.id AND status IN ('draft','ready','failed');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER ops_listing_capture_change AFTER UPDATE OF capture_revision ON ops_items FOR EACH ROW EXECUTE FUNCTION ops_invalidate_listing_on_capture();

CREATE FUNCTION ops_confirm_facts(p_workspace_id uuid,p_item_id uuid,p_expected_revision integer,p_values jsonb,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_current ops_item_facts%ROWTYPE; v_previous ops_command_results%ROWTYPE; v_hash text; v_result jsonb; v_revision integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN ('owner','manager','lister')) THEN RAISE EXCEPTION 'Fact confirmation denied' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL OR p_expected_revision<0 OR jsonb_typeof(p_values)<>'object' OR
     EXISTS(SELECT 1 FROM jsonb_object_keys(p_values) k WHERE k NOT IN ('brand','model','category','size','colour','material','condition','measurements','defects')) THEN RAISE EXCEPTION 'Invalid facts' USING ERRCODE='22023'; END IF;
  v_hash:=encode(digest(jsonb_build_object('item',p_item_id,'expected',p_expected_revision,'values',p_values)::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_item_id::text,0));
  SELECT * INTO v_previous FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_previous.operation<>'facts.confirm' OR v_previous.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='23505'; END IF;
    RETURN v_previous.result;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM ops_items WHERE workspace_id=p_workspace_id AND id=p_item_id) THEN RAISE EXCEPTION 'Item missing' USING ERRCODE='02000'; END IF;
  SELECT * INTO v_current FROM ops_item_facts WHERE workspace_id=p_workspace_id AND item_id=p_item_id FOR UPDATE;
  IF FOUND THEN
    IF v_current.revision<>p_expected_revision THEN RAISE EXCEPTION 'Fact revision changed' USING ERRCODE='40001'; END IF;
    IF v_current.values=p_values THEN
      v_result:=jsonb_build_object('itemId',p_item_id,'factRevision',v_current.revision,'values',p_values,'unchanged',true);
      INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result) VALUES(p_workspace_id,p_key,v_user,'facts.confirm',v_hash,v_result);
      RETURN v_result;
    END IF;
    v_revision:=v_current.revision+1;
    UPDATE ops_item_facts SET values=p_values,revision=v_revision,confirmed_by=v_user,confirmed_at=now() WHERE workspace_id=p_workspace_id AND item_id=p_item_id;
  ELSE
    IF p_expected_revision<>0 THEN RAISE EXCEPTION 'Fact revision changed' USING ERRCODE='40001'; END IF;
    v_revision:=1;
    INSERT INTO ops_item_facts(workspace_id,item_id,revision,values,confirmed_by,confirmed_at) VALUES(p_workspace_id,p_item_id,1,p_values,v_user,now());
  END IF;
  UPDATE ops_listings SET status='draft',approved_revision_id=NULL,version=version+1,updated_at=now() WHERE workspace_id=p_workspace_id AND item_id=p_item_id AND status IN ('draft','ready','failed');
  v_result:=jsonb_build_object('itemId',p_item_id,'factRevision',v_revision,'values',p_values);
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result) VALUES(p_workspace_id,p_key,v_user,'facts.confirm',v_hash,v_result);
  INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version,details) VALUES(p_workspace_id,v_user,'facts.confirm',p_item_id,v_revision,jsonb_build_object('fields',(SELECT jsonb_agg(k) FROM jsonb_object_keys(p_values) k)));
  RETURN v_result;
END; $$;

CREATE FUNCTION ops_save_listing_draft_service(p_workspace_id uuid,p_actor_user_id uuid,p_item_id uuid,p_expected_fact_revision integer,p_expected_listing_version integer,p_expected_template_version integer,p_locale text,p_price_minor bigint,p_currency text,p_human_override text,p_title text,p_description text,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_facts ops_item_facts%ROWTYPE; v_item ops_items%ROWTYPE; v_listing ops_listings%ROWTYPE; v_template_version integer; v_asset_ids uuid[]; v_hash text; v_previous ops_command_results%ROWTYPE; v_revision_id uuid; v_result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=p_actor_user_id AND active AND role IN ('owner','manager','lister')) THEN RAISE EXCEPTION 'Listing denied' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL OR p_locale NOT IN ('en','nl','fr','de','pl','es','it') OR p_price_minor<=0 OR p_currency !~ '^[A-Z]{3}$' OR length(p_title) NOT BETWEEN 1 AND 100 OR length(p_description) NOT BETWEEN 1 AND 10000 OR length(p_human_override)>5000 THEN RAISE EXCEPTION 'Invalid listing draft' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_item_id::text,0));
  v_hash:=encode(digest(jsonb_build_object('item',p_item_id,'facts',p_expected_fact_revision,'listing',p_expected_listing_version,'locale',p_locale,'price',p_price_minor,'currency',p_currency,'override',p_human_override)::text,'sha256'),'hex');
  SELECT * INTO v_previous FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_previous.operation<>'listing.save' OR v_previous.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='23505'; END IF;
    RETURN v_previous.result;
  END IF;
  SELECT * INTO v_item FROM ops_items WHERE workspace_id=p_workspace_id AND id=p_item_id FOR UPDATE;
  SELECT * INTO v_facts FROM ops_item_facts WHERE workspace_id=p_workspace_id AND item_id=p_item_id FOR UPDATE;
  IF v_item.id IS NULL OR v_facts.item_id IS NULL OR v_facts.revision<>p_expected_fact_revision THEN RAISE EXCEPTION 'Confirmed facts changed' USING ERRCODE='40001'; END IF;
  SELECT * INTO v_listing FROM ops_listings WHERE workspace_id=p_workspace_id AND item_id=p_item_id FOR UPDATE;
  IF FOUND THEN
    IF v_listing.version<>p_expected_listing_version OR v_listing.status IN ('queued','pending_confirmation','live') THEN RAISE EXCEPTION 'Listing changed or externally active' USING ERRCODE='40001'; END IF;
    UPDATE ops_listings SET locale=p_locale,status='draft',approved_revision_id=NULL,version=version+1,updated_at=now() WHERE id=v_listing.id RETURNING * INTO v_listing;
  ELSE
    IF p_expected_listing_version<>0 THEN RAISE EXCEPTION 'Listing changed' USING ERRCODE='40001'; END IF;
    INSERT INTO ops_listings(workspace_id,item_id,locale) VALUES(p_workspace_id,p_item_id,p_locale) RETURNING * INTO v_listing;
  END IF;
  SELECT COALESCE(version,1) INTO v_template_version FROM ops_listing_templates WHERE workspace_id=p_workspace_id AND locale=p_locale;
  v_template_version:=COALESCE(v_template_version,1);
  IF v_template_version<>p_expected_template_version THEN RAISE EXCEPTION 'Template changed' USING ERRCODE='40001'; END IF;
  SELECT COALESCE(array_agg(id ORDER BY position,id),'{}'::uuid[]) INTO v_asset_ids FROM ops_media_assets WHERE workspace_id=p_workspace_id AND item_id=p_item_id AND state='available';
  INSERT INTO ops_listing_revisions(workspace_id,listing_id,item_id,fact_revision,capture_revision,template_version,locale,price_minor,currency,human_description_override,title,description,facts,asset_ids,semantic_hash,created_by)
    VALUES(p_workspace_id,v_listing.id,p_item_id,v_facts.revision,v_item.capture_revision,v_template_version,p_locale,p_price_minor,p_currency,p_human_override,p_title,p_description,v_facts.values,v_asset_ids,v_hash,p_actor_user_id) RETURNING id INTO v_revision_id;
  UPDATE ops_listings SET current_revision_id=v_revision_id WHERE id=v_listing.id;
  v_result:=jsonb_build_object('listingId',v_listing.id,'revisionId',v_revision_id,'version',v_listing.version,'status','draft');
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result) VALUES(p_workspace_id,p_key,p_actor_user_id,'listing.save',v_hash,v_result);
  RETURN v_result;
END; $$;

CREATE FUNCTION ops_approve_listing(p_workspace_id uuid,p_listing_id uuid,p_revision_id uuid,p_expected_listing_version integer,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_listing ops_listings%ROWTYPE; v_revision ops_listing_revisions%ROWTYPE; v_item ops_items%ROWTYPE; v_facts ops_item_facts%ROWTYPE; v_previous ops_command_results%ROWTYPE; v_hash text; v_result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN ('owner','manager','lister')) THEN RAISE EXCEPTION 'Approval denied' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL THEN RAISE EXCEPTION 'Idempotency key required' USING ERRCODE='22023'; END IF;
  v_hash:=encode(digest(jsonb_build_object('listing',p_listing_id,'revision',p_revision_id,'expected',p_expected_listing_version)::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_listing_id::text,0));
  SELECT * INTO v_previous FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_previous.operation<>'listing.approve' OR v_previous.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='23505'; END IF;
    RETURN v_previous.result;
  END IF;
  SELECT * INTO v_listing FROM ops_listings WHERE workspace_id=p_workspace_id AND id=p_listing_id FOR UPDATE;
  IF NOT FOUND OR v_listing.version<>p_expected_listing_version OR v_listing.current_revision_id<>p_revision_id OR v_listing.status IN ('queued','pending_confirmation','live') THEN RAISE EXCEPTION 'Listing revision changed' USING ERRCODE='40001'; END IF;
  IF v_listing.status='ready' AND v_listing.approved_revision_id=p_revision_id THEN RAISE EXCEPTION 'Listing revision is already approved' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_revision FROM ops_listing_revisions WHERE workspace_id=p_workspace_id AND id=p_revision_id AND listing_id=p_listing_id;
  SELECT * INTO v_item FROM ops_items WHERE workspace_id=p_workspace_id AND id=v_listing.item_id;
  SELECT * INTO v_facts FROM ops_item_facts WHERE workspace_id=p_workspace_id AND item_id=v_listing.item_id;
  IF v_revision.fact_revision<>v_facts.revision OR v_revision.capture_revision<>v_item.capture_revision OR v_revision.price_minor<=0 OR cardinality(v_revision.asset_ids)<1 OR
     NULLIF(v_revision.facts->>'category','') IS NULL OR NULLIF(v_revision.facts->>'condition','') IS NULL OR
     length(btrim(v_revision.title))<1 OR length(btrim(v_revision.description))<1 THEN RAISE EXCEPTION 'Listing needs review' USING ERRCODE='22023'; END IF;
  UPDATE ops_listing_revisions SET approved_by=v_user,approved_at=now() WHERE id=v_revision.id AND approved_at IS NULL;
  UPDATE ops_items SET catalog_title=v_revision.title WHERE id=v_item.id AND workspace_id=p_workspace_id;
  UPDATE ops_listings SET status='ready',approved_revision_id=v_revision.id,version=version+1,updated_at=now() WHERE id=v_listing.id RETURNING * INTO v_listing;
  v_result:=jsonb_build_object('listingId',v_listing.id,'revisionId',v_revision.id,'version',v_listing.version,'status','ready');
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result) VALUES(p_workspace_id,p_key,v_user,'listing.approve',v_hash,v_result);
  INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version,details) VALUES(p_workspace_id,v_user,'listing.approve',v_listing.id,v_listing.version,jsonb_build_object('revisionId',v_revision.id));
  RETURN v_result;
END; $$;

CREATE FUNCTION ops_save_listing_template(p_workspace_id uuid,p_locale text,p_prefix text,p_suffix text,p_expected_version integer,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_template ops_listing_templates%ROWTYPE; v_previous ops_command_results%ROWTYPE; v_hash text; v_result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN ('owner','manager')) THEN RAISE EXCEPTION 'Template change denied' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL OR p_locale NOT IN ('en','nl','fr','de','pl','es','it') OR length(p_prefix)>1000 OR length(p_suffix)>1000 OR p_expected_version<0 THEN RAISE EXCEPTION 'Invalid template' USING ERRCODE='22023'; END IF;
  v_hash:=encode(digest(jsonb_build_object('locale',p_locale,'prefix',p_prefix,'suffix',p_suffix,'expected',p_expected_version)::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_locale,0));
  SELECT * INTO v_previous FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_previous.operation<>'template.save' OR v_previous.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='23505'; END IF;
    RETURN v_previous.result;
  END IF;
  SELECT * INTO v_template FROM ops_listing_templates WHERE workspace_id=p_workspace_id AND locale=p_locale FOR UPDATE;
  IF FOUND THEN
    IF v_template.version<>p_expected_version THEN RAISE EXCEPTION 'Template changed' USING ERRCODE='40001'; END IF;
    UPDATE ops_listing_templates SET prefix=p_prefix,suffix=p_suffix,version=version+1,updated_by=v_user,updated_at=now() WHERE workspace_id=p_workspace_id AND locale=p_locale RETURNING * INTO v_template;
  ELSE
    IF p_expected_version<>0 THEN RAISE EXCEPTION 'Template changed' USING ERRCODE='40001'; END IF;
    INSERT INTO ops_listing_templates(workspace_id,locale,prefix,suffix,updated_by) VALUES(p_workspace_id,p_locale,p_prefix,p_suffix,v_user) RETURNING * INTO v_template;
  END IF;
  v_result:=jsonb_build_object('locale',p_locale,'version',v_template.version,'prefix',v_template.prefix,'suffix',v_template.suffix);
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result) VALUES(p_workspace_id,p_key,v_user,'template.save',v_hash,v_result);
  RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION ops_confirm_facts(uuid,uuid,integer,jsonb,uuid),ops_save_listing_draft_service(uuid,uuid,uuid,integer,integer,integer,text,bigint,text,text,text,text,uuid),ops_approve_listing(uuid,uuid,uuid,integer,uuid),ops_save_listing_template(uuid,text,text,text,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops_confirm_facts(uuid,uuid,integer,jsonb,uuid),ops_approve_listing(uuid,uuid,uuid,integer,uuid),ops_save_listing_template(uuid,text,text,text,integer,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION ops_save_listing_draft_service(uuid,uuid,uuid,integer,integer,integer,text,bigint,text,text,text,text,uuid) TO service_role;
