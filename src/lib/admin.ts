import { useSyncExternalStore } from "react";

/**
 * Owner-access gate for the Reports history. The real secret lives on the backend
 * (POLARIS_ADMIN_KEY); here we only remember the key the owner typed so we can send
 * it as the `x-admin-key` header. Presence of a stored key == "unlocked" on this
 * device (we only store it after the backend validates it).
 */
const STORAGE_KEY = "polaris-admin-key";

type Listener = () => void;
const listeners = new Set<Listener>();

export function getAdminKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAdminKey(key: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function clearAdminKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True when an owner key is stored on this device. SSR-safe via useSyncExternalStore. */
export function useAdminUnlocked(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => getAdminKey() != null,
    () => false,
  );
}
