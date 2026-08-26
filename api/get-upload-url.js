import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export default async function handler(req, res) {
  // 1. IMPORTANTE: Manejo de CORS si la función es llamada desde otro dominio
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    // 2. Extraemos los datos. Asegúrate de que script.js envíe 'filename', 'contentType' y 'type'
    const { filename, contentType, type } = req.body; 
    
    // 3. Generamos la KEY única. 
    // Usamos el 'type' al inicio para identificarlo visualmente en el bucket.
    const cleanFilename = filename.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
    const key = `${type || 'unknown'}_${Date.now()}_${cleanFilename}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
    
    // 4. Construcción de la URL pública. 
    // Asegúrate de que R2_PUBLIC_DOMAIN no tenga "https://" al inicio en las variables de entorno.
    const publicUrl = `https://${process.env.R2_PUBLIC_DOMAIN}/${key}`;

    return res.status(200).json({ uploadUrl, publicUrl });
  } catch (error) {
    console.error("Error en API R2:", error);
    return res.status(500).json({ error: error.message });
  }
}
