import { Link, NavLink, Outlet } from 'react-router-dom';
import { LogIn, Menu, X } from 'lucide-react';
import { useState } from 'react';
import BrandLogo from './BrandLogo';
import ThemeToggle from './ThemeToggle';

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

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex items-center whitespace-nowrap px-2.5 xl:px-3 py-2 font-mono text-2xs xl:text-xs uppercase tracking-wider transition-colors shrink-0
  ${isActive
    ? 'bg-ink-950 text-white'
    : 'text-ink-600 hover:bg-ink-50 hover:text-ink-950 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-white'
  }`;

export default function PublicLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface overflow-x-hidden">
      <header className="sticky top-0 z-40 border-b-3 border-ink-950 bg-surface-raised">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between gap-3 min-h-[56px] py-2 sm:py-2.5">
            <div className="shrink-0 min-w-0 max-w-[45%] sm:max-w-none">
              <BrandLogo
                linkToPublic
                allowWrap
                iconClassName="h-10 w-10 sm:h-12 sm:w-12 lg:h-14 lg:w-14"
                className="max-w-full"
              />
            </div>

            {/* Desktop nav — lg+ only so links never crush the logo */}
            <nav
              className="hidden lg:flex flex-1 items-center justify-center gap-0.5 min-w-0 max-w-full overflow-x-auto px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              aria-label="Main navigation"
            >
              {navItems.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <ThemeToggle />
              <button
                type="button"
                onClick={() => setMobileOpen(!mobileOpen)}
                className="lg:hidden text-ink-950 dark:text-ink-50 min-h-[44px] min-w-[44px] flex items-center justify-center border-2 border-transparent hover:border-ink-950 dark:hover:border-ink-200 transition-colors"
                aria-expanded={mobileOpen}
                aria-controls="public-mobile-nav"
                aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              >
                {mobileOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>

        {mobileOpen && (
          <nav
            id="public-mobile-nav"
            className="lg:hidden border-t-3 border-ink-950 bg-surface-raised max-h-[min(70vh,480px)] overflow-y-auto"
            aria-label="Mobile navigation"
          >
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center px-4 sm:px-6 py-3 border-b border-ink-100 dark:border-ink-800 font-mono text-xs uppercase tracking-wider min-h-[44px]
                  ${isActive
                    ? 'bg-ink-950 text-white'
                    : 'text-ink-600 dark:text-ink-300'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="min-w-0">
        <Outlet />
      </main>

      <footer className="border-t-3 border-ink-950 bg-ink-950 text-ink-300 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
          {/* Stack until lg — avoids logo overlapping link columns at md widths */}
          <div className="flex flex-col gap-10 lg:grid lg:grid-cols-4 lg:gap-8 lg:items-start">
            <div className="min-w-0 max-w-full lg:pr-4">
              <BrandLogo
                onDark
                layout="stacked"
                allowWrap
                iconClassName="h-11 w-11 sm:h-12 sm:w-12"
                className="max-w-full"
              />
              <p className="mt-4 text-xs leading-relaxed text-ink-400 max-w-md">
                Digital trust infrastructure for nonprofits. Building the missing layer between intention and trust.
              </p>
            </div>

            <div className="min-w-0">
              <h4 className="label-brutal text-ink-400 mb-3">Platform</h4>
              <div className="space-y-2">
                <NavLink to="/public/how-it-works" className="block text-xs text-ink-400 hover:text-white transition-colors py-0.5">How It Works</NavLink>
                <NavLink to="/public/directory" className="block text-xs text-ink-400 hover:text-white transition-colors py-0.5">Verified Directory</NavLink>
                <NavLink to="/public/verification" className="block text-xs text-ink-400 hover:text-white transition-colors py-0.5">Verification</NavLink>
                <NavLink to="/public/blog" className="block text-xs text-ink-400 hover:text-white transition-colors py-0.5">Blog</NavLink>
                <Link
                  to="/ngo/login"
                  className="inline-flex items-center gap-1.5 text-xs text-ink-400 hover:text-white transition-colors py-0.5 min-h-[44px] sm:min-h-0"
                >
                  <LogIn size={12} aria-hidden />
                  NGO sign in
                </Link>
                <Link
                  to="/staff/login"
                  className="block text-xs text-ink-400 hover:text-white transition-colors py-0.5"
                >
                  Staff CRM
                </Link>
              </div>
            </div>

            <div className="min-w-0">
              <h4 className="label-brutal text-ink-400 mb-3">Organization</h4>
              <div className="space-y-2">
                <NavLink to="/public/about" className="block text-xs text-ink-400 hover:text-white transition-colors py-0.5">About</NavLink>
                <NavLink to="/public/contact" className="block text-xs text-ink-400 hover:text-white transition-colors py-0.5">Contact</NavLink>
                <NavLink to="/public/business-plan" className="block text-xs text-ink-400 hover:text-white transition-colors py-0.5">Business Plan</NavLink>
              </div>
            </div>

            <div className="min-w-0">
              <h4 className="label-brutal text-ink-400 mb-3">Legal</h4>
              <div className="space-y-2">
                <NavLink to="/public/privacy" className="block text-xs text-ink-400 hover:text-white transition-colors py-0.5">Privacy Policy</NavLink>
                <NavLink to="/public/terms" className="block text-xs text-ink-400 hover:text-white transition-colors py-0.5">Terms of Service</NavLink>
              </div>
            </div>
          </div>

          <div className="border-t border-ink-700 mt-8 sm:mt-10 pt-6 sm:pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
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
