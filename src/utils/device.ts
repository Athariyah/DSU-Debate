const DEVICE_UUID_KEY = "device_uuid";

/**
 * Anti-fraud: бэкенд ожидает device_fingerprint в паре с ip_address
 * (UNIQUE uq_votes_event_fingerprint / uq_votes_event_ip на таблице votes).
 * Генерируем стабильный UUID один раз на устройство и переиспользуем его.
 */
export function getDeviceFingerprint(): string {
  let id = localStorage.getItem(DEVICE_UUID_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : fallbackUUID();
    localStorage.setItem(DEVICE_UUID_KEY, id);
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
