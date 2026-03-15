import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Save, CheckCircle } from 'lucide-react';
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
  const [currency] = useState(prefs?.currency ?? 'USD');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    updatePreferences({
      commuteTypes: commute,
      dietaryRestrictions: dietary,
      interests,
      pacePreference: pace as UserPreferences['pacePreference'],
      budgetRange: budget as UserPreferences['budgetRange'],
      currency,
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
    <div className="min-h-screen bg-gradient-hero pb-28 safe-top overflow-y-auto max-w-3xl mx-auto">
      {/* Header */}
      <div className="px-5 pt-12 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Profile</h1>
            <p className="text-slate-400 text-sm font-medium">{user?.email}</p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center text-2xl shadow-glow-purple">
            {user?.name?.charAt(0).toUpperCase() ?? '?'}
          </div>
        </div>
      </div>

      <div className="px-5 space-y-6">

        {/* Commute Preferences */}
        <section>
          <h2 className="text-slate-200 font-extrabold mb-3 flex items-center gap-2 tracking-tight">
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
                    selected ? 'bg-violet-100 border-violet-400/60 text-violet-700' : 'bg-slate-700 border-slate-600 text-slate-100 hover:bg-slate-600 hover:text-white',
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
          <h2 className="text-slate-200 font-extrabold mb-3 tracking-tight">🍽️ Dietary Preferences</h2>
          <div className="flex flex-wrap gap-2">
            {DIETARY_OPTIONS.map((opt) => {
              const selected = dietary.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => toggle(dietary, opt.value, setDietary)}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all',
                    selected ? 'bg-amber-100 border-amber-500/60 text-amber-700' : 'bg-slate-700 border-slate-600 text-slate-100 hover:bg-slate-600 hover:text-white',
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
          <h2 className="text-slate-200 font-extrabold mb-3 tracking-tight">❤️ Travel Interests</h2>
          <div className="flex flex-wrap gap-2">
            {INTEREST_OPTIONS.map((opt) => {
              const selected = interests.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => toggle(interests, opt.value, setInterests)}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all',
                    selected ? 'bg-pink-100 border-pink-500/60 text-pink-700' : 'bg-slate-700 border-slate-600 text-slate-100 hover:bg-slate-600 hover:text-white',
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
            <h2 className="text-slate-200 font-extrabold mb-3 text-sm tracking-tight">🧘 Pace</h2>
            <div className="space-y-2">
              {[{ val: 'relaxed', label: 'Relaxed', emoji: '🧘' }, { val: 'moderate', label: 'Moderate', emoji: '🚶' }, { val: 'packed', label: 'Packed', emoji: '🏃' }].map((p) => (
                <button
                  key={p.val}
                  onClick={() => setPace(p.val as any)}
                  className={clsx(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all',
                    pace === p.val ? 'bg-cyan-100 border-cyan-400/60 text-cyan-700' : 'bg-slate-700 border-slate-600 text-slate-100',
                  )}
                >
                  <span>{p.emoji}</span> {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-slate-200 font-extrabold mb-3 text-sm tracking-tight">💰 Budget</h2>
            <div className="space-y-2">
              {[{ val: 'budget', label: 'Budget', emoji: '💸' }, { val: 'moderate', label: 'Moderate', emoji: '💳' }, { val: 'luxury', label: 'Luxury', emoji: '💎' }].map((b) => (
                <button
                  key={b.val}
                  onClick={() => setBudget(b.val as any)}
                  className={clsx(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all',
                    budget === b.val ? 'bg-emerald-100 border-emerald-400/60 text-emerald-700' : 'bg-slate-700 border-slate-600 text-slate-100',
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
            <span className="text-emerald-400 text-sm">✅ Connected</span>
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
