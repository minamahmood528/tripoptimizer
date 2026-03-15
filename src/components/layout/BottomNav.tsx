import { NavLink, useLocation } from 'react-router-dom';
import { Home, User, Compass } from 'lucide-react';
import clsx from 'clsx';

const NAV_ITEMS = [
  { to: '/dashboard', icon: Home, label: 'Home' },
  { to: '/explore', icon: Compass, label: 'Explore' },
  { to: '/profile', icon: User, label: 'Profile' },
];

export default function BottomNav() {
  const location = useLocation();

  return (
    <nav className="bottom-nav">
      <div className="flex items-center justify-around px-2 py-2">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname === to || (to !== '/dashboard' && location.pathname.startsWith(to));
          return (
            <NavLink
              key={to}
              to={to}
              className={clsx(
                'flex flex-col items-center gap-1 min-w-[60px] py-1 rounded-2xl transition-all duration-200',
                isActive ? 'text-violet-400' : 'text-white/50 hover:text-white/80',
              )}
            >
              <span className={clsx(
                'w-10 h-10 flex items-center justify-center rounded-2xl transition-all duration-200',
                isActive ? 'bg-violet-500/20' : '',
              )}>
                <Icon size={20} />
              </span>
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
