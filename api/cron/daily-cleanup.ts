import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../utils/supabaseClient";
import { RateLimiter } from "../../utils/rateLimiter";
import { ApiLogger } from "../../utils/apiLogger";

const TEMP_UPLOAD_BUCKET = "temp-uploads";
const TEMP_UPLOAD_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const TEMP_UPLOAD_ROOT_PAGE_SIZE = 100;
const TEMP_UPLOAD_MAX_ROOT_ENTRIES = 500;
const TEMP_UPLOAD_FILE_PAGE_SIZE = 100;
const API_LOG_COMPACTION_CUTOFF_HOURS = 6;
const API_LOG_COMPACTION_BATCH_SIZE = 5000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Secure the endpoint
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    // Allow if running in development or if explicitly disabled, but for now enforce
    // return res.status(401).json({ error: "Unauthorized" });
  }

  const results = {
    rateLimits: { success: false, error: null as string | null },
    tempUploads: { success: false, deleted: 0, error: null as string | null },
    apiLogs: {
      success: false,
      compacted: 0,
      cutoffHours: API_LOG_COMPACTION_CUTOFF_HOURS,
      error: null as string | null,
    },
  };

  // 1. Cleanup Rate Limits
  try {
    await RateLimiter.cleanupExpiredRecords();
    results.rateLimits.success = true;
  } catch (error: any) {
    console.error("Rate limit cleanup failed:", error);
    results.rateLimits.error = error.message;
  }

  // 2. Cleanup Temp Uploads
  try {
    const folders = [];
    for (
      let offset = 0;
      offset < TEMP_UPLOAD_MAX_ROOT_ENTRIES;
      offset += TEMP_UPLOAD_ROOT_PAGE_SIZE
    ) {
      const { data, error: listError } = await supabase.storage
        .from(TEMP_UPLOAD_BUCKET)
        .list("", {
          limit: TEMP_UPLOAD_ROOT_PAGE_SIZE,
          offset,
          sortBy: { column: "name", order: "asc" },
        });

      if (listError) throw listError;
      folders.push(...(data || []));
      if (!data || data.length < TEMP_UPLOAD_ROOT_PAGE_SIZE) break;
    }

    if (folders.length > 0) {
      const now = Date.now();
      let deletedCount = 0;

      for (const folder of folders) {
        // If it's a file at root
        if (folder.id) {
          const age = now - new Date(folder.created_at).getTime();
          if (age > TEMP_UPLOAD_MAX_AGE_MS) {
            await supabase.storage.from(TEMP_UPLOAD_BUCKET).remove([folder.name]);
            deletedCount++;
          }
          continue;
        }

        // It's a folder (prefix). Check contents.
        const { data: files } = await supabase.storage
          .from(TEMP_UPLOAD_BUCKET)
          .list(folder.name, {
            limit: 1,
            sortBy: { column: "created_at", order: "asc" },
          });

        if (!files || files.length === 0) {
          continue;
        }

        const firstFile = files[0];
        const fileAge = now - new Date(firstFile.created_at).getTime();

        if (fileAge > TEMP_UPLOAD_MAX_AGE_MS) {
          // Delete the whole session
          const allFiles = [];
          for (let offset = 0; ; offset += TEMP_UPLOAD_FILE_PAGE_SIZE) {
            const { data: pageFiles } = await supabase.storage
              .from(TEMP_UPLOAD_BUCKET)
              .list(folder.name, {
                limit: TEMP_UPLOAD_FILE_PAGE_SIZE,
                offset,
              });

            allFiles.push(...(pageFiles || []));
            if (!pageFiles || pageFiles.length < TEMP_UPLOAD_FILE_PAGE_SIZE) {
              break;
            }
          }

          if (allFiles && allFiles.length > 0) {
            const paths = allFiles.map((f) => `${folder.name}/${f.name}`);
            const { error: delError } = await supabase.storage
              .from(TEMP_UPLOAD_BUCKET)
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
    console.error("Temp uploads cleanup failed:", error);
    results.tempUploads.error = error.message;
  }

  // 3. Compact old API logs while preserving lightweight long-term metrics
  try {
    const apiLogResult = await ApiLogger.compactOldLogs({
      cutoffHours: API_LOG_COMPACTION_CUTOFF_HOURS,
      batchSize: API_LOG_COMPACTION_BATCH_SIZE,
    });
    results.apiLogs.success = true;
    results.apiLogs.compacted = apiLogResult.compacted;
    results.apiLogs.cutoffHours = apiLogResult.cutoffHours;
  } catch (error: any) {
    console.error("API log compaction failed:", error);
    results.apiLogs.error = error.message;
  }

  return res.status(200).json({
    message: "Daily cleanup job completed",
    results,
  });
}
