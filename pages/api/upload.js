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

  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        console.log('[upload] token request for:', pathname);
        return {
          // Do not restrict by content type — m4a files can arrive as audio/mp4,
          // audio/x-m4a, audio/aac, or application/octet-stream depending on the
          // browser. We validate by file extension on the client instead.
          allowedContentTypes: undefined,
          maximumSizeInBytes: 25 * 1024 * 1024, // 25 MB (OpenAI Whisper limit)
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log('[upload] completed:', blob.url);
      },
    });
    return res.status(200).json(jsonResponse);
  } catch (err) {
    console.error('[upload] error:', err);
    return res.status(400).json({ error: err.message ?? 'Upload failed' });
  }
}
