/**
 * Ошибки встроенной БД, у которых всегда есть понятная подсказка на русском:
 * такие ошибки печатает и backend, и CLI (`npm run db:local:*`).
 */
export class LocalDatabaseError extends Error {
  readonly hint?: string;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = "LocalDatabaseError";
    this.hint = hint;
  }
}

/** Приводит любую ошибку к строке вида «сообщение + подсказка». */
export function describeLocalDatabaseError(error: unknown): string {
  if (error instanceof LocalDatabaseError) {
    return error.hint ? `${error.message}\n  → ${error.hint}` : error.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
