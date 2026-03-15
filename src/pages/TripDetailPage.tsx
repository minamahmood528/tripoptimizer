import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, Hotel, RotateCcw, Sparkles } from 'lucide-react';
import { useTrips } from '../context/TripContext';
import { useAuth } from '../context/AuthContext';
import ActivityCard from '../components/cards/ActivityCard';
import TripMap from '../components/maps/TripMap';
import { THEME_LABELS } from '../utils/mockData';
import { formatDuration, generateItineraryOptionsAsync, getCommuteOptions } from '../utils/itinerary';
import type { Activity, ItineraryOption, CityEntry, ItineraryDay } from '../types';
import clsx from 'clsx';

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true = open, false = likely closed, null = can't determine */
function isOpenAtArrival(openingHours: string | undefined, arrivalTime: string): boolean | null {
  if (!openingHours) return null;
  const lower = openingHours.toLowerCase();
  if (lower.includes('24') || lower.includes('always open')) return true;

  const match = openingHours.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*[–\-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;

  const toMin = (h: string, m: string, ap: string) => {
    let hour = parseInt(h);
    const ampm = ap.toUpperCase();
    if (ampm === 'PM' && hour !== 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    return hour * 60 + parseInt(m);
  };

  const openMin = toMin(match[1], match[2], match[3]);
  const closeMin = toMin(match[4], match[5], match[6]);
  const [ah, am] = arrivalTime.split(':').map(Number);
  const arrivalMin = (ah ?? 0) * 60 + (am ?? 0);
  return arrivalMin >= openMin && arrivalMin < closeMin;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlatDay {
  city: CityEntry;
  day: ItineraryDay;
  isFirstOfCity: boolean;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { trips, generateDaysForCity, selectItineraryOption } = useTrips();
  const { user } = useAuth();
  const navigate = useNavigate();

  const trip = trips.find(t => t.id === id);

  // Flat list of every day across every city (only cities that have days)
  const allDays: FlatDay[] = trip?.cities.flatMap(city =>
    city.itineraryDays.map((day, di) => ({
      city,
      day,
      isFirstOfCity: di === 0,
    }))
  ) ?? [];

  // Cities that have NO itinerary days yet
  const pendingCities = trip?.cities.filter(c => c.itineraryDays.length === 0) ?? [];

  const [selectedDayId, setSelectedDayId] = useState<string | null>(
    allDays[0]?.day.id ?? null,
  );
  const [selectedOptionIdx, setSelectedOptionIdx] = useState(0);
  const [liveOptions, setLiveOptions] = useState<ItineraryOption[] | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [highlightedActivity, setHighlightedActivity] = useState<Activity | null>(null);
  const [hoursOutside, setHoursOutside] = useState<number | null>(null);
  const dayStripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!trip) navigate('/dashboard');
  }, [trip, navigate]);

  // When a different day is selected, reset option + live data + hours
  useEffect(() => {
    setSelectedOptionIdx(0);
    setLiveOptions(null);
    setHighlightedActivity(null);
    setHoursOutside(null);
  }, [selectedDayId]);

  // Auto-select first day when trip first loads
  useEffect(() => {
    if (!selectedDayId && allDays.length > 0) {
      setSelectedDayId(allDays[0].day.id);
    }
  }, [allDays.length, selectedDayId]);

  // Fetch live itinerary from Google Places when day changes
  useEffect(() => {
    if (!selectedDayId || !user?.preferences?.googleMapsApiKey) return;
    if (!(window as any).google?.maps) return;

    const flat = allDays.find(fd => fd.day.id === selectedDayId);
    if (!flat || !flat.city.accommodation) return;

    const previouslyVisited = flat.city.itineraryDays
      .filter(d => d.id !== selectedDayId)
      .flatMap(d => d.options[d.selectedOptionIndex]?.activities.map(a => a.id) ?? []);

    generateItineraryOptionsAsync(
      flat.city.accommodation,
      flat.city.name,
      flat.day.dayNumber,
      previouslyVisited,
      user.preferences,
    ).then(opts => {
      if (opts.some(o => o.activities.length > 0)) setLiveOptions(opts);
    }).catch(() => {});
  }, [selectedDayId, user?.preferences?.googleMapsApiKey]);

  if (!trip) return null;

  const selectedFlat = allDays.find(fd => fd.day.id === selectedDayId);
  const selectedCity = selectedFlat?.city ?? null;
  const selectedDay = selectedFlat?.day ?? null;
  const globalDayNumber = selectedDayId ? allDays.findIndex(fd => fd.day.id === selectedDayId) + 1 : 0;
  const displayOptions = liveOptions ?? selectedDay?.options ?? [];
  const selectedOption = displayOptions[selectedOptionIdx] ?? displayOptions[0] ?? null;
  const userCommutes = user?.preferences?.commuteTypes ?? ['walking'];

  // Trim activities to fit within hours-outside budget
  const visibleActivities = useMemo(() => {
    if (!selectedOption) return [];
    if (!hoursOutside) return selectedOption.activities;
    const budgetMin = hoursOutside * 60;
    let total = 0;
    return selectedOption.activities.filter(act => {
      const needed = (act.travelTimeMin || 0) + act.durationMin;
      if (total + needed <= budgetMin) { total += needed; return true; }
      return false;
    });
  }, [selectedOption, hoursOutside]);

  const handleSelectOption = (idx: number) => {
    setSelectedOptionIdx(idx);
    if (selectedCity && selectedDay) {
      selectItineraryOption(trip.id, selectedCity.id, selectedDay.id, idx);
    }
  };

  const handleRefresh = async () => {
    if (!selectedCity?.accommodation || !user || !selectedDay) return;
    setIsRefreshing(true);
    await new Promise(r => setTimeout(r, 800));
    const prev = selectedCity.itineraryDays
      .filter(d => d.id !== selectedDay.id)
      .flatMap(d => d.options[d.selectedOptionIndex]?.activities.map(a => a.id) ?? []);
    const opts = await generateItineraryOptionsAsync(
      selectedCity.accommodation, selectedCity.name, selectedDay.dayNumber, prev, user.preferences,
    ).catch(() => displayOptions);
    setLiveOptions(opts as ItineraryOption[]);
    setIsRefreshing(false);
  };

  return (
    <div className="min-h-screen bg-gradient-hero pb-28 safe-top max-w-3xl mx-auto">

      {/* ── Header ── */}
      <div className="px-5 pt-12 pb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-10 h-10 rounded-2xl glass flex items-center justify-center text-white/70 hover:text-white transition-all shrink-0"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold text-white truncate tracking-tight">{trip.name}</h1>
            <p className="text-slate-400 text-sm">
              {trip.cities.length} {trip.cities.length === 1 ? 'city' : 'cities'} · {allDays.length} {allDays.length === 1 ? 'day' : 'days'}
            </p>
          </div>
          {selectedDay && (
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh itinerary with live places"
              className="w-9 h-9 rounded-xl glass text-white/50 hover:text-white flex items-center justify-center transition-all"
            >
              <RotateCcw size={15} className={isRefreshing ? 'animate-spin text-violet-400' : ''} />
            </button>
          )}
        </div>
      </div>

      {/* ── Day Navigation Strip ── */}
      {allDays.length > 0 && (
        <div
          ref={dayStripRef}
          className="flex overflow-x-auto scroll-hidden px-5 pb-3 gap-1 border-b border-white/5"
        >
          {allDays.map((flat, i) => {
            const isActive = flat.day.id === selectedDayId;
            const pickedOption = flat.day.options[flat.day.selectedOptionIndex];
            const theme = pickedOption ? THEME_LABELS[pickedOption.theme] : null;
            // Insert a city separator label before each city's first day
            return (
              <div key={flat.day.id} className={clsx('flex flex-col items-center shrink-0', flat.isFirstOfCity && i > 0 && 'ml-3')}>
                {/* City badge above first day of each city */}
                <div className="h-5 flex items-center mb-1">
                  {flat.isFirstOfCity && (
                    <div className="flex items-center gap-1 bg-white/5 rounded-md px-1.5 py-0.5">
                      <span className="text-[10px]">{flat.city.countryCode}</span>
                      <span className="text-white/40 text-[10px] font-semibold max-w-[56px] truncate">{flat.city.name}</span>
                    </div>
                  )}
                </div>
                {/* Day tab */}
                <button
                  onClick={() => setSelectedDayId(flat.day.id)}
                  className={clsx(
                    'flex flex-col items-center gap-0.5 min-w-[52px] py-2 px-2 rounded-2xl border transition-all duration-200',
                    isActive
                      ? 'bg-violet-500/25 border-violet-500/50'
                      : 'glass border-white/8 hover:border-white/20',
                  )}
                >
                  <span className={clsx('text-sm font-black leading-none', isActive ? 'text-white' : 'text-white/50')}>
                    D{i + 1}
                  </span>
                  <span className="text-[10px] leading-none mt-0.5">
                    {theme ? theme.emoji : <span className="text-white/20">·</span>}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pending Cities (no itinerary yet) ── */}
      {pendingCities.length > 0 && (
        <div className="px-5 pt-4 space-y-2">
          {pendingCities.map(city => (
            <div key={city.id} className="glass rounded-2xl p-3 border border-white/10 flex items-center gap-3">
              <span className="text-xl shrink-0">{city.countryCode}</span>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">{city.name}</p>
                <p className="text-white/40 text-xs">{city.arrivalDate} → {city.departureDate}</p>
              </div>
              {city.accommodation ? (
                <button
                  onClick={() => generateDaysForCity(trip.id, city.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-500/20 border border-violet-500/30 text-violet-300 text-xs font-semibold hover:bg-violet-500/30 transition-all shrink-0"
                >
                  <Sparkles size={12} /> Generate
                </button>
              ) : (
                <span className="text-amber-400/60 text-xs">No hotel added</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── No Days At All ── */}
      {allDays.length === 0 && pendingCities.length === 0 && (
        <div className="px-5 pt-8 text-center">
          <div className="glass rounded-3xl p-8 border border-white/10">
            <p className="text-4xl mb-3">🗺️</p>
            <p className="text-white font-bold mb-1">No itinerary yet</p>
            <p className="text-white/40 text-sm">Add accommodation to generate daily routes</p>
          </div>
        </div>
      )}

      {/* ── Selected Day Content ── */}
      {selectedCity && selectedDay && (
        <div className="px-5 pt-4 animate-slide-up">

          {/* City + Day + Hotel row */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500/20 to-pink-500/20 flex items-center justify-center text-xl border border-white/10 shrink-0">
              {selectedCity.countryCode}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-white font-bold text-base leading-tight">
                {selectedCity.name} · Day {globalDayNumber}
              </h2>
              <p className="text-white/40 text-xs">{selectedDay.date}</p>
            </div>
            {selectedCity.accommodation && (
              <div className="flex items-center gap-1.5 glass rounded-xl px-2.5 py-1.5 border border-white/10 shrink-0 max-w-[130px]">
                <Hotel size={11} className="text-pink-400 shrink-0" />
                <span className="text-white/50 text-xs truncate">{selectedCity.accommodation.name}</span>
              </div>
            )}
          </div>

          {/* 5 Route Options */}
          {displayOptions.length > 0 ? (
            <>
              <div className="flex gap-2 overflow-x-auto scroll-hidden pb-3 -mx-5 px-5 mb-1">
                {displayOptions.map((opt, idx) => {
                  const theme = THEME_LABELS[opt.theme];
                  const isSelected = idx === selectedOptionIdx;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => handleSelectOption(idx)}
                      className={clsx(
                        'flex-shrink-0 rounded-2xl px-3 py-2.5 border transition-all duration-200 text-left',
                        isSelected
                          ? 'bg-violet-500/20 border-violet-500/50 shadow-glow-purple'
                          : 'glass border-white/10 hover:border-white/25',
                      )}
                      style={{ minWidth: '150px' }}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-base">{theme.emoji}</span>
                        <span className={clsx('text-xs font-bold', isSelected ? 'text-white' : 'text-white/60')}>
                          Option {opt.optionNumber}
                        </span>
                      </div>
                      <p className={clsx('text-xs font-semibold mb-1', isSelected ? 'text-violet-300' : 'text-white/40')}>
                        {theme.name}
                      </p>
                      <p className={clsx('text-[10px] mb-1.5 line-clamp-1', isSelected ? 'text-white/60' : 'text-white/30')}>
                        {opt.highlight}
                      </p>
                      <div className="flex gap-2 text-[10px] text-white/35">
                        <span>📍 {opt.totalDistanceKm} km</span>
                        <span>⏱ {formatDuration(opt.totalDurationMin)}</span>
                        <span>🎯 {opt.activities.length}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Map */}
              {selectedCity.accommodation && selectedOption && (
                <div className="mb-4 mt-2">
                  <TripMap
                    accommodation={selectedCity.accommodation}
                    activities={selectedOption.activities}
                    height="210px"
                    onMarkerClick={act => setHighlightedActivity(
                      highlightedActivity?.id === act.id ? null : act,
                    )}
                  />
                </div>
              )}

              {/* Timeline */}
              {selectedOption && (
                <div>
                  {/* Theme header + hours-outside selector */}
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className="text-base">{THEME_LABELS[selectedOption.theme]?.emoji}</span>
                    <span className="text-white font-bold text-sm">{THEME_LABELS[selectedOption.theme]?.name}</span>
                    <span className="text-white/30 text-xs ml-auto">{visibleActivities.length} stops</span>
                  </div>

                  {/* Hours Outside Stepper */}
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-white/40 text-xs font-medium">⏰ Time outside:</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setHoursOutside(h => h === null ? 16 : Math.max(1, h - 1))}
                        className="w-7 h-7 rounded-lg bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-300 hover:text-white hover:border-slate-400 transition-all"
                      >
                        <ChevronDown size={14} />
                      </button>
                      <span className="text-white font-bold text-sm min-w-[64px] text-center">
                        {hoursOutside ? `${hoursOutside}h` : 'Full Day'}
                      </span>
                      <button
                        onClick={() => setHoursOutside(h => h === null ? null : h >= 16 ? null : h + 1)}
                        className="w-7 h-7 rounded-lg bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-300 hover:text-white hover:border-slate-400 transition-all"
                      >
                        <ChevronUp size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Start dot */}
                  {selectedCity.accommodation && (
                    <div className="flex items-start gap-3 mb-0">
                      <div className="flex flex-col items-center shrink-0">
                        <div className="w-8 h-8 rounded-xl bg-pink-500/20 border border-pink-500/30 flex items-center justify-center">
                          <Hotel size={13} className="text-pink-400" />
                        </div>
                        <div className="w-px flex-1 min-h-[24px] bg-gradient-to-b from-pink-500/30 to-white/10" />
                      </div>
                      <div className="pt-1.5 pb-3 min-w-0">
                        <p className="text-white/70 text-xs font-semibold">{selectedCity.accommodation.name}</p>
                        <p className="text-white/30 text-[11px]">Depart {selectedOption.startTime}</p>
                      </div>
                    </div>
                  )}

                  {visibleActivities.map((act, i) => {
                    const isLast = i === visibleActivities.length - 1;
                    const commuteOpts = getCommuteOptions(act.distanceFromPrevKm, userCommutes);
                    return (
                      <div key={act.id}>
                        {/* Travel connector — shows all user's commute modes */}
                        {act.distanceFromPrevKm > 0 && commuteOpts.length > 0 && (
                          <div className="flex items-start gap-3 mb-0">
                            <div className="flex flex-col items-center shrink-0 w-8">
                              <div className="w-px flex-1 min-h-[28px] bg-white/10" />
                            </div>
                            <div className="flex items-center gap-3 py-1 flex-wrap">
                              {commuteOpts.map(o => (
                                <span key={o.label} className="text-[11px] text-white/35">
                                  {o.emoji} {o.minutes} min {o.label}
                                </span>
                              ))}
                              <span className="text-white/20 text-[11px]">· {act.distanceFromPrevKm} km</span>
                            </div>
                          </div>
                        )}

                        {/* Activity */}
                        <div className="flex items-start gap-3">
                          <div className="flex flex-col items-center shrink-0">
                            <div className="w-8 h-8 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-[11px] font-black text-violet-300">
                              {i + 1}
                            </div>
                            {(!isLast || selectedCity.accommodation) && (
                              <div className="w-px flex-1 min-h-[16px] bg-white/10" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0 pb-2">
                            {act.arrivalTime && (
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <p className="text-white/35 text-[11px]">{act.arrivalTime} – {act.departureTime}</p>
                                {act.openingHours && isOpenAtArrival(act.openingHours, act.arrivalTime) === false && (
                                  <span className="text-amber-400/80 text-[10px] font-semibold">⚠️ May be closed</span>
                                )}
                                {act.openingHours && isOpenAtArrival(act.openingHours, act.arrivalTime) === true && (
                                  <span className="text-emerald-400/60 text-[10px]">✓ Open</span>
                                )}
                              </div>
                            )}
                            <ActivityCard
                              activity={act}
                              index={i}
                              isSelected={highlightedActivity?.id === act.id}
                              onClick={() => setHighlightedActivity(
                                highlightedActivity?.id === act.id ? null : act,
                              )}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Return to hotel */}
                  {selectedCity.accommodation && selectedOption.activities.length > 0 && (
                    <div className="flex items-start gap-3 mt-0">
                      <div className="flex flex-col items-center shrink-0 w-8">
                        <div className="w-px min-h-[28px] bg-white/10" />
                        <div className="w-8 h-8 rounded-xl bg-pink-500/20 border border-pink-500/30 flex items-center justify-center">
                          <Hotel size={13} className="text-pink-400" />
                        </div>
                      </div>
                      <div className="pt-7">
                        <p className="text-white/40 text-xs font-semibold">Return to {selectedCity.accommodation.name}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="glass rounded-3xl p-6 border border-white/10 text-center">
              <p className="text-white/50 text-sm mb-3">No itinerary generated for this day</p>
              {selectedCity.accommodation && (
                <button
                  onClick={() => generateDaysForCity(trip.id, selectedCity.id)}
                  className="btn-primary text-sm flex items-center gap-2 mx-auto"
                >
                  <Sparkles size={15} /> Generate Itinerary
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
