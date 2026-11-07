# ListenWise

> **Read less. Understand more.**

ListenWise transforms dense webpages, technical PDFs, and study notes into structured, natural-sounding educational audio lessons.

Unlike basic summarization tools or plain text-to-speech readers, ListenWise reconstructs the logical structure of technical material and teaches it like an expert instructor.

---

## Current Status: Phase 2 Completed

| Phase | Description | Status |
| :--- | :--- | :--- |
| **Phase 0** | Monorepo structure, Vite + React + Express, Tailwind, health check | ✅ Complete |
| **Phase 1** | Content Extraction (URL Readability + Cheerio, PDF.js, Markdown/Text, SSRF Security) | ✅ Complete |
| **Phase 2** | AI Understanding Engine (Gemini LLM Provider, Chunking, Section-by-Section Teaching, Source Validation) | ✅ Complete |
| **Phase 3** | Gnani AI Timbre v2.5 Speech Synthesis & Interactive Audio Player | ⏳ Planned |

> [!NOTE]
> **Audio Generation / TTS Notice:** Speech generation using Gnani AI Timbre v2.5 is scheduled for **Phase 3**. The current build generates the complete, verified pedagogical teaching script with chapters, source traceability, and conceptual breakdown.

---

## Architecture Overview

```
ListenWise/
├── client/                     # React 18 + Vite 6 + TypeScript + Tailwind CSS
│   ├── src/
│   │   ├── components/         # Reusable UI components (LessonViewer, etc.)
│   │   ├── services/           # Typed API client (extraction, lesson generation)
│   │   ├── types/              # Canonical Content Representation & Lesson models
│   │   └── App.tsx             # Interactive 3-mode input & lesson presentation
│   └── package.json
│
├── server/                     # Node.js + Express + TypeScript
│   ├── src/
│   │   ├── models/             # Canonical Content Representation (CCR) & Lesson models (Zod schemas)
│   │   ├── services/
│   │   │   ├── extraction/     # URL (Cheerio + Readability), PDF (pdfjs-dist), Text extractors
│   │   │   └── ai/             # AI Understanding Engine:
│   │   │       ├── providers/  # LLM Provider abstraction (Gemini 2.5 Flash, Mock for CI)
│   │   │       ├── chunking.service.ts
│   │   │       ├── prompt-builder.service.ts
│   │   │       ├── lesson-validator.service.ts
│   │   │       └── lesson-generator.service.ts
│   │   ├── routes/             # REST API routes (/api/extract, /api/lessons)
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

# Google Gemini API (AI Understanding Engine)
# Get a key at: https://aistudio.google.com/
GEMINI_API_KEY=your_actual_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# Gnani AI Timbre TTS (Phase 3: Speech Synthesis — future)
GNANI_API_KEY=

# File storage & limits
TEMP_DIR=./tmp
MAX_UPLOAD_SIZE_MB=20
```

> [!TIP]
> If `GEMINI_API_KEY` is omitted, the server still boots safely without crashing. Requests to `/api/lessons/generate` will return a clear HTTP 503 configuration error. Automated tests use deterministic mock providers when offline.

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

### Extraction Endpoints (Phase 1)
- `POST /api/extract/url` — `{ "url": "https://..." }` (SSRF-protected webpage extraction)
- `POST /api/extract/pdf` — Multipart form-data with `file` (reading order, headings, tables)
- `POST /api/extract/text` — `{ "text": "...", "title": "..." }` (Markdown & text normalization)

### AI Understanding Engine Endpoints (Phase 2)
- `POST /api/lessons/generate` (also `/api/lesson/generate`)
  - Accepts either:
    - `{ "content": <StructuredContent> }` — Canonical Content Representation from Phase 1
    - `{ "url": "https://..." }` — Direct extraction + generation
    - `{ "text": "...", "title": "..." }` — Direct text + generation
  - Returns complete, structured, grounded educational lesson JSON:
    - `documentTitle`, `subject`, `purpose`, `lessonOverview`
    - `keyConcepts`: Array of source-grounded concepts with explanations
    - `chapters`: Array of topic-specific chapters with `teachingScript`, `conceptsCovered`, `transitionToNext`, and `sourceReferences` (`blockId`, `pageNumber`, `sectionTitle`)
    - `completeLessonScript`: Unified script with pedagogical bridges
    - `validation`: `sourceCoverage` score, `unsupportedClaims` verification, and warnings

---

## Automated Test Suites

ListenWise includes 64 comprehensive automated tests covering all pipelines:

```bash
# Run Phase 1 Extraction Tests (35 tests)
cd server
npx tsx src/test-pipeline.ts

# Run Phase 2 AI Understanding Engine Tests (29 tests)
cd server
npx tsx src/test-ai-engine.ts
```

### What the Phase 2 Test Suite Verifies:
1. **Technical article input** (HTML with equations, tables, code blocks)
2. **PDF-derived canonical content** (PDF reading order, multi-section hierarchy)
3. **Multiple sections** with heading depth preservation
4. **Technical terminology** and conceptual definitions
5. **Formulas and significant numbers** ($Attention(Q,K,V)$, $28.4$ BLEU)
6. **Code blocks and tabular matrices**
7. **Large document chunking** (preserving section boundaries and block IDs)
8. **Missing API key handling** (AppError 503 without crashing)
9. **Empty & invalid provider response handling**
10. **Structured JSON validation & markdown fence repair**
11. **Unsupported claim detection** (flags unverified metrics)
12. **Source coverage validation** (calculates real section coverage)
13. **Source reference validation** (detects non-existent block IDs)
14. **Live Gemini integration** (conditional on credentials)

---

## License

Private project — all rights reserved.
