import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  Shield,
  Users,
  Globe,
  Mail,
  FileText,
  ChevronLeft,
  Menu,
  LogOut,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/organizations', icon: Building2, label: 'Organizations' },
  { to: '/verification', icon: Shield, label: 'Verification' },
  { to: '/contacts', icon: Users, label: 'Contacts' },
  { to: '/inquiries', icon: Mail, label: 'Inquiries' },
  { to: '/blog-manager', icon: FileText, label: 'Blog' },
  { to: '/public', icon: Globe, label: 'Public Site' },
];

export default function CRMLayout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/staff/login', { replace: true });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-ink-950/50 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 flex flex-col border-r-3 border-ink-950 bg-ink-950 text-white
          transition-all duration-200 ${collapsed ? 'w-16' : 'w-56'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Logo */}
        <div className={`flex items-center border-b border-ink-700 px-4 py-5 ${collapsed ? 'justify-center' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center border-2 border-accent bg-accent font-mono text-xs font-black">
              N
            </div>
            {!collapsed && (
              <span className="text-sm font-black uppercase tracking-[0.2em]">NGOreality</span>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 font-mono text-xs uppercase tracking-wider transition-colors
                ${isActive
                  ? 'bg-accent text-white'
                  : 'text-ink-300 hover:bg-ink-800 hover:text-white'
                }
                ${collapsed ? 'justify-center' : ''}`
              }
            >
              <item.icon size={16} />
              {!collapsed && item.label}
            </NavLink>
          ))}
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex items-center justify-center border-t border-ink-700 py-3 text-ink-400 hover:text-white transition-colors"
        >
          <ChevronLeft size={16} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between border-b-3 border-ink-950 bg-surface-raised px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden text-ink-600 hover:text-ink-950"
            >
              <Menu size={20} />
            </button>
            <div className="label-brutal mb-0">CRM Console</div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {profile?.full_name && (
              <span className="hidden sm:inline font-mono text-2xs uppercase tracking-wider text-ink-500 truncate max-w-[140px]">
                {profile.full_name}
              </span>
            )}
            <div className="flex items-center gap-2 border-2 border-ink-200 px-3 py-1.5">
              <div className="h-2 w-2 rounded-full bg-teal animate-pulse" />
              <span className="font-mono text-2xs uppercase tracking-wider text-ink-500">Active</span>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex items-center justify-center min-h-[44px] min-w-[44px] border-2 border-ink-950 text-ink-600 hover:bg-ink-950 hover:text-white transition-colors"
              aria-label="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
