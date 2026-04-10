export default async function handler(req, res) {
  const token = process.env.REPLICATE_API_TOKEN;

  if (req.method === 'GET') {
    const { id } = req.query;
    const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await response.json();
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { fileUrl } = req.body;
    
    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        version: "25a173108cff36ef9f80f854c162d01df9e6528be175794b8115892d80d594b2", 
        input: { audio: fileUrl } // ¡Ahora usamos un Link directo!
      })
    });
    
    const data = await response.json();
    
    // Escudo: Si la llave de Replicate falla, nos avisa aquí
    if (!response.ok) {
       return res.status(response.status).json({ error: data.detail || "Error en la cuenta de Replicate" });
    }

    return res.status(200).json(data);
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
