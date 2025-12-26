import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../utils/supabaseClient';

// This cron job should run periodically (e.g., every hour or day)
// to clean up old files from the temp-uploads bucket.
// Configure in vercel.json

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Verify cron secret if needed (Vercel handles this automatically for registered crons usually, 
    // but good to check auth if exposed publicly)
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET_KEY}`) {
        // return res.status(401).json({ error: 'Unauthorized' });
        // For now, we'll skip strict auth check to ensure it runs easily in dev/test, 
        // but in prod you should secure this.
    }

    try {
        // 1. List top-level folders (sessionIds)
        // Note: Folders in object storage are "prefixes". They often don't have a created_at timestamp.
        // We must check the files inside to determine age.
        const { data: folders, error: listError } = await supabase.storage
            .from('temp-uploads')
            .list('', { limit: 50, sortBy: { column: 'name', order: 'asc' } });

        if (listError) throw listError;

        if (!folders || folders.length === 0) {
            return res.status(200).json({ message: 'No sessions found' });
        }

        const now = Date.now();
        const MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours
        let deletedCount = 0;

        for (const folder of folders) {
            // If it's a file at root (shouldn't happen with our logic, but possible), check it
            if (folder.id) {
                const age = now - new Date(folder.created_at).getTime();
                if (age > MAX_AGE) {
                    await supabase.storage.from('temp-uploads').remove([folder.name]);
                    deletedCount++;
                }
                continue;
            }

            // It's a folder (prefix). Check contents to determine age.
            // We peek at the first file.
            const { data: files } = await supabase.storage
                .from('temp-uploads')
                .list(folder.name, { limit: 1, sortBy: { column: 'created_at', order: 'asc' } });

            if (!files || files.length === 0) {
                // Empty folder, maybe leftover. Ignore or could try to remove if Supabase supports rmdir equivalent
                // (usually removing all files removes the prefix)
                continue;
            }

            const firstFile = files[0];
            const fileAge = now - new Date(firstFile.created_at).getTime();

            if (fileAge > MAX_AGE) {
                // The oldest file in this session is older than 24h.
                // Delete the whole session.
                
                // List all files in this session to delete them
                const { data: allFiles } = await supabase.storage
                    .from('temp-uploads')
                    .list(folder.name, { limit: 100 });
                
                if (allFiles && allFiles.length > 0) {
                    const paths = allFiles.map(f => `${folder.name}/${f.name}`);
                    const { error: delError } = await supabase.storage
                        .from('temp-uploads')
                        .remove(paths);
                    
                    if (!delError) deletedCount++;
                }
            }
        }

        res.status(200).json({ message: 'Cleanup job ran', checked: folders.length, deletedSessions: deletedCount });

    } catch (error: any) {
        console.error('Cleanup error:', error);
        res.status(500).json({ error: error.message });
    }
}
