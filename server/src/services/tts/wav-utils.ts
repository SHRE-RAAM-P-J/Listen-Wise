import { AppError } from '../../middleware/error-handler.js';

export interface WavMetadata {
  numChannels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  dataSize: number;
  durationSeconds: number;
}

export class WavUtils {
  /**
   * Parses and validates a binary WAV buffer, extracting its audio metadata and duration.
   */
  public static parseWav(buffer: Buffer): WavMetadata {
    if (buffer.length < 44) {
      throw new AppError('Invalid WAV file: buffer is shorter than 44-byte standard header.', 400, 'INVALID_WAV_HEADER');
    }

    const riff = buffer.toString('ascii', 0, 4);
    const wave = buffer.toString('ascii', 8, 12);

    if (riff !== 'RIFF' || wave !== 'WAVE') {
      throw new AppError('Invalid WAV file: missing RIFF or WAVE signature.', 400, 'INVALID_WAV_SIGNATURE');
    }

    // Locate the 'fmt ' and 'data' chunks
    let offset = 12;
    let numChannels = 1;
    let sampleRate = 24000;
    let byteRate = 48000;
    let blockAlign = 2;
    let bitsPerSample = 16;
    let dataSize = 0;
    let fmtFound = false;
    let dataFound = false;

    while (offset < buffer.length - 8) {
      const chunkId = buffer.toString('ascii', offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);

      if (chunkId === 'fmt ') {
        fmtFound = true;
        // AudioFormat = buffer.readUInt16LE(offset + 8);
        numChannels = buffer.readUInt16LE(offset + 10);
        sampleRate = buffer.readUInt32LE(offset + 12);
        byteRate = buffer.readUInt32LE(offset + 16);
        blockAlign = buffer.readUInt16LE(offset + 20);
        bitsPerSample = buffer.readUInt16LE(offset + 22);
      } else if (chunkId === 'data') {
        dataFound = true;
        dataSize = chunkSize;
        break;
      }

      offset += 8 + chunkSize;
    }

    if (!fmtFound || !dataFound) {
      // Fallback: estimate using standard 44-byte header
      dataSize = Math.max(0, buffer.length - 44);
    }

    const calculatedByteRate = byteRate > 0 ? byteRate : sampleRate * numChannels * (bitsPerSample / 8);
    const durationSeconds = calculatedByteRate > 0 ? dataSize / calculatedByteRate : 0;

    return {
      numChannels,
      sampleRate,
      byteRate: calculatedByteRate,
      blockAlign,
      bitsPerSample,
      dataSize,
      durationSeconds: Number(durationSeconds.toFixed(2)),
    };
  }

  /**
   * Merges multiple WAV buffers into a single seamless WAV file.
   * Concatenates raw PCM audio samples and updates the RIFF & data headers.
   */
  public static mergeWavBuffers(buffers: Buffer[]): Buffer {
    if (buffers.length === 0) {
      throw new AppError('Cannot merge empty array of WAV buffers.', 400, 'EMPTY_WAV_ARRAY');
    }
    if (buffers.length === 1) {
      return buffers[0];
    }

    const firstMeta = this.parseWav(buffers[0]);
    const pcmChunks: Buffer[] = [];
    let totalPcmBytes = 0;

    for (const buf of buffers) {
      // Find 'data' chunk offset
      let dataOffset = 44;
      let offset = 12;
      while (offset < buf.length - 8) {
        const chunkId = buf.toString('ascii', offset, offset + 4);
        const chunkSize = buf.readUInt32LE(offset + 4);
        if (chunkId === 'data') {
          dataOffset = offset + 8;
          break;
        }
        offset += 8 + chunkSize;
      }

      const pcm = buf.subarray(dataOffset);
      pcmChunks.push(pcm);
      totalPcmBytes += pcm.length;
    }

    // Build standard 44-byte WAV header for the combined PCM payload
    const header = Buffer.alloc(44);

    // RIFF header
    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(36 + totalPcmBytes, 4); // File size - 8
    header.write('WAVE', 8, 'ascii');

    // fmt subchunk
    header.write('fmt ', 12, 'ascii');
    header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    header.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
    header.writeUInt16LE(firstMeta.numChannels, 22);
    header.writeUInt32LE(firstMeta.sampleRate, 24);
    header.writeUInt32LE(firstMeta.byteRate, 28);
    header.writeUInt16LE(firstMeta.blockAlign, 32);
    header.writeUInt16LE(firstMeta.bitsPerSample, 34);

    // data subchunk
    header.write('data', 36, 'ascii');
    header.writeUInt32LE(totalPcmBytes, 40);

    return Buffer.concat([header, ...pcmChunks]);
  }

  /**
   * Generates a valid PCM 16-bit 24kHz mono WAV audio buffer of specified duration.
   * Useful for deterministic testing, CI runs, and synthetic audio benchmarks.
   */
  public static createSyntheticWav(durationSeconds: number = 2.0, frequencyHz: number = 440): Buffer {
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const numSamples = Math.floor(sampleRate * durationSeconds);
    const dataSize = numSamples * (bitsPerSample / 8);

    const header = Buffer.alloc(44);
    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8, 'ascii');
    header.write('fmt ', 12, 'ascii');
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * numChannels * 2, 28);
    header.writeUInt16LE(numChannels * 2, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36, 'ascii');
    header.writeUInt32LE(dataSize, 40);

    const pcm = Buffer.alloc(dataSize);
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      // Gentle sine tone with fade-in and fade-out envelope to avoid clicks
      const envelope = Math.min(1, Math.min(t / 0.05, (durationSeconds - t) / 0.05));
      const sample = Math.sin(2 * Math.PI * frequencyHz * t) * 0.3 * envelope;
      const intSample = Math.floor(sample * 32767);
      pcm.writeInt16LE(intSample, i * 2);
    }

    return Buffer.concat([header, pcm]);
  }
}
