// Generates two simple WAV tones into media/
// success: ascending chirp (880 Hz, 0.15s)
// failure: low descending tone (220 Hz, 0.4s)
const fs = require('fs');
const path = require('path');

function makeWav(freq, durationSec, sampleRate = 44100) {
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataBytes = numSamples * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  let o = 0;

  buf.write('RIFF', o); o += 4;
  buf.writeUInt32LE(36 + dataBytes, o); o += 4;
  buf.write('WAVE', o); o += 4;
  buf.write('fmt ', o); o += 4;
  buf.writeUInt32LE(16, o); o += 4;
  buf.writeUInt16LE(1, o); o += 2;   // PCM
  buf.writeUInt16LE(1, o); o += 2;   // mono
  buf.writeUInt32LE(sampleRate, o); o += 4;
  buf.writeUInt32LE(sampleRate * 2, o); o += 4;
  buf.writeUInt16LE(2, o); o += 2;
  buf.writeUInt16LE(16, o); o += 2;
  buf.write('data', o); o += 4;
  buf.writeUInt32LE(dataBytes, o); o += 4;

  const attack = 0.01;
  const release = Math.min(0.1, durationSec * 0.3);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let env = 1.0;
    if (t < attack) env = t / attack;
    else if (t > durationSec - release) env = (durationSec - t) / release;
    const sample = Math.sin(2 * Math.PI * freq * t) * env * 0.7;
    buf.writeInt16LE(Math.round(sample * 32767), o); o += 2;
  }
  return buf;
}

const mediaDir = path.join(__dirname, '..', 'media');
fs.mkdirSync(mediaDir, { recursive: true });
fs.writeFileSync(path.join(mediaDir, 'success.wav'), makeWav(880, 0.25));
fs.writeFileSync(path.join(mediaDir, 'failure.wav'), makeWav(220, 0.5));
console.log('Sound files written to media/');
