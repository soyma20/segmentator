# Segmentator

A NestJS-based backend service for comprehensive media file processing, transcription, and AI-powered analysis.

## Features

- **Media Processing**: Upload and process video/audio files
- **Audio Transcription**: Convert speech to text using Google Cloud Speech or OpenAI Whisper
- **AI Analysis**: Analyze transcribed content using OpenAI GPT models
- **Async Processing**: Queue-based processing with BullMQ and Redis
- **Video Clipping**: Extract segments based on AI analysis
- **Multiple Storage**: Support for local and cloud storage (Google Cloud Storage)

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

## Quick Start

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- MongoDB
- Redis
- FFmpeg

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/segmentator.git
   cd segmentator
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

4. **Start with Docker Compose**

   ```bash
   docker-compose up -d
   ```

5. **Or run locally**
   ```bash
   # Start MongoDB and Redis
   # Then run the application
   npm run start:dev
   ```

### Environment Variables

| Variable                             | Description                                   | Default                                         |
| ------------------------------------ | --------------------------------------------- | ----------------------------------------------- |
| `NODE_ENV`                           | Node.js environment                           | `development`                                   |
| `MONGODB_URI`                        | MongoDB connection string                     | `mongodb://segmentator-mongo:27017/segmentator` |
| `REDIS_HOST`                         | Redis host                                    | `segmentator-redis`                             |
| `REDIS_PORT`                         | Redis port                                    | `6379`                                          |
| `STORAGE_TYPE`                       | Storage type (`local` or `gcs`)               | `local`                                         |
| `MAX_FILE_SIZE`                      | Max upload size in MB                         | `500`                                           |
| `UPLOAD_PATH`                        | Local upload directory path                   | `./uploads`                                     |
| `STORAGE_BUCKET`                     | Google Cloud Storage bucket name              | (empty)                                         |
| `STORAGE_REGION`                     | Google Cloud Storage region                   | `us-central1`                                   |
| `TRANSCRIPTION_PROVIDER`             | Transcription service provider                | `google_speech`                                 |
| `LLM_PROVIDER`                       | LLM service provider                          | `openai`                                        |
| `OPENAI_API_KEY`                     | OpenAI API key                                | Required for LLM analysis                       |
| `ANTHROPIC_API_KEY`                  | Anthropic API key                             | Required for Anthropic LLM                      |
| `GOOGLE_API_KEY`                     | Google Cloud API key                          | Required for transcription                      |
| `GOOGLE_TRANSCRIPTION_UPLOAD_BUCKET` | Google Cloud Storage bucket for transcription | (empty)                                         |
| `GOOGLE_APPLICATION_CREDENTIALS`     | Path to Google service account key            | `/app/your-key.json`                            |
| `MONGO_EXPRESS_PASSWORD`             | MongoDB Express admin password                | (empty)                                         |

## Deployment

- **Dockerfile**, `docker-compose.yml` — containerization
- Redis and MongoDB run as services
- Production start:
  ```bash
  npm run build && npm run start:prod
  ```

## API Documentation

The API documentation is available at `http://localhost:3000/api` when running the application.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
