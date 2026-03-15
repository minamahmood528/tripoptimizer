import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Compass, Loader2, RefreshCw, Navigation, Search, X, Star, ArrowUpDown, ChevronDown } from 'lucide-react';
import { useAuth, DIETARY_OPTIONS } from '../context/AuthContext';
import { streamCitywidePlaces, getDirections } from '../utils/googlePlaces';
import { getPriceLevelLabel } from '../utils/itinerary';
import TripMap from '../components/maps/TripMap';
import ActivityCard from '../components/cards/ActivityCard';
import AddToTripModal from '../components/explore/AddToTripModal';
import type { Activity, Accommodation, DietaryRestriction, LatLng } from '../types';
import clsx from 'clsx';
import { useGoogleMaps } from '../hooks/useGoogleMaps';

const FILTER_TYPES = [
  { label: 'Attractions', emoji: '🏛️', types: ['tourist_attraction', 'zoo', 'aquarium', 'amusement_park'] },
  { label: 'Food',        emoji: '🍜', types: ['restaurant', 'meal_takeaway', 'meal_delivery', 'bakery'] },
  { label: 'Cafés',       emoji: '☕', types: ['cafe', 'bakery'] },
  { label: 'Nightlife',   emoji: '🍺', types: ['bar', 'night_club', 'casino', 'liquor_store'] },
  { label: 'Shopping',    emoji: '🛍️', types: ['shopping_mall', 'clothing_store', 'department_store', 'electronics_store'] },
  { label: 'Museums',     emoji: '🎨', types: ['museum', 'art_gallery', 'library'] },
  { label: 'Parks',       emoji: '🌿', types: ['park', 'campground', 'natural_feature', 'rv_park'] },
  { label: 'Activities',  emoji: '🎯', types: ['amusement_park', 'bowling_alley', 'movie_theater', 'gym'] },
  { label: 'Sports',      emoji: '🏟️', types: ['stadium', 'gym', 'park'] },
  { label: 'Religious',   emoji: '⛪', types: ['church', 'mosque', 'synagogue', 'hindu_temple'] },
  { label: 'Spas',        emoji: '💆', types: ['spa', 'beauty_salon', 'hair_care'] },
];

const FOOD_CATEGORIES = new Set(['Food', 'Cafés']);

const INTEREST_TO_FILTER: Record<string, string> = {
  tourist_attractions: 'Attractions', nightlife: 'Nightlife', restaurants: 'Food',
  shopping: 'Shopping', museums: 'Museums', outdoor: 'Parks', wellness: 'Spas',
  sports: 'Sports', historical: 'Museums', beaches: 'Parks',
  photography: 'Attractions', local_experiences: 'Food',
};

const DIETARY_KEYWORDS: Partial<Record<DietaryRestriction, string>> = {
  halal: 'halal', vegan: 'vegan', vegetarian: 'vegetarian', kosher: 'kosher',
  gluten_free: 'gluten free', pescatarian: 'pescatarian',
  dairy_free: 'dairy free', nut_free: 'nut free',
};

type SortOption = 'top_rated' | 'most_reviewed' | 'a_z' | 'z_a' | 'price_low' | 'price_high' | 'nearest';

const SORT_OPTIONS: { value: SortOption; label: string; emoji: string }[] = [
  { value: 'top_rated',     label: 'Top Rated',    emoji: '⭐' },
  { value: 'most_reviewed', label: 'Most Reviews', emoji: '💬' },
  { value: 'nearest',       label: 'Nearest',      emoji: '📍' },
  { value: 'a_z',           label: 'A → Z',        emoji: '🔤' },
  { value: 'z_a',           label: 'Z → A',        emoji: '🔤' },
  { value: 'price_low',     label: 'Cheapest',     emoji: '💸' },
  { value: 'price_high',    label: 'Priciest',     emoji: '💎' },
];

const PRICE_OPTIONS = [
  { value: 0,  label: 'Free 🆓' },
  { value: 1,  label: '$' },
  { value: 2,  label: '$$' },
  { value: 3,  label: '$$$' },
  { value: 4,  label: '$$$$' },
];

const RATING_OPTIONS = [
  { value: 0,   label: 'Any' },
  { value: 3.5, label: '3.5+' },
  { value: 4.0, label: '4.0+' },
  { value: 4.5, label: '4.5+' },
];

const EXPLORE_MARKER_COLOR = '#7C3AED';

const getTypes = (label: string): string[] =>
  FILTER_TYPES.find((f) => f.label === label)?.types ?? ['tourist_attraction'];

const approxDist = (a: LatLng, b: LatLng) =>
  Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 111 * Math.cos(a.lat * Math.PI / 180));

export default function ExplorePage() {
  const { user } = useAuth();
  const apiKey = user?.preferences?.googleMapsApiKey ?? '';
  const { isLoaded } = useGoogleMaps(apiKey);

  const profileInterests = user?.preferences?.interests ?? [];
  const profileDietary = (user?.preferences?.dietaryRestrictions ?? []).filter(
    (d) => d !== 'none',
  ) as DietaryRestriction[];

  const getInitialFilter = (): string => {
    for (const interest of profileInterests) {
      const label = INTEREST_TO_FILTER[interest];
      if (label) return label;
    }
    return 'Attractions';
  };

  // ── Category filter ───────────────────────────────────────────────────────
  const [filter, setFilter] = useState(getInitialFilter());

  // ── Sort & Filter panel state — all multi-select except sort + rating ─────
  const [sortBy, setSortBy] = useState<SortOption>('top_rated');
  const [priceFilters, setPriceFilters] = useState<number[]>([]);       // empty = all
  const [minRating, setMinRating] = useState<number>(0);
  const [dietaryFilters, setDietaryFilters] = useState<DietaryRestriction[]>(
    FOOD_CATEGORIES.has(getInitialFilter()) ? profileDietary : [],
  );
  const [showSortFilter, setShowSortFilter] = useState(false);

  // ── Search state ──────────────────────────────────────────────────────────
  const [places, setPlaces] = useState<Activity[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [mapCenter, setMapCenter] = useState<LatLng | null>(null);
  const [searchCenter, setSearchCenter] = useState<LatLng | null>(null);
  const [locationLabel, setLocationLabel] = useState<string>('');
  const [geoStatus, setGeoStatus] = useState<'loading' | 'ok' | 'denied' | 'unsupported'>('loading');
  const [showSearchHere, setShowSearchHere] = useState(false);
  const [pendingCenter, setPendingCenter] = useState<LatLng | null>(null);

  const [popupActivity, setPopupActivity] = useState<Activity | null>(null);
  const [modalActivity, setModalActivity] = useState<Activity | null>(null);

  // Travel time
  const [userGpsLocation, setUserGpsLocation] = useState<LatLng | null>(null);
  type TravelModeKey = 'WALKING' | 'DRIVING' | 'TRANSIT' | 'BICYCLING';
  const [travelMode, setTravelMode] = useState<TravelModeKey>('WALKING');
  const [travelTimes, setTravelTimes] = useState<Partial<Record<TravelModeKey, number | null>>>({});
  const [travelLoading, setTravelLoading] = useState(false);

  const initialSearchDone = useRef(false);
  const searchAbortRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch travel times for all modes from user GPS to selected place
  const fetchTravelTimes = useCallback(async (destination: LatLng, fromLoc: LatLng) => {
    setTravelLoading(true);
    setTravelTimes({});
    const modes: TravelModeKey[] = ['WALKING', 'DRIVING', 'TRANSIT', 'BICYCLING'];
    const results: Partial<Record<TravelModeKey, number | null>> = {};
    await Promise.all(
      modes.map(async (mode) => {
        try {
          const res = await getDirections([fromLoc, destination], mode === 'BICYCLING' ? 'DRIVING' : mode);
          results[mode] = res?.totalMin ?? null;
        } catch {
          results[mode] = null;
        }
      }),
    );
    setTravelTimes(results);
    setTravelLoading(false);
  }, []);

  const handleCardClick = useCallback((place: Activity) => {
    setPopupActivity((prev) => {
      const next = prev?.id === place.id ? null : place;
      if (next && userGpsLocation) {
        fetchTravelTimes({ lat: next.lat, lng: next.lng }, userGpsLocation);
      } else if (next) {
        setTravelTimes({});
      }
      return next;
    });
  }, [userGpsLocation, fetchTravelTimes]);

  // Multi-select toggle helpers
  const toggleDietary = (val: DietaryRestriction) =>
    setDietaryFilters((prev) => prev.includes(val) ? prev.filter((d) => d !== val) : [...prev, val]);

  const togglePrice = (val: number) =>
    setPriceFilters((prev) => prev.includes(val) ? prev.filter((p) => p !== val) : [...prev, val]);

  // Build keyword string from multiple dietary selections
  const buildDietaryKeyword = (diets: DietaryRestriction[]): string | undefined => {
    const keywords = diets.map((d) => DIETARY_KEYWORDS[d]).filter(Boolean) as string[];
    return keywords.length > 0 ? keywords.join(' ') : undefined;
  };

  // Clear dietary when leaving food categories
  useEffect(() => {
    if (!FOOD_CATEGORIES.has(filter)) setDietaryFilters([]);
  }, [filter]);

  // ── Derived: filtered + sorted places ─────────────────────────────────────
  const filteredSortedPlaces = useMemo(() => {
    let result = [...places];
    if (priceFilters.length > 0) result = result.filter((p) => priceFilters.includes(p.priceLevel));
    if (minRating > 0) result = result.filter((p) => p.rating >= minRating);
    switch (sortBy) {
      case 'top_rated':     result.sort((a, b) => b.rating - a.rating); break;
      case 'most_reviewed': result.sort((a, b) => b.reviewCount - a.reviewCount); break;
      case 'a_z':           result.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'z_a':           result.sort((a, b) => b.name.localeCompare(a.name)); break;
      case 'price_low':     result.sort((a, b) => a.priceLevel - b.priceLevel); break;
      case 'price_high':    result.sort((a, b) => b.priceLevel - a.priceLevel); break;
      case 'nearest':
        if (searchCenter) result.sort((a, b) => approxDist(searchCenter, a) - approxDist(searchCenter, b));
        break;
    }
    return result;
  }, [places, sortBy, priceFilters, minRating, searchCenter]);

  // Pan map to selected place when a card is clicked
  useEffect(() => {
    if (popupActivity) {
      setMapCenter({ lat: popupActivity.lat, lng: popupActivity.lng });
      setShowSearchHere(false);
    }
  }, [popupActivity]);

  const isFoodCategory = FOOD_CATEGORIES.has(filter);
  const activeFilterCount =
    (priceFilters.length > 0 ? 1 : 0) +
    (minRating > 0 ? 1 : 0) +
    (sortBy !== 'top_rated' ? 1 : 0) +
    (isFoodCategory && dietaryFilters.length > 0 ? 1 : 0);

  const resetAll = () => {
    setSortBy('top_rated');
    setPriceFilters([]);
    setMinRating(0);
    setDietaryFilters([]);
  };

  // ── 1. Geolocation on mount ───────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoStatus('unsupported');
      const fb = { lat: 48.8566, lng: 2.3522 };
      setMapCenter(fb); setSearchCenter(fb); setLocationLabel('Paris');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMapCenter(loc); setSearchCenter(loc); setGeoStatus('ok');
        setUserGpsLocation(loc);
        if (window.google?.maps) {
          new window.google.maps.Geocoder().geocode({ location: loc }, (results, status) => {
            if (status === 'OK' && results?.[0]) {
              const comp = results[0].address_components?.find((c) =>
                c.types.includes('locality') || c.types.includes('administrative_area_level_1'),
              );
              if (comp) setLocationLabel(comp.long_name);
            }
          });
        }
      },
      () => {
        setGeoStatus('denied');
        const fb = { lat: 48.8566, lng: 2.3522 };
        setMapCenter(fb); setSearchCenter(fb); setLocationLabel('Paris');
      },
      { timeout: 8000, enableHighAccuracy: false },
    );
  }, []);

  // ── 2. Places Autocomplete ────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded || !searchInputRef.current || autocompleteRef.current) return;
    const ac = new window.google.maps.places.Autocomplete(searchInputRef.current, {
      types: ['geocode', 'establishment'],
      fields: ['geometry', 'name', 'formatted_address'],
    });
    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (!place.geometry?.location) return;
      const loc: LatLng = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() };
      const label = place.name ?? place.formatted_address ?? '';
      setLocationLabel(label);
      setSearchQuery(label);
      setMapCenter(loc);
      setSearchCenter(loc);
      setShowSearchHere(false);
      setPopupActivity(null);
      doSearch(loc, getTypes(filter), buildDietaryKeyword(dietaryFilters));
    });
    autocompleteRef.current = ac;
  }, [isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 3. City-wide grid search ──────────────────────────────────────────────
  const doSearch = useCallback((center: LatLng, types: string[], keyword?: string) => {
    if (!window.google?.maps?.places) return;
    searchAbortRef.current = true;
    setIsSearching(true);
    setIsLoadingMore(false);
    setShowSearchHere(false);
    setPlaces([]);
    setPopupActivity(null);
    searchAbortRef.current = false;

    streamCitywidePlaces(
      center, types,
      (batch) => {
        if (searchAbortRef.current) return;
        setPlaces((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const fresh = batch.filter((p) => !existingIds.has(p.id));
          if (fresh.length === 0) return prev;
          const combined = [...prev, ...fresh];
          combined.sort((a, b) => b.rating - a.rating);
          return combined;
        });
        setIsSearching(false);
        setIsLoadingMore(true);
      },
      () => {
        if (searchAbortRef.current) return;
        setIsSearching(false);
        setIsLoadingMore(false);
      },
      keyword,
    );
  }, []);

  useEffect(() => {
    if (!isLoaded || !searchCenter) return;
    if (initialSearchDone.current) return;
    initialSearchDone.current = true;
    doSearch(searchCenter, getTypes(filter), buildDietaryKeyword(dietaryFilters));
  }, [isLoaded, searchCenter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isLoaded || !searchCenter) return;
    doSearch(searchCenter, getTypes(filter), buildDietaryKeyword(dietaryFilters));
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isLoaded || !searchCenter) return;
    doSearch(searchCenter, getTypes(filter), buildDietaryKeyword(dietaryFilters));
  }, [dietaryFilters]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 4. Map controls ───────────────────────────────────────────────────────
  const handleMapIdle = useCallback((center: LatLng) => {
    if (!searchCenter) return;
    const dist = Math.abs(center.lat - searchCenter.lat) + Math.abs(center.lng - searchCenter.lng);
    if (dist > 0.01) { setPendingCenter(center); setShowSearchHere(true); }
  }, [searchCenter]);

  const handleSearchHere = () => {
    if (!pendingCenter) return;
    setSearchCenter(pendingCenter);
    doSearch(pendingCenter, getTypes(filter), buildDietaryKeyword(dietaryFilters));
    setShowSearchHere(false);
  };

  const handleRecenter = () => {
    if (geoStatus !== 'ok') return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMapCenter(loc); setSearchCenter(loc); setSearchQuery('');
        doSearch(loc, getTypes(filter), buildDietaryKeyword(dietaryFilters));
      },
      () => {},
      { timeout: 5000 },
    );
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    if (searchInputRef.current) searchInputRef.current.value = '';
  };

  const centerPin: Accommodation = {
    id: 'explore_center',
    name: locationLabel || (geoStatus === 'ok' ? 'Your Location' : 'City Center'),
    address: '',
    lat: searchCenter?.lat ?? 48.8566,
    lng: searchCenter?.lng ?? 2.3522,
    checkIn: '', checkOut: '', type: 'hotel',
  };

  const mapsReady = isLoaded && !!searchCenter;

  const subtitleText = () => {
    if (geoStatus === 'loading') return '📡 Getting your location…';
    if (locationLabel) return `📍 Exploring ${locationLabel}`;
    if (geoStatus === 'denied') return '⚠️ Location denied — showing Paris';
    return '📍 Showing places near you';
  };

  const activeDietaryOptions = isFoodCategory
    ? DIETARY_OPTIONS.filter((d) => dietaryFilters.includes(d.value as DietaryRestriction))
    : [];

  return (
    <div className="min-h-screen bg-gradient-hero pb-28 safe-top">

      {/* Header */}
      <div className="px-5 pt-12 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Explore</h1>
            <p className="text-slate-400 text-sm font-medium mt-0.5">{subtitleText()}</p>
          </div>
          {geoStatus === 'ok' && (
            <button onClick={handleRecenter}
              className="w-10 h-10 rounded-2xl glass flex items-center justify-center text-violet-400 hover:text-violet-300 transition-all"
              title="Back to my location">
              <Navigation size={18} />
            </button>
          )}
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search any city, place, restaurant…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-9 py-3 rounded-2xl glass border border-white/10 text-white placeholder-white/40 text-sm font-medium focus:outline-none focus:border-violet-500/50 transition-all"
          />
          {searchQuery && (
            <button onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors">
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Category filter chips */}
      <div className="flex gap-2 overflow-x-auto scroll-hidden px-5 pb-3">
        {FILTER_TYPES.map((f) => {
          const isPersonalized = profileInterests.some((i) => INTEREST_TO_FILTER[i] === f.label);
          return (
            <button key={f.label} onClick={() => setFilter(f.label)}
              className={clsx(
                'flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-semibold transition-all',
                filter === f.label
                  ? 'bg-violet-100 border-violet-400/60 text-violet-700'
                  : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20 hover:text-white',
              )}>
              <span>{f.emoji}</span>
              {f.label}
              {isPersonalized && filter !== f.label && (
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 opacity-70" />
              )}
            </button>
          );
        })}
      </div>

      {/* Map */}
      <div className="px-5 mb-3 relative">
        {mapCenter ? (
          <TripMap
            accommodation={centerPin}
            activities={popupActivity ? [popupActivity] : []}
            height="260px"
            showRoute={false}
            autoFitBounds={false}
            uniformMarkerColor={EXPLORE_MARKER_COLOR}
            onMapIdle={handleMapIdle}
            onMarkerClick={(act) => setPopupActivity((prev) => prev?.id === act.id ? null : act)}
          />
        ) : (
          <div style={{ height: '260px' }} className="map-container flex items-center justify-center glass">
            <div className="flex flex-col items-center gap-2">
              <Loader2 size={24} className="text-violet-400 animate-spin" />
              <p className="text-white/50 text-sm">Detecting location…</p>
            </div>
          </div>
        )}

        {showSearchHere && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
            <button onClick={handleSearchHere}
              className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-900/95 border border-white/10 text-white text-sm font-semibold shadow-card-hover backdrop-blur-sm">
              <RefreshCw size={14} className="text-violet-400" />
              Search this area
            </button>
          </div>
        )}

      </div>

      {/* Results */}
      <div className="px-5">

        {/* Status bar */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-slate-400 text-sm font-medium">
              {isSearching
                ? 'Finding places…'
                : `${filteredSortedPlaces.length}${filteredSortedPlaces.length !== places.length ? `/${places.length}` : ''} places${locationLabel ? ` in ${locationLabel}` : ''}`}
              {isLoadingMore && !isSearching && <span className="text-violet-400 ml-1">· loading…</span>}
            </p>
            {/* Active dietary badges */}
            {activeDietaryOptions.map((opt) => (
              <span key={opt.value} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold">
                {opt.emoji} {opt.label}
                <button onClick={() => toggleDietary(opt.value as DietaryRestriction)} className="ml-0.5 hover:text-amber-200"><X size={10} /></button>
              </span>
            ))}
            {/* Active price badges */}
            {priceFilters.map((p) => (
              <span key={p} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                {p === 0 ? 'Free' : '$'.repeat(p)}
                <button onClick={() => togglePrice(p)} className="ml-0.5 hover:text-emerald-200"><X size={10} /></button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(isSearching || isLoadingMore) && <Loader2 size={14} className="text-violet-400 animate-spin" />}
            <button
              onClick={() => setShowSortFilter((v) => !v)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all',
                showSortFilter || activeFilterCount > 0
                  ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                  : 'bg-white/5 border-white/15 text-white/50 hover:bg-white/10 hover:text-white/80',
              )}>
              <ArrowUpDown size={12} />
              Sort & Filter
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-violet-500 text-white text-[10px] font-black flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown size={12} className={clsx('transition-transform', showSortFilter && 'rotate-180')} />
            </button>
          </div>
        </div>

        {/* Sort & Filter panel */}
        {showSortFilter && (
          <div className="glass rounded-2xl border border-white/10 p-4 mb-4 space-y-4 animate-fade-in">

            {/* Sort — single select */}
            <div>
              <p className="text-white/50 text-xs font-bold uppercase tracking-widest mb-2">Sort by</p>
              <div className="flex flex-wrap gap-2">
                {SORT_OPTIONS.map((opt) => (
                  <button key={opt.value} onClick={() => setSortBy(opt.value)}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all',
                      sortBy === opt.value
                        ? 'bg-violet-500/25 border-violet-500/50 text-violet-200'
                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/90',
                    )}>
                    <span>{opt.emoji}</span> {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Price — multi-select */}
            <div>
              <p className="text-white/50 text-xs font-bold uppercase tracking-widest mb-1">Price
                <span className="ml-1 text-white/30 normal-case font-normal">· select multiple</span>
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setPriceFilters([])}
                  className={clsx(
                    'px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all',
                    priceFilters.length === 0
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/90',
                  )}>
                  All
                </button>
                {PRICE_OPTIONS.map((opt) => (
                  <button key={opt.value} onClick={() => togglePrice(opt.value)}
                    className={clsx(
                      'px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all min-w-[48px] text-center',
                      priceFilters.includes(opt.value)
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/90',
                    )}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Rating — single select (threshold) */}
            <div>
              <p className="text-white/50 text-xs font-bold uppercase tracking-widest mb-2">Min Rating</p>
              <div className="flex flex-wrap gap-2">
                {RATING_OPTIONS.map((opt) => (
                  <button key={opt.value} onClick={() => setMinRating(opt.value)}
                    className={clsx(
                      'flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all',
                      minRating === opt.value
                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/90',
                    )}>
                    {opt.value > 0 && <Star size={10} className="text-amber-400 fill-amber-400" />}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dietary — multi-select, food categories only */}
            {isFoodCategory && (
              <div>
                <p className="text-white/50 text-xs font-bold uppercase tracking-widest mb-1">Dietary
                  <span className="ml-1 text-white/30 normal-case font-normal">· select multiple</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setDietaryFilters([])}
                    className={clsx(
                      'px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all',
                      dietaryFilters.length === 0
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/90',
                    )}>
                    All
                  </button>
                  {DIETARY_OPTIONS.filter((d) => d.value !== 'none').map((opt) => {
                    const isActive = dietaryFilters.includes(opt.value as DietaryRestriction);
                    const isProfilePref = profileDietary.includes(opt.value as DietaryRestriction);
                    return (
                      <button key={opt.value}
                        onClick={() => toggleDietary(opt.value as DietaryRestriction)}
                        className={clsx(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all',
                          isActive
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                            : isProfilePref
                            ? 'bg-white/10 border-amber-500/25 text-white/80 hover:bg-amber-500/15 hover:border-amber-500/40'
                            : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/90',
                        )}>
                        <span>{opt.emoji}</span>
                        {opt.label}
                        {isProfilePref && !isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 opacity-60" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Reset */}
            {activeFilterCount > 0 && (
              <button onClick={resetAll}
                className="text-xs text-white/40 hover:text-white/70 transition-colors underline underline-offset-2">
                Reset all filters
              </button>
            )}
          </div>
        )}

        {!mapsReady && geoStatus !== 'loading' && (
          <div className="glass rounded-3xl p-8 text-center">
            <Compass size={36} className="text-white/20 mx-auto mb-3" />
            <p className="text-white font-bold mb-1">Google Maps API Key Required</p>
            <p className="text-white/50 text-sm mb-4">Go to Profile → configure your API key to see real places near you.</p>
            <a href="/profile" className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm">Go to Profile →</a>
          </div>
        )}

        {mapsReady && isSearching && places.length === 0 && (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="glass rounded-3xl p-4 border border-white/10 animate-pulse">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-white/10 rounded-xl w-3/4" />
                    <div className="h-3 bg-white/5 rounded-xl w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {mapsReady && !isSearching && filteredSortedPlaces.length === 0 && (
          <div className="glass rounded-3xl p-8 text-center">
            <Compass size={36} className="text-white/20 mx-auto mb-3" />
            <p className="text-white/50 text-sm">
              {places.length > 0
                ? 'No places match your current filters. Try adjusting or clearing them.'
                : 'No places found. Try a different category or search for a new city above.'}
            </p>
            {places.length > 0 && (
              <button onClick={resetAll}
                className="mt-3 text-violet-400 text-sm font-semibold hover:text-violet-300 transition-colors">
                Clear all filters
              </button>
            )}
          </div>
        )}

        {mapsReady && filteredSortedPlaces.length > 0 && (
          <div className="space-y-3">
            {filteredSortedPlaces.map((place, i) => {
              const isSelected = popupActivity?.id === place.id;
              return (
                <div key={place.id} id={`place-${place.id}`}>
                  <ActivityCard
                    activity={place}
                    index={i}
                    isSelected={isSelected}
                    onClick={() => handleCardClick(place)}
                    onSaveToTrip={() => setModalActivity(place)}
                    showSaveButton
                  />
                  {/* Travel time panel — only for the selected card */}
                  {isSelected && (
                    <div className="mt-2 glass rounded-2xl border border-white/10 p-3 animate-fade-in">
                      <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-2.5">
                        {userGpsLocation ? 'Travel time from your location' : 'Enable location for travel times'}
                      </p>
                      {userGpsLocation ? (
                        <div className="grid grid-cols-4 gap-2">
                          {(
                            [
                              { mode: 'WALKING' as TravelModeKey,   emoji: '🚶', label: 'Walk'    },
                              { mode: 'BICYCLING' as TravelModeKey, emoji: '🚲', label: 'Bike'    },
                              { mode: 'DRIVING' as TravelModeKey,   emoji: '🚗', label: 'Drive'   },
                              { mode: 'TRANSIT' as TravelModeKey,   emoji: '🚇', label: 'Transit' },
                            ] as { mode: TravelModeKey; emoji: string; label: string }[]
                          ).map(({ mode, emoji, label }) => {
                            const minutes = travelTimes[mode];
                            const isActive = travelMode === mode;
                            return (
                              <button
                                key={mode}
                                onClick={() => setTravelMode(mode)}
                                className={clsx(
                                  'flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-semibold transition-all',
                                  isActive
                                    ? 'bg-violet-500/25 border-violet-500/50 text-violet-200'
                                    : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/80',
                                )}
                              >
                                <span className="text-base">{emoji}</span>
                                {travelLoading ? (
                                  <Loader2 size={10} className="animate-spin text-violet-400" />
                                ) : minutes != null ? (
                                  <span>{minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`}</span>
                                ) : (
                                  <span className="text-white/30">—</span>
                                )}
                                <span className="text-[10px] text-white/40">{label}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-white/30 text-xs">Grant location access to see travel times.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {isLoadingMore && (
              <div className="flex items-center justify-center gap-2 py-4 text-white/40 text-sm">
                <Loader2 size={14} className="animate-spin text-violet-400" />
                Loading more places…
              </div>
            )}
          </div>
        )}
      </div>

      {modalActivity && (
        <AddToTripModal
          activity={modalActivity}
          onClose={() => setModalActivity(null)}
        />
      )}
    </div>
  );
}
