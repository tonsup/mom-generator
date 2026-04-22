import OpenAI, { toFile } from 'openai';
import { Buffer } from 'node:buffer';

export const config = {
  api: { bodyParser: false },
  maxDuration: 60,
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Read the raw request body as a Buffer. Avoids formidable, which has been
// flaky on Vercel serverless in this project.
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (c) => {
      chunks.push(c);
      total += c.length;
      if (total > 6 * 1024 * 1024) {
        reject(new Error(`Request body too large: ${total} bytes`));
        req.destroy();
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Minimal multipart parser — handles our two fields: `audio` (binary) and
// `chunkIndex` (text). Good enough since the client is ours.
function parseMultipart(buffer, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];
  let cursor = 0;
  while (cursor < buffer.length) {
    const start = buffer.indexOf(delimiter, cursor);
    if (start === -1) break;
    const end = buffer.indexOf(delimiter, start + delimiter.length);
    if (end === -1) break;
    const partStart = start + delimiter.length + 2; // skip CRLF
    const partEnd = end - 2; // strip trailing CRLF
    if (partEnd > partStart) parts.push(buffer.slice(partStart, partEnd));
    cursor = end;
  }

  const fields = {};
  let audioBuffer = null;
  const headerSep = Buffer.from('\r\n\r\n');

  for (const part of parts) {
    const headerEnd = part.indexOf(headerSep);
    if (headerEnd === -1) continue;
    const header = part.slice(0, headerEnd).toString('utf8');
    const body = part.slice(headerEnd + 4);
    const nameMatch = /name="([^"]+)"/.exec(header);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    if (/filename="/.test(header)) {
      if (name === 'audio') audioBuffer = body;
    } else {
      fields[name] = body.toString('utf8');
    }
  }
  return { fields, audioBuffer };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = /boundary=(.+)$/.exec(contentType);
    if (!boundaryMatch) {
      return res.status(400).json({ error: 'Missing multipart boundary' });
    }
    const boundary = boundaryMatch[1];

    console.log('[transcribe] reading body, content-length:', req.headers['content-length']);
    const body = await readRawBody(req);
    console.log('[transcribe] body size:', body.length);

    const { fields, audioBuffer } = parseMultipart(body, boundary);
    if (!audioBuffer) {
      return res.status(400).json({ error: 'No audio file in upload' });
    }

    const chunkIndex = fields.chunkIndex || '?';
    console.log(`[transcribe] chunk ${chunkIndex}: audio ${audioBuffer.length} bytes`);

    const whisperFile = await toFile(audioBuffer, 'audio.mp3', { type: 'audio/mpeg' });

    const transcription = await client.audio.transcriptions.create({
      file: whisperFile,
      model: 'whisper-1',
      response_format: 'verbose_json',
    });

    const text = transcription.text?.trim() || '';
    const language = transcription.language || 'unknown';
    console.log(`[transcribe] chunk ${chunkIndex} done: ${text.length} chars, lang=${language}`);

    return res.status(200).json({ text, language });
  } catch (err) {
    console.error('[transcribe] error:', err?.stack || err);
    return res.status(500).json({ error: err?.message || 'Transcription failed' });
  }
}
