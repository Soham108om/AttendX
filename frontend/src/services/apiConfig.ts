const DEFAULT_API_ORIGIN = 'http://localhost:8000';

export function resolveApiBaseUrl(envUrl?: string): string {
  const raw = (envUrl !== undefined ? envUrl : import.meta.env.VITE_API_BASE_URL)?.trim();
  const base = (raw || DEFAULT_API_ORIGIN).replace(/\/+$/, '');
  return base.endsWith('/api/v1') ? base : `${base}/api/v1`;
}

export const API_BASE_URL = resolveApiBaseUrl();
export const API_HEALTH_URL = `${API_BASE_URL.slice(0, -'/api/v1'.length)}/health`;
