import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, MapPin, Calendar, ChevronRight, Plane, Globe, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTrips } from '../context/TripContext';
import { format, parseISO, differenceInDays } from 'date-fns';
import clsx from 'clsx';

const STATUS_CONFIG = {
  planning: { label: 'Planning', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  active: { label: 'Active', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  completed: { label: 'Completed', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
};

const DESTINATION_EMOJIS: Record<string, string> = {
  France: '🇫🇷', Japan: '🇯🇵', Thailand: '🇹🇭', Italy: '🇮🇹', Spain: '🇪🇸',
  UK: '🇬🇧', USA: '🇺🇸', Germany: '🇩🇪', Australia: '🇦🇺', Canada: '🇨🇦',
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { trips, deleteTrip, setActiveTrip } = useTrips();
  const navigate = useNavigate();

  const myTrips = trips.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const upcoming = myTrips.filter((t) => t.status === 'planning' || t.status === 'active');
  const past = myTrips.filter((t) => t.status === 'completed');

  const handleOpenTrip = (trip: typeof trips[number]) => {
    setActiveTrip(trip);
    navigate(`/trips/${trip.id}`);
  };

  return (
    <div className="min-h-screen bg-gradient-hero pb-28 safe-top max-w-2xl mx-auto">
      {/* Header */}
      <div className="px-5 pt-12 pb-6">
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="text-slate-400 text-sm font-medium">Good {getGreeting()},</p>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">{user?.name?.split(' ')[0]} 👋</h1>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-xl shadow-glow-purple">
            ✈️
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      {myTrips.length > 0 && (
        <div className="px-5 mb-6">
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: myTrips.length, label: 'Trips', emoji: '🧳' },
              { value: myTrips.reduce((s, t) => s + t.cities.length, 0), label: 'Cities', emoji: '🏙️' },
              {
                value: myTrips.reduce((s, t) => {
                  try { return s + differenceInDays(parseISO(t.endDate), parseISO(t.startDate)); } catch { return s; }
                }, 0),
                label: 'Days', emoji: '📅',
              },
            ].map((stat) => (
              <div key={stat.label} className="glass rounded-2xl p-3 text-center">
                <div className="text-xl mb-0.5">{stat.emoji}</div>
                <div className="text-xl font-black text-white">{stat.value}</div>
                <div className="text-white/50 text-xs">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {myTrips.length === 0 && (
        <div className="px-5 mt-8 text-center animate-slide-up">
          <div className="glass rounded-3xl p-10 flex flex-col items-center gap-4">
            <div className="text-6xl animate-float">🌍</div>
            <h2 className="text-xl font-bold text-white tracking-tight">No trips yet</h2>
            <p className="text-white/50 text-sm leading-relaxed">
              Start planning your first adventure! Add a city, drop your hotel, and get 5 personalized daily routes.
            </p>
            <button onClick={() => navigate('/trips/new')} className="btn-primary flex items-center gap-2">
              <Plus size={18} /> Plan Your First Trip
            </button>
          </div>
        </div>
      )}

      {/* Upcoming Trips */}
      {upcoming.length > 0 && (
        <section className="px-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-slate-200 font-extrabold text-lg tracking-tight">Upcoming Trips</h2>
            <button
              onClick={() => navigate('/trips/new')}
              className="w-8 h-8 rounded-xl bg-violet-500/20 flex items-center justify-center text-violet-400 hover:bg-violet-500/30 transition-colors"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="space-y-3">
            {upcoming.map((trip) => (
              <TripCard key={trip.id} trip={trip} onOpen={handleOpenTrip} onDelete={deleteTrip} />
            ))}
          </div>
        </section>
      )}

      {/* Past Trips */}
      {past.length > 0 && (
        <section className="px-5 mb-6">
          <h2 className="text-slate-700 font-extrabold text-lg mb-3 tracking-tight">Past Trips</h2>
          <div className="space-y-3">
            {past.map((trip) => (
              <TripCard key={trip.id} trip={trip} onOpen={handleOpenTrip} onDelete={deleteTrip} />
            ))}
          </div>
        </section>
      )}

      {/* FAB */}
      <button
        onClick={() => navigate('/trips/new')}
        className="fixed bottom-24 right-5 w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-glow-purple z-40 hover:scale-110 active:scale-95 transition-transform"
      >
        <Plus size={24} className="text-white" />
      </button>
    </div>
  );
}

function TripCard({ trip, onOpen, onDelete }: {
  trip: ReturnType<typeof useTrips>['trips'][number];
  onOpen: (t: any) => void;
  onDelete: (id: string) => void;
}) {
  const status = STATUS_CONFIG[trip.status];
  const firstCity = trip.cities[0];
  const emoji = DESTINATION_EMOJIS[firstCity?.country ?? ''] ?? '🌍';
  let dateRange = '';
  try {
    dateRange = `${format(parseISO(trip.startDate), 'MMM d')} – ${format(parseISO(trip.endDate), 'MMM d, yyyy')}`;
  } catch {}

  return (
    <div className="glass rounded-3xl p-4 border border-white/10 hover:border-white/20 hover:-translate-y-0.5 transition-all duration-300">
      <div className="flex items-start gap-3">
        {/* Emoji Flag */}
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/20 to-pink-500/20 flex items-center justify-center text-2xl shrink-0 border border-white/10">
          {emoji}
        </div>

        <div className="flex-1 min-w-0" onClick={() => onOpen(trip)}>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-bold text-white text-base truncate">{trip.name}</h3>
            <span className={clsx('category-pill border text-xs', status.color)}>{status.label}</span>
          </div>

          <div className="flex items-center gap-3 text-white/50 text-sm flex-wrap">
            {dateRange && (
              <span className="flex items-center gap-1">
                <Calendar size={12} /> {dateRange}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Globe size={12} /> {trip.cities.length} {trip.cities.length === 1 ? 'city' : 'cities'}
            </span>
          </div>

          {/* Cities Preview */}
          {trip.cities.length > 0 && (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {trip.cities.slice(0, 3).map((c) => (
                <span key={c.id} className="flex items-center gap-1 bg-white/5 rounded-xl px-2 py-0.5 text-xs text-white/60">
                  <MapPin size={10} /> {c.name}
                </span>
              ))}
              {trip.cities.length > 3 && (
                <span className="bg-white/5 rounded-xl px-2 py-0.5 text-xs text-white/40">+{trip.cities.length - 3} more</span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-2 shrink-0">
          <button
            onClick={() => onOpen(trip)}
            className="w-8 h-8 rounded-xl bg-violet-500/20 flex items-center justify-center text-violet-400 hover:bg-violet-500/30 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); if (confirm('Delete this trip?')) onDelete(trip.id); }}
            className="w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400/50 hover:bg-red-500/20 hover:text-red-400 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}
