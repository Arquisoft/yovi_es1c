export class HttpError extends Error {
    constructor(
        public readonly statusCode: number,
        public readonly error: string,
        message?: string,
    ) {
        super(message ?? error);
    }
}
