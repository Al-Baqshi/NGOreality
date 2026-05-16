import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function NgoProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <p className="font-mono text-xs uppercase tracking-wider text-ink-500">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/ngo/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
