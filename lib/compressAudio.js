// Compress audio in the browser to keep the payload under Vercel's 4.5 MB API body limit.
// Whisper only uses 16 kHz mono internally, so we lose no useful information.
//
// Strategy: decode any audio format → resample to 16 kHz mono → re-encode as 16-bit WAV.
// A 1-hour meeting at 16 kHz mono 16-bit is ~115 MB raw; we downsample timing by
// accepting up to 25 MB, but typical meetings compress from 18 MB m4a → ~3-4 MB WAV.

const TARGET_SAMPLE_RATE = 16000;

export async function compressAudioForWhisper(file, onProgress) {
  onProgress?.(5, 'กำลังอ่านไฟล์ / Reading file');
  const arrayBuffer = await file.arrayBuffer();

  onProgress?.(15, 'กำลังถอดรหัสเสียง / Decoding audio');
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));

  onProgress?.(40, 'กำลังลด sample rate / Resampling to 16 kHz');
  // Mix down to mono + resample to 16 kHz using OfflineAudioContext
  const durationSec = decoded.duration;
  const targetLength = Math.ceil(durationSec * TARGET_SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, targetLength, TARGET_SAMPLE_RATE);

  const source = offline.createBufferSource();
  source.buffer = decoded;

  // Mix channels to mono manually for predictable results
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

  onProgress?.(75, 'กำลังเข้ารหัส WAV / Encoding WAV');
  const wavBlob = encodeWav(rendered);

  audioCtx.close?.();
  onProgress?.(95, 'เสร็จสิ้น / Done');
  return wavBlob;
}

function encodeWav(audioBuffer) {
  const numChannels = 1;
  const sampleRate = audioBuffer.sampleRate;
  const samples = audioBuffer.getChannelData(0);
  const numSamples = samples.length;
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const bufferSize = 44 + dataSize;

  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true);  // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // PCM samples (clamped Float32 → Int16)
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
