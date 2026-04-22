import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const serverToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!serverToken) {
    console.error('[upload] BLOB_READ_WRITE_TOKEN missing');
    return res.status(500).json({
      error:
        'BLOB_READ_WRITE_TOKEN ไม่ถูกตั้ง — ไปที่ Vercel project → Storage → Create Blob store แล้ว Redeploy',
    });
  }

  const { pathname } = req.body ?? {};
  if (!pathname || typeof pathname !== 'string') {
    return res.status(400).json({ error: 'Missing "pathname" in request body.' });
  }

  try {
    // Generate a short-lived client token that authorizes ONE upload of this file.
    // This bypasses handleUpload's webhook flow, which fails when the deployment
    // is behind any kind of authentication (Preview URLs on free tier, SSO, etc.).
    const clientToken = await generateClientTokenFromReadWriteToken({
      token: serverToken,
      pathname,
      onUploadCompleted: undefined, // no webhook — client tells us when it's done
      addRandomSuffix: true,
      maximumSizeInBytes: 25 * 1024 * 1024, // 25 MB (OpenAI Whisper limit)
      validUntil: Date.now() + 10 * 60 * 1000, // 10 minutes
    });

    console.log('[upload] issued client token for:', pathname);
    return res.status(200).json({ clientToken });
  } catch (err) {
    console.error('[upload] token error:', err?.message, err?.stack);
    return res.status(500).json({ error: err?.message ?? 'Failed to generate upload token' });
  }
}
