// Tiny endpoint to verify that API routes are working and env vars are present.
export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    hasOpenAIKey: !!process.env.OPENAI_API_KEY,
    openAIKeyPrefix: process.env.OPENAI_API_KEY?.slice(0, 7) || null,
    nodeVersion: process.version,
    now: new Date().toISOString(),
  });
}
