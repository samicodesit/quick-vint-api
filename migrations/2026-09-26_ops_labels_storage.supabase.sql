-- Supabase-only private label bucket. Run only during an approved release.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('ops-labels','ops-labels',false,10000000,ARRAY['application/pdf'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE POLICY ops_private_labels_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
USING(bucket_id<>'ops-labels');
