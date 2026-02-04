import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { handleCorsPreflight, addCorsHeaders, getAllowedOrigin } from '@/lib/cors';

// Required for static export with API routes
export const dynamic = 'force-static';

// Helper to parse multipart form data
async function parseMultipartForm(request: NextRequest): Promise<{
  fields: Record<string, string>;
  files: Array<{ name: string; buffer: Buffer; mimeType: string; filename: string }>;
}> {
  const formData = await request.formData();
  const fields: Record<string, string> = {};
  const files: Array<{ name: string; buffer: Buffer; mimeType: string; filename: string }> = [];

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      const arrayBuffer = await value.arrayBuffer();
      files.push({
        name: key,
        buffer: Buffer.from(arrayBuffer),
        mimeType: value.type,
        filename: value.name,
      });
    } else {
      fields[key] = value as string;
    }
  }

  return { fields, files };
}

// OPTIONS handler - CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsPreflight(request);
}

// GET handler - List files
export async function GET(request: NextRequest) {
  const origin = getAllowedOrigin(request);
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    const response = NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
    return origin ? addCorsHeaders(response, origin) : response;
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
      const response = NextResponse.json({ files: [] });
      return origin ? addCorsHeaders(response, origin) : response;
    }

    const fileUrls = await Promise.all(
      files.map(async (file) => {
        const path = `${sessionId}/${file.name}`;
        const { data, error } = await supabase.storage.from('temp-uploads').createSignedUrl(path, 3600);

        if (error) return null;

        return {
          name: file.name,
          url: data?.signedUrl,
          size: file.metadata?.size,
          type: file.metadata?.mimetype,
        };
      })
    );

    const validFiles = fileUrls.filter((f): f is NonNullable<typeof f> => f !== null);
    const response = NextResponse.json({ files: validFiles });
    return origin ? addCorsHeaders(response, origin) : response;
  } catch (error: any) {
    console.error('List error:', error);
    const response = NextResponse.json({ error: error.message }, { status: 500 });
    return origin ? addCorsHeaders(response, origin) : response;
  }
}

// POST handler - Upload files or complete session
export async function POST(request: NextRequest) {
  const origin = getAllowedOrigin(request);
  const contentType = request.headers.get('content-type') || '';

  // Check if it's multipart (upload) or JSON (complete)
  if (contentType.includes('multipart/form-data')) {
    return handleUpload(request, origin);
  } else {
    return handleComplete(request, origin);
  }
}

async function handleUpload(request: NextRequest, origin: string | null) {
  try {
    const { fields, files } = await parseMultipartForm(request);
    const sessionId = fields.sessionId;

    if (!sessionId) {
      const response = NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
      return origin ? addCorsHeaders(response, origin) : response;
    }

    const uploadPromises = files.map(async (file) => {
      const uniqueSuffix = Math.random().toString(36).substring(2, 9);
      const path = `${sessionId}/${Date.now()}-${uniqueSuffix}-${file.filename}`;
      const { error } = await supabase.storage.from('temp-uploads').upload(path, file.buffer, {
        contentType: file.mimeType,
        upsert: false,
      });

      if (error) throw error;
    });

    await Promise.all(uploadPromises);
    const response = NextResponse.json({ success: true, count: files.length });
    return origin ? addCorsHeaders(response, origin) : response;
  } catch (error: any) {
    console.error('Upload error:', error);
    const response = NextResponse.json({ error: error.message }, { status: 500 });
    return origin ? addCorsHeaders(response, origin) : response;
  }
}

async function handleComplete(request: NextRequest, origin: string | null) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    const response = NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
    return origin ? addCorsHeaders(response, origin) : response;
  }

  try {
    // 1. List all files in the session folder
    const { data: files, error: listError } = await supabase.storage
      .from('temp-uploads')
      .list(sessionId);

    if (listError) throw listError;

    // 2. If there are files, delete them
    if (files && files.length > 0) {
      const filesToRemove = files.map((f) => `${sessionId}/${f.name}`);
      const { error: removeError } = await supabase.storage.from('temp-uploads').remove(filesToRemove);

      if (removeError) throw removeError;
      console.log(`Cleaned up session ${sessionId}: ${files.length} files removed.`);
    }

    const response = NextResponse.json({
      success: true,
      message: 'Session completed and cleaned up',
    });
    return origin ? addCorsHeaders(response, origin) : response;
  } catch (error: any) {
    console.error('Complete error:', error);
    // Even if cleanup fails, we return success to the client so they don't retry
    const response = NextResponse.json({
      success: true,
      warning: 'Cleanup failed but session marked complete',
    });
    return origin ? addCorsHeaders(response, origin) : response;
  }
}
