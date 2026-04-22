// Compress audio in the browser:
// 1. Decode any format → 16 kHz mono (Whisper's internal sample rate)
// 2. Encode to MP3 @ 48 kbps (good enough for speech, small enough to upload)
// 3. Split into chunks that fit Vercel's 4.5 MB API body limit
//
// At 48 kbps mono, 1 hour of audio = ~21 MB → split into ~5 chunks of ~4 MB each.

import lamejs from '@breezystack/lamejs';

const TARGET_SAMPLE_RATE = 16000;
const MP3_BITRATE_KBPS = 48;
const MAX_CHUNK_BYTES = 4 * 1024 * 1024; // 4 MB — safely under Vercel's 4.5 MB limit

export async function compressAudioForWhisper(file, onProgress) {
  onProgress?.(2, 'กำลังอ่านไฟล์ / Reading file');
  const arrayBuffer = await file.arrayBuffer();

  onProgress?.(8, 'กำลังถอดรหัสเสียง / Decoding audio');
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  const durationSec = decoded.duration;
  console.log(`[compress] duration: ${Math.round(durationSec)}s, channels: ${decoded.numberOfChannels}`);

  onProgress?.(15, 'กำลังลด sample rate / Resampling to 16 kHz mono');
  const targetLength = Math.ceil(durationSec * TARGET_SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, targetLength, TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;

  if (decoded.numberOfChannels > 1) {
    const merger = offline.createChannelMerger(1);
    const splitter = offline.createChannelSplitter(decoded.numberOfChannels);
    source.connect(splitter);
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      splitter.connect(merger, ch, 0);
    }
    merger.connect(offline.destination);
  } else {
    source.connect(offline.destination);
  }
  source.start(0);
  const rendered = await offline.startRendering();
  audioCtx.close?.();

  const samples = rendered.getChannelData(0);
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  onProgress?.(25, 'กำลังเข้ารหัส MP3 / Encoding MP3');
  const encoder = new lamejs.Mp3Encoder(1, TARGET_SAMPLE_RATE, MP3_BITRATE_KBPS);
  const blockSize = 1152;
  const mp3Parts = [];
  const totalBlocks = Math.ceil(pcm.length / blockSize);

  for (let i = 0; i < pcm.length; i += blockSize) {
    const slice = pcm.subarray(i, Math.min(i + blockSize, pcm.length));
    const buf = encoder.encodeBuffer(slice);
    if (buf.length > 0) mp3Parts.push(buf);

    const blockIdx = i / blockSize;
    if (blockIdx % 500 === 0) {
      const pct = 25 + Math.round((blockIdx / totalBlocks) * 65);
      onProgress?.(pct, 'กำลังเข้ารหัส MP3 / Encoding MP3');
      // yield to UI so progress updates paint
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  const flush = encoder.flush();
  if (flush.length > 0) mp3Parts.push(flush);

  const mp3Blob = new Blob(mp3Parts, { type: 'audio/mpeg' });
  const mp3SizeMB = (mp3Blob.size / 1024 / 1024).toFixed(2);
  console.log(`[compress] MP3 size: ${mp3SizeMB} MB`);
  onProgress?.(95, `บีบอัดเสร็จ ${mp3SizeMB} MB / Compressed to ${mp3SizeMB} MB`);

  // Split into chunks by accumulating encoder outputs (each is on a clean MP3
  // frame boundary) until we approach MAX_CHUNK_BYTES.
  const chunks = [];
  let current = [];
  let currentSize = 0;
  for (const part of mp3Parts) {
    if (currentSize + part.length > MAX_CHUNK_BYTES && current.length > 0) {
      chunks.push(new Blob(current, { type: 'audio/mpeg' }));
      current = [];
      currentSize = 0;
    }
    current.push(part);
    currentSize += part.length;
  }
  if (current.length > 0) chunks.push(new Blob(current, { type: 'audio/mpeg' }));

  console.log(`[compress] split into ${chunks.length} chunks`);
  onProgress?.(100, `แบ่งเป็น ${chunks.length} ส่วน / Split into ${chunks.length} chunks`);
  return { chunks, durationSec, totalSizeMB: mp3SizeMB };
}
