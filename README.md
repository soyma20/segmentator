# Segmentator Project

## Architecture

**Segmentator** is a backend application based on **NestJS** (Node.js + TypeScript), designed for comprehensive media file processing (video and audio).  
Main tasks:

- Uploading and processing media files
- Transcribing audio to text
- Analyzing text using LLM (OpenAI)
- Asynchronous processing via queues (BullMQ + Redis)

---

## Modular Structure

- **`src/files`** — uploading and managing files (storage, access)
- **`src/processing`** — orchestrating the processing pipeline (file → audio → transcription → analysis)
- **`src/transcription`** — audio transcription (Google Cloud Speech, OpenAI Whisper)
- **`src/analysis`** — analyzing the resulting text (classification, segmentation, evaluation)
- **`src/queues`** — queues for asynchronous tasks (BullMQ, Redis)
- **`src/services/ffmpeg`** — integration with **FFmpeg** (extracting audio from video)
- **`src/common/providers`** — abstraction layers for external services (Storage, Audio Processing, LLM)
- **`src/database`** — working with the database (**MongoDB via Mongoose**)

---

## Main Tech Stack

- **NestJS 11** (modular architecture, controllers, services)
- **MongoDB + Mongoose** (storing results)
- **BullMQ + Redis** (background queues)
- **FFmpeg** (video/audio processing)
- **Google Cloud Speech-to-Text** (transcription)
- **OpenAI API** (text analysis, LLM)
- **RxJS** (reactive streams)
- **Multer** (file uploads)

---

## Development Process

### Scripts from `package.json`

- `npm run start:dev` — start dev server with hot reload
- `npm run lint` — ESLint (with Prettier style)
- `npm run test` — unit tests (Jest)
- `npm run test:e2e` — end-to-end tests
- `npm run build` — compilation (Nest build)
- `npm run start:prod` — start in production mode

### Code Style

- **TypeScript** with strict typing
- **ESLint + Prettier** for code style
- **Jest** for testing (`*.spec.ts` + `test/e2e`)

---

## Application Workflow

1. User uploads a file via API (`FilesController`)
2. The file is stored and a job is created in the queue (`ProcessingService` + BullMQ)
3. **FFmpeg** extracts audio from the video
4. Audio is sent for transcription (Google Speech or OpenAI)
5. Transcription result is saved in **MongoDB**
6. Text is sent for analysis (`AnalysisService`, OpenAI)
7. Analysis results are saved in the database
8. Client can retrieve status and results via API

---

## Deployment

- **Dockerfile**, `docker-compose.yml` — containerization
- Redis and MongoDB run as services
- Production start:
  ```bash
  npm run build && npm run start:prod
  ```
