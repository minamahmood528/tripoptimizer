import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Trip, CityEntry, ItineraryDay, Accommodation, Activity, UserPreferences } from '../types';
import { useAuth } from './AuthContext';
import { buildItineraryDay } from '../utils/itinerary';
import { eachDayOfInterval, parseISO, format } from 'date-fns';

interface TripCtx {
  trips: Trip[];
  activeTrip: Trip | null;
  setActiveTrip: (t: Trip | null) => void;
  createFullTrip: (trip: Trip) => void;
  createTrip: (data: Omit<Trip, 'id' | 'userId' | 'createdAt' | 'status'>) => Trip;
  updateTrip: (id: string, data: Partial<Trip>) => void;
  deleteTrip: (id: string) => void;
  addCity: (tripId: string, city: Omit<CityEntry, 'id' | 'tripId' | 'itineraryDays'>) => CityEntry;
  updateCity: (tripId: string, cityId: string, data: Partial<CityEntry>) => void;
  setAccommodation: (tripId: string, cityId: string, acc: Accommodation) => void;
  generateDaysForCity: (tripId: string, cityId: string) => void;
  selectItineraryOption: (tripId: string, cityId: string, dayId: string, optionIndex: number) => void;
  addActivityToDay: (tripId: string, cityId: string, dayId: string, activity: Activity, time?: string) => void;
  regenerateAllItineraries: (newPrefs: UserPreferences) => void;
}

const TripContext = createContext<TripCtx>({} as TripCtx);

const STORAGE_KEY = 'tripoptimizer_trips';

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function TripProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);

  // Load user trips from localStorage on user change
  useEffect(() => {
    if (!user) { setTrips([]); return; }
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY}_${user.id}`);
      if (stored) setTrips(JSON.parse(stored));
    } catch { setTrips([]); }
  }, [user]);

  // Write to localStorage — called inside functional setTrips updates
  const writeStorage = useCallback((updated: Trip[]) => {
    if (!user) return;
    localStorage.setItem(`${STORAGE_KEY}_${user.id}`, JSON.stringify(updated));
  }, [user]);

  // --- MUTATIONS — all use setTrips(prev => ...) to avoid stale closures ---

  const createFullTrip = useCallback((trip: Trip) => {
    setTrips(prev => {
      const updated = [...prev, trip];
      writeStorage(updated);
      return updated;
    });
  }, [writeStorage]);

  const createTrip = useCallback((data: Omit<Trip, 'id' | 'userId' | 'createdAt' | 'status'>): Trip => {
    const trip: Trip = {
      ...data,
      id: uid('trip'),
      userId: user!.id,
      status: 'planning',
      createdAt: new Date().toISOString(),
    };
    setTrips(prev => {
      const updated = [...prev, trip];
      writeStorage(updated);
      return updated;
    });
    return trip;
  }, [user, writeStorage]);

  const updateTrip = useCallback((id: string, data: Partial<Trip>) => {
    setTrips(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, ...data } : t);
      writeStorage(updated);
      return updated;
    });
    setActiveTrip(prev => prev?.id === id ? { ...prev, ...data } : prev);
  }, [writeStorage]);

  const deleteTrip = useCallback((id: string) => {
    setTrips(prev => {
      const updated = prev.filter(t => t.id !== id);
      writeStorage(updated);
      return updated;
    });
    setActiveTrip(prev => prev?.id === id ? null : prev);
  }, [writeStorage]);

  const addCity = useCallback((tripId: string, city: Omit<CityEntry, 'id' | 'tripId' | 'itineraryDays'>): CityEntry => {
    const newCity: CityEntry = {
      ...city,
      id: uid('city'),
      tripId,
      itineraryDays: [],
    };
    setTrips(prev => {
      const updated = prev.map(t =>
        t.id === tripId ? { ...t, cities: [...t.cities, newCity] } : t,
      );
      writeStorage(updated);
      return updated;
    });
    return newCity;
  }, [writeStorage]);

  const updateCity = useCallback((tripId: string, cityId: string, data: Partial<CityEntry>) => {
    setTrips(prev => {
      const updated = prev.map(t =>
        t.id === tripId
          ? { ...t, cities: t.cities.map(c => c.id === cityId ? { ...c, ...data } : c) }
          : t,
      );
      writeStorage(updated);
      return updated;
    });
  }, [writeStorage]);

  const setAccommodation = useCallback((tripId: string, cityId: string, acc: Accommodation) => {
    // Inline instead of calling updateCity so the functional update chains correctly
    setTrips(prev => {
      const updated = prev.map(t =>
        t.id === tripId
          ? { ...t, cities: t.cities.map(c => c.id === cityId ? { ...c, accommodation: acc } : c) }
          : t,
      );
      writeStorage(updated);
      return updated;
    });
  }, [writeStorage]);

  const generateDaysForCity = useCallback((tripId: string, cityId: string) => {
    if (!user) return;
    // Use functional update so we read the latest prev (includes accommodation set just before this call)
    setTrips(prev => {
      const trip = prev.find(t => t.id === tripId);
      const city = trip?.cities.find(c => c.id === cityId);
      if (!city?.accommodation) return prev; // no change — accommodation not set yet

      let days: Date[];
      try {
        days = eachDayOfInterval({
          start: parseISO(city.arrivalDate),
          end: parseISO(city.departureDate),
        });
      } catch {
        return prev;
      }

      // Start with activities already visited in the old itinerary (before regeneration)
      const previouslyVisited: string[] = city.itineraryDays
        .flatMap(d => d.options[d.selectedOptionIndex]?.activities.map(a => a.id) ?? [])
        .filter(id => !id.startsWith('meal-'));

      // Accumulate across newly generated days so no location repeats
      let accVisited = [...previouslyVisited];
      const itineraryDays: ItineraryDay[] = days.map((date, i) => {
        const day = buildItineraryDay(
          cityId,
          format(date, 'yyyy-MM-dd'),
          i + 1,
          city.accommodation!,
          city.name,
          accVisited,
          user.preferences,
        );
        const opt = day.options[0];
        if (opt) accVisited = [...accVisited, ...opt.activities.map(a => a.id).filter(id => !id.startsWith('meal-'))];
        return day;
      });

      const updated = prev.map(t =>
        t.id === tripId
          ? { ...t, cities: t.cities.map(c => c.id === cityId ? { ...c, itineraryDays } : c) }
          : t,
      );
      writeStorage(updated);
      return updated;
    });
  }, [user, writeStorage]);

  const addActivityToDay = useCallback((
    tripId: string, cityId: string, dayId: string, activity: Activity, time?: string,
  ) => {
    setTrips(prev => {
      const updated = prev.map(t =>
        t.id !== tripId ? t : {
          ...t,
          cities: t.cities.map(c =>
            c.id !== cityId ? c : {
              ...c,
              itineraryDays: c.itineraryDays.map(d => {
                if (d.id !== dayId) return d;
                const optIdx = d.selectedOptionIndex;
                const newActivity: Activity = {
                  ...activity,
                  arrivalTime: time ?? '10:00',
                  distanceFromPrevKm: 0,
                  travelTimeMin: 0,
                };
                return {
                  ...d,
                  options: d.options.map((opt, idx) =>
                    idx === optIdx ? { ...opt, activities: [...opt.activities, newActivity] } : opt,
                  ),
                };
              }),
            },
          ),
        },
      );
      writeStorage(updated);
      return updated;
    });
  }, [writeStorage]);

  const selectItineraryOption = useCallback((
    tripId: string, cityId: string, dayId: string, optionIndex: number,
  ) => {
    setTrips(prev => {
      const updated = prev.map(t =>
        t.id === tripId
          ? {
            ...t,
            cities: t.cities.map(c =>
              c.id === cityId
                ? {
                  ...c,
                  itineraryDays: c.itineraryDays.map(d =>
                    d.id === dayId ? { ...d, selectedOptionIndex: optionIndex } : d,
                  ),
                }
                : c,
            ),
          }
          : t,
      );
      writeStorage(updated);
      return updated;
    });
  }, [writeStorage]);

  const regenerateAllItineraries = useCallback((newPrefs: UserPreferences) => {
    setTrips(prev => {
      const updated = prev.map(trip => ({
        ...trip,
        cities: trip.cities.map(city => {
          if (!city.accommodation || city.itineraryDays.length === 0) return city;
          let days: Date[];
          try {
            days = eachDayOfInterval({ start: parseISO(city.arrivalDate), end: parseISO(city.departureDate) });
          } catch { return city; }
          let accVisited: string[] = [];
          const itineraryDays: ItineraryDay[] = days.map((date, i) => {
            const day = buildItineraryDay(city.id, format(date, 'yyyy-MM-dd'), i + 1, city.accommodation!, city.name, accVisited, newPrefs);
            const opt = day.options[0];
            if (opt) accVisited = [...accVisited, ...opt.activities.map(a => a.id).filter(id => !id.startsWith('meal-'))];
            return day;
          });
          return { ...city, itineraryDays };
        }),
      }));
      writeStorage(updated);
      return updated;
    });
  }, [writeStorage]);

  return (
    <TripContext.Provider value={{
      trips, activeTrip, setActiveTrip,
      createFullTrip, createTrip, updateTrip, deleteTrip,
      addCity, updateCity, setAccommodation,
      generateDaysForCity, selectItineraryOption, addActivityToDay,
      regenerateAllItineraries,
    }}>
      {children}
    </TripContext.Provider>
  );
}

export const useTrips = () => {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrips must be used within TripProvider');
  return ctx;
};
