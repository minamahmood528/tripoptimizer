import { useState, useEffect } from 'react';
import { Search, MapPin, Filter, Compass } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTrips } from '../context/TripContext';
import { searchNearbyPlaces } from '../utils/googlePlaces';
import TripMap from '../components/maps/TripMap';
import ActivityCard from '../components/cards/ActivityCard';
import type { Activity, Accommodation } from '../types';
import clsx from 'clsx';

const FILTER_TYPES = [
  { label: 'All', value: '', emoji: '🌍' },
  { label: 'Attractions', value: 'tourist_attraction', emoji: '🏛️' },
  { label: 'Food', value: 'restaurant', emoji: '🍜' },
  { label: 'Cafés', value: 'cafe', emoji: '☕' },
  { label: 'Nightlife', value: 'bar', emoji: '🍺' },
  { label: 'Shopping', value: 'shopping_mall', emoji: '🛍️' },
  { label: 'Museums', value: 'museum', emoji: '🎨' },
  { label: 'Parks', value: 'park', emoji: '🌿' },
  { label: 'Hospitals', value: 'hospital', emoji: '🏥' },
];

export default function ExplorePage() {
  const { user } = useAuth();
  const { trips } = useTrips();
  const [filter, setFilter] = useState('');
  const [places, setPlaces] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [center, setCenter] = useState<Accommodation | null>(null);

  // Get the most recent accommodation as starting center
  useEffect(() => {
    const latestTrip = trips[0];
    const latestCity = latestTrip?.cities[0];
    if (latestCity?.accommodation) {
      setCenter(latestCity.accommodation);
    }
  }, [trips]);

  useEffect(() => {
    if (!center || !user?.preferences?.googleMapsApiKey) return;
    if (!(window as any).google?.maps?.places) return;
    setIsLoading(true);
    const types = filter ? [filter] : ['tourist_attraction'];
    searchNearbyPlaces({ lat: center.lat, lng: center.lng }, types, 3000)
      .then((results) => setPlaces(results))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [filter, center, user?.preferences?.googleMapsApiKey]);

  const mockCenter: Accommodation = center ?? {
    id: 'explore',
    name: 'City Center',
    address: 'City Center',
    lat: 48.8566,
    lng: 2.3522,
    checkIn: '',
    checkOut: '',
    type: 'hotel',
  };

  return (
    <div className="min-h-screen bg-gradient-hero pb-28 safe-top">
      <div className="px-5 pt-12 pb-4">
        <h1 className="text-2xl font-black text-white mb-1">Explore Nearby</h1>
        <p className="text-white/50 text-sm">Discover places around your accommodation</p>
      </div>

      {/* Filter Chips */}
      <div className="flex gap-2 overflow-x-auto scroll-hidden px-5 pb-4">
        {FILTER_TYPES.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={clsx(
              'flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all',
              filter === f.value
                ? 'bg-violet-500/30 border-violet-500/60 text-violet-200'
                : 'glass border-white/10 text-white/60 hover:text-white',
            )}
          >
            <span>{f.emoji}</span> {f.label}
          </button>
        ))}
      </div>

      {/* Map */}
      <div className="px-5 mb-4">
        <TripMap
          accommodation={mockCenter}
          activities={places.slice(0, 10)}
          height="220px"
        />
      </div>

      {/* Results */}
      <div className="px-5">
        {!user?.preferences?.googleMapsApiKey ? (
          <div className="glass rounded-3xl p-8 text-center">
            <div className="text-4xl mb-3">🗝️</div>
            <h3 className="text-white font-bold mb-2">Set up Google Maps</h3>
            <p className="text-white/50 text-sm mb-4">Add your API key in Profile to explore real places near you</p>
            <a href="/profile" className="btn-primary inline-flex items-center gap-2 px-6 py-3">
              Go to Profile →
            </a>
          </div>
        ) : !trips.length ? (
          <div className="glass rounded-3xl p-8 text-center">
            <div className="text-4xl mb-3">🏨</div>
            <h3 className="text-white font-bold mb-2">Create a trip first</h3>
            <p className="text-white/50 text-sm">Add a trip with accommodation to explore nearby places</p>
          </div>
        ) : isLoading ? (
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
        ) : places.length > 0 ? (
          <div className="space-y-3">
            <p className="text-white/50 text-sm">{places.length} places found</p>
            {places.map((place, i) => (
              <ActivityCard key={place.id} activity={place} index={i} />
            ))}
          </div>
        ) : (
          <div className="glass rounded-3xl p-8 text-center">
            <Compass size={40} className="text-white/20 mx-auto mb-3" />
            <p className="text-white/50">No places found for this filter. Try another category.</p>
          </div>
        )}
      </div>
    </div>
  );
}
