import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Save, Key, Eye, EyeOff, CheckCircle, ChevronRight, Bell, Globe, DollarSign } from 'lucide-react';
import { useAuth, COMMUTE_OPTIONS, DIETARY_OPTIONS, INTEREST_OPTIONS } from '../context/AuthContext';
import type { CommuteType, DietaryRestriction, Interest, UserPreferences } from '../types';
import clsx from 'clsx';

export default function ProfilePage() {
  const { user, logout, updatePreferences } = useAuth();
  const navigate = useNavigate();

  const prefs = user?.preferences;

  const [commute, setCommute] = useState<CommuteType[]>(prefs?.commuteTypes ?? []);
  const [dietary, setDietary] = useState<DietaryRestriction[]>(prefs?.dietaryRestrictions ?? ['none']);
  const [interests, setInterests] = useState<Interest[]>(prefs?.interests ?? []);
  const [pace, setPace] = useState(prefs?.pacePreference ?? 'moderate');
  const [budget, setBudget] = useState(prefs?.budgetRange ?? 'moderate');
  const [currency, setCurrency] = useState(prefs?.currency ?? 'USD');
  const [apiKey, setApiKey] = useState(prefs?.googleMapsApiKey ?? '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    updatePreferences({
      commuteTypes: commute,
      dietaryRestrictions: dietary,
      interests,
      pacePreference: pace as UserPreferences['pacePreference'],
      budgetRange: budget as UserPreferences['budgetRange'],
      currency,
      googleMapsApiKey: apiKey,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const toggle = <T,>(arr: T[], val: T, set: (v: T[]) => void) => {
    set(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  };

  return (
    <div className="min-h-screen bg-gradient-hero pb-28 safe-top overflow-y-auto">
      {/* Header */}
      <div className="px-5 pt-12 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">Profile</h1>
            <p className="text-white/50 text-sm">{user?.email}</p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center text-2xl shadow-glow-purple">
            {user?.name?.charAt(0).toUpperCase() ?? '?'}
          </div>
        </div>
      </div>

      <div className="px-5 space-y-6">

        {/* Google Maps API Key */}
        <section className="glass rounded-3xl p-5 border border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <Key size={18} className="text-amber-400" />
            <h2 className="text-white font-bold">Google Maps API Key</h2>
          </div>
          <p className="text-white/50 text-sm mb-3">
            Required for real places data worldwide. Get yours free at{' '}
            <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-violet-400 underline">console.cloud.google.com</a>.
            Enable: Maps JS, Places, Directions, Geocoding APIs.
          </p>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza..."
              className="input-field font-mono text-sm pr-12"
            />
            <button
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
            >
              {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {apiKey && (
            <p className="text-emerald-400 text-xs mt-2 flex items-center gap-1">
              <CheckCircle size={12} /> API key configured — real places will load for any city
            </p>
          )}
        </section>

        {/* Commute Preferences */}
        <section>
          <h2 className="text-white font-bold mb-3 flex items-center gap-2">
            🚌 How do you get around?
          </h2>
          <div className="flex flex-wrap gap-2">
            {COMMUTE_OPTIONS.map((opt) => {
              const selected = commute.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => toggle(commute, opt.value, setCommute)}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all',
                    selected ? 'bg-violet-500/25 border-violet-500/60 text-violet-200' : 'glass border-white/10 text-white/60 hover:text-white',
                  )}
                >
                  <span>{opt.emoji}</span>
                  <span>{opt.label}</span>
                  <span className="text-[10px] text-white/40">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Dietary Preferences */}
        <section>
          <h2 className="text-white font-bold mb-3">🍽️ Dietary Preferences</h2>
          <div className="flex flex-wrap gap-2">
            {DIETARY_OPTIONS.map((opt) => {
              const selected = dietary.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => toggle(dietary, opt.value, setDietary)}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all',
                    selected ? 'bg-amber-500/25 border-amber-500/60 text-amber-200' : 'glass border-white/10 text-white/60 hover:text-white',
                  )}
                >
                  <span>{opt.emoji}</span> {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Interests */}
        <section>
          <h2 className="text-white font-bold mb-3">❤️ Travel Interests</h2>
          <div className="flex flex-wrap gap-2">
            {INTEREST_OPTIONS.map((opt) => {
              const selected = interests.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => toggle(interests, opt.value, setInterests)}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all',
                    selected ? 'bg-pink-500/25 border-pink-500/60 text-pink-200' : 'glass border-white/10 text-white/60 hover:text-white',
                  )}
                >
                  <span>{opt.emoji}</span> {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Pace & Budget */}
        <section className="grid grid-cols-2 gap-4">
          <div>
            <h2 className="text-white font-bold mb-3 text-sm">🧘 Pace</h2>
            <div className="space-y-2">
              {[{ val: 'relaxed', label: 'Relaxed', emoji: '🧘' }, { val: 'moderate', label: 'Moderate', emoji: '🚶' }, { val: 'packed', label: 'Packed', emoji: '🏃' }].map((p) => (
                <button
                  key={p.val}
                  onClick={() => setPace(p.val as any)}
                  className={clsx(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all',
                    pace === p.val ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300' : 'glass border-white/10 text-white/60',
                  )}
                >
                  <span>{p.emoji}</span> {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-white font-bold mb-3 text-sm">💰 Budget</h2>
            <div className="space-y-2">
              {[{ val: 'budget', label: 'Budget', emoji: '💸' }, { val: 'moderate', label: 'Moderate', emoji: '💳' }, { val: 'luxury', label: 'Luxury', emoji: '💎' }].map((b) => (
                <button
                  key={b.val}
                  onClick={() => setBudget(b.val as any)}
                  className={clsx(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all',
                    budget === b.val ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : 'glass border-white/10 text-white/60',
                  )}
                >
                  <span>{b.emoji}</span> {b.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Save Button */}
        <button
          onClick={handleSave}
          className={clsx(
            'w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base transition-all duration-300',
            saved
              ? 'bg-emerald-500/30 border border-emerald-500/50 text-emerald-300'
              : 'btn-primary',
          )}
        >
          {saved ? (
            <><CheckCircle size={18} /> Saved!</>
          ) : (
            <><Save size={18} /> Save Preferences</>
          )}
        </button>

        {/* App Info */}
        <div className="glass rounded-3xl p-4 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-white/60 text-sm">Version</span>
            <span className="text-white/40 text-sm">1.0.0</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/60 text-sm">Data Storage</span>
            <span className="text-white/40 text-sm">Local device only</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/60 text-sm">Maps</span>
            <span className={clsx('text-sm', apiKey ? 'text-emerald-400' : 'text-amber-400')}>
              {apiKey ? '✅ Connected' : '⚠️ Key needed'}
            </span>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="btn-danger w-full flex items-center justify-center gap-2 py-4"
        >
          <LogOut size={18} /> Log Out
        </button>

        <div className="h-4" />
      </div>
    </div>
  );
}
