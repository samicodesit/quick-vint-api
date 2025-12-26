import type { VercelRequest, VercelResponse } from '@vercel/node';
import Busboy from 'busboy';
import Cors from 'cors';
import { supabase } from '../utils/supabaseClient';

// Initialize CORS middleware
const cors = Cors({
    methods: ['GET', 'POST', 'OPTIONS'],
    origin: true,
});

function runMiddleware(req: VercelRequest, res: VercelResponse, fn: Function) {
    return new Promise((resolve, reject) => {
        fn(req, res, (result: any) => {
            if (result instanceof Error) {
                return reject(result);
            }
            return resolve(result);
        });
    });
}

export const config = {
    api: {
        bodyParser: false,
    },
};

interface FileUpload {
    buffer: Buffer;
    filename: string;
    mimeType: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    await runMiddleware(req, res, cors);

    if (req.method === 'GET') {
        return handleList(req, res);
    } else if (req.method === 'POST') {
        // Check if it's a multipart request (upload) or JSON (complete)
        const contentType = req.headers['content-type'] || '';
        if (contentType.includes('multipart/form-data')) {
            return handleUpload(req, res);
        } else {
            return handleComplete(req, res);
        }
    } else {
        return res.status(405).json({ error: 'Method not allowed' });
    }
}

// --- Handler: List Files (GET) ---
async function handleList(req: VercelRequest, res: VercelResponse) {
    const { sessionId } = req.query;

    if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ error: 'Missing sessionId' });
    }

    try {
        const { data: files, error: listError } = await supabase.storage
            .from('temp-uploads')
            .list(sessionId, {
                limit: 100,
                offset: 0,
                sortBy: { column: 'created_at', order: 'asc' },
            });

        if (listError) throw listError;

        if (!files || files.length === 0) {
            return res.status(200).json({ files: [] });
        }

        const fileUrls = await Promise.all(
            files.map(async (file) => {
                const path = `${sessionId}/${file.name}`;
                const { data, error } = await supabase.storage
                    .from('temp-uploads')
                    .createSignedUrl(path, 3600);

                if (error) return null;

                return {
                    name: file.name,
                    url: data?.signedUrl,
                    size: file.metadata?.size,
                    type: file.metadata?.mimetype
                };
            })
        );

        const validFiles = fileUrls.filter(f => f !== null);
        res.status(200).json({ files: validFiles });

    } catch (error: any) {
        console.error('List error:', error);
        res.status(500).json({ error: error.message });
    }
}

// --- Handler: Upload Files (POST Multipart) ---
async function handleUpload(req: VercelRequest, res: VercelResponse) {
    const busboy = Busboy({ headers: req.headers });
    const fileUploads: FileUpload[] = [];
    let sessionId = '';

    busboy.on('field', (fieldname, val) => {
        if (fieldname === 'sessionId') {
            sessionId = val;
        }
    });

    busboy.on('file', (fieldname, file, info) => {
        const { filename, mimeType } = info;
        const chunks: Buffer[] = [];
        
        file.on('data', (data) => chunks.push(data));
        file.on('end', () => {
            fileUploads.push({
                buffer: Buffer.concat(chunks),
                filename,
                mimeType
            });
        });
    });

    busboy.on('finish', async () => {
        try {
            const finalSessionId = sessionId || (req.query.sessionId as string);

            if (!finalSessionId) {
                return res.status(400).json({ error: 'Missing sessionId' });
            }

            const uploadPromises = fileUploads.map(async (file) => {
                const uniqueSuffix = Math.random().toString(36).substring(2, 9);
                const path = `${finalSessionId}/${Date.now()}-${uniqueSuffix}-${file.filename}`;
                const { error } = await supabase.storage
                    .from('temp-uploads')
                    .upload(path, file.buffer, {
                        contentType: file.mimeType,
                        upsert: false
                    });
                
                if (error) throw error;
            });

            await Promise.all(uploadPromises);
            res.status(200).json({ success: true, count: fileUploads.length });
        } catch (error: any) {
            console.error('Upload error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    req.pipe(busboy);
}

// --- Handler: Complete Session (POST JSON) ---
async function handleComplete(req: VercelRequest, res: VercelResponse) {
    // Parse body if needed, but we mostly just need sessionId from query or body
    // Since bodyParser is false, we might need to parse manually if it's in body.
    // But for simplicity, let's rely on query param for sessionId in this case, 
    // or simple JSON parsing if we really need body.
    
    // Note: Since config.api.bodyParser is false for the whole file (needed for busboy),
    // req.body will be undefined or raw stream.
    // We can just use query param for sessionId which is easier.
    
    const sessionId = req.query.sessionId as string;
    
    if (!sessionId) {
         return res.status(400).json({ error: 'Missing sessionId' });
    }

    // In the future, this could trigger a WebSocket event or push notification
    res.status(200).json({ message: 'Upload session completed' });
}
