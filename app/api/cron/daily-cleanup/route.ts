import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { RateLimiter } from '@/utils/rateLimiter';

// Required for static export
export const dynamic = 'force-static';

export async function GET(request: NextRequest) {
  // Secure the endpoint
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = {
    rateLimits: { success: false, error: null as string | null },
    tempUploads: { success: false, deleted: 0, error: null as string | null },
  };

  // 1. Cleanup Rate Limits
  try {
    await RateLimiter.cleanupExpiredRecords();
    results.rateLimits.success = true;
  } catch (error: any) {
    console.error('Rate limit cleanup failed:', error);
    results.rateLimits.error = error.message;
  }

  // 2. Cleanup Temp Uploads
  try {
    const { data: folders, error: listError } = await supabase.storage
      .from('temp-uploads')
      .list('', { limit: 50, sortBy: { column: 'name', order: 'asc' } });

    if (listError) throw listError;

    if (folders && folders.length > 0) {
      const now = Date.now();
      const MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours
      let deletedCount = 0;

      for (const folder of folders) {
        // If it's a file at root
        if (folder.id) {
          const age = now - new Date(folder.created_at).getTime();
          if (age > MAX_AGE) {
            await supabase.storage.from('temp-uploads').remove([folder.name]);
            deletedCount++;
          }
          continue;
        }

        // It's a folder (prefix). Check contents.
        const { data: files } = await supabase.storage
          .from('temp-uploads')
          .list(folder.name, {
            limit: 1,
            sortBy: { column: 'created_at', order: 'asc' },
          });

        if (!files || files.length === 0) {
          continue;
        }

        const firstFile = files[0];
        const fileAge = now - new Date(firstFile.created_at).getTime();

        if (fileAge > MAX_AGE) {
          // Delete the whole session
          const { data: allFiles } = await supabase.storage
            .from('temp-uploads')
            .list(folder.name, { limit: 100 });

          if (allFiles && allFiles.length > 0) {
            const paths = allFiles.map((f) => `${folder.name}/${f.name}`);
            const { error: delError } = await supabase.storage
              .from('temp-uploads')
              .remove(paths);

            if (!delError) deletedCount++;
          }
        }
      }
      results.tempUploads.deleted = deletedCount;
      results.tempUploads.success = true;
    } else {
      results.tempUploads.success = true; // No folders is a success state
    }
  } catch (error: any) {
    console.error('Temp uploads cleanup failed:', error);
    results.tempUploads.error = error.message;
  }

  return NextResponse.json({
    message: 'Daily cleanup job completed',
    results,
  });
}
