import { Link, NavLink, Outlet } from 'react-router-dom';
import { LogIn, Menu, X } from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { to: '/public', label: 'Home', end: true },
  { to: '/public/how-it-works', label: 'How It Works' },
  { to: '/public/verified', label: 'Verified' },
  { to: '/public/directory', label: 'Directory' },
  { to: '/public/reality-badge', label: 'Reality Badge' },
  { to: '/public/blog', label: 'Blog' },
  { to: '/public/about', label: 'About' },
  { to: '/public/contact', label: 'Contact' },
  { to: '/ngo/login', label: 'NGO Portal' },
];

export default function PublicLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b-3 border-ink-950 bg-surface-raised">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <NavLink to="/public" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center border-3 border-ink-950 bg-accent font-mono text-sm font-black text-white">
              N
            </div>
            <span className="text-lg font-black uppercase tracking-[0.15em] text-ink-950">NGOreality</span>
          </NavLink>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `px-4 py-2 font-mono text-xs uppercase tracking-wider transition-colors
                  ${isActive
                    ? 'bg-ink-950 text-white'
                    : 'text-ink-600 hover:bg-ink-50 hover:text-ink-950'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Mobile toggle */}
          <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden text-ink-950">
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <nav className="md:hidden border-t-3 border-ink-950 bg-surface-raised">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `block px-6 py-3 border-b border-ink-100 font-mono text-xs uppercase tracking-wider
                  ${isActive
                    ? 'bg-ink-950 text-white'
                    : 'text-ink-600'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      {/* Content */}
      <main>
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t-3 border-ink-950 bg-ink-950 text-ink-300">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-8 w-8 items-center justify-center border-2 border-accent bg-accent font-mono text-xs font-black text-white">
                  N
                </div>
                <span className="text-sm font-black uppercase tracking-[0.2em] text-white">NGOreality</span>
              </div>
              <p className="text-xs leading-relaxed text-ink-400">
                Digital trust infrastructure for nonprofits. Building the missing layer between intention and trust.
              </p>
            </div>
            <div>
              <h4 className="label-brutal text-ink-400 mb-3">Platform</h4>
              <div className="space-y-2">
                <NavLink to="/public/how-it-works" className="block text-xs text-ink-400 hover:text-white transition-colors">How It Works</NavLink>
                <NavLink to="/public/directory" className="block text-xs text-ink-400 hover:text-white transition-colors">Verified Directory</NavLink>
                <NavLink to="/public/verification" className="block text-xs text-ink-400 hover:text-white transition-colors">Verification</NavLink>
                <NavLink to="/public/blog" className="block text-xs text-ink-400 hover:text-white transition-colors">Blog</NavLink>
                <Link
                  to="/ngo/login"
                  className="inline-flex items-center gap-1.5 text-xs text-ink-400 hover:text-white transition-colors"
                >
                  <LogIn size={12} aria-hidden />
                  NGO sign in
                </Link>
                <Link
                  to="/staff/login"
                  className="block text-xs text-ink-400 hover:text-white transition-colors"
                >
                  Staff CRM
                </Link>
              </div>
            </div>
            <div>
              <h4 className="label-brutal text-ink-400 mb-3">Organization</h4>
              <div className="space-y-2">
                <NavLink to="/public/about" className="block text-xs text-ink-400 hover:text-white transition-colors">About</NavLink>
                <NavLink to="/public/contact" className="block text-xs text-ink-400 hover:text-white transition-colors">Contact</NavLink>
              </div>
            </div>
            <div>
              <h4 className="label-brutal text-ink-400 mb-3">Legal</h4>
              <div className="space-y-2">
                <span className="block text-xs text-ink-400">Privacy Policy</span>
                <span className="block text-xs text-ink-400">Terms of Service</span>
              </div>
            </div>
          </div>
          <div className="border-t border-ink-700 mt-8 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="font-mono text-2xs text-ink-500 uppercase tracking-wider">
              &copy; {new Date().getFullYear()} NGOreality. All rights reserved.
            </p>
            <p className="font-mono text-2xs text-ink-500 uppercase tracking-wider">
              Independent Verification Body
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
