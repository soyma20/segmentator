export interface TranscriptionJobData {
  fileId: string;
  filePath: string;
  originalName: string;
  mimeType: string;
  duration: number;
  priority?: number;
}

export interface TranscriptionJobResult {
  fileId: string;
  transcriptionId: string;
  status: 'completed' | 'failed';
  error?: string;
}
