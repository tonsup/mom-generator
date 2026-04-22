import OpenAI from 'openai';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: { bodyParser: false },
  maxDuration: 60,
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: 6 * 1024 * 1024,
      keepExtensions: true,
    });
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let tempPath = null;
  try {
    const { fields, files } = await parseForm(req);
    const audioFile = Array.isArray(files.audio) ? files.audio[0] : files.audio;
    if (!audioFile) return res.status(400).json({ error: 'No audio chunk uploaded' });
    tempPath = audioFile.filepath;

    const chunkIndex = Array.isArray(fields.chunkIndex) ? fields.chunkIndex[0] : fields.chunkIndex;
    console.log(`[transcribe] chunk ${chunkIndex}: ${audioFile.size} bytes`);

    const transcription = await client.audio.transcriptions.create({
      file: fs.createReadStream(tempPath),
      model: 'whisper-1',
      response_format: 'verbose_json',
    });

    const text = transcription.text?.trim() || '';
    const language = transcription.language || 'unknown';
    console.log(`[transcribe] chunk ${chunkIndex} done: ${text.length} chars, lang=${language}`);

    return res.status(200).json({ text, language });
  } catch (err) {
    console.error('[transcribe] error:', err);
    return res.status(500).json({ error: err.message || 'Transcription failed' });
  } finally {
    if (tempPath) fs.promises.unlink(tempPath).catch(() => {});
  }
}
