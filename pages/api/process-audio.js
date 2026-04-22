import OpenAI from 'openai';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
    responseLimit: '5mb',
  },
  maxDuration: 60,
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function buildPrompt(isThai, transcript) {
  if (isThai) {
    return `คุณเป็นผู้ช่วยมืออาชีพสำหรับการสรุปบันทึกการประชุม (Minutes of Meeting)
โปรดอ่าน transcript ด้านล่าง แล้วสรุปออกมาเป็นรูปแบบ MOM ที่มีหัวข้อต่อไปนี้อย่างครบถ้วน:

# หัวข้อการประชุม
# สรุปภาพรวม
# ประเด็นที่หารือหลัก
# มติที่ประชุม
# งานที่ต้องดำเนินการ (ใครทำ / ภายในเมื่อใด)
# ขั้นตอนต่อไป

ใช้ภาษาไทยที่เป็นทางการ ชัดเจน กระชับ ใช้ bullet points เมื่อเหมาะสม

Transcript:
${transcript}`;
  }
  return `You are a professional minute-taker. Read the transcript below and produce a clear
Minutes of Meeting (MOM) document with these sections:

# Meeting Title
# Overview
# Key Discussion Points
# Decisions Made
# Action Items (Owner / Due Date)
# Next Steps

Use clear professional English with bullet points where appropriate.

Transcript:
${transcript}`;
}

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10 MB — compressed WAV should be well under this
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
    console.log('[process-audio] parsing multipart form');
    const { fields, files } = await parseForm(req);

    const audioFile = Array.isArray(files.audio) ? files.audio[0] : files.audio;
    if (!audioFile) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }
    tempPath = audioFile.filepath;
    const originalFilename = Array.isArray(fields.originalFilename)
      ? fields.originalFilename[0]
      : fields.originalFilename || 'audio.wav';

    console.log('[process-audio] received', audioFile.size, 'bytes for', originalFilename);

    // Whisper — transcribe with language detection
    console.log('[process-audio] calling Whisper');
    const transcription = await client.audio.transcriptions.create({
      file: fs.createReadStream(tempPath),
      model: 'whisper-1',
      response_format: 'verbose_json',
    });

    const transcript = transcription.text?.trim();
    const language = transcription.language || 'unknown';
    if (!transcript) {
      return res.status(400).json({ error: 'ไม่พบคำพูดในไฟล์เสียง / No speech detected' });
    }

    console.log('[process-audio] transcript language:', language, '-', transcript.length, 'chars');

    const isThai = language?.toLowerCase().startsWith('th') || /[\u0E00-\u0E7F]/.test(transcript);

    // GPT-4o — generate MOM
    console.log('[process-audio] calling GPT-4o');
    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      messages: [
        { role: 'system', content: isThai ? 'คุณเป็นเลขาที่เชี่ยวชาญการสรุปการประชุม' : 'You are an expert meeting minute-taker.' },
        { role: 'user', content: buildPrompt(isThai, transcript) },
      ],
    });

    const mom = completion.choices[0]?.message?.content?.trim();
    if (!mom) {
      return res.status(500).json({ error: 'Failed to generate MOM summary' });
    }

    return res.status(200).json({
      mom,
      transcript,
      language: isThai ? 'th' : language,
      originalFilename,
    });
  } catch (err) {
    console.error('[process-audio] error:', err);
    return res.status(500).json({ error: err.message || 'Processing failed' });
  } finally {
    if (tempPath) {
      fs.promises.unlink(tempPath).catch(() => {});
    }
  }
}
