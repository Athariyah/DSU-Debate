const DEVICE_UUID_KEY = "device_uuid";

/**
 * Anti-fraud: бэкенд ожидает device_fingerprint в паре с ip_address
 * (UNIQUE uq_votes_event_fingerprint / uq_votes_event_ip на таблице votes).
 * Генерируем стабильный UUID один раз на устройство и переиспользуем его.
 */
export function getDeviceFingerprint(): string {
  let id: string | null = null;
  try {
    id = localStorage.getItem(DEVICE_UUID_KEY);
  } catch {
    // localStorage недоступен (встроенные фреймы): работаем без персиста.
  }
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : fallbackUUID();
    try {
      localStorage.setItem(DEVICE_UUID_KEY, id);
    } catch {
      // остаёмся с одноразовым отпечатком на эту страницу.
    }
  }
  return id;
}

function fallbackUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
