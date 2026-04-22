import { handleUpload } from '@vercel/blob/client';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb', // only JSON metadata passes through this route
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Surface missing-token failures loudly instead of letting them bubble up as
  // the vague "Failed to retrieve the client token" error on the client.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('[upload] BLOB_READ_WRITE_TOKEN is missing on this deployment');
    return res.status(500).json({
      error:
        'BLOB_READ_WRITE_TOKEN ไม่ถูกตั้ง — ไปที่ Vercel project → Storage → Create Blob store แล้วกด Redeploy',
    });
  }

  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        console.log('[upload] token request for:', pathname);
        return {
          allowedContentTypes: undefined,
          maximumSizeInBytes: 25 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log('[upload] webhook completed:', blob.url);
      },
    });
    console.log('[upload] returning response to client');
    return res.status(200).json(jsonResponse);
  } catch (err) {
    console.error('[upload] handleUpload error:', err?.message, err?.stack);
    return res.status(400).json({ error: err?.message ?? 'Upload handler failed' });
  }
}
