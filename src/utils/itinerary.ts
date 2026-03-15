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

// ─── Dietary Hard-Filter ──────────────────────────────────────────────────────

const ALCOHOL_KEYWORDS = ['alcohol', 'beer', 'wine', 'cocktail', 'cocktails', 'craft beer', 'craft drinks', 'spirits', 'pub', 'brewery', 'winery'];
const ALCOHOL_TYPES = ['bar', 'nightclub'];

function filterByDietary(pool: Activity[], dietary: string[] | undefined): Activity[] {
  if (!dietary?.length || dietary.includes('none')) return pool;

  const isHalalOrKosher = dietary.some(d => d === 'halal' || d === 'kosher');
  const isVegan = dietary.includes('vegan');
  const isVegetarian = dietary.includes('vegetarian') || isVegan;

  return pool.filter(p => {
    const tags = p.tags.join(' ').toLowerCase();
    const name = p.name.toLowerCase();

    // Hard-exclude alcohol venues for halal/kosher
    if (isHalalOrKosher) {
      if (ALCOHOL_TYPES.includes(p.type)) return false;
      if (ALCOHOL_KEYWORDS.some(kw => tags.includes(kw) || name.includes(kw))) return false;
    }

    // Exclude meat-heavy places for vegan/vegetarian (only if explicitly tagged)
    if (isVegetarian) {
      if (tags.includes('meat') || tags.includes('bbq') || tags.includes('steakhouse')) return false;
    }

    return true;
  });
}

// ─── Meal Injection ───────────────────────────────────────────────────────────

function buildMealSlot(
  mealType: 'lunch' | 'dinner',
  lat: number,
  lng: number,
  cityName: string,
  dietary: string[] | undefined,
  idx: number,
): Activity {
  const isHalal = dietary?.some(d => d === 'halal' || d === 'kosher');
  const isVegan = dietary?.includes('vegan');
  const isVeg = dietary?.includes('vegetarian') || isVegan;
  const prefix = isHalal ? 'Halal ' : isVegan ? 'Vegan ' : isVeg ? 'Vegetarian ' : '';
  const name = mealType === 'lunch' ? `${prefix}Lunch Stop` : `${prefix}Dinner Restaurant`;
  const durationMin = mealType === 'lunch' ? 60 : 90;
  const openingHours = mealType === 'lunch' ? '11:00 AM – 3:00 PM' : '6:00 PM – 11:00 PM';
  return {
    id: `meal-${mealType}-${idx}`,
    name,
    type: 'restaurant',
    category: 'food',
    description: `${mealType === 'lunch' ? 'Lunch' : 'Dinner'} break — grab a bite near your current location in ${cityName}.`,
    address: cityName,
    lat: lat + 0.0003,
    lng: lng + 0.0003,
    durationMin,
    distanceFromPrevKm: 0.2,
    travelTimeMin: 5,
    rating: 4.1,
    reviewCount: 0,
    photos: [],
    priceLevel: 1,
    requiresBooking: false,
    bookingPlatforms: [],
    tags: ['meal_break', mealType, 'restaurant'],
    openingHours,
    isEssential: false,
  };
}

/** Insert a lunch (~12:00) and dinner (~18:30) slot into an ordered activity list */
function injectMeals(
  activities: Activity[],
  theme: ItineraryTheme,
  startMinute: number,
  center: LatLng,
  cityName: string,
  dietary: string[] | undefined,
  commute: UserPreferences['commuteTypes'],
): Activity[] {
  // Foodie = already all food; nightlife starts at 19:00 so no lunch/dinner slot needed
  if (theme === 'foodie' || theme === 'adventure_nightlife') return activities;

  const LUNCH_MIN = 12 * 60;
  const DINNER_MIN = 18 * 60 + 30;

  const result: Activity[] = [];
  let clock = startMinute;
  let lunchDone = false;
  let dinnerDone = false;
  let mealIdx = 0;
  let lastLat = center.lat;
  let lastLng = center.lng;

  for (const act of activities) {
    clock += estimateTravelMin(act.distanceFromPrevKm || 0, commute);
    if (!lunchDone && clock >= LUNCH_MIN) {
      result.push(buildMealSlot('lunch', lastLat, lastLng, cityName, dietary, mealIdx++));
      clock += 60;
      lunchDone = true;
    }
    if (!dinnerDone && clock >= DINNER_MIN) {
      result.push(buildMealSlot('dinner', lastLat, lastLng, cityName, dietary, mealIdx++));
      clock += 90;
      dinnerDone = true;
    }
    result.push(act);
    clock += act.durationMin;
    lastLat = act.lat;
    lastLng = act.lng;
  }
  return result;
}

const THEMES: ItineraryTheme[] = [
  'classic_tourist', 'culture_art', 'foodie', 'local_life', 'adventure_nightlife', 'fun_experiences',
];

// ─── Theme Filtering ──────────────────────────────────────────────────────────

// Primary categories each theme should prioritise
const THEME_CATEGORIES: Record<ItineraryTheme, string[]> = {
  classic_tourist: ['tourist'],
  culture_art: ['culture'],
  foodie: ['food'],
  local_life: ['local_life', 'outdoor'],
  adventure_nightlife: ['nightlife'],
  fun_experiences: ['entertainment', 'tourist'],
};

// Secondary activity types that also fit each theme
const THEME_TYPES: Record<ItineraryTheme, string[]> = {
  classic_tourist: ['attraction', 'historical', 'park', 'entertainment'],
  culture_art: ['museum', 'historical', 'entertainment'],
  foodie: ['restaurant', 'cafe', 'attraction'], // 'attraction' covers food markets
  local_life: ['park', 'shopping', 'cafe', 'attraction'],
  adventure_nightlife: ['bar', 'nightclub', 'entertainment', 'attraction'],
  fun_experiences: ['entertainment', 'attraction', 'park'],
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
  const nonEssential = places.filter(p => {
    if (p.category === 'essential') return false;
    // Restaurants only belong in foodie days; other themes get injected meal slots
    if (p.type === 'restaurant' && theme !== 'foodie') return false;
    // Cafés only belong in foodie and local_life (morning coffee is a local-life activity)
    if (p.type === 'cafe' && theme !== 'foodie' && theme !== 'local_life') return false;
    // Bars/nightclubs only for adventure_nightlife
    if ((p.type === 'bar' || p.type === 'nightclub') && theme !== 'adventure_nightlife') return false;
    return true;
  });
  const tier1 = nonEssential.filter(p => cats.includes(p.category));
  const tier2 = nonEssential.filter(p => !cats.includes(p.category) && types.includes(p.type));
  const tier3 = nonEssential.filter(p => !cats.includes(p.category) && !types.includes(p.type));
  return [...tier1, ...tier2, ...tier3];
}

// ─── Generic Theme-Specific Fallback Activities ────────────────────────────────

type ActivityTemplate = Omit<Activity,
  'id' | 'lat' | 'lng' | 'address' | 'description' | 'rating' | 'reviewCount' |
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
    { name: 'Iconic Bridge or Waterfront', type: 'attraction', category: 'tourist', durationMin: 45, priceLevel: 0, requiresBooking: false, bookingPlatforms: [], tags: ['scenic', 'waterfront', 'photography', 'free'], openingHours: 'Open 24h' },
    { name: 'Royal Palace or Government Building', type: 'historical', category: 'tourist', durationMin: 75, priceLevel: 1, requiresBooking: false, bookingPlatforms: [BOOKING_PLATFORMS.getyourguide], tags: ['palace', 'royal', 'historic', 'architecture'], openingHours: '9:00 AM – 5:00 PM' },
    { name: 'City Panorama Cable Car / Gondola', type: 'attraction', category: 'tourist', durationMin: 90, priceLevel: 2, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.klook, BOOKING_PLATFORMS.viator], tags: ['cable car', 'views', 'scenic', 'city panorama'], openingHours: '9:00 AM – 9:00 PM' },
    { name: 'War Memorial & National Monument', type: 'historical', category: 'tourist', durationMin: 60, priceLevel: 0, requiresBooking: false, bookingPlatforms: [], tags: ['memorial', 'history', 'national', 'free'], openingHours: 'Open 24h' },
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
    { name: 'Photography & Visual Arts Museum', type: 'museum', category: 'culture', durationMin: 90, priceLevel: 1, requiresBooking: false, bookingPlatforms: [BOOKING_PLATFORMS.klook], tags: ['photography', 'visual arts', 'exhibitions'], openingHours: '10:00 AM – 7:00 PM' },
    { name: 'Ancient Ruins & Archaeological Site', type: 'historical', category: 'culture', durationMin: 120, priceLevel: 1, requiresBooking: false, bookingPlatforms: [BOOKING_PLATFORMS.getyourguide], tags: ['ruins', 'ancient', 'archaeology', 'outdoor'], openingHours: '8:00 AM – 6:00 PM' },
    { name: 'Music Heritage & Instrument Museum', type: 'museum', category: 'culture', durationMin: 90, priceLevel: 1, requiresBooking: false, bookingPlatforms: [], tags: ['music', 'heritage', 'instruments', 'culture'], openingHours: '9:00 AM – 5:00 PM' },
    { name: 'Literary & Writers Quarter Walking Tour', type: 'attraction', category: 'culture', durationMin: 90, priceLevel: 1, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.viator, BOOKING_PLATFORMS.getyourguide], tags: ['literary', 'writers', 'walking tour', 'history'], openingHours: '10:00 AM – 4:00 PM' },
  ],
  foodie: [
    { name: 'Local Food Market', type: 'attraction', category: 'food', durationMin: 90, priceLevel: 1, requiresBooking: false, bookingPlatforms: [BOOKING_PLATFORMS.klook], tags: ['market', 'street food', 'local produce'], openingHours: '6:00 AM – 2:00 PM' },
    { name: 'Iconic Local Restaurant', type: 'restaurant', category: 'food', durationMin: 90, priceLevel: 2, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.opentable, BOOKING_PLATFORMS.resy], tags: ['local cuisine', 'traditional', 'authentic'], openingHours: '12:00 PM – 11:00 PM' },
    { name: 'Street Food Tour', type: 'attraction', category: 'food', durationMin: 120, priceLevel: 1, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.viator, BOOKING_PLATFORMS.klook], tags: ['street food', 'guided', 'local bites'], openingHours: 'Morning & evening tours' },
    { name: 'Rooftop Fine Dining', type: 'restaurant', category: 'food', durationMin: 90, priceLevel: 3, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.resy, BOOKING_PLATFORMS.opentable], tags: ['views', 'upscale', 'fine dining'], openingHours: '6:00 PM – 11:00 PM' },
    { name: 'Artisan Café & Bakery', type: 'cafe', category: 'food', durationMin: 45, priceLevel: 1, requiresBooking: false, bookingPlatforms: [], tags: ['coffee', 'pastries', 'breakfast'], openingHours: '7:00 AM – 3:00 PM' },
    { name: 'Hands-On Cooking Class', type: 'entertainment', category: 'food', durationMin: 180, priceLevel: 3, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.viator, BOOKING_PLATFORMS.klook], tags: ['cooking', 'hands-on', 'local cuisine'], openingHours: 'Morning & afternoon sessions' },
    { name: 'Evening Night Market', type: 'attraction', category: 'food', durationMin: 120, priceLevel: 1, requiresBooking: false, bookingPlatforms: [BOOKING_PLATFORMS.klook], tags: ['night market', 'street food', 'local atmosphere'], openingHours: '5:00 PM – 11:00 PM' },
    { name: 'Dessert & Sweets Shop', type: 'cafe', category: 'food', durationMin: 45, priceLevel: 1, requiresBooking: false, bookingPlatforms: [], tags: ['desserts', 'sweets', 'local treats', 'casual'], openingHours: '10:00 AM – 10:00 PM' },
    { name: 'Wine / Sake / Tea Tasting Experience', type: 'entertainment', category: 'food', durationMin: 90, priceLevel: 2, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.viator, BOOKING_PLATFORMS.klook], tags: ['tasting', 'drinks', 'experience', 'local speciality'], openingHours: '11:00 AM – 6:00 PM' },
    { name: 'Famous Brunch Café & Breakfast Spot', type: 'cafe', category: 'food', durationMin: 75, priceLevel: 2, requiresBooking: false, bookingPlatforms: [BOOKING_PLATFORMS.opentable], tags: ['brunch', 'breakfast', 'café', 'morning'], openingHours: '8:00 AM – 3:00 PM' },
    { name: 'Specialty Coffee Roastery', type: 'cafe', category: 'food', durationMin: 45, priceLevel: 1, requiresBooking: false, bookingPlatforms: [], tags: ['specialty coffee', 'roastery', 'barista', 'third-wave'], openingHours: '8:00 AM – 5:00 PM' },
    { name: 'International Cuisine Quarter', type: 'attraction', category: 'food', durationMin: 90, priceLevel: 2, requiresBooking: false, bookingPlatforms: [], tags: ['diverse cuisine', 'ethnic food', 'neighbourhood', 'variety'], openingHours: '12:00 PM – 10:00 PM' },
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
    { name: 'Community Sports Park & Recreation', type: 'park', category: 'outdoor', durationMin: 60, priceLevel: 0, requiresBooking: false, bookingPlatforms: [], tags: ['sports', 'community', 'outdoor', 'free'], openingHours: '6:00 AM – 10:00 PM' },
    { name: 'Scenic Cycling or Running Trail', type: 'park', category: 'outdoor', durationMin: 90, priceLevel: 0, requiresBooking: false, bookingPlatforms: [], tags: ['cycling', 'running', 'trail', 'scenic', 'active'], openingHours: 'Open 24h' },
    { name: 'Urban Village & Hidden Alley Exploration', type: 'attraction', category: 'local_life', durationMin: 75, priceLevel: 0, requiresBooking: false, bookingPlatforms: [], tags: ['urban village', 'alleyways', 'discovery', 'local life', 'free'], openingHours: 'Open 24h' },
    { name: 'Rooftop Garden & Urban Farm', type: 'attraction', category: 'local_life', durationMin: 60, priceLevel: 1, requiresBooking: false, bookingPlatforms: [], tags: ['rooftop', 'garden', 'urban farm', 'green space'], openingHours: '9:00 AM – 5:00 PM' },
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
    { name: 'Speakeasy & Hidden Cocktail Bar', type: 'bar', category: 'nightlife', durationMin: 90, priceLevel: 3, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.resy], tags: ['speakeasy', 'hidden bar', 'cocktails', 'secret'], openingHours: '7:00 PM – 2:00 AM' },
    { name: 'Sunrise Viewpoint Hike', type: 'attraction', category: 'outdoor', durationMin: 120, priceLevel: 0, requiresBooking: false, bookingPlatforms: [], tags: ['sunrise', 'hike', 'viewpoint', 'early morning', 'adventure'], openingHours: 'Dawn' },
    { name: 'Electronic Music & DJ Set Night', type: 'nightclub', category: 'nightlife', durationMin: 180, priceLevel: 2, requiresBooking: false, bookingPlatforms: [BOOKING_PLATFORMS.klook], tags: ['electronic music', 'DJ', 'nightlife', 'dancing'], openingHours: '10:00 PM – 5:00 AM' },
    { name: 'Late-Night Street Food Hunt', type: 'attraction', category: 'food', durationMin: 90, priceLevel: 1, requiresBooking: false, bookingPlatforms: [], tags: ['late night', 'street food', 'casual', 'local eats'], openingHours: '9:00 PM – 2:00 AM' },
  ],
  fun_experiences: [
    { name: 'Immersive Digital Art Exhibition', type: 'entertainment', category: 'entertainment', durationMin: 120, priceLevel: 3, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.klook, BOOKING_PLATFORMS.viator], tags: ['digital art', 'immersive', 'interactive', 'teamlab', 'unique'], openingHours: '10:00 AM – 9:00 PM' },
    { name: 'Observation Deck & Sky View', type: 'attraction', category: 'tourist', durationMin: 90, priceLevel: 2, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.klook, BOOKING_PLATFORMS.getyourguide], tags: ['views', 'skyline', 'photography', 'rooftop', 'observation deck'], openingHours: '10:00 AM – 10:30 PM' },
    { name: 'Escape Room Adventure', type: 'entertainment', category: 'entertainment', durationMin: 90, priceLevel: 2, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.klook], tags: ['escape room', 'puzzle', 'group activity', 'adventure'], openingHours: '10:00 AM – 10:00 PM' },
    { name: 'Indoor Go-Kart Racing', type: 'entertainment', category: 'entertainment', durationMin: 90, priceLevel: 3, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.klook], tags: ['go-kart', 'racing', 'adrenaline', 'fun'], openingHours: '10:00 AM – 9:00 PM' },
    { name: 'VR & Interactive Experience Centre', type: 'entertainment', category: 'entertainment', durationMin: 90, priceLevel: 2, requiresBooking: false, bookingPlatforms: [BOOKING_PLATFORMS.klook], tags: ['VR', 'virtual reality', 'interactive', 'tech', 'gaming'], openingHours: '10:00 AM – 9:00 PM' },
    { name: 'Amusement Park / Theme Park', type: 'park', category: 'entertainment', durationMin: 240, priceLevel: 3, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.klook, BOOKING_PLATFORMS.viator], tags: ['theme park', 'rides', 'thrill', 'family fun', 'amusement'], openingHours: '9:00 AM – 9:00 PM' },
    { name: 'Arcade & Game Center', type: 'entertainment', category: 'entertainment', durationMin: 90, priceLevel: 1, requiresBooking: false, bookingPlatforms: [], tags: ['arcade', 'games', 'fun', 'casual', 'gaming'], openingHours: '11:00 AM – 11:00 PM' },
    { name: 'Unique City Experience Tour', type: 'attraction', category: 'entertainment', durationMin: 120, priceLevel: 2, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.viator, BOOKING_PLATFORMS.klook], tags: ['unique', 'local experience', 'guided', 'adventure', 'city'], openingHours: '9:00 AM – 6:00 PM' },
    { name: 'Indoor Rock Climbing Wall', type: 'entertainment', category: 'entertainment', durationMin: 120, priceLevel: 2, requiresBooking: false, bookingPlatforms: [BOOKING_PLATFORMS.klook], tags: ['rock climbing', 'fitness', 'adventure', 'indoor'], openingHours: '9:00 AM – 10:00 PM' },
    { name: 'Trampoline & Adventure Park', type: 'entertainment', category: 'entertainment', durationMin: 90, priceLevel: 2, requiresBooking: false, bookingPlatforms: [BOOKING_PLATFORMS.klook], tags: ['trampoline', 'adventure park', 'jumping', 'fun', 'active'], openingHours: '10:00 AM – 9:00 PM' },
    { name: 'City Segway or E-Scooter Tour', type: 'attraction', category: 'entertainment', durationMin: 120, priceLevel: 2, requiresBooking: true, bookingPlatforms: [BOOKING_PLATFORMS.viator, BOOKING_PLATFORMS.getyourguide], tags: ['segway', 'e-scooter', 'city tour', 'fun', 'guided'], openingHours: '9:00 AM – 6:00 PM' },
    { name: 'Planetarium & Science Discovery Centre', type: 'museum', category: 'entertainment', durationMin: 120, priceLevel: 1, requiresBooking: false, bookingPlatforms: [BOOKING_PLATFORMS.klook], tags: ['planetarium', 'science', 'space', 'discovery', 'interactive'], openingHours: '10:00 AM – 6:00 PM' },
  ],
};

/** Simple deterministic hash of a city name (returns 0–65535) */
function cityHash(name: string): number {
  let h = 5381;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) + h + name.charCodeAt(i)) & 0xffff;
  }
  return Math.abs(h);
}

/** Build theme-specific generic activities positioned around the city center.
 *  Picks 8 out of 12 templates using a deterministic city-name hash so every
 *  city gets a different (but consistent) subset. */
function buildGenericActivities(
  theme: ItineraryTheme,
  center: LatLng,
  cityName: string,
): Activity[] {
  const templates = THEME_GENERIC[theme];
  const PICK = Math.min(8, templates.length);

  // Deterministic Fisher-Yates shuffle seeded by city name
  const indices = Array.from({ length: templates.length }, (_, i) => i);
  let seed = cityHash(cityName);
  for (let i = indices.length - 1; i > 0; i--) {
    seed = ((seed * 1664525) + 1013904223) & 0x7fffffff;
    const j = Math.abs(seed) % (i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  // Pick first PICK indices and sort to preserve original template ordering
  const pickedIndices = indices.slice(0, PICK).sort((a, b) => a - b);
  const selected = pickedIndices.map(idx => templates[idx]);

  const offsets: [number, number][] = [
    [0.006, 0.004], [-0.005, 0.007], [0.008, -0.003], [-0.004, -0.006],
    [0.007, 0.008], [-0.009, 0.002], [0.003, -0.009], [0.010, 0.005],
  ];
  const ratings = [4.2, 4.4, 4.1, 4.5, 4.3, 4.6, 4.0, 4.7];
  const reviewCounts = [1200, 3400, 890, 5600, 2100, 780, 4300, 1900];

  return selected.map((t, i) => {
    const [dLat, dLng] = offsets[i];
    return {
      ...t,
      id: `gen-${theme}-${pickedIndices[i]}`,
      address: cityName,
      lat: center.lat + dLat,
      lng: center.lng + dLng,
      description: `${t.name} — a top ${theme.replace(/_/g, ' ')} experience in ${cityName}.`,
      rating: ratings[i],
      reviewCount: reviewCounts[i],
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

      // Apply dietary hard-filter (halal/kosher/vegan/vegetarian)
      pool = filterByDietary(pool, prefs.dietaryRestrictions);

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
      const startMinute = theme === 'adventure_nightlife' ? 19 * 60 : 9 * 60;
      const withMeals = injectMeals(optimised, theme, startMinute, center, cityName, prefs.dietaryRestrictions, prefs.commuteTypes ?? ['walking']);
      const scheduled = scheduleTimes(withMeals, startTime, prefs.commuteTypes ?? ['walking']);
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

    // Filter previously visited + dietary restrictions
    const available = filterByDietary(
      themePool.filter(p => !previouslyVisited.includes(p.id)),
      prefs.dietaryRestrictions,
    );
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
    const startMinute = theme === 'adventure_nightlife' ? 19 * 60 : 9 * 60;
    const withMeals = injectMeals(optimised, theme, startMinute, center, cityName, prefs.dietaryRestrictions, prefs.commuteTypes ?? ['walking']);
    const scheduled = scheduleTimes(withMeals, startTime, prefs.commuteTypes ?? ['walking']);
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
