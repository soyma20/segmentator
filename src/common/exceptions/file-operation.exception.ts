export class FileOperationException extends Error {
  constructor(
    message: string,
    public readonly operation: 'upload' | 'delete' | 'read' | 'write',
    public readonly filePath?: string,
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = 'FileOperationException';
  }
}
