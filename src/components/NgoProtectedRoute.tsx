import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function NgoProtectedRoute() {
  // Either issuer counts: NGO users arrive via central Baqshi auth, while
  // anyone still on a Supabase session keeps working unchanged.
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <p className="font-mono text-xs uppercase tracking-wider text-ink-500">Loading…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/ngo/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
