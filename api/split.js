export default async function handler(req, res) {
  const token = process.env.REPLICATE_API_TOKEN;

  // Si el mesero viene a preguntar cómo va el pedido (GET)
  if (req.method === 'GET') {
    const { id } = req.query;
    const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { "Authorization": `Token ${token}` }
    });
    const data = await response.json();
    return res.status(200).json(data);
  }

  // Si el mesero trae una nueva canción para separar (POST)
  if (req.method === 'POST') {
    const { audioBase64 } = req.body;
    
    // Usamos el modelo Demucs de Replicate (Cerebro IA para separar audio)
    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        version: "25a173108cff36ef9f80f854c162d01df9e6528be175794b8115892d80d594b2", 
        input: { audio: `data:audio/mp3;base64,${audioBase64}` }
      })
    });
    
    const data = await response.json();
    return res.status(200).json(data);
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
