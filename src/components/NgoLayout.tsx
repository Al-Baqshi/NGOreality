import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import BrandLogo from './BrandLogo';

export default function NgoLayout() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/ngo/login');
  };

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-40 border-b-3 border-ink-950 bg-surface-raised">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4">
          <Link to="/ngo" className="flex items-center gap-2 sm:gap-3 min-w-0">
            <BrandLogo fullClassName="h-11 sm:h-12 w-auto max-w-[220px]" />
            <span className="text-sm sm:text-base font-black uppercase tracking-[0.12em] text-ink-950 truncate">
              NGO Portal
            </span>
          </Link>

          <nav className="hidden sm:flex items-center gap-1">
            <NavLink
              to="/ngo"
              end
              className={({ isActive }) =>
                `px-3 py-2 font-mono text-2xs sm:text-xs uppercase tracking-wider ${
                  isActive ? 'bg-ink-950 text-white' : 'text-ink-600 hover:bg-ink-50'
                }`
              }
            >
              Dashboard
            </NavLink>
            <Link
              to="/public"
              className="px-3 py-2 font-mono text-2xs sm:text-xs uppercase tracking-wider text-ink-600 hover:bg-ink-50"
            >
              Public site
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <span className="hidden md:block font-mono text-2xs text-ink-400 truncate max-w-[140px]">
              {user?.email}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="hidden sm:inline-flex items-center gap-1.5 border-2 border-ink-950 px-3 py-2 font-mono text-2xs uppercase tracking-wider hover:bg-ink-950 hover:text-white transition-colors min-h-[44px]"
              aria-label="Sign out"
            >
              <LogOut size={14} aria-hidden />
              Sign out
            </button>
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              className="sm:hidden p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-ink-950"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav className="sm:hidden border-t-3 border-ink-950 bg-surface-raised px-4 py-2">
            <NavLink
              to="/ngo"
              end
              onClick={() => setMobileOpen(false)}
              className="block py-3 font-mono text-xs uppercase tracking-wider border-b border-ink-100"
            >
              Dashboard
            </NavLink>
            <Link
              to="/public"
              onClick={() => setMobileOpen(false)}
              className="block py-3 font-mono text-xs uppercase tracking-wider border-b border-ink-100"
            >
              Public site
            </Link>
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                handleSignOut();
              }}
              className="w-full flex items-center gap-2 py-3 font-mono text-xs uppercase tracking-wider text-accent"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </nav>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <Outlet />
      </main>
    </div>
  );
}
