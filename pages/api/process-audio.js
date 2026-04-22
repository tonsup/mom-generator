import formidable from 'formidable';
import { createReadStream, unlinkSync } from 'fs';
import OpenAI from 'openai';

// Disable Next.js default body parser so formidable can handle multipart
export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 60,
};

const ALLOWED_EXTENSIONS = new Set(['.m4a', '.mp3', '.mp4', '.wav', '.webm', '.mpeg', '.mpga']);

function getExtension(filename = '') {
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
}

function buildPrompt(isThai, transcript) {
  if (isThai) {
    return {
      system:
        'คุณเป็นผู้เชี่ยวชาญในการสรุปการประชุม (Minutes of Meeting) ' +
        'ตอบเป็นภาษาไทย ใช้ Markdown formatting ให้โครงสร้างชัดเจนและอ่านง่าย',
      user:
        `สรุป MOM จากบทสนทนาต่อไปนี้ โดยแบ่งเป็นหัวข้อดังนี้:\n\n` +
        `## หัวข้อการประชุม\n` +
        `## สรุปภาพรวม\n` +
        `## ประเด็นที่หารือหลัก\n` +
        `## มติที่ประชุม\n` +
        `## งานที่ต้องดำเนินการ _(ระบุผู้รับผิดชอบและกำหนดเวลาถ้ามี)_\n` +
        `## ขั้นตอนต่อไป / การประชุมครั้งต่อไป\n\n` +
        `ถ้าหัวข้อใดไม่มีข้อมูลให้เขียนว่า "ไม่มีข้อมูล"\n\n` +
        `**บทสนทนา:**\n${transcript}`,
    };
  }
  return {
    system:
      'You are an expert at creating structured Minutes of Meeting (MOM). ' +
      'Respond in English using clean Markdown formatting.',
    user:
      `Create a structured MOM from the transcript below, using these sections:\n\n` +
      `## Meeting Title\n` +
      `## Overview\n` +
      `## Key Discussion Points\n` +
      `## Decisions Made\n` +
      `## Action Items _(with owners and deadlines if mentioned)_\n` +
      `## Next Steps / Next Meeting\n\n` +
      `If a section has no data, write "None mentioned."\n\n` +
      `**Transcript:**\n${transcript}`,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API key is not configured on the server.' });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const form = formidable({
    maxFileSize: 25 * 1024 * 1024, // 25 MB (OpenAI Whisper hard limit)
    keepExtensions: true,
    filter: ({ originalFilename }) => {
      const ext = getExtension(originalFilename);
      return ALLOWED_EXTENSIONS.has(ext);
    },
  });

  let audioFilePath = null;

  try {
    const [, files] = await form.parse(req);
    const audioFile = files.audio?.[0];

    if (!audioFile) {
      return res.status(400).json({
        error: 'ไม่พบไฟล์เสียง / No audio file received. Make sure the field name is "audio".',
      });
    }

    // Validate extension
    const ext = getExtension(audioFile.originalFilename ?? '');
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return res.status(422).json({
        error: `ไม่รองรับนามสกุลไฟล์ "${ext}" / Unsupported file type "${ext}".`,
      });
    }

    audioFilePath = audioFile.filepath;

    // ── Step 1: Transcribe with Whisper ────────────────────────────────────
    const transcriptionResponse = await openai.audio.transcriptions.create({
      file: createReadStream(audioFile.filepath),
      model: 'whisper-1',
      response_format: 'verbose_json',
    });

    const transcript = transcriptionResponse.text?.trim();
    const detectedLanguage = transcriptionResponse.language ?? 'en';

    if (!transcript) {
      return res.status(422).json({
        error: 'ไม่สามารถถอดเสียงได้ / Could not extract speech from the audio file.',
      });
    }

    // ── Step 2: Generate MOM with GPT-4o ───────────────────────────────────
    const isThai = detectedLanguage === 'th';
    const { system, user } = buildPrompt(isThai, transcript);

    const momResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
    });

    const momText = momResponse.choices[0]?.message?.content ?? '';

    return res.status(200).json({
      transcript,
      language: detectedLanguage,
      mom: momText,
    });
  } catch (err) {
    console.error('[process-audio] error:', err);

    if (err.status === 401) {
      return res.status(500).json({ error: 'OpenAI API key ไม่ถูกต้อง / Invalid OpenAI API key.' });
    }
    if (err.status === 429) {
      return res.status(429).json({ error: 'OpenAI rate limit exceeded. Please try again in a moment.' });
    }
    if (err.code === '1009' || err.message?.includes('maxFileSize')) {
      return res.status(413).json({ error: 'ไฟล์ใหญ่เกิน 25 MB / File exceeds 25 MB limit.' });
    }

    return res.status(500).json({ error: err.message ?? 'Internal server error' });
  } finally {
    // Always clean up the temp file
    if (audioFilePath) {
      try {
        unlinkSync(audioFilePath);
      } catch {
        // ignore cleanup errors
      }
    }
  }
}
