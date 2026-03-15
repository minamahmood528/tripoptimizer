import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Calendar, Hotel, ChevronRight, Plus, Sparkles } from 'lucide-react';
import { useTrips } from '../context/TripContext';
import { format, parseISO, differenceInDays, eachDayOfInterval } from 'date-fns';
import clsx from 'clsx';

export default function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { trips, generateDaysForCity } = useTrips();
  const navigate = useNavigate();

  const trip = trips.find((t) => t.id === id);

  useEffect(() => {
    if (!trip) navigate('/dashboard');
  }, [trip, navigate]);

  if (!trip) return null;

  return (
    <div className="min-h-screen bg-gradient-hero pb-28 safe-top">
      {/* Header */}
      <div className="px-5 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate('/dashboard')} className="w-10 h-10 rounded-2xl glass flex items-center justify-center text-white/70 hover:text-white transition-all">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-extrabold text-slate-800 truncate tracking-tight">{trip.name}</h1>
            <p className="text-slate-500 text-sm font-medium">
              {trip.cities.length} {trip.cities.length === 1 ? 'city' : 'cities'} · {trip.cities.reduce((s, c) => {
                try { return s + differenceInDays(parseISO(c.departureDate), parseISO(c.arrivalDate)) + 1; } catch { return s; }
              }, 0)} days
            </p>
          </div>
        </div>
      </div>

      {/* Cities */}
      <div className="px-5 space-y-6">
        {trip.cities.map((city, cityIdx) => {
          const days = (() => {
            try {
              return eachDayOfInterval({ start: parseISO(city.arrivalDate), end: parseISO(city.departureDate) });
            } catch { return []; }
          })();

          return (
            <div key={city.id} className="animate-slide-up" style={{ animationDelay: `${cityIdx * 0.1}s` }}>
              {/* City Header */}
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/30 to-pink-500/20 flex items-center justify-center text-2xl border border-white/10">
                  {city.countryCode}
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">{city.name}</h2>
                  <p className="text-slate-500 text-sm font-medium">{city.country}</p>
                </div>
              </div>

              {/* Hotel */}
              {city.accommodation ? (
                <div className="glass rounded-2xl p-3 mb-3 border border-white/10 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <Hotel size={16} className="text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{city.accommodation.name}</p>
                    <p className="text-white/50 text-xs truncate">{city.accommodation.address}</p>
                  </div>
                  <div className="text-xs text-white/40">
                    {city.accommodation.checkIn} → {city.accommodation.checkOut}
                  </div>
                </div>
              ) : (
                <div className="glass rounded-2xl p-3 mb-3 border border-amber-500/30 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                    <Hotel size={16} className="text-amber-400" />
                  </div>
                  <p className="text-amber-400 text-sm">No accommodation added</p>
                </div>
              )}

              {/* Days */}
              {city.itineraryDays.length > 0 ? (
                <div className="space-y-2">
                  {city.itineraryDays.map((day) => {
                    const selected = day.options[day.selectedOptionIndex];
                    return (
                      <button
                        key={day.id}
                        onClick={() => navigate(`/trips/${trip.id}/city/${city.id}/day/${day.id}`)}
                        className="w-full glass rounded-2xl p-4 border border-white/10 hover:border-violet-500/30 hover:bg-violet-500/5 transition-all text-left flex items-center gap-3"
                      >
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/20 to-pink-500/20 flex flex-col items-center justify-center border border-white/10 shrink-0">
                          <span className="text-white font-black text-lg leading-none">{day.dayNumber}</span>
                          <span className="text-white/40 text-[10px]">Day</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-white/40 text-xs">{day.date}</span>
                            {selected && (
                              <span className="text-xs bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-lg border border-violet-500/30">
                                {selected.theme.replace(/_/g, ' ')}
                              </span>
                            )}
                          </div>
                          {selected ? (
                            <p className="text-white text-sm font-medium truncate">{selected.highlight}</p>
                          ) : (
                            <p className="text-white/50 text-sm">5 route options ready</p>
                          )}
                          {selected && (
                            <div className="flex gap-3 mt-1 text-xs text-white/40">
                              <span>📍 {selected.totalDistanceKm} km</span>
                              <span>⏱ {Math.round(selected.totalDurationMin / 60)}h {selected.totalDurationMin % 60}m</span>
                              <span>🎯 {selected.activities.length} stops</span>
                            </div>
                          )}
                        </div>
                        <ChevronRight size={16} className="text-white/40 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              ) : city.accommodation ? (
                <button
                  onClick={() => { generateDaysForCity(trip.id, city.id); }}
                  className="w-full glass rounded-2xl p-4 border border-dashed border-violet-500/30 flex items-center justify-center gap-2 hover:bg-violet-500/10 transition-all"
                >
                  <Sparkles size={16} className="text-violet-400" />
                  <span className="text-violet-400 font-medium">Generate Itinerary for {city.name}</span>
                </button>
              ) : (
                <div className="glass rounded-2xl p-4 border border-dashed border-white/20 text-center text-white/40 text-sm">
                  Add accommodation to generate itinerary
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
