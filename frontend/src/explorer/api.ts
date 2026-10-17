export type Platform = 'ios' | 'android';
export type AppListing = {
  id: string;
  platform: Platform;
  store_app_id: string;
  country: string;
  title: string;
  developer: string;
  listing_url: string | null;
  created_at: string;
};
export type Page<T> = { items: T[]; next_cursor: string | null; limit: number };
export type AppListingFilters = { platform?: Platform; geo?: string; keyword?: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new Error('The local API could not be reached. Start the backend and try again.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string; details?: { errors?: { location: unknown[]; message: string }[] } } } | null;
    const errors = body?.error?.details?.errors?.map((item) => `${item.location.join('.')}: ${item.message}`).join('; ');
    throw new Error(errors || body?.error?.message || `Request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export const appsApi = {
  list(filters: AppListingFilters = {}, cursor?: string): Promise<Page<AppListing>> {
    const params = new URLSearchParams({ limit: '50' });
    if (cursor) params.set('cursor', cursor);
    if (filters.platform) params.set('platform', filters.platform);
    if (filters.geo) params.set('geo', filters.geo);
    if (filters.keyword) params.set('keyword', filters.keyword);
    return request(`/apps?${params.toString()}`);
  },
  create(payload: Omit<AppListing, 'id' | 'created_at'>): Promise<AppListing> {
    return request('/apps', { method: 'POST', body: JSON.stringify(payload) });
  },
};
