import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createWorker } from 'tesseract.js';

/** OCR is created lazily, used sequentially, then terminated so uploads do not retain workers. */
export async function recognizePdfPage(image: Buffer): Promise<string> {
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  try {
    const cachePath = path.join(tmpdir(), 'listenwise-tesseract-cache');
    await mkdir(cachePath, { recursive: true });
    worker = await createWorker('eng', 1, {
      cachePath,
      logger: () => {},
      errorHandler: () => {},
    });
    const result = await worker.recognize(image, { rotateAuto: true });
    return result.data.text;
  } finally {
    if (worker) await worker.terminate();
  }
}
