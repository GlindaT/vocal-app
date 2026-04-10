export default async function handler(req, res) {
  // Solo aceptamos peticiones POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { audioBase64 } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ error: 'Falta el audio' });
    }

    // 1. Convertir el Base64 de vuelta a un archivo
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const blob = new Blob([audioBuffer], { type: 'audio/wav' });
    
    // 2. Preparar el paquete para OpenAI
    const formData = new FormData();
    formData.append("file", blob, "chunk.wav");
    formData.append("model", "whisper-1");
    formData.append("language", "es");
    formData.append("response_format", "verbose_json"); // Necesario para los tiempos del Karaoke

    // 3. Llamar a OpenAI usando nuestra clave secreta
    const openAIResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: formData
    });

    if (!openAIResponse.ok) {
      const errorData = await openAIResponse.text();
      console.error("Error de OpenAI:", errorData);
      return res.status(openAIResponse.status).json({ error: 'Error al transcribir en OpenAI' });
    }

    const data = await openAIResponse.json();
    
    // 4. Devolver la letra y los tiempos al Mesero (script.js)
    return res.status(200).json(data);

  } catch (error) {
    console.error("Error del servidor:", error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
