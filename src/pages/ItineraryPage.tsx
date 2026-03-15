import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, MapPin, RotateCcw, ChevronDown, ChevronUp, Map, List } from 'lucide-react';
import { useTrips } from '../context/TripContext';
import { useAuth } from '../context/AuthContext';
import ActivityCard from '../components/cards/ActivityCard';
import TripMap from '../components/maps/TripMap';
import { THEME_LABELS } from '../utils/mockData';
import { formatDuration } from '../utils/itinerary';
import { generateItineraryOptionsAsync } from '../utils/itinerary';
import type { Activity, ItineraryOption } from '../types';
import clsx from 'clsx';

type ViewMode = 'split' | 'map' | 'list';

export default function ItineraryPage() {
  const { id: tripId, cityId, dayId } = useParams<{ id: string; cityId: string; dayId: string }>();
  const { trips, selectItineraryOption } = useTrips();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [selectedOptionIdx, setSelectedOptionIdx] = useState(0);
  const [highlightedActivity, setHighlightedActivity] = useState<Activity | null>(null);
  const [isListExpanded, setIsListExpanded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [liveOptions, setLiveOptions] = useState<ItineraryOption[] | null>(null);

  const trip = trips.find((t) => t.id === tripId);
  const city = trip?.cities.find((c) => c.id === cityId);
  const day = city?.itineraryDays.find((d) => d.id === dayId);

  useEffect(() => {
    if (!trip || !city || !day) navigate('/dashboard');
  }, [trip, city, day]);

  // Try to fetch real Google Places data if API key is available
  useEffect(() => {
    if (!day || !city?.accommodation || !user?.preferences?.googleMapsApiKey) return;
    if (!(window as any).google?.maps) return; // Maps not loaded yet

    const previouslyVisited = city.itineraryDays
      .filter((d) => d.id !== dayId)
      .flatMap((d) => d.options[d.selectedOptionIndex]?.activities.map((a) => a.id) ?? []);

    generateItineraryOptionsAsync(
      city.accommodation,
      city.name,
      day.dayNumber,
      previouslyVisited,
      user.preferences,
    ).then((options) => {
      if (options.some((o) => o.activities.length > 0)) {
        setLiveOptions(options);
      }
    }).catch(() => {}); // Silently fall back to mock data
  }, [day?.id, user?.preferences?.googleMapsApiKey]);

  if (!trip || !city || !day) return null;

  const displayOptions = liveOptions ?? day.options;
  const selected = displayOptions[selectedOptionIdx] ?? displayOptions[0];

  const handleSelectOption = (idx: number) => {
    setSelectedOptionIdx(idx);
    selectItineraryOption(tripId!, cityId!, dayId!, idx);
  };

  const handleRefresh = async () => {
    if (!city.accommodation || !user) return;
    setIsRefreshing(true);
    await new Promise((r) => setTimeout(r, 1000));
    const prev = city.itineraryDays
      .filter((d) => d.id !== dayId)
      .flatMap((d) => d.options[d.selectedOptionIndex]?.activities.map((a) => a.id) ?? []);
    const opts = await generateItineraryOptionsAsync(
      city.accommodation, city.name, day.dayNumber, prev, user.preferences,
    ).catch(() => displayOptions);
    setLiveOptions(opts as ItineraryOption[]);
    setIsRefreshing(false);
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col safe-top max-w-3xl mx-auto">
      {/* Header */}
      <div className="px-5 pt-10 pb-3 shrink-0 z-10">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(`/trips/${tripId}`)} className="w-10 h-10 rounded-2xl glass flex items-center justify-center text-white/70 hover:text-white transition-all shrink-0">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-lg">{city.countryCode}</span>
              <h1 className="font-black text-white text-lg truncate">{city.name} — Day {day.dayNumber}</h1>
            </div>
            <p className="text-white/50 text-sm">{day.date}</p>
          </div>

          <div className="flex gap-1.5">
            {(['split', 'map', 'list'] as ViewMode[]).map((vm) => (
              <button
                key={vm}
                onClick={() => setViewMode(vm)}
                className={clsx(
                  'w-9 h-9 rounded-xl flex items-center justify-center transition-all',
                  viewMode === vm ? 'bg-violet-500/30 text-violet-300' : 'glass text-white/50 hover:text-white',
                )}
              >
                {vm === 'map' ? <Map size={16} /> : vm === 'list' ? <List size={16} /> : <span className="text-xs font-bold">⊞</span>}
              </button>
            ))}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh with live places"
              className="w-9 h-9 rounded-xl glass text-white/50 hover:text-white flex items-center justify-center transition-all"
            >
              <RotateCcw size={16} className={isRefreshing ? 'animate-spin text-violet-400' : ''} />
            </button>
          </div>
        </div>

        {/* 5 Option Selector */}
        <div className="flex gap-2 overflow-x-auto scroll-hidden pb-1">
          {displayOptions.map((opt, idx) => {
            const theme = THEME_LABELS[opt.theme];
            const isSelected = idx === selectedOptionIdx;
            return (
              <button
                key={opt.id}
                onClick={() => handleSelectOption(idx)}
                className={clsx(
                  'flex-shrink-0 rounded-2xl px-3 py-2 border transition-all duration-200 text-left',
                  isSelected
                    ? `bg-gradient-to-br ${theme.color} border-white/30`
                    : 'glass border-white/10 hover:border-white/25',
                )}
                style={{ minWidth: '140px' }}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-base">{theme.emoji}</span>
                  <span className={clsx('text-xs font-bold', isSelected ? 'text-white' : 'text-white/70')}>
                    Option {opt.optionNumber}
                  </span>
                </div>
                <p className={clsx('text-xs', isSelected ? 'text-white/80' : 'text-white/40')}>{theme.name}</p>
                <div className="flex gap-2 mt-1 text-[10px] text-white/40">
                  <span>📍{opt.totalDistanceKm}km</span>
                  <span>⏱{formatDuration(opt.totalDurationMin)}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      {selected && (
        <div className="flex-1 overflow-hidden">
          {/* Split View */}
          {viewMode === 'split' && (
            <div className="flex flex-col h-full">
              {/* Map (top half) */}
              {city.accommodation && (
                <div className="px-5 mb-3 shrink-0">
                  <TripMap
                    accommodation={city.accommodation}
                    activities={selected.activities}
                    height="260px"
                    onMarkerClick={setHighlightedActivity}
                  />
                </div>
              )}

              {/* Activity List (bottom half, scrollable) */}
              <div className="flex-1 overflow-y-auto scroll-hidden px-5 pb-28">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-bold">
                    {THEME_LABELS[selected.theme].emoji} {THEME_LABELS[selected.theme].name}
                  </h3>
                  <span className="text-white/50 text-xs">{selected.activities.length} stops</span>
                </div>
                <div className="space-y-3">
                  {selected.activities.map((act, i) => (
                    <ActivityCard
                      key={act.id}
                      activity={act}
                      index={i}
                      isSelected={highlightedActivity?.id === act.id}
                      onClick={() => setHighlightedActivity(highlightedActivity?.id === act.id ? null : act)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Map Only */}
          {viewMode === 'map' && city.accommodation && (
            <div className="px-5 h-full pb-28">
              <TripMap
                accommodation={city.accommodation}
                activities={selected.activities}
                height="calc(100vh - 280px)"
                onMarkerClick={setHighlightedActivity}
              />
              {highlightedActivity && (
                <div className="mt-3">
                  <ActivityCard
                    activity={highlightedActivity}
                    index={selected.activities.indexOf(highlightedActivity)}
                    isSelected
                    onClick={() => setHighlightedActivity(null)}
                  />
                </div>
              )}
            </div>
          )}

          {/* List Only */}
          {viewMode === 'list' && (
            <div className="overflow-y-auto scroll-hidden px-5 h-full pb-28">
              {/* Summary Row */}
              <div className="glass rounded-2xl p-3 mb-4 flex gap-4">
                <div className="flex items-center gap-1.5 text-sm text-white/70">
                  <Clock size={14} className="text-cyan-400" />
                  <span>Starts {selected.startTime}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-white/70">
                  <MapPin size={14} className="text-pink-400" />
                  <span>{selected.totalDistanceKm} km total</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-white/70">
                  <span>🎯 {selected.activities.length} stops</span>
                </div>
              </div>

              <div className="space-y-3">
                {selected.activities.map((act, i) => (
                  <ActivityCard key={act.id} activity={act} index={i} onClick={() => {}} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
