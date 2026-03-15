/**
 * Real Google Places API integration.
 * All place data is fetched live from Google — no mock data needed when an API key is configured.
 */

import type { Activity, ActivityType, ActivityCategory, LatLng, BookingPlatform, UserPreferences } from '../types';
import { BOOKING_PLATFORMS } from './mockData';

// ─── Place Type Mappings ──────────────────────────────────────────────────────

const GOOGLE_TYPE_TO_ACTIVITY: Record<string, { type: ActivityType; category: ActivityCategory }> = {
  tourist_attraction: { type: 'attraction', category: 'tourist' },
  museum: { type: 'museum', category: 'culture' },
  art_gallery: { type: 'museum', category: 'culture' },
  church: { type: 'historical', category: 'culture' },
  hindu_temple: { type: 'historical', category: 'culture' },
  mosque: { type: 'historical', category: 'culture' },
  place_of_worship: { type: 'historical', category: 'culture' },
  synagogue: { type: 'historical', category: 'culture' },
  restaurant: { type: 'restaurant', category: 'food' },
  food: { type: 'restaurant', category: 'food' },
  cafe: { type: 'cafe', category: 'food' },
  bakery: { type: 'cafe', category: 'food' },
  meal_takeaway: { type: 'restaurant', category: 'food' },
  meal_delivery: { type: 'restaurant', category: 'food' },
  bar: { type: 'bar', category: 'nightlife' },
  night_club: { type: 'nightclub', category: 'nightlife' },
  casino: { type: 'nightclub', category: 'nightlife' },
  bowling_alley: { type: 'entertainment', category: 'nightlife' },
  shopping_mall: { type: 'shopping', category: 'shopping' },
  store: { type: 'shopping', category: 'shopping' },
  clothing_store: { type: 'shopping', category: 'shopping' },
  jewelry_store: { type: 'shopping', category: 'shopping' },
  shoe_store: { type: 'shopping', category: 'shopping' },
  electronics_store: { type: 'shopping', category: 'shopping' },
  department_store: { type: 'shopping', category: 'shopping' },
  book_store: { type: 'shopping', category: 'shopping' },
  park: { type: 'park', category: 'outdoor' },
  natural_feature: { type: 'park', category: 'outdoor' },
  campground: { type: 'park', category: 'outdoor' },
  amusement_park: { type: 'entertainment', category: 'tourist' },
  movie_theater: { type: 'entertainment', category: 'nightlife' },
  stadium: { type: 'entertainment', category: 'tourist' },
  zoo: { type: 'attraction', category: 'tourist' },
  aquarium: { type: 'attraction', category: 'tourist' },
  hospital: { type: 'essential', category: 'essential' },
  pharmacy: { type: 'essential', category: 'essential' },
  embassy: { type: 'essential', category: 'essential' },
  police: { type: 'essential', category: 'essential' },
};

// ─── Theme Search Types ───────────────────────────────────────────────────────

export const THEME_SEARCH_TYPES: Record<string, string[][]> = {
  classic_tourist: [['tourist_attraction'], ['museum'], ['restaurant']],
  culture_art: [['museum'], ['art_gallery'], ['church', 'mosque', 'hindu_temple']],
  foodie: [['restaurant'], ['cafe', 'bakery'], ['food', 'meal_takeaway']],
  local_life: [['park'], ['shopping_mall', 'store'], ['restaurant', 'cafe']],
  adventure_nightlife: [['bar', 'night_club'], ['amusement_park', 'bowling_alley'], ['restaurant']],
  essentials: [['hospital'], ['pharmacy'], ['police', 'embassy']],
};

// ─── Booking Platform Links (dynamic URL construction) ─────────────────────

function getBookingPlatforms(type: ActivityType, category: ActivityCategory, name: string, address: string): BookingPlatform[] {
  const encoded = encodeURIComponent(name);
  const encodedAddr = encodeURIComponent(`${name} ${address}`);

  if (category === 'food' || type === 'restaurant' || type === 'cafe') {
    return [
      { ...BOOKING_PLATFORMS.opentable, url: `https://www.opentable.com/s/?term=${encoded}` },
      { ...BOOKING_PLATFORMS.resy, url: `https://resy.com/cities/anywhere?query=${encoded}` },
      { ...BOOKING_PLATFORMS.yelp, url: `https://www.yelp.com/search?find_desc=${encoded}` },
    ];
  }
  if (category === 'tourist' || category === 'culture') {
    return [
      { ...BOOKING_PLATFORMS.getyourguide, url: `https://www.getyourguide.com/s/?q=${encodedAddr}` },
      { ...BOOKING_PLATFORMS.viator, url: `https://www.viator.com/searchResults/all?text=${encoded}` },
      { ...BOOKING_PLATFORMS.klook, url: `https://www.klook.com/en-US/search/?query=${encoded}` },
    ];
  }
  if (category === 'nightlife') {
    return [
      { ...BOOKING_PLATFORMS.klook, url: `https://www.klook.com/en-US/search/?query=${encoded}` },
      { ...BOOKING_PLATFORMS.getyourguide, url: `https://www.getyourguide.com/s/?q=${encodedAddr}` },
    ];
  }
  return [];
}

// ─── Convert Google Place to Activity ─────────────────────────────────────────

function placeToActivity(
  place: google.maps.places.PlaceResult,
  distanceFromPrev: number,
  prefs: UserPreferences,
): Activity | null {
  if (!place.geometry?.location || !place.name) return null;

  // Find best type mapping
  const googleTypes = place.types ?? [];
  let mapped = { type: 'attraction' as ActivityType, category: 'tourist' as ActivityCategory };
  for (const gt of googleTypes) {
    if (GOOGLE_TYPE_TO_ACTIVITY[gt]) {
      mapped = GOOGLE_TYPE_TO_ACTIVITY[gt];
      break;
    }
  }

  const name = place.name;
  const address = place.formatted_address ?? place.vicinity ?? '';
  const lat = place.geometry.location.lat();
  const lng = place.geometry.location.lng();
  const rating = place.rating ?? 3.5;
  const priceLevel = (place.price_level ?? 1) as 0 | 1 | 2 | 3 | 4;
  const isEssential = mapped.category === 'essential';

  // Estimate duration based on type
  const durationMap: Partial<Record<ActivityType, number>> = {
    museum: 120, attraction: 90, restaurant: 75, cafe: 45, bar: 90,
    nightclub: 150, shopping: 90, park: 60, historical: 60, entertainment: 120, essential: 30,
  };
  const durationMin = durationMap[mapped.type] ?? 60;

  // Booking logic: places with reservations tend to be restaurants, tours, shows
  const requiresBooking = ['restaurant', 'nightclub', 'entertainment', 'museum'].includes(mapped.type);
  const bookingPlatforms = requiresBooking
    ? getBookingPlatforms(mapped.type, mapped.category, name, address)
    : [];

  // Photos from Google
  const photos = place.photos?.slice(0, 3).map((p) => p.getUrl({ maxWidth: 600 })) ?? [];

  // Opening hours
  const openingHours = place.opening_hours?.weekday_text?.[new Date().getDay()]
    ?? place.opening_hours?.isOpen?.() !== undefined
    ? (place.opening_hours?.isOpen?.() ? 'Open now' : 'Closed')
    : undefined;

  return {
    id: place.place_id ?? `place_${Date.now()}_${Math.random()}`,
    placeId: place.place_id,
    name,
    type: mapped.type,
    category: mapped.category,
    description: (place as any).editorial_summary?.overview
      ?? `${name} is a popular ${mapped.type.replace('_', ' ')} in the area.`,
    address,
    lat,
    lng,
    durationMin,
    distanceFromPrevKm: distanceFromPrev,
    travelTimeMin: 0, // set by scheduler
    rating,
    reviewCount: place.user_ratings_total ?? 0,
    photos,
    openingHours,
    priceLevel,
    requiresBooking,
    bookingPlatforms,
    tags: googleTypes.slice(0, 4).map((t) => t.replace(/_/g, ' ')),
    isEssential,
  };
}

// ─── Nearby Search (single page, used by itinerary builder) ──────────────────

export async function searchNearbyPlaces(
  center: LatLng,
  types: string[],
  radius = 5000,
): Promise<Activity[]> {
  if (!window.google?.maps?.places) return [];

  const service = new window.google.maps.places.PlacesService(
    document.createElement('div'),
  );

  const results = await new Promise<google.maps.places.PlaceResult[]>((resolve) => {
    service.nearbySearch(
      { location: center, radius, type: types[0] as any },
      (res, status) => {
        resolve(status === window.google.maps.places.PlacesServiceStatus.OK && res ? res : []);
      },
    );
  });

  return results
    .filter((p) => p.geometry?.location && p.name)
    .map((p) => placeToActivity(p, 0, {} as UserPreferences))
    .filter((a): a is Activity => a !== null)
    .sort((a, b) => b.rating - a.rating);
}

// ─── Streaming Nearby Search (Explore page — up to 3 pages / ~60 results) ────
// Kept for backward compat but Explore now uses streamCitywidePlaces.

export function streamNearbyPlaces(
  center: LatLng,
  type: string,
  radius: number,
  onBatch: (places: Activity[]) => void,
  onComplete: () => void,
): void {
  if (!window.google?.maps?.places) { onComplete(); return; }

  const service = new window.google.maps.places.PlacesService(document.createElement('div'));
  let totalFetched = 0;

  const handle = (
    res: google.maps.places.PlaceResult[] | null,
    status: google.maps.places.PlacesServiceStatus,
    pagination: google.maps.places.PlaceSearchPagination | null,
  ) => {
    if (status === window.google.maps.places.PlacesServiceStatus.OK && res) {
      totalFetched += res.length;
      const batch = res
        .filter((p) => p.geometry?.location && p.name)
        .map((p) => placeToActivity(p, 0, {} as UserPreferences))
        .filter((a): a is Activity => a !== null);
      onBatch(batch);
    }
    if (pagination?.hasNextPage && totalFetched < 60) {
      setTimeout(() => pagination.nextPage(), 2200);
    } else {
      onComplete();
    }
  };

  service.nearbySearch({ location: center, radius, type: type as any }, handle);
}

// ─── City-wide Grid Search (Explore page) ────────────────────────────────────
// Runs 5 parallel searches across a cross-shaped grid (center + N/S/E/W)
// so every part of the city is covered, not just the famous downtown cluster.
// Each zone uses a 10 km radius; zones are offset ~7 km so they overlap.
// Total: up to 5 × 20 = 100 unique results, arriving in parallel.

export function streamCitywidePlaces(
  center: LatLng,
  type: string,
  onBatch: (places: Activity[]) => void,
  onComplete: () => void,
): void {
  if (!window.google?.maps?.places) { onComplete(); return; }

  // Offsets: ~7 km in lat/lng degrees (0.063° lat ≈ 7 km; 0.09° lng ≈ 7 km at mid-lat)
  const DL = 0.063;
  const DG = 0.09;
  const zones: LatLng[] = [
    center,
    { lat: center.lat + DL, lng: center.lng },         // North
    { lat: center.lat - DL, lng: center.lng },         // South
    { lat: center.lat,       lng: center.lng + DG },   // East
    { lat: center.lat,       lng: center.lng - DG },   // West
  ];

  const seen = new Set<string>();
  let completedZones = 0;

  zones.forEach((zoneCenter) => {
    const service = new window.google.maps.places.PlacesService(document.createElement('div'));
    service.nearbySearch(
      { location: zoneCenter, radius: 10000, type: type as any },
      (res, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && res) {
          const fresh = res
            .filter((p) => p.geometry?.location && p.name && !seen.has(p.place_id ?? ''))
            .map((p) => {
              seen.add(p.place_id ?? `${p.name}_${Math.random()}`);
              return placeToActivity(p, 0, {} as UserPreferences);
            })
            .filter((a): a is Activity => a !== null);
          if (fresh.length > 0) onBatch(fresh);
        }
        completedZones++;
        if (completedZones === zones.length) onComplete();
      },
    );
  });
}

// ─── Fetch Place Details ──────────────────────────────────────────────────────

export async function getPlaceDetails(placeId: string): Promise<google.maps.places.PlaceResult | null> {
  if (!window.google?.maps?.places) return null;
  const service = new window.google.maps.places.PlacesService(document.createElement('div'));
  return new Promise((resolve) => {
    service.getDetails(
      {
        placeId,
        fields: ['name', 'formatted_address', 'geometry', 'rating', 'opening_hours',
          'photos', 'price_level', 'types', 'user_ratings_total', 'editorial_summary', 'url'],
      },
      (result, status) => {
        resolve(status === window.google.maps.places.PlacesServiceStatus.OK ? result : null);
      },
    );
  });
}

// ─── Directions / Route ───────────────────────────────────────────────────────

export interface RouteStep {
  from: LatLng;
  to: LatLng;
  distanceKm: number;
  durationMin: number;
  travelMode: 'WALKING' | 'DRIVING' | 'TRANSIT';
}

export async function getDirections(
  waypoints: LatLng[],
  travelMode: 'WALKING' | 'DRIVING' | 'TRANSIT' = 'WALKING',
): Promise<{ totalKm: number; totalMin: number; steps: RouteStep[]; polylinePath: LatLng[] } | null> {
  if (!window.google?.maps || waypoints.length < 2) return null;

  const directionsService = new window.google.maps.DirectionsService();

  const origin = waypoints[0];
  const destination = waypoints[waypoints.length - 1];
  const stops = waypoints.slice(1, -1).map((wp) => ({
    location: new window.google.maps.LatLng(wp.lat, wp.lng),
    stopover: true,
  }));

  return new Promise((resolve) => {
    directionsService.route(
      {
        origin: new window.google.maps.LatLng(origin.lat, origin.lng),
        destination: new window.google.maps.LatLng(destination.lat, destination.lng),
        waypoints: stops,
        optimizeWaypoints: false,
        travelMode: window.google.maps.TravelMode[travelMode],
      },
      (result, status) => {
        if (status !== 'OK' || !result) { resolve(null); return; }

        const legs = result.routes[0].legs;
        let totalKm = 0;
        let totalMin = 0;
        const steps: RouteStep[] = [];
        const polylinePath: LatLng[] = [];

        legs.forEach((leg, i) => {
          totalKm += (leg.distance?.value ?? 0) / 1000;
          totalMin += (leg.duration?.value ?? 0) / 60;
          steps.push({
            from: waypoints[i],
            to: waypoints[i + 1],
            distanceKm: (leg.distance?.value ?? 0) / 1000,
            durationMin: (leg.duration?.value ?? 0) / 60,
            travelMode,
          });
          leg.steps.forEach((s) => {
            s.path?.forEach((p) => polylinePath.push({ lat: p.lat(), lng: p.lng() }));
          });
        });

        resolve({ totalKm, totalMin, steps, polylinePath });
      },
    );
  });
}
