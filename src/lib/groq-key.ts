import { useSyncExternalStore } from "react";

/**
 * "Bring your own key" for the LLM. The user's personal Groq API key is stored
 * only on this device and sent as the `x-groq-key` header when starting a run;
 * the backend uses it for that run instead of the server's key and never persists
 * it. This lets a deployed POLARIS run on each visitor's own Groq quota.
 */
const STORAGE_KEY = "polaris-groq-key";

type Listener = () => void;
const listeners = new Set<Listener>();

export function getGroqKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setGroqKey(key: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function clearGroqKey(): void {
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

/** The stored key (or null). SSR-safe via useSyncExternalStore. */
export function useGroqKey(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => getGroqKey(),
    () => null,
  );
}

/** Mask a key for display: keep the `gsk_` prefix and last 4 chars. */
export function maskKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "••••";
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}
