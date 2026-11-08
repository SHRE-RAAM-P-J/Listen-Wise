import { StructuredContent } from '../types/structured-content.js';
import { GeneratedLesson, LessonAudioResult } from '../types/lesson.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export interface HealthResponse {
  status: string;
  name: string;
  version: string;
  timestamp: string;
}

export interface ApiErrorResponse {
  error: {
    message: string;
    code?: string;
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMessage = `Request failed with HTTP ${res.status}`;
    try {
      const errJson = (await res.json()) as ApiErrorResponse;
      if (errJson?.error?.message) {
        errorMessage = errJson.error.message;
      }
    } catch {
      // ignore JSON parse error
    }
    throw new Error(errorMessage);
  }
  const json = await res.json();
  return json.data !== undefined ? json.data : json;
}

export async function checkBackendHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/api/health`, { signal });
  return handleResponse<HealthResponse>(res);
}

export async function extractFromUrlApi(url: string, signal?: AbortSignal): Promise<StructuredContent> {
  const res = await fetch(`${API_BASE}/api/extract/url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    signal,
  });
  return handleResponse<StructuredContent>(res);
}

export async function extractFromPdfApi(file: File, signal?: AbortSignal): Promise<StructuredContent> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/api/extract/pdf`, {
    method: 'POST',
    body: formData,
    signal,
  });
  return handleResponse<StructuredContent>(res);
}

export async function extractFromTextApi(
  text: string,
  title?: string,
  signal?: AbortSignal,
): Promise<StructuredContent> {
  const res = await fetch(`${API_BASE}/api/extract/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, title }),
    signal,
  });
  return handleResponse<StructuredContent>(res);
}

export async function generateLessonApi(
  content: StructuredContent,
  signal?: AbortSignal,
): Promise<GeneratedLesson> {
  const res = await fetch(`${API_BASE}/api/lessons/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
    signal,
  });
  return handleResponse<GeneratedLesson>(res);
}

export async function generateLessonAudioApi(
  lesson: GeneratedLesson,
  options?: { voice?: string; speed?: number },
  signal?: AbortSignal,
): Promise<LessonAudioResult> {
  const res = await fetch(`${API_BASE}/api/tts/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lesson, options }),
    signal,
  });
  return handleResponse<LessonAudioResult>(res);
}
