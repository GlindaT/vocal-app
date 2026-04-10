export default async function handler(req, res) {
  const token = process.env.REPLICATE_API_TOKEN;

  // 1. Cuando el mesero pregunta cómo va la orden
  if (req.method === 'GET') {
    const { id } = req.query;
    const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await response.json();
    return res.status(200).json(data);
  }

  // 2. Cuando el mesero manda la canción nueva
  if (req.method === 'POST') {
    const { fileUrl } = req.body;
    
    // CAMBIO MAGISTRAL AQUÍ: 
    // Usamos la ruta directa del modelo (cjwbw/demucs) para que siempre use la versión más reciente automáticamente.
    const response = await fetch("https://api.replicate.com/v1/models/cjwbw/demucs/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input: { audio: fileUrl } // Le pasamos el link directo
      })
    });
    
    const data = await response.json();
    
    // Si Replicate nos rebota, avisamos en español
    if (!response.ok) {
       return res.status(response.status).json({ error: data.detail || "Error en la cuenta de Replicate" });
    }

    return res.status(200).json(data);
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
