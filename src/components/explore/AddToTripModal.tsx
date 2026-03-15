import { useState } from 'react';
import { X, MapPin, Calendar, Clock, Check, Plus } from 'lucide-react';
import { useTrips } from '../../context/TripContext';
import { useNavigate } from 'react-router-dom';
import type { Activity, Trip, CityEntry, ItineraryDay } from '../../types';
import clsx from 'clsx';

interface Props {
  activity: Activity;
  onClose: () => void;
}

const TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
  '20:00', '20:30', '21:00',
];

export default function AddToTripModal({ activity, onClose }: Props) {
  const { trips, addActivityToDay } = useTrips();
  const navigate = useNavigate();

  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [selectedCity, setSelectedCity] = useState<CityEntry | null>(null);
  const [selectedDay, setSelectedDay] = useState<ItineraryDay | null>(null);
  const [selectedTime, setSelectedTime] = useState('10:00');
  const [added, setAdded] = useState(false);

  const planningTrips = trips.filter((t) => t.status !== 'completed');

  const handleAdd = () => {
    if (!selectedTrip || !selectedCity || !selectedDay) return;
    addActivityToDay(selectedTrip.id, selectedCity.id, selectedDay.id, activity, selectedTime);
    setAdded(true);
    setTimeout(() => {
      onClose();
      navigate(`/trips/${selectedTrip.id}/city/${selectedCity.id}/day/${selectedDay.id}`);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md glass rounded-3xl p-6 shadow-card-hover max-h-[85vh] overflow-y-auto scroll-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex-1 min-w-0">
            <p className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-1">Save to Trip</p>
            <h2 className="text-white font-extrabold text-lg leading-tight truncate">{activity.name}</h2>
            <p className="text-white/40 text-sm mt-0.5 flex items-center gap-1">
              <MapPin size={11} /> {activity.address}
            </p>
          </div>
          <button onClick={onClose} className="ml-3 w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/20 transition-all shrink-0">
            <X size={16} />
          </button>
        </div>

        {added ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <Check size={32} className="text-emerald-400" />
            </div>
            <p className="text-white font-bold">Added to your itinerary!</p>
            <p className="text-white/50 text-sm">Redirecting to your day plan…</p>
          </div>
        ) : (
          <>
            {/* Step 1: Select Trip */}
            <div className="mb-5">
              <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-3">1. Select Trip</p>
              {planningTrips.length === 0 ? (
                <div className="glass rounded-2xl p-4 text-center">
                  <p className="text-white/50 text-sm mb-3">No active trips yet.</p>
                  <button onClick={() => { onClose(); navigate('/trips/new'); }}
                    className="btn-primary text-sm px-4 py-2 flex items-center gap-2 mx-auto">
                    <Plus size={14} /> Create a Trip
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {planningTrips.map((trip) => (
                    <button key={trip.id} onClick={() => { setSelectedTrip(trip); setSelectedCity(null); setSelectedDay(null); }}
                      className={clsx(
                        'w-full flex items-center gap-3 p-3 rounded-2xl border transition-all text-left',
                        selectedTrip?.id === trip.id
                          ? 'bg-violet-500/20 border-violet-500/50'
                          : 'bg-white/5 border-white/10 hover:bg-white/10',
                      )}>
                      <span className="text-xl">{trip.cities[0]?.countryCode ?? '🌍'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm truncate">{trip.name}</p>
                        <p className="text-white/40 text-xs">{trip.cities.length} {trip.cities.length === 1 ? 'city' : 'cities'}</p>
                      </div>
                      {selectedTrip?.id === trip.id && <Check size={16} className="text-violet-400 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Step 2: Select City */}
            {selectedTrip && selectedTrip.cities.length > 0 && (
              <div className="mb-5">
                <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-3">2. Select City</p>
                <div className="space-y-2">
                  {selectedTrip.cities.map((city) => (
                    <button key={city.id} onClick={() => { setSelectedCity(city); setSelectedDay(null); }}
                      className={clsx(
                        'w-full flex items-center gap-3 p-3 rounded-2xl border transition-all text-left',
                        selectedCity?.id === city.id
                          ? 'bg-cyan-500/20 border-cyan-500/50'
                          : 'bg-white/5 border-white/10 hover:bg-white/10',
                      )}>
                      <span className="text-lg">{city.countryCode}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm">{city.name}</p>
                        <p className="text-white/40 text-xs">{city.itineraryDays.length} days planned</p>
                      </div>
                      {selectedCity?.id === city.id && <Check size={16} className="text-cyan-400 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: Select Day */}
            {selectedCity && (
              <div className="mb-5">
                <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-3">3. Select Day</p>
                {selectedCity.itineraryDays.length === 0 ? (
                  <p className="text-white/40 text-sm">No days generated yet for {selectedCity.name}. Generate an itinerary first.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedCity.itineraryDays.map((day) => {
                      const option = day.options[day.selectedOptionIndex];
                      return (
                        <button key={day.id} onClick={() => setSelectedDay(day)}
                          className={clsx(
                            'w-full flex items-center gap-3 p-3 rounded-2xl border transition-all text-left',
                            selectedDay?.id === day.id
                              ? 'bg-emerald-500/20 border-emerald-500/50'
                              : 'bg-white/5 border-white/10 hover:bg-white/10',
                          )}>
                          <div className="w-10 h-10 rounded-xl bg-white/10 flex flex-col items-center justify-center shrink-0">
                            <span className="text-white font-black text-base leading-none">{day.dayNumber}</span>
                            <span className="text-white/40 text-[9px]">Day</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Calendar size={11} className="text-white/40" />
                              <span className="text-white/60 text-xs">{day.date}</span>
                            </div>
                            <p className="text-white text-sm font-medium truncate">
                              {option?.theme.replace(/_/g, ' ') ?? 'No theme'} · {option?.activities.length ?? 0} stops
                            </p>
                          </div>
                          {selectedDay?.id === day.id && <Check size={16} className="text-emerald-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Select Time */}
            {selectedDay && (
              <div className="mb-6">
                <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-3">4. What time?</p>
                <div className="flex items-center gap-3 bg-white/5 rounded-2xl p-3 border border-white/10">
                  <Clock size={16} className="text-violet-400 shrink-0" />
                  <select
                    value={selectedTime}
                    onChange={(e) => setSelectedTime(e.target.value)}
                    className="bg-transparent text-white font-semibold text-sm flex-1 focus:outline-none"
                  >
                    {TIME_SLOTS.map((t) => (
                      <option key={t} value={t} className="bg-slate-800">{t}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Confirm Button */}
            <button
              onClick={handleAdd}
              disabled={!selectedTrip || !selectedCity || !selectedDay}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check size={16} /> Add to Itinerary
            </button>
          </>
        )}
      </div>
    </div>
  );
}
