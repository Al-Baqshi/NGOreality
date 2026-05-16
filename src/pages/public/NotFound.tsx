import { Link } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import SEO from '../../components/SEO';

export default function NotFound() {
  return (
    <>
      <SEO title="Page Not Found" description="The page you're looking for doesn't exist." path="/404" />
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="max-w-lg mx-auto px-6 text-center">
          <div className="flex items-center justify-center mb-6">
            <div className="flex h-20 w-20 items-center justify-center border-3 border-ink-950 bg-ink-50">
              <Search size={40} className="text-ink-300" />
            </div>
          </div>
          <h1 className="text-6xl font-black uppercase tracking-tight text-ink-950 mb-4">404</h1>
          <h2 className="text-xl font-bold uppercase tracking-tight text-ink-700 mb-4">Page not found</h2>
          <p className="text-sm text-ink-500 mb-8">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <Link to="/public" className="btn-brutal inline-flex items-center gap-2">
            <ArrowLeft size={16} /> Back to Home
          </Link>
        </div>
      </div>
    </>
  );
}
