import OpenAI from 'openai';

export const config = {
  api: { bodyParser: { sizeLimit: '2mb' } },
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { transcript, language } = req.body || {};
    if (!transcript || typeof transcript !== 'string') {
      return res.status(400).json({ error: 'Missing transcript' });
    }

    const isThai = (language || '').toLowerCase().startsWith('th') || /[\u0E00-\u0E7F]/.test(transcript);
    console.log(`[generate-mom] transcript ${transcript.length} chars, isThai=${isThai}`);

    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: isThai ? 'คุณเป็นเลขาที่เชี่ยวชาญการสรุปการประชุม' : 'You are an expert meeting minute-taker.',
        },
        { role: 'user', content: buildPrompt(isThai, transcript) },
      ],
    });

    const mom = completion.choices[0]?.message?.content?.trim();
    if (!mom) return res.status(500).json({ error: 'Failed to generate MOM summary' });

    return res.status(200).json({
      mom,
      transcript,
      language: isThai ? 'th' : language || 'en',
    });
  } catch (err) {
    console.error('[generate-mom] error:', err);
    return res.status(500).json({ error: err.message || 'Summary generation failed' });
  }
}
