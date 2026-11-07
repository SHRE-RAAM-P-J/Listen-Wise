import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config.js';
import { AppError } from '../../middleware/error-handler.js';

export class TempStorageService {
  private static getAudioBaseDir(): string {
    const audioDir = path.join(config.tempDir, 'audio');
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }
    return audioDir;
  }

  public static getLessonAudioDir(lessonId: string): string {
    // Sanitize lessonId to avoid path traversal
    const safeId = lessonId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const lessonDir = path.join(this.getAudioBaseDir(), safeId);
    if (!fs.existsSync(lessonDir)) {
      fs.mkdirSync(lessonDir, { recursive: true });
    }
    return lessonDir;
  }

  public static saveChapterAudio(
    lessonId: string,
    chapterIndex: number,
    wavBuffer: Buffer,
  ): { filePath: string; fileName: string } {
    const lessonDir = this.getLessonAudioDir(lessonId);
    const fileName = `chapter-${chapterIndex}.wav`;
    const filePath = path.join(lessonDir, fileName);

    try {
      fs.writeFileSync(filePath, wavBuffer);
      return { filePath, fileName };
    } catch (err: any) {
      throw new AppError(`Failed to save generated audio to temporary storage: ${err.message}`, 500, 'STORAGE_WRITE_ERROR');
    }
  }

  public static getChapterAudioPath(lessonId: string, fileName: string): string {
    const safeId = lessonId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeName = path.basename(fileName); // Prevents path traversal
    const filePath = path.join(this.getAudioBaseDir(), safeId, safeName);

    if (!fs.existsSync(filePath)) {
      throw new AppError(`Audio file not found: ${fileName}`, 404, 'AUDIO_NOT_FOUND');
    }

    return filePath;
  }

  public static cleanupLessonAudio(lessonId: string): boolean {
    const safeId = lessonId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const lessonDir = path.join(this.getAudioBaseDir(), safeId);

    if (fs.existsSync(lessonDir)) {
      try {
        fs.rmSync(lessonDir, { recursive: true, force: true });
        return true;
      } catch (err: any) {
        console.warn(`[TempStorage] Could not clean up lesson directory ${lessonDir}:`, err.message);
        return false;
      }
    }
    return false;
  }

  /**
   * Cleans up audio files older than maxAgeMs (default: 4 hours).
   */
  public static cleanupExpiredAudio(maxAgeMs: number = 4 * 60 * 60 * 1000): number {
    const audioDir = this.getAudioBaseDir();
    if (!fs.existsSync(audioDir)) return 0;

    let cleaned = 0;
    const now = Date.now();

    try {
      const lessonDirs = fs.readdirSync(audioDir);
      for (const dirName of lessonDirs) {
        const fullPath = path.join(audioDir, dirName);
        const stats = fs.statSync(fullPath);
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.rmSync(fullPath, { recursive: true, force: true });
          cleaned++;
        }
      }
    } catch (err: any) {
      console.warn('[TempStorage] Error during expired audio cleanup:', err.message);
    }

    return cleaned;
  }
}
