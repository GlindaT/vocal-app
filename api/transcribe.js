export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const { audioBase64, letraText, language } = req.body || {};

    if (!audioBase64) {
      return res.status(400).json({ error: "Falta el audio binario" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Falta configurar la variable OPENAI_API_KEY en Vercel" });
    }

    // 1. Convertir la cadena Base64 del cliente en un Buffer de memoria puro
    const audioBuffer = Buffer.from(audioBase64, "base64");

    // ==========================================================
    // FORMULARIO MULTIPART MANUAL CORREGIDO PARA OPENAI
    // ==========================================================
    const boundary = "----WebKitFormBoundaryVocalAppKaraoke2026";
    const chunks = [];

    const appendField = (name, value) => {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
    };

    // Parámetros obligatorios estructurados de forma exacta para Whisper
    appendField("model", "whisper-1");
    appendField("language", language || "es");
    appendField("response_format", "verbose_json");
    
    // CORRECCIÓN CRÍTICA: OpenAI exige esta sintaxis exacta para arrays en FormData manuales
    appendField("timestamp_granularities[]", "word");

    if (letraText) {
      appendField("initial_prompt", letraText); // Envío del prompt guía con la letra limpia
    }

    // Inyección del archivo binario WAV al cierre del formulario
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="chunk.wav"\r\nContent-Type: audio/wav\r\n\r\n`));
    chunks.push(audioBuffer);
    chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    // Consolidamos todos los trozos binarios en un solo cuerpo
    const bodyBuffer = Buffer.concat(chunks);

    // 2. Envío directo al endpoint central de OpenAI
    const openAIResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY.trim()}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`
      },
      body: bodyBuffer
    });

    const responseText = await openAIResponse.text();

    // 3. Verificación de la respuesta del servidor
    if (!openAIResponse.ok) {
      return res.status(openAIResponse.status).json({
        error: "OpenAI rechazó el fragmento de audio",
        detail: responseText.substring(0, 150) // Recortamos el texto para no saturar la consola
      });
    }

    const data = JSON.parse(responseText);
    
    // Devolvemos las marcas de tiempo palabra por palabra calculadas por la IA
    return res.status(200).json({
      text: data.text || "",
      words: data.words || []
    });

  } catch (error) {
    console.error("Error del servidor:", error);
    return res.status(500).json({
      error: "Error interno del servidor Vercel",
      detail: error.message
    });
  }
}
