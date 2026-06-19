export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    // 1. Modificación: Ahora extraemos también la letra pegada por el usuario
    const { audioBase64, letraText } = req.body || {};

    if (!audioBase64) {
      return res.status(400).json({ error: "Falta el audio" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Falta configurar OPENAI_API_KEY en el servidor" });
    }

    // Convertir base64 a binario
    const audioBuffer = Buffer.from(audioBase64, "base64");

    // Crear archivo compatible para enviar a OpenAI
    const audioBlob = new Blob([audioBuffer], { type: "audio/wav" });
    const formData = new FormData();
    formData.append("file", audioBlob, "chunk.wav");
    formData.append("model", "whisper-1");
    formData.append("language", "es"); // Forzamos español estricto
    formData.append("response_format", "verbose_json");
    
    // CORRECCIÓN CRÍTICA: Cambiado de prompt a initial_prompt para Whisper
    if (letraText) {
      formData.append("initial_prompt", letraText);
    }
    
    formData.append("timestamp_granularities[]", "word");

    const openAIResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
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
    
    // 4. Modificación: Retornamos de forma limpia el array de palabras estructurado
    // Whisper verbose_json nos devolverá la propiedad 'data.words' que contiene [{word, start, end}, ...]
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
