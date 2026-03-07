export class HttpError extends Error {
    constructor(
        public readonly statusCode: number,
        public readonly error: string,
        message?: string,
        public readonly details?: unknown
    ) {
        super(message ?? error);
    }
}
