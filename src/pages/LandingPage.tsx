import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Plane, Star, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type Mode = 'login' | 'signup';

export default function LandingPage() {
  const { login, signup, isLoading } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        if (!name.trim()) { setError('Please enter your name'); return; }
        await signup(name, email, password);
      }
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    }
  };

  const FEATURES = [
    { emoji: '🗺️', title: '5 Daily Route Options', desc: 'Optimized from your hotel' },
    { emoji: '📍', title: 'Real Google Maps', desc: 'Live places data worldwide' },
    { emoji: '🍜', title: 'Diet-Aware', desc: 'Filters restaurants by your needs' },
    { emoji: '📋', title: 'Instant Booking Links', desc: 'OpenTable, Klook, Viator & more' },
  ];

  return (
    <div className="min-h-screen bg-gradient-hero overflow-hidden relative">
      {/* Animated background orbs */}
      <div className="orb w-96 h-96 bg-violet-600 top-[-100px] left-[-100px] animate-float" />
      <div className="orb w-80 h-80 bg-pink-600 bottom-[-50px] right-[-50px] animate-float-delay" />
      <div className="orb w-64 h-64 bg-cyan-600 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-float-slow" />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-5 py-12">

        {/* Logo + Hero */}
        <div className="text-center mb-10 animate-slide-up">
          <div className="inline-flex items-center gap-3 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center shadow-glow-purple">
              <Plane size={28} className="text-white" />
            </div>
            <div className="text-left">
              <h1 className="text-2xl font-black text-white leading-none">TripOptimizer</h1>
              <p className="text-violet-400 text-xs font-medium">Smart Travel Planner</p>
            </div>
          </div>

          <h2 className="text-4xl sm:text-5xl font-black text-white leading-tight mb-4">
            Your city,{' '}
            <span className="gradient-text">perfectly</span>
            <br />
            planned. ✈️
          </h2>
          <p className="text-white/60 text-base max-w-xs mx-auto leading-relaxed">
            Drop your hotel address and we'll generate 5 optimized daily itineraries — real places, real routes, instant bookings.
          </p>
        </div>

        {/* Feature Pills */}
        <div className="flex gap-2 flex-wrap justify-center mb-8 animate-fade-in">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass rounded-2xl px-3 py-2 flex items-center gap-2">
              <span className="text-lg">{f.emoji}</span>
              <div>
                <p className="text-white text-xs font-semibold">{f.title}</p>
                <p className="text-white/50 text-[10px]">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Auth Card */}
        <div className="w-full max-w-sm glass rounded-3xl p-6 animate-slide-up" style={{ animationDelay: '0.1s' }}>

          {/* Mode Toggle */}
          <div className="flex bg-white/5 rounded-2xl p-1 mb-6">
            {(['login', 'signup'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); }}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  mode === m
                    ? 'bg-gradient-to-r from-violet-600 to-pink-600 text-white shadow-glow-purple'
                    : 'text-white/50 hover:text-white/80'
                }`}
              >
                {m === 'login' ? '👋 Log In' : '🚀 Sign Up'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="text-white/60 text-xs font-medium mb-1.5 block">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Chen"
                  required
                  className="input-field"
                />
              </div>
            )}

            <div>
              <label className="text-white/60 text-xs font-medium mb-1.5 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="input-field"
              />
            </div>

            <div>
              <label className="text-white/60 text-xs font-medium mb-1.5 block">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'Min. 8 characters' : '••••••••'}
                  required
                  minLength={mode === 'signup' ? 8 : 1}
                  className="input-field pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-2xl px-4 py-3">
                <p className="text-red-400 text-sm">⚠️ {error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? 'Log In' : 'Create Account'}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {mode === 'signup' && (
            <p className="text-white/30 text-xs text-center mt-4">
              By signing up you agree to our terms. Your data stays on your device.
            </p>
          )}
        </div>

        {/* Social proof */}
        <div className="mt-8 flex items-center gap-3 animate-fade-in">
          <div className="flex -space-x-2">
            {['🧑‍💼', '👩‍🦱', '🧑‍🦰', '👩'].map((e, i) => (
              <div key={i} className="w-8 h-8 rounded-full glass flex items-center justify-center text-sm border border-white/20">
                {e}
              </div>
            ))}
          </div>
          <div>
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => <Star key={i} size={10} className="fill-amber-400 text-amber-400" />)}
            </div>
            <p className="text-white/50 text-xs">Loved by 2,000+ travellers</p>
          </div>
        </div>
      </div>
    </div>
  );
}
