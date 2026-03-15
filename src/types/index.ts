// ─── User & Auth ───────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  preferences: UserPreferences;
  createdAt: string;
}

export interface UserPreferences {
  commuteTypes: CommuteType[];
  dietaryRestrictions: DietaryRestriction[];
  interests: Interest[];
  budgetRange: 'budget' | 'moderate' | 'luxury';
  pacePreference: 'relaxed' | 'moderate' | 'packed';
  currency: string;
  language: string;
  googleMapsApiKey?: string;
}

export type CommuteType =
  | 'walking'
  | 'uber'
  | 'grab'
  | 'taxi'
  | 'bus'
  | 'subway'
  | 'bike'
  | 'scooter'
  | 'car_rental'
  | 'tuk_tuk';

export type DietaryRestriction =
  | 'none'
  | 'vegan'
  | 'vegetarian'
  | 'halal'
  | 'kosher'
  | 'gluten_free'
  | 'nut_free'
  | 'dairy_free'
  | 'pescatarian';

export type Interest =
  | 'tourist_attractions'
  | 'nightlife'
  | 'restaurants'
  | 'shopping'
  | 'museums'
  | 'outdoor'
  | 'sports'
  | 'wellness'
  | 'photography'
  | 'local_experiences'
  | 'historical'
  | 'beaches';

// ─── Trips ─────────────────────────────────────────────────────────────────────

export interface Trip {
  id: string;
  userId: string;
  name: string;
  cities: CityEntry[];
  startDate: string;
  endDate: string;
  status: 'planning' | 'active' | 'completed';
  createdAt: string;
  coverImage?: string;
}

export interface CityEntry {
  id: string;
  tripId: string;
  name: string;
  country: string;
  countryCode: string;
  arrivalDate: string;
  departureDate: string;
  accommodation: Accommodation | null;
  itineraryDays: ItineraryDay[];
  lat: number;
  lng: number;
  timezone?: string;
}

export interface Accommodation {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  checkIn: string;
  checkOut: string;
  bookingPlatform?: string;
  bookingUrl?: string;
  type: 'hotel' | 'airbnb' | 'hostel' | 'resort' | 'apartment' | 'other';
}

// ─── Itinerary ─────────────────────────────────────────────────────────────────

export interface ItineraryDay {
  id: string;
  cityId: string;
  date: string;
  dayNumber: number;
  selectedOptionIndex: number;
  options: ItineraryOption[];
  isGenerated: boolean;
}

export interface ItineraryOption {
  id: string;
  optionNumber: number; // 1–5
  theme: ItineraryTheme;
  activities: Activity[];
  totalDistanceKm: number;
  totalDurationMin: number;
  startTime: string; // e.g. "09:00"
  highlight: string; // one-line description
}

export type ItineraryTheme =
  | 'classic_tourist'
  | 'culture_art'
  | 'foodie'
  | 'local_life'
  | 'adventure_nightlife'
  | 'fun_experiences';

export interface Activity {
  id: string;
  placeId?: string;
  name: string;
  type: ActivityType;
  category: ActivityCategory;
  description: string;
  address: string;
  lat: number;
  lng: number;
  durationMin: number;
  distanceFromPrevKm: number;
  travelTimeMin: number;
  rating: number;
  reviewCount: number;
  photos: string[];
  openingHours?: string;
  priceLevel: 0 | 1 | 2 | 3 | 4; // 0=free, 1=$, 2=$$, 3=$$$, 4=$$$$
  requiresBooking: boolean;
  bookingPlatforms: BookingPlatform[];
  tags: string[];
  isEssential: boolean;
  arrivalTime?: string; // calculated
  departureTime?: string; // calculated
}

export type ActivityType =
  | 'attraction'
  | 'museum'
  | 'restaurant'
  | 'cafe'
  | 'bar'
  | 'nightclub'
  | 'shopping'
  | 'park'
  | 'beach'
  | 'historical'
  | 'entertainment'
  | 'transport'
  | 'essential';

export type ActivityCategory =
  | 'tourist'
  | 'culture'
  | 'food'
  | 'nightlife'
  | 'shopping'
  | 'outdoor'
  | 'local_life'
  | 'entertainment'
  | 'essential';

export interface BookingPlatform {
  name: string;
  url: string;
  logo: string;
  category: 'restaurant' | 'hotel' | 'activity' | 'transport' | 'general';
}

export interface LatLng {
  lat: number;
  lng: number;
}

// ─── UI State ──────────────────────────────────────────────────────────────────

export interface MapMarker {
  id: string;
  position: LatLng;
  label: string;
  type: 'accommodation' | ActivityType;
  activity?: Activity;
}

export interface NewTripFormData {
  name: string;
  cities: NewCityData[];
  preferences: Partial<UserPreferences>;
}

export interface NewCityData {
  name: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  arrivalDate: string;
  departureDate: string;
  accommodation: Partial<Accommodation> | null;
}
