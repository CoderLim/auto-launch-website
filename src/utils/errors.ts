export class AppError extends Error {
  constructor(message: string, public readonly code = 'APP_ERROR', public readonly causeValue?: unknown) {
    super(message);
    this.name = 'AppError';
  }
}
export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new AppError(`Missing required environment variable: ${name}`, 'MISSING_ENV');
  return value;
}
