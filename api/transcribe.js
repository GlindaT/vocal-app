export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const { audioBase64, letraText, language } = req.body || {};

    if (!audioBase64) {
      return res.status(400).json({ error: "Falta el audio" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Falta configurar OPENAI_API_KEY en el servidor" });
    }

    // 1. Convertir base64 a binario de Node.js
    const audioBufferBinario = Buffer.from(audioBase64, "base64");

    // 2. Crear archivo blob compatible para enviar a OpenAI
    const audioBlob = new Blob([audioBufferBinario], { type: "audio/wav" });
    const formData = new FormData();
    formData.append("file", audioBlob, "chunk.wav");
    formData.append("model", "whisper-1");
    
    // Inyección dinámica del idioma detectado ("es" o "en")
    formData.append("language", language || "es");
    formData.append("response_format", "verbose_json");
    
    // Usamos el initial_prompt para guiar la alineación con tu letra pegada
    if (letraText) {
      formData.append("initial_prompt", letraText);
    }
    
    // Solicitamos marcas de tiempo palabra por palabra
    formData.append("timestamp_granularities[]", "word");

    // 3. Petición directa a OpenAI
    const openAIResponse = await fetch("https://openai.com", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: formData
    });

    const responseText = await openAIResponse.text();

    if (!openAIResponse.ok) {
      console.error("Error de OpenAI:", responseText);
      return res.status(openAIResponse.status).json({
        error: "Error al transcribir en OpenAI",
        detail: responseText
      });
    }

    const data = JSON.parse(responseText);
    
    // Devolvemos el texto global y el array de palabras con sus tiempos exactos
    return res.status(200).json({
      text: data.text,
      words: data.words || []
    });

  } catch (error) {
    console.error("Error del servidor:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      detail: error.message
    });
  }
}
