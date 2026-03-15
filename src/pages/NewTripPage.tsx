import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Plus, MapPin, Calendar, Hotel, Check, Loader2, Search, X } from 'lucide-react';
import { useAuth, COMMUTE_OPTIONS, DIETARY_OPTIONS, INTEREST_OPTIONS } from '../context/AuthContext';
import { useTrips } from '../context/TripContext';
import { format, addDays, parseISO } from 'date-fns';
import clsx from 'clsx';
import type { NewCityData, CommuteType, DietaryRestriction, Interest, UserPreferences } from '../types';

const STEPS = [
  { number: 1, label: 'Destination', emoji: '🌍' },
  { number: 2, label: 'Accommodation', emoji: '🏨' },
  { number: 3, label: 'Preferences', emoji: '⚙️' },
  { number: 4, label: 'Generate', emoji: '✨' },
];

const POPULAR_CITIES = [
  { name: 'Paris', country: 'France', emoji: '🗼', lat: 48.8566, lng: 2.3522 },
  { name: 'Tokyo', country: 'Japan', emoji: '🗾', lat: 35.6762, lng: 139.6503 },
  { name: 'Bangkok', country: 'Thailand', emoji: '🇹🇭', lat: 13.7563, lng: 100.5018 },
  { name: 'New York', country: 'USA', emoji: '🗽', lat: 40.7128, lng: -74.0060 },
  { name: 'London', country: 'UK', emoji: '🎡', lat: 51.5074, lng: -0.1278 },
  { name: 'Rome', country: 'Italy', emoji: '🏛️', lat: 41.9028, lng: 12.4964 },
  { name: 'Barcelona', country: 'Spain', emoji: '⛪', lat: 41.3851, lng: 2.1734 },
  { name: 'Dubai', country: 'UAE', emoji: '🌇', lat: 25.2048, lng: 55.2708 },
  { name: 'Singapore', country: 'Singapore', emoji: '🇸🇬', lat: 1.3521, lng: 103.8198 },
  { name: 'Sydney', country: 'Australia', emoji: '🦘', lat: -33.8688, lng: 151.2093 },
  { name: 'Istanbul', country: 'Turkey', emoji: '🕌', lat: 41.0082, lng: 28.9784 },
  { name: 'Amsterdam', country: 'Netherlands', emoji: '🌷', lat: 52.3676, lng: 4.9041 },
];

export default function NewTripPage() {
  const { user } = useAuth();
  const { createTrip, addCity, setAccommodation, generateDaysForCity } = useTrips();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [tripName, setTripName] = useState('');
  const [cities, setCities] = useState<NewCityData[]>([]);
  const [editingCityIdx, setEditingCityIdx] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [createdTripId, setCreatedTripId] = useState<string | null>(null);

  // Step 2: Accommodation
  const [hotelName, setHotelName] = useState('');
  const [hotelAddress, setHotelAddress] = useState('');
  const [isSearchingHotel, setIsSearchingHotel] = useState(false);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');

  // Step 3: Preferences
  const [commute, setCommute] = useState<CommuteType[]>(user?.preferences.commuteTypes ?? ['walking']);
  const [dietary, setDietary] = useState<DietaryRestriction[]>(user?.preferences.dietaryRestrictions ?? ['none']);
  const [interests, setInterests] = useState<Interest[]>(user?.preferences.interests ?? ['tourist_attractions']);
  const [pace, setPace] = useState<UserPreferences['pacePreference']>(user?.preferences.pacePreference ?? 'moderate');
  const [budget, setBudget] = useState<UserPreferences['budgetRange']>(user?.preferences.budgetRange ?? 'moderate');

  const addCityToList = (city: typeof POPULAR_CITIES[number]) => {
    if (cities.find((c) => c.name === city.name)) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    const newCity: NewCityData = {
      name: city.name,
      country: city.country,
      countryCode: city.emoji,
      lat: city.lat,
      lng: city.lng,
      arrivalDate: today,
      departureDate: format(addDays(new Date(), 3), 'yyyy-MM-dd'),
      accommodation: null,
    };
    setCities([...cities, newCity]);
  };

  const removeCity = (idx: number) => setCities(cities.filter((_, i) => i !== idx));

  const updateCityDates = (idx: number, field: 'arrivalDate' | 'departureDate', val: string) => {
    const updated = [...cities];
    updated[idx] = { ...updated[idx], [field]: val };
    setCities(updated);
  };

  const goNext = async () => {
    if (step === 1) {
      if (!tripName.trim()) { alert('Please enter a trip name'); return; }
      if (!cities.length) { alert('Add at least one city'); return; }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    } else if (step === 3) {
      setStep(4);
      await generateTrip();
    }
  };

  const generateTrip = async () => {
    setIsGenerating(true);
    await new Promise((r) => setTimeout(r, 1500)); // Simulate generation

    const today = format(new Date(), 'yyyy-MM-dd');
    const end = format(addDays(new Date(), cities.reduce((s) => s + 3, 0)), 'yyyy-MM-dd');

    const trip = createTrip({
      name: tripName,
      cities: [],
      startDate: cities[0]?.arrivalDate ?? today,
      endDate: cities[cities.length - 1]?.departureDate ?? end,
    });

    for (const cityData of cities) {
      const city = addCity(trip.id, {
        name: cityData.name,
        country: cityData.country,
        countryCode: cityData.countryCode,
        lat: cityData.lat,
        lng: cityData.lng,
        arrivalDate: cityData.arrivalDate,
        departureDate: cityData.departureDate,
        accommodation: null,
      });

      if (cityData.accommodation) {
        const acc = cityData.accommodation;
        setAccommodation(trip.id, city.id, {
          id: `acc_${Date.now()}`,
          name: (acc.name ?? hotelName) || 'My Hotel',
          address: (acc.address ?? hotelAddress) || `${cityData.name} City Center`,
          lat: acc.lat ?? (cityData.lat + 0.001),
          lng: acc.lng ?? (cityData.lng + 0.001),
          checkIn: checkIn || cityData.arrivalDate,
          checkOut: checkOut || cityData.departureDate,
          type: 'hotel',
        });
        generateDaysForCity(trip.id, city.id);
      }
    }

    setCreatedTripId(trip.id);
    setIsGenerating(false);
  };

  return (
    <div className="min-h-screen bg-gradient-hero pb-10 safe-top">
      {/* Header */}
      <div className="px-5 pt-12 pb-4 flex items-center gap-3">
        <button onClick={() => step > 1 ? setStep(step - 1) : navigate(-1)} className="w-10 h-10 rounded-2xl glass flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-black text-white">New Trip</h1>
          <p className="text-white/50 text-sm">{STEPS[step - 1].label}</p>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="px-5 mb-6">
        <div className="flex gap-2">
          {STEPS.map((s) => (
            <div key={s.number} className={clsx(
              'flex-1 h-1.5 rounded-full transition-all duration-500',
              s.number <= step ? 'bg-gradient-to-r from-violet-600 to-pink-600' : 'bg-white/10',
            )} />
          ))}
        </div>
        <div className="flex justify-between mt-1.5">
          {STEPS.map((s) => (
            <span key={s.number} className={clsx('text-xs font-medium transition-colors', s.number === step ? 'text-violet-400' : 'text-white/30')}>
              {s.emoji}
            </span>
          ))}
        </div>
      </div>

      <div className="px-5">
        {/* ── Step 1: Destination ── */}
        {step === 1 && (
          <div className="space-y-5 animate-slide-up">
            <div>
              <label className="text-white/60 text-sm font-medium mb-2 block">Trip Name</label>
              <input
                value={tripName}
                onChange={(e) => setTripName(e.target.value)}
                placeholder="e.g. Euro Summer 2025 ✈️"
                className="input-field text-lg font-semibold"
              />
            </div>

            <div>
              <label className="text-white/60 text-sm font-medium mb-3 block">Pick Your Cities</label>
              <div className="grid grid-cols-3 gap-2">
                {POPULAR_CITIES.map((city) => {
                  const added = cities.some((c) => c.name === city.name);
                  return (
                    <button
                      key={city.name}
                      onClick={() => added ? removeCity(cities.findIndex((c) => c.name === city.name)) : addCityToList(city)}
                      className={clsx(
                        'rounded-2xl p-3 flex flex-col items-center gap-1 border transition-all duration-200',
                        added
                          ? 'bg-violet-500/20 border-violet-500/50 shadow-glow-purple'
                          : 'glass border-white/10 hover:border-white/25',
                      )}
                    >
                      <span className="text-2xl">{city.emoji}</span>
                      <span className="text-white text-xs font-semibold">{city.name}</span>
                      <span className="text-white/40 text-[10px]">{city.country}</span>
                      {added && <Check size={12} className="text-violet-400" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {cities.length > 0 && (
              <div>
                <label className="text-white/60 text-sm font-medium mb-2 block">Set Dates</label>
                <div className="space-y-2">
                  {cities.map((city, idx) => (
                    <div key={city.name} className="glass rounded-2xl p-3 border border-white/10">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{city.countryCode}</span>
                        <span className="text-white font-semibold">{city.name}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-white/40 text-xs mb-1 block">Arrival</label>
                          <input type="date" value={city.arrivalDate}
                            onChange={(e) => updateCityDates(idx, 'arrivalDate', e.target.value)}
                            className="input-field text-sm py-2" />
                        </div>
                        <div>
                          <label className="text-white/40 text-xs mb-1 block">Departure</label>
                          <input type="date" value={city.departureDate}
                            onChange={(e) => updateCityDates(idx, 'departureDate', e.target.value)}
                            className="input-field text-sm py-2" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Accommodation ── */}
        {step === 2 && (
          <div className="space-y-4 animate-slide-up">
            <div className="glass rounded-3xl p-4 border border-white/10">
              <h3 className="text-white font-bold mb-1">Where are you staying?</h3>
              <p className="text-white/50 text-sm mb-4">We'll use this to generate routes that start and end at your accommodation.</p>

              {cities.map((city, idx) => (
                <div key={city.name} className="mb-4 last:mb-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{city.countryCode}</span>
                    <span className="text-white font-semibold text-sm">{city.name}</span>
                  </div>

                  <div className="space-y-2">
                    <input
                      placeholder="Hotel / Airbnb name"
                      className="input-field"
                      onChange={(e) => {
                        const updated = [...cities];
                        updated[idx] = {
                          ...updated[idx],
                          accommodation: { ...(updated[idx].accommodation ?? {}), name: e.target.value } as any,
                        };
                        setCities(updated);
                      }}
                    />
                    <input
                      placeholder={`Hotel address in ${city.name}`}
                      className="input-field"
                      onChange={(e) => {
                        const updated = [...cities];
                        updated[idx] = {
                          ...updated[idx],
                          accommodation: {
                            ...(updated[idx].accommodation ?? {}),
                            name: updated[idx].accommodation?.name ?? '',
                            address: e.target.value,
                            lat: city.lat + 0.002,
                            lng: city.lng + 0.002,
                          } as any,
                        };
                        setCities(updated);
                      }}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-white/40 text-xs mb-1 block">Check-in</label>
                        <input type="date" defaultValue={city.arrivalDate} className="input-field text-sm py-2"
                          onChange={(e) => setCheckIn(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-white/40 text-xs mb-1 block">Check-out</label>
                        <input type="date" defaultValue={city.departureDate} className="input-field text-sm py-2"
                          onChange={(e) => setCheckOut(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="glass rounded-3xl p-4 border border-white/10">
              <p className="text-white/60 text-sm">
                💡 <strong className="text-white">Tip:</strong> Enter your hotel address accurately for the best route optimization. We'll geocode it using Google Maps.
              </p>
            </div>
          </div>
        )}

        {/* ── Step 3: Preferences ── */}
        {step === 3 && (
          <div className="space-y-5 animate-slide-up">
            {/* Commute */}
            <div>
              <label className="text-white font-semibold mb-1 block">How do you get around?</label>
              <p className="text-white/50 text-xs mb-3">Select all that apply — we'll estimate travel times accordingly</p>
              <div className="flex flex-wrap gap-2">
                {COMMUTE_OPTIONS.map((opt) => {
                  const selected = commute.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setCommute(selected ? commute.filter((c) => c !== opt.value) : [...commute, opt.value])}
                      className={clsx(
                        'flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all',
                        selected ? 'bg-violet-500/20 border-violet-500/50 text-violet-300' : 'glass border-white/10 text-white/60 hover:text-white',
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
                {DIETARY_OPTIONS.map((opt) => {
                  const selected = dietary.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setDietary(selected ? dietary.filter((d) => d !== opt.value) : [...dietary, opt.value])}
                      className={clsx(
                        'flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all',
                        selected ? 'bg-amber-500/20 border-amber-500/50 text-amber-300' : 'glass border-white/10 text-white/60 hover:text-white',
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
                ] as const).map((p) => (
                  <button
                    key={p.val}
                    onClick={() => setPace(p.val)}
                    className={clsx(
                      'rounded-2xl p-3 border flex flex-col items-center gap-1 transition-all',
                      pace === p.val ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300' : 'glass border-white/10 text-white/60',
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
                ] as const).map((b) => (
                  <button
                    key={b.val}
                    onClick={() => setBudget(b.val)}
                    className={clsx(
                      'rounded-2xl p-3 border flex flex-col items-center gap-1 transition-all',
                      budget === b.val ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : 'glass border-white/10 text-white/60',
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

        {/* ── Step 4: Generating ── */}
        {step === 4 && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] gap-6 animate-fade-in">
            {isGenerating ? (
              <>
                <div className="relative">
                  <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center text-4xl shadow-glow-purple animate-pulse-glow">
                    ✨
                  </div>
                  <div className="absolute inset-0 rounded-3xl border-2 border-violet-500 animate-ping opacity-30" />
                </div>
                <div className="text-center">
                  <h2 className="text-2xl font-black text-white mb-2">Generating Your Trip</h2>
                  <p className="text-white/50">Finding the best places near your hotels...</p>
                </div>
                <div className="space-y-2 w-full max-w-xs">
                  {['📍 Locating your accommodations', '🗺️ Finding nearby attractions', '🍜 Filtering by your diet', '🔄 Optimizing 5 routes per day', '✅ Saving your itinerary'].map((step, i) => (
                    <div key={step} className="flex items-center gap-3 glass rounded-2xl px-4 py-2 animate-fade-in" style={{ animationDelay: `${i * 0.3}s` }}>
                      <Loader2 size={14} className="text-violet-400 animate-spin" />
                      <span className="text-white/70 text-sm">{step}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : createdTripId ? (
              <>
                <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center text-4xl shadow-glow-teal">
                  🎉
                </div>
                <div className="text-center">
                  <h2 className="text-2xl font-black text-white mb-2">Your Trip is Ready!</h2>
                  <p className="text-white/50">5 itinerary options generated for each day</p>
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

        {/* Next Button */}
        {step < 4 && (
          <button onClick={goNext} className="btn-primary w-full mt-8 flex items-center justify-center gap-2 text-base py-4">
            {step === 3 ? '✨ Generate Itinerary' : 'Continue'} <ArrowRight size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
