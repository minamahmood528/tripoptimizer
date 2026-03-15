import { useState, useEffect, useRef, useCallback } from 'react';
import { Compass, Loader2, RefreshCw, Navigation } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { searchNearbyPlaces } from '../utils/googlePlaces';
import TripMap from '../components/maps/TripMap';
import ActivityCard from '../components/cards/ActivityCard';
import AddToTripModal from '../components/explore/AddToTripModal';
import type { Activity, Accommodation, LatLng } from '../types';
import clsx from 'clsx';
import { useGoogleMaps } from '../hooks/useGoogleMaps';

const FILTER_TYPES = [
  { label: 'Attractions', value: 'tourist_attraction', emoji: '🏛️' },
  { label: 'Food', value: 'restaurant', emoji: '🍜' },
  { label: 'Cafés', value: 'cafe', emoji: '☕' },
  { label: 'Nightlife', value: 'bar', emoji: '🍺' },
  { label: 'Shopping', value: 'shopping_mall', emoji: '🛍️' },
  { label: 'Museums', value: 'museum', emoji: '🎨' },
  { label: 'Parks', value: 'park', emoji: '🌿' },
  { label: 'Activities', value: 'amusement_park', emoji: '🎡' },
  { label: 'Spas', value: 'spa', emoji: '💆' },
];

export default function ExplorePage() {
  const { user } = useAuth();
  const apiKey = user?.preferences?.googleMapsApiKey ?? '';
  const { isLoaded } = useGoogleMaps(apiKey);

  const [filter, setFilter] = useState('tourist_attraction');
  const [places, setPlaces] = useState<Activity[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [mapCenter, setMapCenter] = useState<LatLng | null>(null);
  const [searchCenter, setSearchCenter] = useState<LatLng | null>(null);
  const [geoStatus, setGeoStatus] = useState<'loading' | 'ok' | 'denied' | 'unsupported'>('loading');
  const [showSearchHere, setShowSearchHere] = useState(false);
  const [pendingCenter, setPendingCenter] = useState<LatLng | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const initialSearchDone = useRef(false);

  // ── 1. Get user's current location on mount ───────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoStatus('unsupported');
      const fallback = { lat: 48.8566, lng: 2.3522 }; // Paris fallback
      setMapCenter(fallback);
      setSearchCenter(fallback);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMapCenter(loc);
        setSearchCenter(loc);
        setGeoStatus('ok');
      },
      () => {
        setGeoStatus('denied');
        const fallback = { lat: 48.8566, lng: 2.3522 };
        setMapCenter(fallback);
        setSearchCenter(fallback);
      },
      { timeout: 8000, enableHighAccuracy: false },
    );
  }, []);

  // ── 2. Search when location + filter are ready ────────────────────────────
  const doSearch = useCallback((center: LatLng, type: string) => {
    if (!window.google?.maps?.places) return;
    setIsSearching(true);
    setShowSearchHere(false);
    searchNearbyPlaces(center, [type], 2500)
      .then((results) => setPlaces(results))
      .catch(() => setPlaces([]))
      .finally(() => setIsSearching(false));
  }, []);

  useEffect(() => {
    if (!isLoaded || !searchCenter) return;
    if (initialSearchDone.current && searchCenter === mapCenter) return;
    initialSearchDone.current = true;
    doSearch(searchCenter, filter);
  }, [isLoaded, searchCenter, filter, doSearch, mapCenter]);

  // Re-search when filter changes
  useEffect(() => {
    if (!isLoaded || !searchCenter) return;
    doSearch(searchCenter, filter);
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 3. Map idle → offer "Search this area" ───────────────────────────────
  const handleMapIdle = useCallback((center: LatLng) => {
    if (!searchCenter) return;
    const dist = Math.abs(center.lat - searchCenter.lat) + Math.abs(center.lng - searchCenter.lng);
    if (dist > 0.005) {
      setPendingCenter(center);
      setShowSearchHere(true);
    }
  }, [searchCenter]);

  const handleSearchHere = () => {
    if (!pendingCenter) return;
    setSearchCenter(pendingCenter);
    doSearch(pendingCenter, filter);
  };

  const handleRecenter = () => {
    if (geoStatus !== 'ok') return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMapCenter(loc);
        setSearchCenter(loc);
        doSearch(loc, filter);
      },
      () => {},
      { timeout: 5000 },
    );
  };

  // Fake "accommodation" for TripMap (just the center pin)
  const centerPin: Accommodation = {
    id: 'explore_center',
    name: geoStatus === 'ok' ? 'Your Location' : 'City Center',
    address: '',
    lat: searchCenter?.lat ?? 48.8566,
    lng: searchCenter?.lng ?? 2.3522,
    checkIn: '',
    checkOut: '',
    type: 'hotel',
  };

  const mapsReady = isLoaded && !!searchCenter;

  return (
    <div className="min-h-screen bg-gradient-hero pb-28 safe-top">

      {/* Header */}
      <div className="px-5 pt-12 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Explore</h1>
            <p className="text-slate-500 text-sm font-medium mt-0.5">
              {geoStatus === 'loading' && '📡 Getting your location…'}
              {geoStatus === 'ok' && '📍 Showing places near you'}
              {geoStatus === 'denied' && '⚠️ Location denied — showing Paris'}
              {geoStatus === 'unsupported' && '⚠️ GPS unavailable — showing Paris'}
            </p>
          </div>
          {geoStatus === 'ok' && (
            <button onClick={handleRecenter}
              className="w-10 h-10 rounded-2xl glass flex items-center justify-center text-violet-400 hover:text-violet-300 transition-all">
              <Navigation size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Filter Chips */}
      <div className="flex gap-2 overflow-x-auto scroll-hidden px-5 pb-3">
        {FILTER_TYPES.map((f) => (
          <button key={f.value} onClick={() => setFilter(f.value)}
            className={clsx(
              'flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-semibold transition-all',
              filter === f.value
                ? 'bg-violet-100 border-violet-400/60 text-violet-700'
                : 'glass border-white/10 text-white/60 hover:text-white',
            )}>
            <span>{f.emoji}</span> {f.label}
          </button>
        ))}
      </div>

      {/* Map */}
      <div className="px-5 mb-3 relative">
        {mapCenter ? (
          <TripMap
            accommodation={centerPin}
            activities={places.slice(0, 15)}
            height="260px"
            showRoute={false}
            onMapIdle={handleMapIdle}
            onMarkerClick={(act) => {
              setSelectedActivity(act);
              document.getElementById(`place-${act.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
          />
        ) : (
          <div style={{ height: '260px' }} className="map-container flex items-center justify-center glass">
            <div className="flex flex-col items-center gap-2">
              <Loader2 size={24} className="text-violet-400 animate-spin" />
              <p className="text-white/50 text-sm">Detecting location…</p>
            </div>
          </div>
        )}

        {/* Search this area button */}
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
        <div className="flex items-center justify-between mb-3">
          <p className="text-slate-500 text-sm font-medium">
            {isSearching ? 'Finding places…' : `${places.length} places found`}
          </p>
          {isSearching && <Loader2 size={16} className="text-violet-400 animate-spin" />}
        </div>

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
            {[...Array(4)].map((_, i) => (
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

        {mapsReady && !isSearching && places.length === 0 && (
          <div className="glass rounded-3xl p-8 text-center">
            <Compass size={36} className="text-white/20 mx-auto mb-3" />
            <p className="text-white/50">No places found. Try a different filter or pan the map and tap "Search this area".</p>
          </div>
        )}

        {mapsReady && places.length > 0 && (
          <div className="space-y-3">
            {places.map((place, i) => (
              <div key={place.id} id={`place-${place.id}`}>
                <ActivityCard
                  activity={place}
                  index={i}
                  isSelected={selectedActivity?.id === place.id}
                  onClick={() => setSelectedActivity(selectedActivity?.id === place.id ? null : place)}
                  onSaveToTrip={() => setSelectedActivity(place)}
                  showSaveButton
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add to Trip Modal */}
      {selectedActivity && (
        <AddToTripModal
          activity={selectedActivity}
          onClose={() => setSelectedActivity(null)}
        />
      )}
    </div>
  );
}
