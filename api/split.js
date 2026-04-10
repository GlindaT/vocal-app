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
    
    // Le pasamos el ID exacto del modelo MDX23 que encontraste
    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        version: "510b9b91aec1bfa7d634e6c06ee80c18492fb0fc06aa1474533fbda90dd3dba4", 
        input: { audio: fileUrl }
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
