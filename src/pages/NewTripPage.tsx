import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Plus, MapPin, Check, Loader2, X, Hotel,
} from 'lucide-react';
import { useAuth, COMMUTE_OPTIONS, DIETARY_OPTIONS } from '../context/AuthContext';
import { useTrips } from '../context/TripContext';
import { useGoogleMaps } from '../hooks/useGoogleMaps';
import { buildItineraryDay } from '../utils/itinerary';
import { eachDayOfInterval, parseISO, format, addDays } from 'date-fns';
import clsx from 'clsx';
import type { CommuteType, DietaryRestriction, UserPreferences, Trip, CityEntry, Accommodation } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CityBlock {
  id: string;
  // City autocomplete
  cityInput: string;
  cityConfirmed: boolean;
  name: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  // Accommodation autocomplete
  accInput: string;
  accConfirmed: boolean;
  accName: string;
  accAddress: string;
  accLat: number | null;
  accLng: number | null;
  // Dates
  arrivalDate: string;
  departureDate: string;
  isDayTrip: boolean;
}

function makeCityBlock(id: string, afterDate?: string): CityBlock {
  const base = afterDate ? parseISO(afterDate) : new Date();
  return {
    id,
    cityInput: '', cityConfirmed: false,
    name: '', country: '', countryCode: '', lat: 0, lng: 0,
    accInput: '', accConfirmed: false,
    accName: '', accAddress: '', accLat: null, accLng: null,
    arrivalDate: format(base, 'yyyy-MM-dd'),
    departureDate: format(addDays(base, 3), 'yyyy-MM-dd'),
    isDayTrip: false,
  };
}

const STEPS = [
  { number: 1, label: 'Plan Your Trip', emoji: '🌍' },
  { number: 2, label: 'Preferences',    emoji: '⚙️' },
  { number: 3, label: 'Generate',       emoji: '✨' },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NewTripPage() {
  const { user } = useAuth();
  const { createFullTrip } = useTrips();
  const navigate = useNavigate();
  const apiKey = user?.preferences?.googleMapsApiKey ?? '';
  const { isLoaded: mapsLoaded } = useGoogleMaps(apiKey);

  const [step, setStep] = useState(1);
  const [tripName, setTripName] = useState('');
  const [blocks, setBlocks] = useState<CityBlock[]>([makeCityBlock('city_0')]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [createdTripId, setCreatedTripId] = useState<string | null>(null);

  const [commute, setCommute] = useState<CommuteType[]>(user?.preferences.commuteTypes ?? ['walking']);
  const [dietary, setDietary] = useState<DietaryRestriction[]>(user?.preferences.dietaryRestrictions ?? ['none']);
  const [pace, setPace] = useState<UserPreferences['pacePreference']>(user?.preferences.pacePreference ?? 'moderate');
  const [budget, setBudget] = useState<UserPreferences['budgetRange']>(user?.preferences.budgetRange ?? 'moderate');

  const updateBlock = useCallback((id: string, data: Partial<CityBlock>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...data } : b));
  }, []);

  const addBlock = () => {
    const last = blocks[blocks.length - 1];
    setBlocks(prev => [...prev, makeCityBlock(`city_${Date.now()}`, last?.departureDate)]);
  };

  const removeBlock = (id: string) => setBlocks(prev => prev.filter(b => b.id !== id));

  const validBlocks = blocks.filter(b => b.cityConfirmed);
  const canContinue = !!tripName.trim() && validBlocks.length > 0;

  const goNext = async () => {
    if (step === 1) {
      if (!tripName.trim() || !validBlocks.length) return;
      setStep(2);
    } else if (step === 2) {
      setStep(3);
      await generateTrip();
    }
  };

  const generateTrip = async () => {
    setIsGenerating(true);
    await new Promise(r => setTimeout(r, 1500));

    const today = format(new Date(), 'yyyy-MM-dd');
    const confirmedBlocks = blocks.filter(b => b.cityConfirmed);
    const tripId = `trip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Build all cities (with accommodation + itinerary days) in memory first
    const cities: CityEntry[] = confirmedBlocks.map((block, blockIdx) => {
      const cityId = `city_${Date.now()}_${blockIdx}_${Math.random().toString(36).slice(2, 6)}`;

      const accommodation: Accommodation | null = block.accName ? {
        id: `acc_${Date.now()}_${blockIdx}`,
        name: block.accName,
        address: block.accAddress || `${block.name} City Center`,
        lat: block.accLat ?? block.lat + 0.001,
        lng: block.accLng ?? block.lng + 0.001,
        checkIn: block.arrivalDate,
        checkOut: block.departureDate,
        type: 'hotel',
      } : null;

      let itineraryDays: import('../types').ItineraryDay[] = [];
      if (accommodation) {
        try {
          const days = eachDayOfInterval({
            start: parseISO(block.arrivalDate),
            end: parseISO(block.departureDate),
          });
          let visitedIds: string[] = [];
          itineraryDays = days.map((date, i) => {
            const day = buildItineraryDay(
              cityId,
              format(date, 'yyyy-MM-dd'),
              i + 1,
              accommodation,
              block.name,
              visitedIds,
              user!.preferences,
            );
            const opt = day.options[0];
            if (opt) visitedIds = [...visitedIds, ...opt.activities.map((a: import('../types').Activity) => a.id).filter((id: string) => !id.startsWith('meal-'))];
            return day;
          });
        } catch { /* invalid date range — leave itineraryDays empty */ }
      }

      return {
        id: cityId,
        tripId,
        name: block.name,
        country: block.country,
        countryCode: block.countryCode,
        lat: block.lat,
        lng: block.lng,
        arrivalDate: block.arrivalDate,
        departureDate: block.departureDate,
        accommodation,
        itineraryDays,
      };
    });

    // Single atomic write — no sequential state mutations
    const trip: Trip = {
      id: tripId,
      userId: user!.id,
      name: tripName,
      cities,
      startDate: confirmedBlocks[0]?.arrivalDate ?? today,
      endDate: confirmedBlocks[confirmedBlocks.length - 1]?.departureDate ?? today,
      status: 'planning',
      createdAt: new Date().toISOString(),
    };

    createFullTrip(trip);
    setCreatedTripId(tripId);
    setIsGenerating(false);
  };

  return (
    <div className="min-h-screen bg-gradient-hero pb-28 safe-top max-w-3xl mx-auto">
      {/* Header */}
      <div className="px-5 pt-12 pb-4 flex items-center gap-3">
        <button
          onClick={() => (step > 1 ? setStep(step - 1) : navigate(-1))}
          className="w-10 h-10 rounded-2xl glass flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-tight">New Trip</h1>
          <p className="text-slate-400 text-sm font-medium">{STEPS[step - 1].label}</p>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="px-5 mb-6">
        <div className="flex gap-2 mb-2">
          {STEPS.map(s => (
            <div
              key={s.number}
              className={clsx(
                'flex-1 h-1.5 rounded-full transition-all duration-500',
                s.number <= step ? 'bg-gradient-to-r from-violet-600 to-indigo-500' : 'bg-white/10',
              )}
            />
          ))}
        </div>
        <div className="flex justify-between">
          {STEPS.map(s => (
            <span
              key={s.number}
              className={clsx(
                'text-[11px] font-semibold transition-colors',
                s.number === step ? 'text-violet-400' : 'text-white/25',
              )}
            >
              {s.emoji} {s.label}
            </span>
          ))}
        </div>
      </div>

      <div className="px-5">
        {/* ── Step 1: Plan ── */}
        {step === 1 && (
          <div className="space-y-5 animate-slide-up">
            {/* Trip Name */}
            <div>
              <label className="text-white/60 text-sm font-medium mb-2 block">Trip Name</label>
              <input
                value={tripName}
                onChange={e => setTripName(e.target.value)}
                placeholder="e.g. Euro Summer 2025 ✈️"
                className="input-field text-lg font-semibold"
              />
            </div>

            {/* City Blocks */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-white/60 text-sm font-medium">Cities & Accommodation</label>
                {validBlocks.length > 0 && (
                  <span className="text-violet-400 text-xs font-semibold">
                    {validBlocks.length} {validBlocks.length === 1 ? 'city' : 'cities'} added
                  </span>
                )}
              </div>
              <div className="space-y-3">
                {blocks.map((block, idx) => (
                  <CitySearchBlock
                    key={block.id}
                    block={block}
                    index={idx}
                    canRemove={blocks.length > 1}
                    mapsLoaded={mapsLoaded}
                    onUpdate={data => updateBlock(block.id, data)}
                    onRemove={() => removeBlock(block.id)}
                  />
                ))}
              </div>
              <button
                onClick={addBlock}
                className="mt-3 w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-dashed border-violet-500/30 text-violet-400/70 hover:text-violet-400 hover:border-violet-500/60 hover:bg-violet-500/5 transition-all text-sm font-semibold"
              >
                <Plus size={15} /> Add Another City
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Preferences ── */}
        {step === 2 && (
          <div className="space-y-5 animate-slide-up">
            {/* Commute */}
            <div>
              <label className="text-white font-semibold mb-1 block">How do you get around?</label>
              <p className="text-white/50 text-xs mb-3">Select all that apply — we'll estimate travel times accordingly</p>
              <div className="flex flex-wrap gap-2">
                {COMMUTE_OPTIONS.map(opt => {
                  const selected = commute.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setCommute(selected ? commute.filter(c => c !== opt.value) : [...commute, opt.value])}
                      className={clsx(
                        'flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all',
                        selected
                          ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                          : 'bg-slate-700 border-slate-600 text-slate-100 hover:bg-slate-600',
                      )}
                    >
                      <span>{opt.emoji}</span> {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dietary */}
            <div>
              <label className="text-white font-semibold mb-1 block">Dietary preferences</label>
              <p className="text-white/50 text-xs mb-3">We'll filter restaurant suggestions accordingly</p>
              <div className="flex flex-wrap gap-2">
                {DIETARY_OPTIONS.map(opt => {
                  const selected = dietary.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setDietary(selected ? dietary.filter(d => d !== opt.value) : [...dietary, opt.value])}
                      className={clsx(
                        'flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all',
                        selected
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                          : 'bg-slate-700 border-slate-600 text-slate-100 hover:bg-slate-600',
                      )}
                    >
                      <span>{opt.emoji}</span> {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pace */}
            <div>
              <label className="text-white font-semibold mb-3 block">Travel pace</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { val: 'relaxed', emoji: '🧘', label: 'Relaxed', desc: '4 stops/day' },
                  { val: 'moderate', emoji: '🚶', label: 'Moderate', desc: '6 stops/day' },
                  { val: 'packed', emoji: '🏃', label: 'Packed', desc: '8 stops/day' },
                ] as const).map(p => (
                  <button
                    key={p.val}
                    onClick={() => setPace(p.val)}
                    className={clsx(
                      'rounded-2xl p-3 border flex flex-col items-center gap-1 transition-all',
                      pace === p.val
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                        : 'glass border-white/10 text-white/60',
                    )}
                  >
                    <span className="text-2xl">{p.emoji}</span>
                    <span className="text-xs font-semibold">{p.label}</span>
                    <span className="text-[10px] opacity-60">{p.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Budget */}
            <div>
              <label className="text-white font-semibold mb-3 block">Budget range</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { val: 'budget', emoji: '💰', label: 'Budget', desc: '$ – $$' },
                  { val: 'moderate', emoji: '💳', label: 'Moderate', desc: '$$ – $$$' },
                  { val: 'luxury', emoji: '💎', label: 'Luxury', desc: '$$$ – $$$$' },
                ] as const).map(b => (
                  <button
                    key={b.val}
                    onClick={() => setBudget(b.val)}
                    className={clsx(
                      'rounded-2xl p-3 border flex flex-col items-center gap-1 transition-all',
                      budget === b.val
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                        : 'glass border-white/10 text-white/60',
                    )}
                  >
                    <span className="text-2xl">{b.emoji}</span>
                    <span className="text-xs font-semibold">{b.label}</span>
                    <span className="text-[10px] opacity-60">{b.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Generating ── */}
        {step === 3 && (
          <div className="flex flex-col items-center justify-center min-h-[55vh] gap-6 animate-fade-in">
            {isGenerating ? (
              <>
                <div className="relative">
                  <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center text-4xl shadow-glow-purple animate-pulse-glow">
                    ✨
                  </div>
                  <div className="absolute inset-0 rounded-3xl border-2 border-violet-500 animate-ping opacity-30" />
                </div>
                <div className="text-center">
                  <h2 className="text-2xl font-black text-white mb-2">Building Your Trip</h2>
                  <p className="text-white/50 text-sm">Crafting the perfect itinerary for each day…</p>
                </div>
                <div className="space-y-2 w-full max-w-xs">
                  {[
                    '📍 Locating your accommodations',
                    '🗺️ Finding nearby attractions',
                    '🍜 Filtering by your preferences',
                    '🔄 Optimising routes per day',
                    '✅ Saving your itinerary',
                  ].map((label, i) => (
                    <div
                      key={label}
                      className="flex items-center gap-3 glass rounded-2xl px-4 py-2.5 animate-fade-in"
                      style={{ animationDelay: `${i * 0.3}s` }}
                    >
                      <Loader2 size={14} className="text-violet-400 animate-spin shrink-0" />
                      <span className="text-white/70 text-sm">{label}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : createdTripId ? (
              <>
                <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center text-4xl">
                  🎉
                </div>
                <div className="text-center">
                  <h2 className="text-2xl font-black text-white mb-2">Your Trip is Ready!</h2>
                  <p className="text-white/50 text-sm">Itinerary options generated for each day</p>
                </div>
                <button
                  onClick={() => navigate(`/trips/${createdTripId}`)}
                  className="btn-primary flex items-center gap-2 text-lg px-8 py-4"
                >
                  View My Itinerary <ArrowRight size={20} />
                </button>
              </>
            ) : null}
          </div>
        )}

        {/* Continue / Generate Button */}
        {step < 3 && (
          <button
            onClick={goNext}
            disabled={step === 1 && !canContinue}
            className="btn-primary w-full mt-8 flex items-center justify-center gap-2 text-base py-4 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {step === 2 ? '✨ Generate Itinerary' : 'Continue'} <ArrowRight size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── City Search Block ────────────────────────────────────────────────────────

function CitySearchBlock({
  block, index, canRemove, mapsLoaded, onUpdate, onRemove,
}: {
  block: CityBlock;
  index: number;
  canRemove: boolean;
  mapsLoaded: boolean;
  onUpdate: (data: Partial<CityBlock>) => void;
  onRemove: () => void;
}) {
  const [citySuggestions, setCitySuggestions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [accSuggestions, setAccSuggestions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [cityLoading, setCityLoading] = useState(false);
  const [accLoading, setAccLoading] = useState(false);
  const [showCityDrop, setShowCityDrop] = useState(false);
  const [showAccDrop, setShowAccDrop] = useState(false);
  const [cityDropUp, setCityDropUp] = useState(false);
  const [accDropUp, setAccDropUp] = useState(false);

  const acSvc = useRef<google.maps.places.AutocompleteService | null>(null);
  const plSvc = useRef<google.maps.places.PlacesService | null>(null);
  const cityTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const accTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const cityInputRef = useRef<HTMLDivElement>(null);
  const accInputRef = useRef<HTMLDivElement>(null);

  const measureAndShow = (
    ref: React.RefObject<HTMLDivElement | null>,
    setDropUp: (v: boolean) => void,
    setShow: (v: boolean) => void,
  ) => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 80; // 80 = bottom nav
      setDropUp(spaceBelow < 220);
    }
    setShow(true);
  };

  useEffect(() => {
    if (mapsLoaded && window.google?.maps?.places && !acSvc.current) {
      acSvc.current = new window.google.maps.places.AutocompleteService();
      plSvc.current = new window.google.maps.places.PlacesService(document.createElement('div'));
    }
  }, [mapsLoaded]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setShowCityDrop(false);
        setShowAccDrop(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── City search ──────────────────────────────────────────────────────────

  const handleCityInput = (val: string) => {
    onUpdate({ cityInput: val, cityConfirmed: false });
    clearTimeout(cityTimer.current);
    if (!val.trim() || !acSvc.current) {
      setCitySuggestions([]);
      setShowCityDrop(false);
      return;
    }
    setCityLoading(true);
    cityTimer.current = setTimeout(() => {
      acSvc.current!.getPlacePredictions(
        { input: val, types: ['(cities)'] },
        (predictions, status) => {
          setCityLoading(false);
          if (
            status === window.google.maps.places.PlacesServiceStatus.OK &&
            predictions?.length
          ) {
            setCitySuggestions(predictions);
            measureAndShow(cityInputRef, setCityDropUp, setShowCityDrop);
          } else {
            setCitySuggestions([]);
            setShowCityDrop(false);
          }
        },
      );
    }, 280);
  };

  const pickCity = (pred: google.maps.places.AutocompletePrediction) => {
    setShowCityDrop(false);
    setCitySuggestions([]);
    if (!plSvc.current) {
      onUpdate({
        cityInput: pred.structured_formatting.main_text,
        cityConfirmed: true,
        name: pred.structured_formatting.main_text,
        country: pred.structured_formatting.secondary_text?.split(',').pop()?.trim() ?? '',
        countryCode: '',
        lat: 0, lng: 0,
      });
      return;
    }
    plSvc.current.getDetails(
      { placeId: pred.place_id, fields: ['geometry', 'address_components', 'name'] },
      (result, status) => {
        if (
          status !== window.google.maps.places.PlacesServiceStatus.OK ||
          !result?.geometry?.location
        ) return;
        const lat = result.geometry.location.lat();
        const lng = result.geometry.location.lng();
        let country = '';
        let countryCode = '';
        for (const comp of result.address_components ?? []) {
          if (comp.types.includes('country')) {
            country = comp.long_name;
            countryCode = comp.short_name;
            break;
          }
        }
        onUpdate({
          cityInput: pred.structured_formatting.main_text,
          cityConfirmed: true,
          name: pred.structured_formatting.main_text,
          country,
          countryCode,
          lat,
          lng,
          // reset accommodation when city changes
          accInput: '', accConfirmed: false,
          accName: '', accAddress: '', accLat: null, accLng: null,
        });
      },
    );
  };

  // ── Accommodation search ──────────────────────────────────────────────────

  const handleAccInput = (val: string) => {
    onUpdate({ accInput: val, accConfirmed: false });
    clearTimeout(accTimer.current);
    if (!val.trim() || !acSvc.current || !block.cityConfirmed) {
      setAccSuggestions([]);
      setShowAccDrop(false);
      return;
    }
    setAccLoading(true);
    accTimer.current = setTimeout(() => {
      acSvc.current!.getPlacePredictions(
        {
          input: val,
          location: new window.google.maps.LatLng(block.lat, block.lng),
          radius: 30000,
        },
        (predictions, status) => {
          setAccLoading(false);
          if (
            status === window.google.maps.places.PlacesServiceStatus.OK &&
            predictions?.length
          ) {
            setAccSuggestions(predictions);
            measureAndShow(accInputRef, setAccDropUp, setShowAccDrop);
          } else {
            setAccSuggestions([]);
            setShowAccDrop(false);
          }
        },
      );
    }, 280);
  };

  const pickAcc = (pred: google.maps.places.AutocompletePrediction) => {
    setShowAccDrop(false);
    setAccSuggestions([]);
    if (!plSvc.current) {
      onUpdate({
        accInput: pred.structured_formatting.main_text,
        accConfirmed: true,
        accName: pred.structured_formatting.main_text,
        accAddress: pred.description,
        accLat: null, accLng: null,
      });
      return;
    }
    plSvc.current.getDetails(
      { placeId: pred.place_id, fields: ['geometry', 'name', 'formatted_address'] },
      (result, status) => {
        if (
          status !== window.google.maps.places.PlacesServiceStatus.OK ||
          !result?.geometry?.location
        ) {
          onUpdate({
            accInput: pred.structured_formatting.main_text,
            accConfirmed: true,
            accName: pred.structured_formatting.main_text,
            accAddress: pred.description,
            accLat: null, accLng: null,
          });
          return;
        }
        onUpdate({
          accInput: result.name ?? pred.structured_formatting.main_text,
          accConfirmed: true,
          accName: result.name ?? pred.structured_formatting.main_text,
          accAddress: result.formatted_address ?? pred.description,
          accLat: result.geometry.location.lat(),
          accLng: result.geometry.location.lng(),
        });
      },
    );
  };

  const today = format(new Date(), 'yyyy-MM-dd');
  const minDep = block.isDayTrip
    ? (block.arrivalDate || today)
    : block.arrivalDate
      ? format(addDays(parseISO(block.arrivalDate), 1), 'yyyy-MM-dd')
      : format(addDays(new Date(), 1), 'yyyy-MM-dd');

  return (
    <div ref={containerRef} className="glass rounded-3xl p-4 border border-white/10 space-y-3">
      {/* Card Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-violet-500/25 flex items-center justify-center text-[10px] font-bold text-violet-300">
            {index + 1}
          </div>
          <span className="text-white/40 text-xs font-bold uppercase tracking-widest">City {index + 1}</span>
        </div>
        {canRemove && (
          <button
            onClick={onRemove}
            className="w-7 h-7 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400/40 hover:bg-red-500/20 hover:text-red-400 transition-all"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* ── City Search ── */}
      <div className="relative" ref={cityInputRef}>
        <div className="relative">
          <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-400 pointer-events-none z-10" />
          <input
            value={block.cityInput}
            onChange={e => handleCityInput(e.target.value)}
            placeholder="Search any city or town in the world…"
            className={clsx(
              'input-field pl-9 pr-9 w-full',
              block.cityConfirmed && 'border-violet-500/50',
            )}
          />
          {cityLoading && (
            <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 animate-spin pointer-events-none" />
          )}
          {block.cityConfirmed && !cityLoading && (
            <Check size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 pointer-events-none" />
          )}
        </div>
        {block.cityConfirmed && block.country && (
          <p className="text-white/35 text-[11px] mt-1 pl-1">{block.country}</p>
        )}
        {/* City Dropdown */}
        {showCityDrop && citySuggestions.length > 0 && (
          <div
            className={clsx(
              'absolute left-0 right-0 z-[200] rounded-2xl overflow-y-auto border border-white/10 shadow-2xl',
              cityDropUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
            )}
            style={{ background: 'rgba(13,19,41,0.97)', backdropFilter: 'blur(20px)', maxHeight: '224px' }}
          >
            {citySuggestions.slice(0, 6).map(pred => (
              <button
                key={pred.place_id}
                onMouseDown={e => { e.preventDefault(); pickCity(pred); }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left border-b border-white/5 last:border-0"
              >
                <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0">
                  <MapPin size={12} className="text-violet-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-white text-sm font-semibold truncate">
                    {pred.structured_formatting.main_text}
                  </p>
                  <p className="text-white/40 text-xs truncate">
                    {pred.structured_formatting.secondary_text}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Day Trip Toggle ── */}
      <label className="flex items-center gap-2.5 cursor-pointer select-none group">
        <div
          onClick={() => {
            const toggled = !block.isDayTrip;
            const updates: Partial<CityBlock> = { isDayTrip: toggled };
            if (toggled) {
              // Sync departure = arrival for day trips
              updates.departureDate = block.arrivalDate;
              // Clear accommodation
              updates.accInput = '';
              updates.accConfirmed = false;
              updates.accName = '';
              updates.accAddress = '';
              updates.accLat = null;
              updates.accLng = null;
            } else {
              // Restore departure to arrival + 1
              updates.departureDate = format(addDays(parseISO(block.arrivalDate), 1), 'yyyy-MM-dd');
            }
            onUpdate(updates);
          }}
          className={clsx(
            'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0',
            block.isDayTrip
              ? 'bg-violet-500 border-violet-500'
              : 'border-white/25 bg-white/5 group-hover:border-white/40',
          )}
        >
          {block.isDayTrip && <Check size={11} className="text-white" />}
        </div>
        <span className="text-white/60 text-sm font-medium group-hover:text-white/80 transition-colors">
          Day trip <span className="text-white/30 font-normal">(no overnight stay)</span>
        </span>
      </label>

      {/* ── Accommodation Search ── */}
      {!block.isDayTrip && <div className="relative" ref={accInputRef}>
        <div className="relative">
          <Hotel
            size={14}
            className={clsx(
              'absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10 transition-colors',
              block.cityConfirmed ? 'text-pink-400' : 'text-white/20',
            )}
          />
          <input
            value={block.accInput}
            onChange={e => handleAccInput(e.target.value)}
            disabled={!block.cityConfirmed}
            placeholder={
              block.cityConfirmed
                ? `Hotel, Airbnb, hostel in ${block.name}…`
                : 'Select a city first'
            }
            className={clsx(
              'input-field pl-9 pr-9 w-full transition-all',
              !block.cityConfirmed && 'opacity-40 cursor-not-allowed',
              block.accConfirmed && 'border-pink-500/40',
            )}
          />
          {accLoading && (
            <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 animate-spin pointer-events-none" />
          )}
          {block.accConfirmed && !accLoading && (
            <Check size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 pointer-events-none" />
          )}
        </div>
        {block.accConfirmed && block.accAddress && (
          <p className="text-white/35 text-[11px] mt-1 pl-1 truncate">{block.accAddress}</p>
        )}
        {/* Accommodation Dropdown */}
        {showAccDrop && accSuggestions.length > 0 && (
          <div
            className={clsx(
              'absolute left-0 right-0 z-[200] rounded-2xl overflow-y-auto border border-white/10 shadow-2xl',
              accDropUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
            )}
            style={{ background: 'rgba(13,19,41,0.97)', backdropFilter: 'blur(20px)', maxHeight: '224px' }}
          >
            {accSuggestions.slice(0, 6).map(pred => (
              <button
                key={pred.place_id}
                onMouseDown={e => { e.preventDefault(); pickAcc(pred); }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left border-b border-white/5 last:border-0"
              >
                <div className="w-7 h-7 rounded-lg bg-pink-500/15 flex items-center justify-center shrink-0">
                  <Hotel size={12} className="text-pink-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-white text-sm font-semibold truncate">
                    {pred.structured_formatting.main_text}
                  </p>
                  <p className="text-white/40 text-xs truncate">
                    {pred.structured_formatting.secondary_text}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>}

      {/* ── Dates ── */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div>
          <label className="text-white/40 text-xs mb-1.5 block font-medium">Arrival</label>
          <input
            type="date"
            value={block.arrivalDate}
            min={today}
            onChange={e => {
              const val = e.target.value;
              const updates: Partial<CityBlock> = { arrivalDate: val };
              // Auto-bump departure if it would fall before new arrival (skip for day trips)
              if (!block.isDayTrip && block.departureDate && block.departureDate <= val) {
                updates.departureDate = format(addDays(parseISO(val), 1), 'yyyy-MM-dd');
              }
              // For day trips keep departure in sync with arrival
              if (block.isDayTrip) {
                updates.departureDate = val;
              }
              onUpdate(updates);
            }}
            className="input-field text-sm py-2 w-full"
          />
        </div>
        <div>
          <label className="text-white/40 text-xs mb-1.5 block font-medium">Departure</label>
          <input
            type="date"
            value={block.departureDate}
            min={minDep}
            onChange={e => onUpdate({ departureDate: e.target.value })}
            className="input-field text-sm py-2 w-full"
          />
        </div>
      </div>
    </div>
  );
}
