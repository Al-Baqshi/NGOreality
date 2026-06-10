import { FormEvent, useState } from 'react';
import { ExternalLink, LockKeyhole } from 'lucide-react';
import SEO, { BreadcrumbJsonLd } from '../../components/SEO';

const BUSINESS_PLAN_URL = 'https://ngo-reality-business-plan.vercel.app/';
const BUSINESS_PLAN_PASSWORD = '0000';

export default function BusinessPlanGate() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password !== BUSINESS_PLAN_PASSWORD) {
      setError('Incorrect password.');
      setPassword('');
      return;
    }

    window.location.assign(BUSINESS_PLAN_URL);
  };

  return (
    <>
      <SEO
        title="Business Plan"
        description="Password-protected access to the NGOreality business plan."
        path="/public/business-plan"
      />
      <BreadcrumbJsonLd items={[{ name: 'Home', path: '/public' }, { name: 'Business Plan', path: '/public/business-plan' }]} />

      <div>
        <section className="border-b-3 border-ink-950 bg-ink-950 text-white">
          <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px w-12 bg-accent" />
                <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-300">Private</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tight mb-4">
                Business Plan
              </h1>
              <p className="text-ink-300 text-lg leading-relaxed">
                Enter the access code to open the NGOreality business plan.
              </p>
            </div>
          </div>
        </section>

        <section className="max-w-xl mx-auto px-6 py-16 md:py-24">
          <form onSubmit={handleSubmit} className="card-brutal p-6 md:p-8 space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center border-3 border-ink-950 bg-teal-light text-teal">
                <LockKeyhole size={20} aria-hidden />
              </div>
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight">Access required</h2>
                <p className="mt-1 text-sm text-ink-500">This page redirects to the external business plan.</p>
              </div>
            </div>

            <div>
              <label htmlFor="business-plan-password" className="label-brutal">
                Password
              </label>
              <input
                id="business-plan-password"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="current-password"
                className="input-brutal w-full text-base"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError('');
                }}
                autoFocus
                required
              />
            </div>

            {error && <p className="font-mono text-xs text-accent">{error}</p>}

            <button type="submit" className="btn-brutal-accent flex min-h-[44px] w-full items-center justify-center gap-2 text-base">
              Open Business Plan <ExternalLink size={16} aria-hidden />
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
