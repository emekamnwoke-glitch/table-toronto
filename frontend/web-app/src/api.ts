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

export async function fetchRestaurants(limit = 10000): Promise<Restaurant[]> {
  const res = await fetch(`/api/v1/restaurants?limit=${limit}`)
  if (!res.ok) throw new Error(`API returned ${res.status}`)
  const body = await res.json()
  return body.restaurants
}
