import { useState } from 'react';
import { Clock, MapPin, Star, ExternalLink, CheckCircle, Calendar, BookmarkPlus, Images } from 'lucide-react';
import type { Activity } from '../../types';
import { getCategoryIcon, getPriceLevelLabel, formatDuration } from '../../utils/itinerary';
import clsx from 'clsx';

interface ActivityCardProps {
  activity: Activity;
  index: number;
  isSelected?: boolean;
  onClick?: () => void;
  onSaveToTrip?: () => void;
  showSaveButton?: boolean;
}

const CATEGORY_GRADIENTS: Record<string, string> = {
  tourist: 'from-violet-500/20 to-purple-500/10',
  culture: 'from-pink-500/20 to-rose-500/10',
  food: 'from-amber-500/20 to-orange-500/10',
  nightlife: 'from-indigo-500/20 to-blue-500/10',
  shopping: 'from-cyan-500/20 to-teal-500/10',
  outdoor: 'from-emerald-500/20 to-green-500/10',
  essential: 'from-red-500/20 to-pink-500/10',
};

const CATEGORY_BADGES: Record<string, string> = {
  tourist: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  culture: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  food: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  nightlife: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  shopping: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  outdoor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  essential: 'bg-red-500/20 text-red-300 border-red-500/30',
};

const BOOKING_PLATFORM_STYLES: Record<string, string> = {
  OpenTable: 'bg-red-500/20 text-red-300 hover:bg-red-500/30',
  Resy: 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30',
  Yelp: 'bg-red-400/20 text-red-200 hover:bg-red-400/30',
  GetYourGuide: 'bg-green-500/20 text-green-300 hover:bg-green-500/30',
  Viator: 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30',
  Klook: 'bg-orange-500/20 text-orange-300 hover:bg-orange-500/30',
  'Booking.com': 'bg-blue-600/20 text-blue-300 hover:bg-blue-600/30',
  Airbnb: 'bg-pink-500/20 text-pink-300 hover:bg-pink-500/30',
  Agoda: 'bg-red-600/20 text-red-300 hover:bg-red-600/30',
};

export default function ActivityCard({ activity, index, isSelected, onClick, onSaveToTrip, showSaveButton }: ActivityCardProps) {
  const gradient = CATEGORY_GRADIENTS[activity.category] ?? 'from-slate-500/20 to-slate-500/10';
  const badge = CATEGORY_BADGES[activity.category] ?? 'bg-slate-500/20 text-slate-300 border-slate-500/30';

  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [photoFailed, setPhotoFailed] = useState(false);

  const hasPhoto = activity.photos.length > 0 && !photoFailed;

  return (
    <div
      onClick={onClick}
      className={clsx(
        'glass rounded-3xl overflow-hidden border transition-all duration-300 cursor-pointer animate-fade-in',
        !hasPhoto && `bg-gradient-to-br ${gradient}`,
        isSelected
          ? 'border-violet-500/50 shadow-glow-purple'
          : 'border-white/10 hover:border-white/20 hover:-translate-y-0.5 hover:shadow-card',
      )}
    >
      {/* ── Hero Photo ─────────────────────────────────────────────────── */}
      {hasPhoto && (
        <div className="relative h-48 overflow-hidden bg-slate-800">
          <img
            src={activity.photos[activePhotoIdx]}
            alt={activity.name}
            className="w-full h-full object-cover transition-opacity duration-300"
            loading="lazy"
            onError={() => setPhotoFailed(true)}
          />

          {/* gradient overlay — lighter at top, darker at bottom */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/75 pointer-events-none" />

          {/* Number badge — top left */}
          <div className="absolute top-3 left-3 w-8 h-8 rounded-xl bg-black/50 backdrop-blur-sm border border-white/20 flex items-center justify-center text-sm font-bold text-white">
            {index + 1}
          </div>

          {/* Rating pill — top right */}
          <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-xl px-2.5 py-1 border border-white/10">
            <Star size={11} className="text-amber-400 fill-amber-400" />
            <span className="text-xs text-amber-400 font-bold">{activity.rating}</span>
          </div>

          {/* Place name + category overlaid at bottom */}
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-3 pt-8">
            <div className="flex items-end justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-base">{getCategoryIcon(activity.type)}</span>
                  <h3 className="font-bold text-white text-base leading-tight truncate drop-shadow">{activity.name}</h3>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={clsx('category-pill border text-[11px]', badge)}>
                    {activity.category.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-white/70">{getPriceLevelLabel(activity.priceLevel)}</span>
                  {activity.isEssential && (
                    <span className="category-pill bg-red-500/30 text-red-300 border border-red-500/40 text-[11px]">Essential</span>
                  )}
                </div>
              </div>

              {/* Photo strip — tap to cycle photos */}
              {activity.photos.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActivePhotoIdx((i) => (i + 1) % activity.photos.length);
                  }}
                  className="flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-xl px-2 py-1 border border-white/10 text-white/70 hover:text-white transition-colors shrink-0"
                >
                  <Images size={12} />
                  <span className="text-[11px] font-medium">{activePhotoIdx + 1}/{activity.photos.length}</span>
                </button>
              )}
            </div>
          </div>

          {/* Dot indicators for multiple photos */}
          {activity.photos.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 pointer-events-none">
              {activity.photos.slice(0, 5).map((_, i) => (
                <div
                  key={i}
                  className={clsx(
                    'rounded-full transition-all',
                    i === activePhotoIdx ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/40',
                  )}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Card Content ───────────────────────────────────────────────── */}
      <div className={clsx('p-4', hasPhoto && `bg-gradient-to-br ${gradient}`)}>

        {/* Header row — only shown when no photo (photo has its own header overlay) */}
        {!hasPhoto && (
          <div className="flex items-start gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0 text-sm font-bold text-white">
              {index + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{getCategoryIcon(activity.type)}</span>
                <h3 className="font-semibold text-white text-base leading-tight truncate">{activity.name}</h3>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={clsx('category-pill border', badge)}>
                  {activity.category.replace('_', ' ')}
                </span>
                <span className="text-xs text-white/50">{getPriceLevelLabel(activity.priceLevel)}</span>
                {activity.isEssential && (
                  <span className="category-pill bg-red-500/20 text-red-300 border border-red-500/30">Essential</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Star size={12} className="text-amber-400 fill-amber-400" />
              <span className="text-xs text-amber-400 font-semibold">{activity.rating}</span>
            </div>
          </div>
        )}

        {/* Description */}
        <p className="text-white/60 text-sm leading-relaxed mb-3 line-clamp-2">{activity.description}</p>

        {/* Time & Distance Row */}
        <div className="flex items-center gap-4 mb-3">
          {activity.arrivalTime && (
            <div className="flex items-center gap-1.5 text-xs text-white/70">
              <Calendar size={12} className="text-violet-400" />
              <span>{activity.arrivalTime} – {activity.departureTime}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs text-white/70">
            <Clock size={12} className="text-cyan-400" />
            <span>{formatDuration(activity.durationMin)}</span>
          </div>
          {activity.distanceFromPrevKm > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-white/70">
              <MapPin size={12} className="text-pink-400" />
              <span>{activity.distanceFromPrevKm} km</span>
            </div>
          )}
        </div>

        {/* Address */}
        <div className="flex items-start gap-1.5 mb-3">
          <MapPin size={12} className="text-white/30 mt-0.5 shrink-0" />
          <p className="text-white/40 text-xs leading-relaxed">{activity.address}</p>
        </div>

        {/* Opening Hours */}
        {activity.openingHours && (
          <div className="flex items-center gap-1.5 mb-3">
            <Clock size={12} className="text-white/30" />
            <span className="text-white/40 text-xs">{activity.openingHours}</span>
          </div>
        )}

        {/* Tags */}
        {activity.tags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mb-3">
            {activity.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="px-2 py-0.5 rounded-full bg-white/5 text-white/40 text-xs">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Save to Trip */}
        {showSaveButton && (
          <button
            onClick={(e) => { e.stopPropagation(); onSaveToTrip?.(); }}
            className="w-full flex items-center justify-center gap-2 mb-3 py-2.5 rounded-2xl bg-violet-500/15 border border-violet-500/30 text-violet-300 text-sm font-semibold hover:bg-violet-500/25 transition-all"
          >
            <BookmarkPlus size={15} />
            Save to Trip
          </button>
        )}

        {/* Booking Section */}
        <div className="border-t border-white/10 pt-3">
          {activity.requiresBooking ? (
            <div>
              <p className="text-xs text-white/50 mb-2 flex items-center gap-1">
                <Calendar size={11} />
                Booking recommended — available on:
              </p>
              <div className="flex gap-2 flex-wrap">
                {activity.bookingPlatforms.map((platform) => (
                  <a
                    key={platform.name}
                    href={platform.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200',
                      BOOKING_PLATFORM_STYLES[platform.name] ?? 'bg-white/10 text-white/70 hover:bg-white/20',
                    )}
                  >
                    <span>{platform.logo}</span>
                    <span>{platform.name}</span>
                    <ExternalLink size={10} />
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <CheckCircle size={14} className="text-emerald-400" />
              <span className="text-xs text-emerald-400 font-medium">No booking required — just show up!</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
