import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth, AuthProvider } from './context/AuthContext';
import { TripProvider } from './context/TripContext';
import BottomNav from './components/layout/BottomNav';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';
import NewTripPage from './pages/NewTripPage';
import TripDetailPage from './pages/TripDetailPage';
import ItineraryPage from './pages/ItineraryPage';
import ExplorePage from './pages/ExplorePage';
import ProfilePage from './pages/ProfilePage';

const SHOW_NAV_PATHS = ['/dashboard', '/explore', '/profile', '/trips'];

function AppInner() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const showNav = user && SHOW_NAV_PATHS.some((p) => location.pathname.startsWith(p));

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center text-4xl shadow-glow-purple animate-pulse-glow">
            ✈️
          </div>
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm font-medium">Loading TripOptimizer...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
        <Route path="/dashboard" element={user ? <DashboardPage /> : <Navigate to="/" replace />} />
        <Route path="/trips/new" element={user ? <NewTripPage /> : <Navigate to="/" replace />} />
        <Route path="/trips/:id" element={user ? <TripDetailPage /> : <Navigate to="/" replace />} />
        <Route path="/trips/:id/city/:cityId/day/:dayId" element={user ? <ItineraryPage /> : <Navigate to="/" replace />} />
        <Route path="/explore" element={user ? <ExplorePage /> : <Navigate to="/" replace />} />
        <Route path="/profile" element={user ? <ProfilePage /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to={user ? '/dashboard' : '/'} replace />} />
      </Routes>
      {showNav && <BottomNav />}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TripProvider>
          <AppInner />
        </TripProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
