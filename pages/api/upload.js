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
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          'audio/mp4',
          'audio/x-m4a',
          'audio/mpeg',
          'audio/mp3',
          'audio/wav',
          'audio/webm',
          'audio/aac',
          'audio/ogg',
          'application/octet-stream', // some browsers send m4a as this
        ],
        maximumSizeInBytes: 25 * 1024 * 1024, // 25 MB (OpenAI Whisper limit)
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {
        // no-op; the client will call /api/process-audio next
      },
    });
    return res.status(200).json(jsonResponse);
  } catch (err) {
    console.error('[upload] error:', err);
    return res.status(400).json({ error: err.message });
  }
}
