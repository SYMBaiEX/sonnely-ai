export class SonnelyError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export class InferenceRequestError extends SonnelyError {
  constructor(
    cause: SonnelyError,
    public readonly requestId: string,
  ) {
    super(cause.message, cause.status);
  }
}
