import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User, UserPreferences, CommuteType, DietaryRestriction, Interest } from '../types';

const DEFAULT_PREFS: UserPreferences = {
  commuteTypes: ['walking', 'uber'],
  dietaryRestrictions: ['none'],
  interests: ['tourist_attractions', 'restaurants', 'museums'],
  budgetRange: 'moderate',
  pacePreference: 'moderate',
  currency: 'USD',
  language: 'en',
  googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '',
};

interface AuthCtx {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updatePreferences: (prefs: Partial<UserPreferences>) => void;
}

const AuthContext = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('tripoptimizer_user');
      if (stored) setUser(JSON.parse(stored));
    } catch {
      localStorage.removeItem('tripoptimizer_user');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const persist = (u: User) => {
    setUser(u);
    localStorage.setItem('tripoptimizer_user', JSON.stringify(u));
  };

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 800)); // Simulate network
    const stored = localStorage.getItem(`user_${email}`);
    if (!stored) throw new Error('Account not found. Please sign up first.');
    const account = JSON.parse(stored);
    if (account.password !== password) throw new Error('Incorrect password.');
    persist(account.user);
    setIsLoading(false);
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    if (localStorage.getItem(`user_${email}`)) throw new Error('Email already registered.');
    const newUser: User = {
      id: `user_${Date.now()}`,
      email,
      name,
      preferences: { ...DEFAULT_PREFS },
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem(`user_${email}`, JSON.stringify({ user: newUser, password }));
    persist(newUser);
    setIsLoading(false);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('tripoptimizer_user');
  }, []);

  const updatePreferences = useCallback((prefs: Partial<UserPreferences>) => {
    if (!user) return;
    const updated = { ...user, preferences: { ...user.preferences, ...prefs } };
    persist(updated);
    // Also update stored account
    const stored = localStorage.getItem(`user_${user.email}`);
    if (stored) {
      const account = JSON.parse(stored);
      localStorage.setItem(`user_${user.email}`, JSON.stringify({ ...account, user: updated }));
    }
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout, updatePreferences }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

// ─── Commute Options ──────────────────────────────────────────────────────────

export const COMMUTE_OPTIONS: { value: CommuteType; label: string; emoji: string; desc: string }[] = [
  { value: 'walking', label: 'Walking', emoji: '🚶', desc: 'On foot' },
  { value: 'uber', label: 'Uber/Lyft', emoji: '🚗', desc: 'Rideshare' },
  { value: 'grab', label: 'Grab', emoji: '🟢', desc: 'SE Asia rideshare' },
  { value: 'taxi', label: 'Taxi', emoji: '🚕', desc: 'Local taxis' },
  { value: 'bus', label: 'Bus', emoji: '🚌', desc: 'Public buses' },
  { value: 'subway', label: 'Subway/Metro', emoji: '🚇', desc: 'Underground rail' },
  { value: 'bike', label: 'Bike', emoji: '🚲', desc: 'Rental bicycle' },
  { value: 'scooter', label: 'Scooter', emoji: '🛵', desc: 'Moped/E-scooter' },
  { value: 'car_rental', label: 'Car Rental', emoji: '🚙', desc: 'Self-drive' },
  { value: 'tuk_tuk', label: 'Tuk-tuk', emoji: '🛺', desc: 'Where available' },
];

export const DIETARY_OPTIONS: { value: DietaryRestriction; label: string; emoji: string }[] = [
  { value: 'none', label: 'No Restrictions', emoji: '🍽️' },
  { value: 'vegan', label: 'Vegan', emoji: '🌱' },
  { value: 'vegetarian', label: 'Vegetarian', emoji: '🥗' },
  { value: 'halal', label: 'Halal', emoji: '☪️' },
  { value: 'kosher', label: 'Kosher', emoji: '✡️' },
  { value: 'gluten_free', label: 'Gluten-Free', emoji: '🌾' },
  { value: 'nut_free', label: 'Nut-Free', emoji: '🥜' },
  { value: 'dairy_free', label: 'Dairy-Free', emoji: '🥛' },
  { value: 'pescatarian', label: 'Pescatarian', emoji: '🐟' },
];

export const INTEREST_OPTIONS: { value: Interest; label: string; emoji: string }[] = [
  { value: 'tourist_attractions', label: 'Tourist Attractions', emoji: '🏛️' },
  { value: 'nightlife', label: 'Nightlife', emoji: '🎵' },
  { value: 'restaurants', label: 'Restaurants & Cafés', emoji: '🍜' },
  { value: 'shopping', label: 'Shopping', emoji: '🛍️' },
  { value: 'museums', label: 'Museums & Art', emoji: '🎨' },
  { value: 'outdoor', label: 'Outdoor & Nature', emoji: '🌿' },
  { value: 'historical', label: 'Historical Sites', emoji: '🏰' },
  { value: 'beaches', label: 'Beaches', emoji: '🏖️' },
  { value: 'wellness', label: 'Wellness & Spas', emoji: '💆' },
  { value: 'photography', label: 'Photography Spots', emoji: '📸' },
  { value: 'sports', label: 'Sports & Activities', emoji: '⚽' },
  { value: 'local_experiences', label: 'Local Experiences', emoji: '🏠' },
];
