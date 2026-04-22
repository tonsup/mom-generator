import { useState, useCallback, useRef } from 'react';
import Head from 'next/head';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const SUPPORTED_TYPES = '.m4a,.mp3,.mp4,.wav,.webm,.mpeg,.mpga';

const STEPS = [
  { id: 1, th: 'อัปโหลดไฟล์เสียง', en: 'Uploading audio file' },
  { id: 2, th: 'ถอดเสียงเป็นข้อความ (Whisper AI)', en: 'Transcribing audio (Whisper AI)' },
  { id: 3, th: 'สร้างสรุป MOM (GPT-4o)', en: 'Generating MOM summary (GPT-4o)' },
];

const LANGUAGE_LABELS = {
  th: '🇹🇭 ภาษาไทย',
  en: '🇺🇸 English',
};

export default function Home() {
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      setFile(dropped);
      setError(null);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setError(null);
    }
  };

  const handleSubmit = async () => {
    if (!file) return;

    setProcessing(true);
    setError(null);
    setResult(null);
    setCurrentStep(1);

    const formData = new FormData();
    formData.append('audio', file);

    try {
      setCurrentStep(2);
      const response = await fetch('/api/process-audio', {
        method: 'POST',
        body: formData,
      });

      setCurrentStep(3);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'การประมวลผลล้มเหลว / Processing failed');
      }

      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
      setCurrentStep(0);
    }
  };

  const handleCopy = async () => {
    if (result?.mom) {
      await navigator.clipboard.writeText(result.mom);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (result?.mom) {
      const dateStr = new Date().toISOString().split('T')[0];
      const blob = new Blob([result.mom], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MOM_${dateStr}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleReset = () => {
    setResult(null);
    setFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const fileSizeMB = file ? (file.size / 1024 / 1024).toFixed(2) : 0;
  const langLabel = result?.language
    ? LANGUAGE_LABELS[result.language] ?? `🌐 ${result.language.toUpperCase()}`
    : '';

  return (
    <>
      <Head>
        <title>MOM Generator — Auto Minutes of Meeting</title>
        <meta name="description" content="สร้าง Minutes of Meeting อัตโนมัติจากไฟล์เสียง รองรับภาษาไทยและอังกฤษ" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950">
        {/* Header */}
        <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center text-lg">
              📝
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-none">MOM Generator</h1>
              <p className="text-blue-300 text-xs mt-0.5">
                สร้าง Minutes of Meeting อัตโนมัติ · Powered by OpenAI
              </p>
            </div>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">

          {/* Upload section — hidden when result is shown */}
          {!result && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-white">
                  อัปโหลดไฟล์เสียงการประชุม
                </h2>
                <p className="text-blue-200">
                  Upload your meeting recording to generate instant MOM
                </p>
              </div>

              {/* Drop zone */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Upload audio file"
                className={`relative border-2 border-dashed rounded-2xl p-14 text-center cursor-pointer transition-all duration-200 outline-none
                  focus-visible:ring-2 focus-visible:ring-blue-400
                  ${isDragging
                    ? 'border-blue-400 bg-blue-500/15 scale-[1.01]'
                    : 'border-white/20 bg-white/5 hover:border-blue-400/60 hover:bg-white/8'
                  }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept={SUPPORTED_TYPES}
                  className="hidden"
                  onChange={handleFileChange}
                />

                <div className="text-5xl mb-4 select-none">🎙️</div>

                {file ? (
                  <div className="space-y-1">
                    <p className="text-white font-semibold text-lg break-all">{file.name}</p>
                    <p className="text-blue-300 text-sm">{fileSizeMB} MB</p>
                    <p className="text-white/40 text-xs mt-2">คลิกเพื่อเปลี่ยนไฟล์ · Click to change</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-white font-semibold text-lg">
                      ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือก
                    </p>
                    <p className="text-blue-300 text-sm">Drag & drop or click to browse</p>
                    <p className="text-white/40 text-xs mt-3">
                      รองรับ m4a · mp3 · mp4 · wav · webm · ขนาดสูงสุด 25 MB
                    </p>
                  </div>
                )}
              </div>

              {/* Submit button */}
              {file && !processing && (
                <button
                  onClick={handleSubmit}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700
                    text-white font-semibold rounded-xl transition-colors text-lg
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  ✨ สร้าง MOM / Generate MOM
                </button>
              )}

              {/* Progress steps */}
              {processing && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
                  <p className="text-center text-white font-semibold mb-7">
                    กำลังประมวลผล... อาจใช้เวลา 1–2 นาที
                  </p>
                  <div className="space-y-5">
                    {STEPS.map((step) => {
                      const done = currentStep > step.id;
                      const active = currentStep === step.id;
                      return (
                        <div key={step.id} className="flex items-center gap-4">
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-all duration-300
                              ${done ? 'bg-green-500 text-white'
                              : active ? 'bg-blue-500 text-white animate-pulse'
                              : 'bg-white/10 text-white/30'}`}
                          >
                            {done ? '✓' : step.id}
                          </div>
                          <div>
                            <p className={`font-medium transition-colors ${done || active ? 'text-white' : 'text-white/30'}`}>
                              {step.th}
                            </p>
                            <p className={`text-xs transition-colors ${done || active ? 'text-blue-300' : 'text-white/20'}`}>
                              {step.en}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="bg-red-500/15 border border-red-500/40 rounded-xl p-5 text-red-300">
                  <p className="font-semibold">เกิดข้อผิดพลาด / Error</p>
                  <p className="text-sm mt-1 text-red-300/80">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* Result section */}
          {result && (
            <div className="space-y-6">
              {/* Result header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-white">Minutes of Meeting</h2>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs bg-blue-500/25 text-blue-300 border border-blue-500/30 px-3 py-1 rounded-full">
                      {langLabel} detected
                    </span>
                    <span className="text-xs text-white/40">
                      {new Date().toLocaleDateString('th-TH', { dateStyle: 'long' })}
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleReset}
                  className="text-sm text-blue-300 hover:text-white border border-white/20 hover:border-white/40
                    px-4 py-2 rounded-lg transition-colors whitespace-nowrap flex-shrink-0"
                >
                  + อัปโหลดใหม่
                </button>
              </div>

              {/* MOM content */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
                <div className="prose prose-invert prose-blue max-w-none
                  prose-headings:text-white prose-headings:font-bold
                  prose-h2:text-xl prose-h2:mt-6 prose-h2:mb-3 prose-h2:border-b prose-h2:border-white/10 prose-h2:pb-2
                  prose-h3:text-base prose-h3:mt-4
                  prose-p:text-white/80 prose-p:leading-relaxed
                  prose-li:text-white/80
                  prose-strong:text-white
                  prose-ul:space-y-1
                  prose-ol:space-y-1">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {result.mom}
                  </ReactMarkdown>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleCopy}
                  className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl
                    transition-colors font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  {copied ? '✅ คัดลอกแล้ว!' : '📋 คัดลอก / Copy'}
                </button>
                <button
                  onClick={handleDownload}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl
                    transition-colors font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  ⬇️ ดาวน์โหลด / Download
                </button>
              </div>

              {/* Transcript accordion */}
              <details className="group">
                <summary className="cursor-pointer list-none flex items-center gap-2 text-sm text-blue-300 hover:text-white transition-colors select-none">
                  <span className="transition-transform group-open:rotate-90 inline-block">▶</span>
                  ดูข้อความที่ถอดเสียง / View full transcript
                </summary>
                <div className="mt-3 bg-black/30 border border-white/10 rounded-xl p-6
                  text-white/60 text-sm leading-7 whitespace-pre-wrap font-mono">
                  {result.transcript}
                </div>
              </details>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-white/10 mt-16">
          <div className="max-w-3xl mx-auto px-6 py-6 flex flex-wrap items-center justify-between gap-3 text-xs text-white/30">
            <span>MOM Generator · Powered by OpenAI Whisper &amp; GPT-4o</span>
            <span>ขนาดไฟล์สูงสุด 25 MB · Max file size 25 MB</span>
          </div>
        </footer>
      </div>
    </>
  );
}
