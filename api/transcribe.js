export const config = {
  api: {
    bodyParser: false
  }
};

async function readRequestBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "Falta OPENAI_API_KEY en Vercel" });
    }

    const contentType = req.headers["content-type"] || "";
    const bodyBuffer = await readRequestBody(req);

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": contentType
      },
      body: bodyBuffer
    });

    const resultText = await response.text();

    if (!response.ok) {
      console.error("Error OpenAI:", resultText);
      return res.status(response.status).send(resultText);
    }

    res.setHeader("Content-Type", "application/json");
    return res.status(200).send(resultText);

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error interno transcribiendo audio" });
  }
}
