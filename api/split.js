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
    
    // Usamos Spleeter (Especializado en 2 Stems: Vocals + Accompaniment)
    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        version: "b6aa902b467140e4f8d55d288d0ed76a5f700085baaf254b17b6a4149eeb4f94", 
        input: { 
          audio: fileUrl,
          stems: "2stems" // Le obligamos a que no divida los instrumentos
        }
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
       return res.status(response.status).json({ error: data.detail || "Error en la cuenta de Replicate" });
    }

    return res.status(200).json(data);
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
