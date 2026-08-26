/**
 * Cloudflare Worker para subir archivos a R2 (bucket: vocal-app-storage)
 *
 * Endpoints:
 * - POST /api/upload - Sube archivo a R2, devuelve { filePath, fileUrl }
 * - PUT /api/update/:key - Reemplaza archivo existente en R2
 * - DELETE /api/delete/:key - Elimina archivo de R2
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (request.method === 'POST' && path === '/api/upload') {
        return await handleUpload(request, env, corsHeaders);
      }

      if (request.method === 'PUT' && path.startsWith('/api/update/')) {
        const key = decodeURIComponent(path.replace('/api/update/', ''));
        return await handleUpdate(key, request, env, corsHeaders);
      }

      if (request.method === 'DELETE' && path.startsWith('/api/delete/')) {
        const key = decodeURIComponent(path.replace('/api/delete/', ''));
        return await handleDelete(key, env, corsHeaders);
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

async function handleUpload(request, env, corsHeaders) {
  const contentType = request.headers.get('content-type') || '';

  let fileName, mimeType, fileData;

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('file');
    fileName = formData.get('fileName') || file?.name || `upload_${Date.now()}`;
    mimeType = formData.get('mimeType') || file?.type || 'application/octet-stream';
    fileData = await file.arrayBuffer();
  } else if (contentType.includes('application/json')) {
    const json = await request.json();
    fileName = json.fileName || `upload_${Date.now()}`;
    mimeType = json.mimeType || 'application/octet-stream';
    const base64 = json.fileBase64 || json.base64;
    if (!base64) throw new Error('fileBase64 requerido');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    fileData = bytes.buffer;
  } else {
    fileName = new URL(request.url).searchParams.get('fileName') || `upload_${Date.now()}`;
    mimeType = new URL(request.url).searchParams.get('mimeType') || 'application/octet-stream';
    fileData = await request.arrayBuffer();
  }

  // 1. Limpiamos el nombre manteniendo puntos y guiones bajos que ya vienen del script.js
  const cleanName = fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-zA-Z0-9._]/g, "_") 
    .replace(/__+/g, "_");
  
  // 2. IMPORTANTE: Usamos el cleanName directamente como safePath.
  // Si el script.js envió "Tormenta_pista_172465.mp3", el safePath será ese.
  const safePath = cleanName;

  await env.VOCAL_APP_R2_UPLOAD.put(safePath, fileData, {
    httpMetadata: { contentType: mimeType },
  });

  const publicUrl = `${env.R2_PUBLIC_URL}/${safePath}`;

  return new Response(JSON.stringify({
    success: true,
    filePath: safePath,
    fileUrl: publicUrl,
    fileName: cleanName
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function handleUpdate(key, request, env, corsHeaders) {
  const existing = await env.VOCAL_APP_STORAGE.head(key);
  if (!existing) {
    return new Response(JSON.stringify({ error: 'Archivo no encontrado' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const contentType = request.headers.get('content-type') || '';

  let mimeType, fileData;

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('file');
    mimeType = formData.get('mimeType') || file?.type || existing.httpMetadata?.contentType || 'application/octet-stream';
    fileData = await file.arrayBuffer();
  } else if (contentType.includes('application/json')) {
    const json = await request.json();
    mimeType = json.mimeType || existing.httpMetadata?.contentType || 'application/octet-stream';
    const base64 = json.fileBase64 || json.base64;
    if (!base64) throw new Error('fileBase64 requerido');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    fileData = bytes.buffer;
  } else {
    mimeType = new URL(request.url).searchParams.get('mimeType') || existing.httpMetadata?.contentType || 'application/octet-stream';
    fileData = await request.arrayBuffer();
  }

  await env.VOCAL_APP_STORAGE.put(key, fileData, {
    httpMetadata: { contentType: mimeType },
  });

  const publicUrl = `${env.R2_PUBLIC_URL}/${key}`;

  return new Response(JSON.stringify({
    success: true,
    filePath: key,
    fileUrl: publicUrl,
    updated: true
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function handleDelete(key, env, corsHeaders) {
  await env.VOCAL_APP_STORAGE.delete(key);

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
