import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function StaffProtectedRoute() {
  const { user, isStaff, loading, profileLoading } = useAuth();
  const location = useLocation();

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <p className="font-mono text-xs uppercase tracking-wider text-ink-500">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/staff/login" replace state={{ from: location.pathname }} />;
  }

  if (!isStaff) {
    return (
      <Navigate
        to="/staff/login"
        replace
        state={{ from: location.pathname, staffDenied: true }}
      />
    );
  }

  return <Outlet />;
}
