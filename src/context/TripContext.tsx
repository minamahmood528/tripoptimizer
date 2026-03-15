import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Trip, CityEntry, ItineraryDay, Accommodation, Activity } from '../types';
import { useAuth } from './AuthContext';
import { buildItineraryDay } from '../utils/itinerary';
import { eachDayOfInterval, parseISO, format } from 'date-fns';

interface TripCtx {
  trips: Trip[];
  activeTrip: Trip | null;
  setActiveTrip: (t: Trip | null) => void;
  createTrip: (data: Omit<Trip, 'id' | 'userId' | 'createdAt' | 'status'>) => Trip;
  updateTrip: (id: string, data: Partial<Trip>) => void;
  deleteTrip: (id: string) => void;
  addCity: (tripId: string, city: Omit<CityEntry, 'id' | 'tripId' | 'itineraryDays'>) => CityEntry;
  updateCity: (tripId: string, cityId: string, data: Partial<CityEntry>) => void;
  setAccommodation: (tripId: string, cityId: string, acc: Accommodation) => void;
  generateDaysForCity: (tripId: string, cityId: string) => void;
  selectItineraryOption: (tripId: string, cityId: string, dayId: string, optionIndex: number) => void;
  addActivityToDay: (tripId: string, cityId: string, dayId: string, activity: Activity, time?: string) => void;
}

const TripContext = createContext<TripCtx>({} as TripCtx);

const STORAGE_KEY = 'tripoptimizer_trips';

export function TripProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);

  // Load user trips from localStorage
  useEffect(() => {
    if (!user) { setTrips([]); return; }
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY}_${user.id}`);
      if (stored) setTrips(JSON.parse(stored));
    } catch { setTrips([]); }
  }, [user]);

  const persist = useCallback((updated: Trip[]) => {
    if (!user) return;
    setTrips(updated);
    localStorage.setItem(`${STORAGE_KEY}_${user.id}`, JSON.stringify(updated));
  }, [user]);

  const createTrip = useCallback((data: Omit<Trip, 'id' | 'userId' | 'createdAt' | 'status'>): Trip => {
    const trip: Trip = {
      ...data,
      id: `trip_${Date.now()}`,
      userId: user!.id,
      status: 'planning',
      createdAt: new Date().toISOString(),
    };
    persist([...trips, trip]);
    return trip;
  }, [trips, user, persist]);

  const updateTrip = useCallback((id: string, data: Partial<Trip>) => {
    const updated = trips.map((t) => (t.id === id ? { ...t, ...data } : t));
    persist(updated);
    if (activeTrip?.id === id) setActiveTrip((prev) => prev ? { ...prev, ...data } : null);
  }, [trips, activeTrip, persist]);

  const deleteTrip = useCallback((id: string) => {
    persist(trips.filter((t) => t.id !== id));
    if (activeTrip?.id === id) setActiveTrip(null);
  }, [trips, activeTrip, persist]);

  const addCity = useCallback((tripId: string, city: Omit<CityEntry, 'id' | 'tripId' | 'itineraryDays'>): CityEntry => {
    const newCity: CityEntry = {
      ...city,
      id: `city_${Date.now()}`,
      tripId,
      itineraryDays: [],
    };
    const updated = trips.map((t) =>
      t.id === tripId ? { ...t, cities: [...t.cities, newCity] } : t,
    );
    persist(updated);
    return newCity;
  }, [trips, persist]);

  const updateCity = useCallback((tripId: string, cityId: string, data: Partial<CityEntry>) => {
    const updated = trips.map((t) =>
      t.id === tripId
        ? { ...t, cities: t.cities.map((c) => (c.id === cityId ? { ...c, ...data } : c)) }
        : t,
    );
    persist(updated);
  }, [trips, persist]);

  const setAccommodation = useCallback((tripId: string, cityId: string, acc: Accommodation) => {
    updateCity(tripId, cityId, { accommodation: acc });
  }, [updateCity]);

  const generateDaysForCity = useCallback((tripId: string, cityId: string) => {
    if (!user) return;
    const trip = trips.find((t) => t.id === tripId);
    const city = trip?.cities.find((c) => c.id === cityId);
    if (!city?.accommodation) return;

    const days = eachDayOfInterval({
      start: parseISO(city.arrivalDate),
      end: parseISO(city.departureDate),
    });

    const previouslyVisited: string[] = city.itineraryDays
      .flatMap((d) => d.options[d.selectedOptionIndex]?.activities.map((a) => a.id) ?? []);

    const itineraryDays: ItineraryDay[] = days.map((date, i) => {
      const visitedSoFar = [
        ...previouslyVisited,
        ...city.itineraryDays.slice(0, i).flatMap((d) =>
          d.options[d.selectedOptionIndex]?.activities.map((a) => a.id) ?? [],
        ),
      ];
      return buildItineraryDay(
        cityId,
        format(date, 'yyyy-MM-dd'),
        i + 1,
        city.accommodation!,
        city.name,
        visitedSoFar,
        user.preferences,
      );
    });

    updateCity(tripId, cityId, { itineraryDays });
  }, [trips, user, updateCity]);

  const addActivityToDay = useCallback((
    tripId: string, cityId: string, dayId: string, activity: Activity, time?: string,
  ) => {
    const updated = trips.map((t) =>
      t.id !== tripId ? t : {
        ...t,
        cities: t.cities.map((c) =>
          c.id !== cityId ? c : {
            ...c,
            itineraryDays: c.itineraryDays.map((d) => {
              if (d.id !== dayId) return d;
              const optIdx = d.selectedOptionIndex;
              const newActivity: Activity = { ...activity, arrivalTime: time ?? '10:00', distanceFromPrevKm: 0, travelTimeMin: 0 };
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
    persist(updated);
  }, [trips, persist]);

  const selectItineraryOption = useCallback((
    tripId: string, cityId: string, dayId: string, optionIndex: number,
  ) => {
    const updated = trips.map((t) =>
      t.id === tripId
        ? {
          ...t,
          cities: t.cities.map((c) =>
            c.id === cityId
              ? {
                ...c,
                itineraryDays: c.itineraryDays.map((d) =>
                  d.id === dayId ? { ...d, selectedOptionIndex: optionIndex } : d,
                ),
              }
              : c,
          ),
        }
        : t,
    );
    persist(updated);
  }, [trips, persist]);

  return (
    <TripContext.Provider value={{
      trips, activeTrip, setActiveTrip,
      createTrip, updateTrip, deleteTrip,
      addCity, updateCity, setAccommodation,
      generateDaysForCity, selectItineraryOption, addActivityToDay,
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
