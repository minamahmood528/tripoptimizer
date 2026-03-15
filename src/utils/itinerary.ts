import type {
  Activity, Accommodation, ItineraryDay, ItineraryOption, ItineraryTheme,
  UserPreferences, LatLng,
} from '../types';
import { MOCK_PLACES, THEME_LABELS, BOOKING_PLATFORMS } from './mockData';
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

const SPEED_KMH: Record<string, number> = {
  walking: 4.5, bike: 12, scooter: 25, bus: 20,
  subway: 30, uber: 35, grab: 35, taxi: 35, car_rental: 40, tuk_tuk: 20,
};

export function estimateTravelMin(distKm: number, commute: UserPreferences['commuteTypes']): number {
  const primary = commute?.[0] ?? 'walking';
  const speed = SPEED_KMH[primary] ?? 20;
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

function scheduleTimes(
  activities: Activity[],
  startTime: string,
  commute: UserPreferences['commuteTypes'],
): Activity[] {
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

const THEMES: ItineraryTheme[] = [
  'classic_tourist', 'culture_art', 'foodie', 'local_life', 'adventure_nightlife',
];

// ─── Theme Filtering ──────────────────────────────────────────────────────────

// Primary categories each theme should prioritise
const THEME_CATEGORIES: Record<ItineraryTheme, string[]> = {
  classic_tourist: ['tourist'],
  culture_art: ['culture'],
  foodie: ['food'],
  local_life: ['local_life', 'outdoor'],
  adventure_nightlife: ['nightlife'],
};

// Secondary activity types that also fit each theme
const THEME_TYPES: Record<ItineraryTheme, string[]> = {
  classic_tourist: ['attraction', 'historical', 'park', 'entertainment'],
  culture_art: ['museum', 'historical', 'entertainment'],
  foodie: ['restaurant', 'cafe', 'attraction'], // 'attraction' covers food markets
  local_life: ['park', 'shopping', 'cafe', 'attraction'],
  adventure_nightlife: ['bar', 'nightclub', 'entertainment', 'attraction'],
};

/**
 * Sort/rank places by theme relevance:
 *   Tier 1 — exact category match
 *   Tier 2 — type match (but different category)
 *   Tier 3 — everything else non-essential
 */
function rankByTheme(places: Activity[], theme: ItineraryTheme): Activity[] {
  const cats = THEME_CATEGORIES[theme];
  const types = THEME_TYPES[theme];
  const nonEssential = places.filter(p => p.category !== 'essential');
  const tier1 = nonEssential.filter(p => cats.includes(p.category));
  const tier2 = nonEssential.filter(p => !cats.includes(p.category) && types.includes(p.type));
  const tier3 = nonEssential.filter(p => !cats.includes(p.category) && !types.includes(p.type));
  return [...tier1, ...tier2, ...tier3];
}

// ─── Generic Theme-Specific Fallback Activities ────────────────────────────────

type ActivityTemplate = Omit<Activity,
  'id' | 'lat' | 'lng' | 'description' | 'rating' | 'reviewCount' |
  'photos' | 'distanceFromPrevKm' | 'travelTimeMin' | 'isEssential'
>;

const THEME_GENERIC: Record<ItineraryTheme, ActivityTemplate[]> = {
  classic_tourist: [
    { name: 'City Main Square', type: 'attraction', category: 'tourist', durationMin: 45, priceLevel: 0, requiresBooking: false, bookingPlatforms: [], tags: ['landmark', 'free', 'central'], openingHours: 'Open 24h' },
    { name: 'Old Town Walking Tour', type: 'attraction', category: 'tourist', durationMin: 120, priceLevel: 1, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.getyourguide, BOOKING_PLATFORMS.viator], tags: ['guided', 'historic', 'walking'], openingHours: '9:00 AM – 6:00 PM' },
    { name: 'Scenic Viewpoint', type: 'attraction', category: 'tourist', durationMin: 45, priceLevel: 0, requiresBooking: false, bookingPlatforms: [], tags: ['views', 'photography', 'free'], openingHours: 'Open 24h' },
    { name: 'Historic City Museum', type: 'museum', category: 'culture', durationMin: 90, priceLevel: 1, requiresBooking: false, bookingPlatforms: [BOOKING_PLATFORMS.getyourguide], tags: ['history', 'culture'], openingHours: '9:00 AM – 5:00 PM' },
    { name: 'Main Cathedral / Temple', type: 'historical', category: 'culture', durationMin: 60, priceLevel: 0, requiresBooking: false, bookingPlatforms: [], tags: ['architecture', 'historic', 'free'], openingHours: '8:00 AM – 6:00 PM' },
    { name: 'City Park & Gardens', type: 'park', category: 'outdoor', durationMin: 60, priceLevel: 0, requiresBooking: false, bookingPlatforms: [], tags: ['nature', 'relax', 'free'], openingHours: '6:00 AM – dusk' },
    { name: 'Heritage Monument', type: 'historical', category: 'tourist', durationMin: 45, priceLevel: 0, requiresBooking: false, bookingPlatforms: [], tags: ['history', 'free', 'landmark'], openingHours: 'Open 24h' },
    { name: 'Souvenir & Craft Market', type: 'shopping', category: 'shopping', durationMin: 60, priceLevel: 1, requiresBooking: false, bookingPlatforms: [], tags: ['souvenirs', 'local crafts'], openingHours: '9:00 AM – 7:00 PM' },
  ],
  culture_art: [
    { name: 'National Art Museum', type: 'museum', category: 'culture', durationMin: 150, priceLevel: 2, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.getyourguide], tags: ['art', 'national', 'masterpieces'], openingHours: '9:30 AM – 6:00 PM' },
    { name: 'Contemporary Art Gallery', type: 'museum', category: 'culture', durationMin: 90, priceLevel: 1, requiresBooking: false, bookingPlatforms: [BOOKING_PLATFORMS.klook], tags: ['modern art', 'gallery', 'exhibitions'], openingHours: '10:00 AM – 6:00 PM' },
    { name: 'Historic Palace & Gardens', type: 'historical', category: 'culture', durationMin: 120, priceLevel: 2, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.getyourguide, BOOKING_PLATFORMS.viator], tags: ['palace', 'history', 'architecture'], openingHours: '9:00 AM – 5:00 PM' },
    { name: 'Traditional Performing Arts Show', type: 'entertainment', category: 'culture', durationMin: 90, priceLevel: 2, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.klook, BOOKING_PLATFORMS.viator], tags: ['performance', 'traditional', 'cultural'], openingHours: '2:00 PM & 7:00 PM shows' },
    { name: 'Street Art & Mural District', type: 'attraction', category: 'culture', durationMin: 60, priceLevel: 0, requiresBooking: false, bookingPlatforms: [], tags: ['street art', 'murals', 'free'], openingHours: 'Open 24h' },
    { name: 'Archaeology & History Museum', type: 'museum', category: 'culture', durationMin: 120, priceLevel: 1, requiresBooking: false, bookingPlatforms: [BOOKING_PLATFORMS.getyourguide], tags: ['archaeology', 'ancient', 'artifacts'], openingHours: '9:00 AM – 5:00 PM' },
    { name: 'Traditional Craft Workshop', type: 'entertainment', category: 'culture', durationMin: 90, priceLevel: 2, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.klook], tags: ['hands-on', 'traditional', 'workshop'], openingHours: '10:00 AM – 4:00 PM' },
    { name: 'Grand Opera / Theatre', type: 'entertainment', category: 'culture', durationMin: 150, priceLevel: 3, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.viator], tags: ['performance', 'arts', 'evening'], openingHours: 'Evening shows from 7:00 PM' },
  ],
  foodie: [
    { name: 'Local Food Market', type: 'attraction', category: 'food', durationMin: 90, priceLevel: 1, requiresBooking: false, bookingPlatforms: [BOOKING_PLATFORMS.klook], tags: ['market', 'street food', 'local produce'], openingHours: '6:00 AM – 2:00 PM' },
    { name: 'Iconic Local Restaurant', type: 'restaurant', category: 'food', durationMin: 90, priceLevel: 2, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.opentable, BOOKING_PLATFORMS.resy], tags: ['local cuisine', 'traditional', 'authentic'], openingHours: '12:00 PM – 11:00 PM' },
    { name: 'Street Food Tour', type: 'attraction', category: 'food', durationMin: 120, priceLevel: 1, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.viator, BOOKING_PLATFORMS.klook], tags: ['street food', 'guided', 'local bites'], openingHours: 'Morning & evening tours' },
    { name: 'Rooftop Fine Dining', type: 'restaurant', category: 'food', durationMin: 90, priceLevel: 3, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.resy, BOOKING_PLATFORMS.opentable], tags: ['views', 'upscale', 'fine dining'], openingHours: '6:00 PM – 11:00 PM' },
    { name: 'Artisan Café & Bakery', type: 'cafe', category: 'food', durationMin: 45, priceLevel: 1, requiresBooking: false, bookingPlatforms: [], tags: ['coffee', 'pastries', 'breakfast'], openingHours: '7:00 AM – 3:00 PM' },
    { name: 'Hands-On Cooking Class', type: 'entertainment', category: 'food', durationMin: 180, priceLevel: 3, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.viator, BOOKING_PLATFORMS.klook], tags: ['cooking', 'hands-on', 'local cuisine'], openingHours: 'Morning & afternoon sessions' },
    { name: 'Evening Night Market', type: 'attraction', category: 'food', durationMin: 120, priceLevel: 1, requiresBooking: false, bookingPlatforms: [BOOKING_PLATFORMS.klook], tags: ['night market', 'street food', 'local atmosphere'], openingHours: '5:00 PM – 11:00 PM' },
    { name: 'Craft Beer / Wine Bar', type: 'bar', category: 'food', durationMin: 60, priceLevel: 2, requiresBooking: false, bookingPlatforms: [], tags: ['craft drinks', 'local scene', 'casual'], openingHours: '4:00 PM – 12:00 AM' },
  ],
  local_life: [
    { name: 'Neighbourhood Walk & Explore', type: 'attraction', category: 'local_life', durationMin: 90, priceLevel: 0, requiresBooking: false, bookingPlatforms: [], tags: ['local streets', 'hidden gems', 'free'], openingHours: 'Open 24h' },
    { name: 'Local Farmers Market', type: 'attraction', category: 'local_life', durationMin: 60, priceLevel: 1, requiresBooking: false, bookingPlatforms: [], tags: ['market', 'fresh produce', 'community'], openingHours: 'Weekend mornings' },
    { name: 'Botanical Garden', type: 'park', category: 'outdoor', durationMin: 90, priceLevel: 1, requiresBooking: false, bookingPlatforms: [], tags: ['nature', 'gardens', 'peaceful'], openingHours: '8:00 AM – 5:00 PM' },
    { name: 'Local Independent Café', type: 'cafe', category: 'food', durationMin: 60, priceLevel: 1, requiresBooking: false, bookingPlatforms: [], tags: ['coffee', 'local vibe', 'neighbourhood café'], openingHours: '7:00 AM – 6:00 PM' },
    { name: 'Artisan Boutique Quarter', type: 'shopping', category: 'shopping', durationMin: 90, priceLevel: 2, requiresBooking: false, bookingPlatforms: [], tags: ['boutiques', 'local designers', 'unique finds'], openingHours: '10:00 AM – 7:00 PM' },
    { name: 'Riverside / Waterfront Walk', type: 'park', category: 'outdoor', durationMin: 60, priceLevel: 0, requiresBooking: false, bookingPlatforms: [], tags: ['scenic', 'walking', 'free'], openingHours: 'Open 24h' },
    { name: 'Weekend Flea & Antique Market', type: 'shopping', category: 'local_life', durationMin: 90, priceLevel: 1, requiresBooking: false, bookingPlatforms: [], tags: ['vintage', 'antiques', 'treasure hunting'], openingHours: 'Weekends 9:00 AM – 4:00 PM' },
    { name: 'Off-the-Beaten-Path Viewpoint', type: 'attraction', category: 'local_life', durationMin: 30, priceLevel: 0, requiresBooking: false, bookingPlatforms: [], tags: ['views', 'secret spot', 'photography'], openingHours: 'Open 24h' },
  ],
  adventure_nightlife: [
    { name: 'Rooftop Cocktail Bar', type: 'bar', category: 'nightlife', durationMin: 90, priceLevel: 3, requiresBooking: false, bookingPlatforms: [BOOKING_PLATFORMS.resy], tags: ['rooftop', 'cocktails', 'sunset views'], openingHours: '5:00 PM – 2:00 AM' },
    { name: 'Live Music Venue', type: 'entertainment', category: 'nightlife', durationMin: 120, priceLevel: 2, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.klook], tags: ['live music', 'local bands', 'evening'], openingHours: '8:00 PM onwards' },
    { name: 'Night Club & Dance Bar', type: 'nightclub', category: 'nightlife', durationMin: 180, priceLevel: 2, requiresBooking: false, bookingPlatforms: [], tags: ['clubbing', 'dancing', 'late night'], openingHours: '10:00 PM – 4:00 AM' },
    { name: 'Sunset Boat Cruise', type: 'attraction', category: 'tourist', durationMin: 120, priceLevel: 3, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.viator, BOOKING_PLATFORMS.klook], tags: ['sunset', 'scenic cruise', 'city views'], openingHours: 'Sunset departures' },
    { name: 'Escape Room Challenge', type: 'entertainment', category: 'nightlife', durationMin: 90, priceLevel: 2, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.klook], tags: ['puzzle', 'adventure', 'group activity'], openingHours: '10:00 AM – 10:00 PM' },
    { name: 'Comedy & Improv Show', type: 'entertainment', category: 'nightlife', durationMin: 120, priceLevel: 2, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.viator], tags: ['comedy', 'entertainment', 'evening show'], openingHours: 'Evening shows 7:00 PM' },
    { name: 'Night Street Food Tour', type: 'attraction', category: 'food', durationMin: 120, priceLevel: 2, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.klook, BOOKING_PLATFORMS.viator], tags: ['night market', 'street food', 'guided'], openingHours: '6:00 PM – 10:00 PM' },
    { name: 'Karaoke & Drinks Night', type: 'entertainment', category: 'nightlife', durationMin: 120, priceLevel: 1, requiresBooking: false, bookingPlatforms: [], tags: ['karaoke', 'fun night out', 'group activity'], openingHours: '7:00 PM – 2:00 AM' },
  ],
};

/** Build theme-specific generic activities positioned around the city center */
function buildGenericActivities(
  theme: ItineraryTheme,
  center: LatLng,
  cityName: string,
): Activity[] {
  const templates = THEME_GENERIC[theme];
  // Deterministic offsets so the same city always generates the same map positions
  const offsets: [number, number][] = [
    [0.006, 0.004], [-0.005, 0.007], [0.008, -0.003], [-0.004, -0.006],
    [0.007, 0.008], [-0.009, 0.002], [0.003, -0.009], [0.010, 0.005],
  ];
  const ratings = [4.2, 4.4, 4.1, 4.5, 4.3, 4.6, 4.0, 4.7];
  const reviewCounts = [1200, 3400, 890, 5600, 2100, 780, 4300, 1900];

  return templates.map((t, i) => {
    const [dLat, dLng] = offsets[i % offsets.length];
    return {
      ...t,
      id: `gen-${theme}-${i}`,
      lat: center.lat + dLat,
      lng: center.lng + dLng,
      description: `${t.name} — a top ${theme.replace(/_/g, ' ')} experience in ${cityName}.`,
      rating: ratings[i % ratings.length],
      reviewCount: reviewCounts[i % reviewCounts.length],
      photos: [],
      distanceFromPrevKm: 0,
      travelTimeMin: 0,
      isEssential: false,
    } as Activity;
  });
}

// ─── Fetch Real Places (with mock / generic fallback) ─────────────────────────

async function fetchPlacesForTheme(
  theme: ItineraryTheme,
  center: LatLng,
  cityName: string,
  hasApiKey: boolean,
): Promise<Activity[]> {
  if (hasApiKey && (window as any).google?.maps?.places) {
    const typeGroups = THEME_SEARCH_TYPES[theme] ?? [['tourist_attraction']];
    const allResults: Activity[] = [];
    for (const types of typeGroups) {
      const results = await searchNearbyPlaces(center, types, 5000);
      allResults.push(...results);
    }
    return allResults;
  }
  // Fallback: mock data with theme ranking, or generic theme activities
  const cityPlaces = MOCK_PLACES[cityName] ?? [];
  if (cityPlaces.length > 0) return rankByTheme(cityPlaces, theme);
  return buildGenericActivities(theme, center, cityName);
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

      // Filter out previously visited places
      let pool = allPlaces.filter(
        p => !previouslyVisited.includes(p.id) && !previouslyVisited.includes(p.placeId ?? ''),
      );

      // For real Google Places data, rank by theme relevance within the results
      if (hasApiKey) pool = rankByTheme(pool, theme);

      // Apply dietary filter for food options
      if (prefs.dietaryRestrictions?.length && !prefs.dietaryRestrictions.includes('none')) {
        const dietary = pool.filter(p => {
          if (p.category !== 'food') return true;
          const tags = p.tags.join(' ').toLowerCase();
          return prefs.dietaryRestrictions.some(d => tags.includes(d.replace('_', '-')));
        });
        if (dietary.length >= 2) pool = dietary;
      }

      const selected = pool.slice(0, maxPlaces);
      const optimised = nearestNeighbour(center, selected);

      if (optimised.length) {
        optimised[0] = {
          ...optimised[0],
          distanceFromPrevKm: parseFloat(
            haversineKm(center, { lat: optimised[0].lat, lng: optimised[0].lng }).toFixed(2),
          ),
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

// ─── Synchronous (mock only, used at trip-creation time) ─────────────────────

export function generateItineraryOptions(
  accommodation: Accommodation,
  cityName: string,
  dayNumber: number,
  previouslyVisited: string[],
  prefs: UserPreferences,
): ItineraryOption[] {
  const center: LatLng = { lat: accommodation.lat, lng: accommodation.lng };
  const maxPlaces = PLACE_COUNTS[prefs.pacePreference ?? 'moderate'];

  return THEMES.map((theme, idx) => {
    // Theme-filtered city places, or generic themed activities as fallback
    const cityPlaces = MOCK_PLACES[cityName] ?? [];
    const themePool = cityPlaces.length > 0
      ? rankByTheme(cityPlaces, theme)
      : buildGenericActivities(theme, center, cityName);

    // Filter previously visited
    const available = themePool.filter(p => !previouslyVisited.includes(p.id));
    const selected = available.slice(0, maxPlaces);
    const optimised = nearestNeighbour(center, selected);

    if (optimised.length) {
      optimised[0] = {
        ...optimised[0],
        distanceFromPrevKm: parseFloat(
          haversineKm(center, { lat: optimised[0].lat, lng: optimised[0].lng }).toFixed(2),
        ),
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
  const options = generateItineraryOptions(
    accommodation, cityName, dayNumber, previouslyVisited, prefs,
  );
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

/** Compute travel time estimates for multiple commute types at a given distance */
export function getCommuteOptions(
  distKm: number,
  selectedTypes: UserPreferences['commuteTypes'],
): Array<{ emoji: string; label: string; minutes: number }> {
  if (!distKm || distKm === 0) return [];

  // Group user's selected commute types into display categories
  const GROUPS = [
    {
      key: 'walk',
      emoji: '🚶',
      label: 'walk',
      types: ['walking', 'bike', 'scooter'],
    },
    {
      key: 'drive',
      emoji: '🚗',
      label: 'drive',
      types: ['uber', 'grab', 'taxi', 'car_rental', 'tuk_tuk'],
    },
    {
      key: 'transit',
      emoji: '🚌',
      label: 'transit',
      types: ['bus', 'subway'],
    },
  ] as const;

  const result: Array<{ emoji: string; label: string; minutes: number }> = [];
  for (const group of GROUPS) {
    const userType = selectedTypes?.find(t => (group.types as readonly string[]).includes(t));
    if (userType) {
      const speed = SPEED_KMH[userType] ?? 20;
      const minutes = Math.round((distKm / speed) * 60) + 5;
      result.push({ emoji: group.emoji, label: group.label, minutes });
    }
  }
  return result;
}
