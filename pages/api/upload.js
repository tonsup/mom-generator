import { handleUpload } from '@vercel/blob/client';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('[upload] BLOB_READ_WRITE_TOKEN missing');
    return res.status(500).json({
      error:
        'BLOB_READ_WRITE_TOKEN ไม่ถูกตั้ง — ไปที่ Vercel project → Storage → Create Blob store แล้ว Redeploy',
    });
  }

  try {
    const jsonResponse = await handleUpload({
      token: process.env.BLOB_READ_WRITE_TOKEN,
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
        // NOTE: This webhook is called by the Vercel Blob service. It MUST be
        // publicly reachable — if the deployment is behind Vercel Deployment
        // Protection (enabled by default on Preview URLs for some plans), this
        // webhook returns 401 and the client's upload() promise hangs.
        // Fix: disable Deployment Protection, OR use the Production URL.
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
