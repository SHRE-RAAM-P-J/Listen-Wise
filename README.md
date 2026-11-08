# ListenWise

> **Read less. Understand more.**

ListenWise transforms dense webpages, technical PDFs, and study notes into structured, natural-sounding educational audio lessons.

Unlike basic summarization tools or plain text-to-speech readers, ListenWise reconstructs the logical structure of technical material and teaches it like an expert instructor.

---

## Current Status: Phase 3 Completed

| Phase | Description | Status |
| :--- | :--- | :--- |
| **Phase 0** | Monorepo structure, Vite + React + Express, Tailwind, health check | ✅ Complete |
| **Phase 1** | Content Extraction (URL Readability + Cheerio, PDF.js, Markdown/Text, SSRF Security) | ✅ Complete |
| **Phase 2** | AI Understanding Engine (Gemini LLM Provider, Chunking, Section-by-Section Teaching, Source Validation) | ✅ Complete |
| **Phase 3** | Gnani AI Timbre v2.5 Speech Synthesis, WAV Parser & Merging, Temporary Audio Storage, Audio Streaming | ✅ Complete |
| **Phase 4** | Advanced Player Polish & Interactive Transcripts | ⏳ Planned |

---

## Architecture Overview

```
ListenWise/
├── client/                     # React 18 + Vite 6 + TypeScript + Tailwind CSS
│   ├── src/
│   │   ├── components/         # Reusable UI components (LessonViewer with audio player)
│   │   ├── services/           # Typed API client (extraction, lesson generation, TTS generation)
│   │   ├── types/              # Canonical Content Representation & Lesson/Audio models
│   │   └── App.tsx             # Interactive 3-mode input & lesson presentation
│   └── package.json
│
├── server/                     # Node.js + Express + TypeScript
│   ├── src/
│   │   ├── models/             # Canonical Content Representation (CCR) & Lesson/Audio models
│   │   ├── services/
│   │   │   ├── extraction/     # URL (Cheerio + Readability), PDF (pdfjs-dist), Text extractors
│   │   │   ├── ai/             # AI Understanding Engine (Gemini 2.5 Flash, chunking, validator)
│   │   │   ├── tts/            # Gnani AI Timbre v2.5 TTS Integration & WAV binary merger
│   │   │   └── storage/        # Temporary audio file management & cleanup
│   │   ├── routes/             # REST API routes (/api/extract, /api/lessons, /api/tts)
│   │   ├── utils/              # Enterprise URL security & SSRF protection
│   │   └── config.ts           # Central typed configuration
│   └── package.json
└── README.md
```

---

## Prerequisites

- **Node.js** ≥ 18.0.0
- **pnpm** (recommended) or npm

---

## Installation & Setup

### 1. Install Dependencies

```bash
# Backend
cd server
pnpm install

# Frontend
cd ../client
pnpm install
```

### 2. Configure Environment Variables

All API keys and secrets belong **exclusively** to the backend (`server/.env`). Never place secrets in frontend files or repository commits.

Create `server/.env`:
```bash
cp .env.example server/.env
```

Edit `server/.env` with your credentials:
```env
# Server
PORT=3001
NODE_ENV=development

# Google Gemini API (Phase 2: AI Understanding Engine)
# Get a key at: https://aistudio.google.com/
GEMINI_API_KEY=your_actual_gemini_api_key_here
GEMINI_MODEL=gemini-3.8-flash
AI_TIMEOUT_MS=90000

# Gnani AI Timbre TTS (Phase 3: Speech Synthesis)
# Endpoint: https://api.vachana.ai/api/v1/tts/inference
# Authentication header: X-API-Key-ID
GNANI_API_KEY=your_actual_gnani_api_key_here

# File storage & limits
TEMP_DIR=./tmp
MAX_UPLOAD_SIZE_MB=20
MIN_URL_CONTENT_WORDS=40
MIN_URL_CONTENT_CHARS=200
```

> [!TIP]
> If credentials are not yet set, the server still boots safely without crashing. Requests will return clean HTTP 503 configuration errors. The automated test suites use deterministic mock providers when offline.

---

## Development Commands

### Running Locally

```bash
# Terminal 1 — Start Backend Server (port 3001)
cd server
pnpm dev
# (or: npx tsx watch src/index.ts)

# Terminal 2 — Start Frontend Client (port 5173)
cd client
pnpm dev
# (or: npm run dev)
```

- **Frontend:** http://localhost:5173
- **Backend:** http://localhost:3001
- **Health Check:** http://localhost:3001/api/health

The Vite dev server automatically proxies all `/api/*` requests to the Express backend.

---

## API Endpoints

### 1. Extraction Endpoints (Phase 1)
- `POST /api/extract/url` — `{ "url": "https://..." }` (SSRF-protected webpage extraction)
- `POST /api/extract/pdf` — Multipart form-data with `file` (reading order, headings, tables)
- `POST /api/extract/text` — `{ "text": "...", "title": "..." }` (Markdown & text normalization)

### 2. AI Understanding Engine Endpoints (Phase 2)
- `POST /api/lessons/generate` (also `/api/lesson/generate`)
  - Accepts pre-extracted CCR or direct `{ "url": "..." }` / `{ "text": "..." }`
  - Returns complete, structured, grounded educational lesson JSON with chapters and validation.

### 3. Gnani AI Audio Generation Endpoints (Phase 3)
- `POST /api/tts/generate`
  - Accepts `{ "lesson": <Lesson>, "options": { "voice": "Nalini", "speed": 1.0 } }` or `{ "text": "..." }`
  - Synthesizes audio sequentially for each chapter using Gnani Timbre v2.5 (`https://api.vachana.ai/api/v1/tts/inference`).
  - Handles sentence-boundary chunking, merges binary WAV buffers, saves audio to temporary storage, and returns playable references (`AudioSegment[]`).
- `GET /api/tts/audio/:lessonId/:filename`
  - Streams temporary binary WAV audio. Supports HTTP 206 Partial Content (`Range: bytes=start-end`) for streaming and seeking.
- `DELETE /api/tts/audio/:lessonId`
  - Cleans up temporary audio files for a lesson.

---

## Automated Test Suites

ListenWise includes **86 comprehensive automated tests** across all pipelines:

```bash
# Run Phase 1 Extraction Tests (35 tests)
cd server
npx tsx src/test-pipeline.ts

# Run Phase 2 AI Understanding Engine Tests (29 tests)
cd server
npx tsx src/test-ai-engine.ts

# Run Phase 3 Gnani AI Audio Generation Tests (22 tests)
cd server
npx tsx src/test-tts-pipeline.ts
```

### What the Phase 3 Test Suite Verifies:
1. **WAV binary parsing**: Sample rate (24000 Hz), channels (mono), bits (16-bit PCM), and precise duration calculation.
2. **Chunked WAV merging**: Combines multiple raw PCM audio buffers and updates the 44-byte RIFF header seamlessly without audible clicks.
3. **Sentence-boundary chunking**: Splits long scripts at sentence boundaries (`. `, `! `, `? `) respecting Gnani's per-request character limits.
4. **Short script audio generation**: Synthesizes binary audio and extracts duration.
5. **Multi-chapter lesson generation**: Sequential synthesis across 3 chapters, saves to temporary storage, attaches `audioSegment` metadata, and computes total lesson audio duration.
6. **Error handling**:
   - Clean `AppError(503)` when `GNANI_API_KEY` is missing.
   - `AppError(404)` for non-existent audio files.
   - `AppError(402)` for insufficient credits.
   - `AppError(429)` for rate limit backoff.
7. **Temporary storage cleanup**: Safe deletion of temporary lesson audio folders.
8. **Live Gnani API verification**: Verifies actual binary WAV response if `GNANI_API_KEY` is present.

---

## License

Private project — all rights reserved.
