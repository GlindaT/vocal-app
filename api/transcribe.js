export default async function handler(req, res) {
  // 1. Forzar únicamente peticiones tipo POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const { audioBase64, letraText, language } = req.body || {};

    if (!audioBase64) {
      return res.status(400).json({ error: "Falta el audio binario en la petición" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Falta configurar la variable OPENAI_API_KEY en Vercel" });
    }

    // 2. Decodificar la cadena Base64 que viene del frontend a un Buffer puro
    const audioBufferBinario = Buffer.from(audioBase64, "base64");

    // 3. Crear el empaquetado FormData compatible y robusto para OpenAI
    const formData = new FormData();
    
    // Convertimos el Buffer a un archivo virtual asignándole nombre y tipo estricto
    const audioBlob = new Blob([audioBufferBinario], { type: "audio/wav" });
    formData.append("file", audioBlob, "chunk.wav");
    
    formData.append("model", "whisper-1");
    formData.append("language", language || "es");
    formData.append("response_format", "verbose_json");
    
    // Inyección del prompt guía basado en la letra en texto plano
    if (letraText) {
      formData.append("initial_prompt", letraText);
    }
    
    // Solicitamos estrictamente la granularidad por palabra
    formData.append("timestamp_granularities[]", "word");

    // 4. Petición directa y limpia al endpoint de OpenAI
    const openAIResponse = await fetch("https://openai.com", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY.trim()}` // Limpiamos espacios residuales de la clave
      },
      body: formData
    });

    // 5. Validación segura del tipo de respuesta
    const contentType = openAIResponse.headers.get("content-type") || "";
    
    if (!openAIResponse.ok) {
      let detalleError = "Error desconocido";
      if (contentType.includes("application/json")) {
        const errorJson = await openAIResponse.json();
        detalleError = JSON.stringify(errorJson);
      } else {
        detalleError = await openAIResponse.text();
        // Recortamos por si devuelve un HTML masivo para no saturar la consola del frontend
        detalleError = detalleError.substring(0, 200) + "... (HTML truncado)";
      }
      
      return res.status(openAIResponse.status).json({
        error: "OpenAI rechazó la solicitud del fragmento de audio",
        detail: detalleError
      });
    }

    // 6. Si todo salió bien, procesamos el JSON esperado
    if (contentType.includes("application/json")) {
      const data = await openAIResponse.json();
      return res.status(200).json({
        text: data.text || "",
        words: data.words || []
      });
    } else {
      const respuestaInesperada = await openAIResponse.text();
      return res.status(502).json({
        error: "OpenAI devolvió una respuesta que no es JSON válido",
        detail: respuestaInesperada.substring(0, 200)
      });
    }

  } catch (error) {
    console.error("Fallo crítico en el servidor de Vercel:", error);
    return res.status(500).json({
      error: "Error interno en la ejecución de la Serverless Function",
      detail: error.message
    });
  }
}
