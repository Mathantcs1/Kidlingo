/** An export failure with a message meant for the user; `detail` holds optional technical context for logs. */
export class ExportError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'ExportError';
  }
}
