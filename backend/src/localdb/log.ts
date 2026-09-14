/**
 * Единый префикс в логах для всего, что связано со встроенной (локальной)
 * БД: так видно, что сообщение относится к PostgreSQL на вашем компьютере,
 * а не к API.
 */
const PREFIX = "[db:local]";

// eslint-disable-next-line no-console
export function localLog(message: string): void {
  console.log(`${PREFIX} ${message}`);
}

// eslint-disable-next-line no-console
export function localWarn(message: string): void {
  console.warn(`${PREFIX} ${message}`);
}

// eslint-disable-next-line no-console
export function localError(message: string): void {
  console.error(`${PREFIX} ${message}`);
}

/** Печатает многострочный вывод дочернего процесса (initdb/pg_ctl) с отступом. */
export function localLogBlock(title: string, output: string): void {
  const trimmed = output.trim();
  if (!trimmed) return;
  localLog(`${title}:`);
  for (const line of trimmed.split(/\r?\n/)) {
    // eslint-disable-next-line no-console
    console.log(`  ${line}`);
  }
}
