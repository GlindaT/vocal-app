export default async function handler(req, res) {
  // 1. Forzar únicamente peticiones tipo POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const { audioBase64, letraText, language } = req.body || {};

    if (!audioBase64) {
      return res.status(400).json({ error: "Falta el audio" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Falta configurar la variable OPENAI_API_KEY en Vercel" });
    }

    // 2. Convertir el Base64 que viene del frontend a un Buffer binario puro
    const audioBuffer = Buffer.from(audioBase64, "base64");

    // ==========================================================
    // CONSTRUCCIÓN MANUAL DEL FORMULARIO BINARIO (EVITA CLOUDFLARE)
    // ==========================================================
    const boundary = "----WebKitFormBoundaryKaraokeApp2026";
    const chunks = [];

    // Función auxiliar para escribir texto dentro del Buffer binario
    const appendField = (name, value) => {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
    };

    // Inyectamos los parámetros obligatorios de Whisper de forma limpia
    appendField("model", "whisper-1");
    appendField("language", language || "es");
    appendField("response_format", "verbose_json");
    appendField("timestamp_granularities[]", "word"); // Pedimos marcas palabra por palabra

    if (letraText) {
      appendField("initial_prompt", letraText); // Guía de texto en español/inglés
    }

    // Inyectamos el archivo físico de audio WAV al final del formulario
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="chunk.wav"\r\nContent-Type: audio/wav\r\n\r\n`));
    chunks.push(audioBuffer);
    chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    // Juntamos todas las piezas binarias en un solo bloque macizo de datos
    const bodyBuffer = Buffer.concat(chunks);

    // 3. Petición HTTP pura y directa al servidor central de OpenAI
    const openAIResponse = await fetch("https://openai.com", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY.trim()}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": bodyBuffer.length
      },
      body: bodyBuffer
    });

    const responseText = await openAIResponse.text();

    // 4. Verificación segura de la respuesta
    if (!openAIResponse.ok) {
      return res.status(openAIResponse.status).json({
        error: "OpenAI rechazó el fragmento de audio",
        detail: responseText.substring(0, 200) // Recortamos por seguridad
      });
    }

    const data = JSON.parse(responseText);
    
    // Devolvemos los tiempos milimétricos al frontend
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
