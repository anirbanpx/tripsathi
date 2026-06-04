import type { AuthUser } from "../types";

const STORAGE_KEY = "tripsathi_auth";

interface StoredAuth {
  access_token: string;
  user: AuthUser;
}

export function getAuthState(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

export function setAuthState(data: StoredAuth): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearAuthState(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getAuthHeaders(): Record<string, string> {
  const auth = getAuthState();
  return auth ? { Authorization: `Bearer ${auth.access_token}` } : {};
}

export function isAuthenticated(): boolean {
  return getAuthState() !== null;
}
