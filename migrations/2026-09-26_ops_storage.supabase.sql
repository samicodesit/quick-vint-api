-- Supabase-only release migration. Never apply to a plain PostgreSQL test cluster.
-- Deliberately no authenticated storage.objects policies: only the server service
-- role can download originals or issue upload/read signatures after membership checks.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('ops-originals','ops-originals',false,20971520,ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
-- Existing permissive storage policies elsewhere must not make OS assets readable.
CREATE POLICY ops_private_media_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
USING (bucket_id NOT IN ('ops-originals','ops-derivatives'));
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('ops-derivatives','ops-derivatives',false,20971520,ARRAY['image/webp'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
