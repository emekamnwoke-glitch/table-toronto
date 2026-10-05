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
  code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
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
  if (!res.ok) throw new ApiError(res.status, body.error ?? `API returned ${res.status}`, body.code)
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

// ---- The diner journey (docs/product/first-slice-diner-journey.md) ----

export interface RecommendedRestaurant {
  id: string
  name: string
  address: string
  neighbourhood: string | null
  lng: number
  lat: number
}

export interface RecommendationItem {
  rank: number
  restaurant: RecommendedRestaurant
  distanceKm: number
  reason: string
}

export interface Recommendation {
  recommendationId: string
  rankedBy: 'proximity'
  rankingVersion: string
  radiusKm: number
  request: { partySize: number; date: string; time: string; requestedDiningTime: string }
  items: RecommendationItem[]
  notice: string
}

export interface RecommendationRequest {
  lat: number
  lng: number
  party_size: number
  date: string
  time: string
  session_id: string
  location_source: 'device' | 'map_pick'
}

export interface Slot {
  startsAt: string
  localTime: string
  token: string
  expiresAt: string
}

export interface Availability {
  restaurantId: string
  slots: Slot[]
  simulated: boolean
  notice?: string
}

export interface ReservationResult {
  outcome: 'confirmed' | 'redirect'
  reservation?: { id: string; startsAt: string; partySize: number; simulated: boolean }
  url?: string
  simulated: boolean
  providerId: string
  notice?: string
}

export const recommend = (token: string, body: RecommendationRequest) =>
  request<Recommendation>('/api/v1/recommendations', { method: 'POST', body: JSON.stringify(body) }, token)

export const fetchAvailability = (token: string, restaurantId: string, r: Recommendation['request']) =>
  request<Availability>(
    `/api/v1/restaurants/${restaurantId}/availability?party_size=${r.partySize}&date=${r.date}&time=${r.time}`,
    {},
    token,
  )

/** Client-reported behaviour events. The server decides `simulated`. */
export type ClientEvent =
  | {
      event_id: string
      event_name: 'restaurant_opened'
      occurred_at: string
      session_id: string
      recommendation_id: string
      restaurant_id: string
      rank: number
    }
  | {
      event_id: string
      event_name: 'reservation_intent'
      occurred_at: string
      session_id: string
      recommendation_id: string
      restaurant_id: string
      party_size: number
      requested_dining_time: string
    }

export const postEvents = (token: string, events: ClientEvent[]) =>
  request<{ received: number; recorded: number }>(
    '/api/v1/events',
    { method: 'POST', body: JSON.stringify({ events }) },
    token,
  )

export const reserve = (
  token: string,
  body: {
    recommendation_id: string
    restaurant_id: string
    session_id: string
    slot_token: string
    party_size: number
    idempotency_key: string
  },
) => request<ReservationResult>('/api/v1/reservations', { method: 'POST', body: JSON.stringify(body) }, token)

export const cancelReservation = (token: string, reservationId: string) =>
  request<{ reservation: { id: string; status: 'cancelled' }; simulated: boolean; notice?: string }>(
    `/api/v1/reservations/${reservationId}/cancel`,
    { method: 'POST' },
    token,
  )
