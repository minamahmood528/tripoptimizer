import type {
  Activity, Accommodation, ItineraryDay, ItineraryOption, ItineraryTheme,
  UserPreferences, LatLng,
} from '../types';
import { MOCK_PLACES, THEME_LABELS } from './mockData';
import { searchNearbyPlaces, THEME_SEARCH_TYPES } from './googlePlaces';

// ─── Distance Calculation ─────────────────────────────────────────────────────

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

// ─── Travel Time Estimate ─────────────────────────────────────────────────────

export function estimateTravelMin(distKm: number, commute: UserPreferences['commuteTypes']): number {
  const primary = commute?.[0] ?? 'walking';
  const speedKmH: Record<string, number> = {
    walking: 4.5, bike: 12, scooter: 25, bus: 20,
    subway: 30, uber: 35, grab: 35, taxi: 35, car_rental: 40, tuk_tuk: 20,
  };
  const speed = speedKmH[primary] ?? 20;
  return Math.round((distKm / speed) * 60) + 5;
}

// ─── Nearest-Neighbour Route Optimisation ─────────────────────────────────────

export function nearestNeighbour(start: LatLng, places: Activity[]): Activity[] {
  if (!places.length) return [];
  const remaining = [...places];
  const route: Activity[] = [];
  let current: LatLng = start;

  while (remaining.length) {
    let nearest = 0;
    let minDist = Infinity;
    remaining.forEach((p, i) => {
      const d = haversineKm(current, { lat: p.lat, lng: p.lng });
      if (d < minDist) { minDist = d; nearest = i; }
    });
    const picked = remaining.splice(nearest, 1)[0];
    route.push({ ...picked, distanceFromPrevKm: parseFloat(minDist.toFixed(2)) });
    current = { lat: picked.lat, lng: picked.lng };
  }
  return route;
}

// ─── Time Scheduling ──────────────────────────────────────────────────────────

function scheduleTimes(activities: Activity[], startTime: string, commute: UserPreferences['commuteTypes']): Activity[] {
  let [h, m] = startTime.split(':').map(Number);
  return activities.map((act) => {
    const arrivalTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    m += act.durationMin;
    h += Math.floor(m / 60); m = m % 60;
    const departureTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const travelMin = estimateTravelMin(act.distanceFromPrevKm || 0, commute);
    m += travelMin;
    h += Math.floor(m / 60); m = m % 60;
    return { ...act, arrivalTime, departureTime, travelTimeMin: travelMin };
  });
}

const PLACE_COUNTS: Record<NonNullable<UserPreferences['pacePreference']>, number> = {
  relaxed: 4, moderate: 6, packed: 8,
};

const THEMES: ItineraryTheme[] = ['classic_tourist', 'culture_art', 'foodie', 'local_life', 'adventure_nightlife'];

// ─── Fetch Real Places (with mock fallback) ────────────────────────────────────

async function fetchPlacesForTheme(
  theme: ItineraryTheme,
  center: LatLng,
  cityName: string,
  hasApiKey: boolean,
): Promise<Activity[]> {
  if (hasApiKey && (window as any).google?.maps?.places) {
    // Real Google Places API call
    const typeGroups = THEME_SEARCH_TYPES[theme] ?? [['tourist_attraction']];
    const allResults: Activity[] = [];
    for (const types of typeGroups) {
      const results = await searchNearbyPlaces(center, types, 5000);
      allResults.push(...results);
    }
    return allResults;
  }
  // Fallback: mock data
  return MOCK_PLACES[cityName] ?? [];
}

// ─── Generate All 5 Options (async — uses real API when available) ─────────────

export async function generateItineraryOptionsAsync(
  accommodation: Accommodation,
  cityName: string,
  dayNumber: number,
  previouslyVisited: string[],
  prefs: UserPreferences,
): Promise<ItineraryOption[]> {
  const center: LatLng = { lat: accommodation.lat, lng: accommodation.lng };
  const hasApiKey = !!(prefs.googleMapsApiKey);
  const maxPlaces = PLACE_COUNTS[prefs.pacePreference ?? 'moderate'];

  const options: ItineraryOption[] = await Promise.all(
    THEMES.map(async (theme, idx) => {
      const allPlaces = await fetchPlacesForTheme(theme, center, cityName, hasApiKey);

      // Filter out previously visited
      const available = allPlaces.filter(
        (p) => !previouslyVisited.includes(p.id) && !previouslyVisited.includes(p.placeId ?? ''),
      );

      // Apply dietary filter
      let pool = available;
      if (prefs.dietaryRestrictions?.length && !prefs.dietaryRestrictions.includes('none')) {
        const dietary = available.filter((p) => {
          if (p.category !== 'food') return true;
          const tags = p.tags.join(' ').toLowerCase();
          return prefs.dietaryRestrictions.some((d) => tags.includes(d.replace('_', '-')));
        });
        if (dietary.length >= 2) pool = dietary;
      }

      const selected = pool.slice(0, maxPlaces);
      const optimised = nearestNeighbour(center, selected);

      // Set distance from accommodation for first stop
      if (optimised.length) {
        optimised[0] = {
          ...optimised[0],
          distanceFromPrevKm: parseFloat(haversineKm(center, { lat: optimised[0].lat, lng: optimised[0].lng }).toFixed(2)),
        };
      }

      const startTime = theme === 'adventure_nightlife' ? '19:00' : '09:00';
      const scheduled = scheduleTimes(optimised, startTime, prefs.commuteTypes ?? ['walking']);

      const totalDistance = scheduled.reduce((s, a) => s + (a.distanceFromPrevKm || 0), 0);
      const totalDuration = scheduled.reduce((s, a) => s + a.durationMin + (a.travelTimeMin || 0), 0);

      return {
        id: `option-${dayNumber}-${theme}`,
        optionNumber: idx + 1,
        theme,
        activities: scheduled,
        totalDistanceKm: parseFloat(totalDistance.toFixed(1)),
        totalDurationMin: totalDuration,
        startTime,
        highlight: THEME_LABELS[theme].description,
      } as ItineraryOption;
    }),
  );

  return options;
}

// ─── Synchronous fallback (mock only) ────────────────────────────────────────

export function generateItineraryOptions(
  accommodation: Accommodation,
  cityName: string,
  dayNumber: number,
  previouslyVisited: string[],
  prefs: UserPreferences,
): ItineraryOption[] {
  const center: LatLng = { lat: accommodation.lat, lng: accommodation.lng };
  const maxPlaces = PLACE_COUNTS[prefs.pacePreference ?? 'moderate'];
  const cityPlaces = MOCK_PLACES[cityName] ?? [];

  return THEMES.map((theme, idx) => {
    const available = cityPlaces.filter((p) => !previouslyVisited.includes(p.id));
    const selected = available.slice(0, maxPlaces);
    const optimised = nearestNeighbour(center, selected);

    if (optimised.length) {
      optimised[0] = {
        ...optimised[0],
        distanceFromPrevKm: parseFloat(haversineKm(center, { lat: optimised[0].lat, lng: optimised[0].lng }).toFixed(2)),
      };
    }

    const startTime = theme === 'adventure_nightlife' ? '19:00' : '09:00';
    const scheduled = scheduleTimes(optimised, startTime, prefs.commuteTypes ?? ['walking']);
    const totalDistance = scheduled.reduce((s, a) => s + (a.distanceFromPrevKm || 0), 0);
    const totalDuration = scheduled.reduce((s, a) => s + a.durationMin + (a.travelTimeMin || 0), 0);

    return {
      id: `option-${dayNumber}-${theme}`,
      optionNumber: idx + 1,
      theme,
      activities: scheduled,
      totalDistanceKm: parseFloat(totalDistance.toFixed(1)),
      totalDurationMin: totalDuration,
      startTime,
      highlight: THEME_LABELS[theme].description,
    } as ItineraryOption;
  });
}

// ─── Build a full ItineraryDay ─────────────────────────────────────────────────

export function buildItineraryDay(
  cityId: string,
  date: string,
  dayNumber: number,
  accommodation: Accommodation,
  cityName: string,
  previouslyVisited: string[],
  prefs: UserPreferences,
): ItineraryDay {
  const options = generateItineraryOptions(accommodation, cityName, dayNumber, previouslyVisited, prefs);
  return {
    id: `day-${cityId}-${dayNumber}`,
    cityId,
    date,
    dayNumber,
    selectedOptionIndex: 0,
    options,
    isGenerated: true,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getPriceLevelLabel(level: number): string {
  return ['Free', '$', '$$', '$$$', '$$$$'][level] ?? '?';
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function getCategoryIcon(type: string): string {
  const icons: Record<string, string> = {
    attraction: '🏛️', museum: '🎨', restaurant: '🍽️', cafe: '☕', bar: '🍺',
    nightclub: '🎵', shopping: '🛍️', park: '🌿', beach: '🏖️', historical: '🏰',
    entertainment: '🎭', transport: '🚌', essential: '🏥', accommodation: '🏨',
  };
  return icons[type] ?? '📍';
}
