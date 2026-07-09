/* ===========================================================
 * library-supabase.js
 * -----------------------------------------------------------
 * Helpers para leer/subir/eliminar archivos del bucket público
 * `library` en Supabase Storage.
 *
 * Convención de carpetas dentro del bucket:
 *   library/karaoke/<archivo.mp3>
 *   library/pista/<archivo.mp3>
 *   library/voz/<archivo.mp3>
 *   library/grabacion/<archivo.webm>
 *   library/texto/<archivo.txt>
 *
 * Para karaokes con sync manual se puede colocar un sidecar
 * de mismo nombre y extensión .txt/.json junto al audio:
 *   library/karaoke/miCancion.mp3
 *   library/karaoke/miCancion.txt        <-- lírica/sync ultrastar
 * ============================================================ */
(function () {
  const BUCKET = "library";
  const TOP_KINDS = new Set(["pista", "karaoke", "voz", "grabacion", "texto"]);
  const AUDIO_EXT = new Set(["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus", "webm"]);
  const TEXT_EXT = new Set(["txt", "md", "csv", "json", "srt", "vtt"]);

  function client() {
    if (!window.supabaseClient) {
      throw new Error("supabaseClient no inicializado (revisa supabase-config.js).");
    }
    return window.supabaseClient;
  }

  function inferKind(path, mime) {
    // Ignorar placeholders de Supabase
    if (/\.emptyFolderPlaceholder$/i.test(path)) return "ignore";
    const parts = String(path).split("/").filter(Boolean);
    const folder = (parts[0] || "").toLowerCase();
    // Si hay carpeta explícita reconocida, usar eso
    if (parts.length > 1 && TOP_KINDS.has(folder)) return folder;
    // Detectar por mimetype (los archivos subidos por la app suelen no traer extensión)
    if (mime) {
      if (/^audio\//i.test(mime)) return "pista";
      if (/^text\//i.test(mime) || /json|xml/i.test(mime)) return "texto";
    }
    // Fallback por extensión
    const file = (parts[parts.length - 1] || "").toLowerCase();
    const ext = file.includes(".") ? file.split(".").pop() : "";
    if (AUDIO_EXT.has(ext)) return "pista";
    if (TEXT_EXT.has(ext)) return "texto";
    // Por defecto, un archivo suelto se considera pista (con audio hay que reproducirlo)
    return "pista";
  }

  function baseName(path) {
    const name = String(path).split("/").pop() || "";
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.substring(0, dot) : name;
  }

  function extName(path) {
    const name = String(path).split("/").pop() || "";
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.substring(dot + 1).toLowerCase() : "";
  }

  function displayName(path) {
    // "karaoke/Born To Die.mp3" -> "Born To Die"
    return baseName(path);
  }

  function isAudio(path) {
    return AUDIO_EXT.has(extName(path));
  }
  function isText(path) {
    return TEXT_EXT.has(extName(path));
  }

  // Parsea el nombre de archivo con patrón "timestamp_SongName_-_Artist" o
  // "timestamp_SongName_Artist" (guiones bajos = espacios) para extraer nombre y autor.
  function parseFileName(path) {
    const raw = String(path).split("/").pop() || "";
    const stem = raw.replace(/\.[a-z0-9]{2,5}$/i, "");
    // Quitar prefijo timestamp: dígitos + _
    const noTs = stem.replace(/^\d{10,}_+/, "");
    // Espacios en lugar de guiones bajos
    const humanized = noTs.replace(/_/g, " ").replace(/\s+/g, " ").trim();
    // Intentar dividir en "Song - Artist" o "Song  Artist"
    let name = humanized;
    let artist = "";
    if (humanized.includes(" - ")) {
      const [a, b] = humanized.split(" - ");
      name = a.trim();
      artist = (b || "").trim();
    }
    return { name: name || raw, artist };
  }

  // list() no es recursivo: hacemos DFS manual.
  async function listAll(prefix = "") {
    const rows = [];
    let offset = 0;
    const cli = client();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await cli.storage.from(BUCKET).list(prefix, {
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" }
      });
      if (error) throw error;
      if (!data || data.length === 0) break;

      for (const item of data) {
        // Ignorar placeholders internos de Supabase
        if (item.name === ".emptyFolderPlaceholder") continue;

        const path = (prefix ? `${prefix}/${item.name}` : item.name).replace(/^\/+/, "");
        // Los folders tienen id === null y metadata === null
        if (item.id === null) {
          const sub = await listAll(path);
          rows.push(...sub);
        } else {
          const mime = item.metadata?.mimetype || "";
          const kind = inferKind(path, mime);
          if (kind === "ignore") continue;
          const { data: pub } = cli.storage.from(BUCKET).getPublicUrl(path);
          const parsed = parseFileName(path);
          rows.push({
            path,
            name: parsed.name,
            artist: parsed.artist,
            type: kind,
            mime,
            size: item.metadata?.size ?? 0,
            updated: item.updated_at || item.created_at || "",
            publicUrl: pub.publicUrl,
            _raw: item
          });
        }
      }

      if (data.length < 1000) break;
      offset += 1000;
    }
    return rows;
  }

  // Empareja cada karaoke con su sidecar .txt/.json de la misma carpeta y nombre base
  function attachKaraokeSidecars(rows) {
    const byBase = new Map();
    // Indexa todos los archivos por "carpeta/base"
    for (const r of rows) {
      const folder = r.path.split("/").slice(0, -1).join("/");
      const key = `${folder}/${baseName(r.path)}`.toLowerCase();
      if (!byBase.has(key)) byBase.set(key, []);
      byBase.get(key).push(r);
    }
    // Para cada audio, adjunta sidecar si existe
    for (const r of rows) {
      if (r.type === "karaoke" && isAudio(r.path)) {
        const folder = r.path.split("/").slice(0, -1).join("/");
        const key = `${folder}/${baseName(r.path)}`.toLowerCase();
        const siblings = byBase.get(key) || [];
        const sidecar = siblings.find(s => isText(s.path));
        if (sidecar) r.sidecarPath = sidecar.path;
      }
    }
    return rows;
  }

  async function uploadFile(file, kindHint) {
    const kind = kindHint || inferKind(file.name);
    const folder = TOP_KINDS.has(kind) ? kind : "otro";
    const path = `${folder}/${file.name}`.replace(/^\/+/, "");
    const cli = client();
    const { error } = await cli.storage.from(BUCKET).upload(path, file, {
      upsert: false,
      cacheControl: "3600"
    });
    if (error) throw error;
    return path;
  }

  async function deleteFile(path) {
    const cli = client();
    const { error } = await cli.storage.from(BUCKET).remove([path]);
    if (error) throw error;
  }

  async function downloadBlob(path) {
    const cli = client();
    const { data, error } = await cli.storage.from(BUCKET).download(path);
    if (error) throw error;
    return data; // Blob
  }

  async function downloadText(path) {
    const blob = await downloadBlob(path);
    return await blob.text();
  }

  function getPublicUrl(path) {
    const cli = client();
    const { data } = cli.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl || "";
  }

  // Expose API global
  window.SupabaseLibrary = {
    BUCKET,
    listAll,
    attachKaraokeSidecars,
    uploadFile,
    deleteFile,
    downloadBlob,
    downloadText,
    getPublicUrl,
    inferKind,
    isAudio,
    isText,
    displayName
  };
})();
