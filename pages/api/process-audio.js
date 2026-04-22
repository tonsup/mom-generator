import OpenAI from 'openai';
import { del } from '@vercel/blob';
import { toFile } from 'openai/uploads';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
  maxDuration: 60,
};

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

  const { blobUrl, filename } = req.body ?? {};

  if (!blobUrl) {
    return res.status(400).json({ error: 'Missing blobUrl in request body.' });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    // ── Step 1: Fetch audio from Vercel Blob ───────────────────────────────
    const audioResponse = await fetch(blobUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to fetch uploaded audio (HTTP ${audioResponse.status})`);
    }
    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

    // ── Step 2: Transcribe with Whisper ────────────────────────────────────
    const file = await toFile(audioBuffer, filename ?? 'audio.m4a');
    const transcriptionResponse = await openai.audio.transcriptions.create({
      file,
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

    // ── Step 3: Generate MOM with GPT-4o ───────────────────────────────────
    const isThai = detectedLanguage === 'th' || detectedLanguage === 'thai';
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
      language: isThai ? 'th' : 'en',
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

    return res.status(500).json({ error: err.message ?? 'Internal server error' });
  } finally {
    // Clean up the blob after processing
    try {
      await del(blobUrl);
    } catch {
      // ignore cleanup errors
    }
  }
}
