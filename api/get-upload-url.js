import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Configuración de la conexión segura con Cloudflare R2
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    // En tu handler de Next.js/Node
    const { filename, contentType, type } = req.body; // Recibe el tipo (pista/voz)
    const key = `${type}_${Date.now()}_${filename.replace(/\s+/g, '_')}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    // Genera una URL válida por 5 minutos para que el cliente suba el archivo
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
    // URL pública final desde donde se escuchará el audio
    const publicUrl = `https://${process.env.R2_PUBLIC_DOMAIN}/${key}`;

    return res.status(200).json({ uploadUrl, publicUrl });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
