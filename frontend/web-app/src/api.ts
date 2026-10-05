export interface Restaurant {
  id: string
  operating_name: string
  address: string
  cuisine: string | null
  price_level: number | null
  accessible: boolean
  neighbourhood: string | null
  lng: number
  lat: number
}

export interface User {
  id: string
  role: 'diner' | 'manager'
  email: string
  displayName: string | null
  cuisinePreferences: string[]
  budgetPreference: number | null
  diningStyle: string | null
  accessibilityNeeds: string[]
  onboarded: boolean
}

export type Preferences = Partial<
  Pick<User, 'cuisinePreferences' | 'budgetPreference' | 'diningStyle' | 'accessibilityNeeds' | 'displayName'>
> & { /** Marks onboarding finished or skipped; one-way. */ onboarded?: true }

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, body.error ?? `API returned ${res.status}`)
  return body as T
}

export async function fetchRestaurants(limit = 10000): Promise<Restaurant[]> {
  return (await request<{ restaurants: Restaurant[] }>(`/api/v1/restaurants?limit=${limit}`)).restaurants
}

export const register = (email: string, password: string, displayName: string) =>
  request<{ token: string; user: User }>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, displayName }),
  })

export const login = (email: string, password: string) =>
  request<{ token: string; user: User }>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })

export const fetchMe = (token: string) =>
  request<{ user: User }>('/api/v1/users/me', {}, token).then((r) => r.user)

export const savePreferences = (token: string, prefs: Preferences) =>
  request<{ user: User }>(
    '/api/v1/users/me/preferences',
    { method: 'PATCH', body: JSON.stringify(prefs) },
    token,
  ).then((r) => r.user)

export interface MerchantRestaurant {
  id: string
  name: string
  address: string
  neighbourhood: string | null
  lng: number
  lat: number
  cuisine: string | null
  priceLevel: number | null
  accessible: boolean
  seatingCapacity: number | null
  holdWindowMinutes: number
}

export type RestaurantEdit = Partial<
  Pick<MerchantRestaurant, 'cuisine' | 'priceLevel' | 'accessible' | 'seatingCapacity' | 'holdWindowMinutes'>
>

export const fetchMyRestaurant = (token: string) =>
  request<{ restaurant: MerchantRestaurant }>('/api/v1/merchant/restaurant', {}, token).then((r) => r.restaurant)

export const saveMyRestaurant = (token: string, edit: RestaurantEdit) =>
  request<{ restaurant: MerchantRestaurant }>(
    '/api/v1/merchant/restaurant',
    { method: 'PATCH', body: JSON.stringify(edit) },
    token,
  ).then((r) => r.restaurant)
