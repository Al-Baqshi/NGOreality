import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Globe, Eye, ArrowRight, CheckCircle, Search, MapPin, Clock } from 'lucide-react';
import SEO, { OrganizationJsonLd } from '../../components/SEO';
import { useDirectoryCountryCounts } from '../../hooks/useDirectory';
import { COUNTRY_NAMES } from '../../data/countryNames';

/* Scroll offset (throttled via rAF) used to drive vertical parallax layers. */
function useScrollParallax() {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setOffset(window.scrollY));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);
  return offset;
}

/* Pointer position (-0.5..0.5) for subtle mouse-driven parallax on the hero. */
function usePointerParallax() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() =>
        setPos({ x: e.clientX / window.innerWidth - 0.5, y: e.clientY / window.innerHeight - 0.5 }),
      );
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);
  return pos;
}

/* Live local date + time — updates every second. */
function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, ' ');

  return (
    <div className="inline-flex items-center gap-3 border border-white/15 bg-white/5 px-4 py-2 backdrop-blur-sm">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="animate-pulse-ring absolute inline-flex h-full w-full rounded-full bg-glow-teal" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-glow-teal" />
      </span>
      <Clock size={13} className="text-glow-teal shrink-0" aria-hidden />
      <span className="font-mono text-2xs uppercase tracking-wider text-ink-200">{date}</span>
      <span className="font-mono text-sm font-semibold tabular-nums tracking-wider text-white" aria-live="off">
        {time}
      </span>
      <span className="hidden sm:inline font-mono text-2xs uppercase tracking-wider text-ink-300">{tz}</span>
    </div>
  );
}

/* Search that navigates to the directory pre-filtered by country + keyword. */
function DirectorySearch() {
  const navigate = useNavigate();
  const { counts } = useDirectoryCountryCounts();
  const [country, setCountry] = useState('NZ');
  const [query, setQuery] = useState('');

  const countryOptions = useMemo(() => {
    const fromCounts = Object.entries(counts)
      .filter(([code]) => COUNTRY_NAMES[code])
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({ code, name: COUNTRY_NAMES[code], count }));
    return fromCounts.length ? fromCounts : [{ code: 'NZ', name: 'New Zealand', count: 0 }];
  }, [counts]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (country) params.set('country', country);
    if (query.trim()) params.set('q', query.trim());
    navigate(`/public/directory?${params.toString()}`);
  };

  return (
    <form
      onSubmit={submit}
      className="border-3 border-ink-950 bg-surface-raised p-2 shadow-brutal-lg dark:border-white/20"
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-stretch">
        <div className="relative flex items-center md:w-56 md:shrink-0">
          <MapPin size={16} className="pointer-events-none absolute left-3 text-teal" aria-hidden />
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            aria-label="Filter by country"
            className="input-brutal w-full appearance-none border-0 bg-transparent pl-9 pr-8 text-sm shadow-none focus:ring-0 dark:bg-transparent"
          >
            {countryOptions.map(({ code, name, count }) => (
              <option key={code} value={code}>
                {name}
                {count ? ` (${count.toLocaleString()})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="hidden w-px self-stretch bg-ink-200 md:block dark:bg-white/15" />

        <div className="relative flex flex-1 items-center">
          <Search size={16} className="pointer-events-none absolute left-3 text-ink-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search NGOs by name, cause, or registration…"
            aria-label="Search nonprofits"
            className="input-brutal w-full border-0 bg-transparent pl-9 text-base shadow-none focus:ring-0 dark:bg-transparent"
          />
        </div>

        <button
          type="submit"
          className="btn-brutal-teal flex shrink-0 items-center justify-center gap-2 text-sm"
        >
          <Search size={16} />
          Search
        </button>
      </div>
    </form>
  );
}

export default function Homepage() {
  const scrollY = useScrollParallax();
  const pointer = usePointerParallax();
  const heroRef = useRef<HTMLElement>(null);

  const blobA = {
    transform: `translate3d(${pointer.x * 40}px, ${scrollY * 0.18 + pointer.y * 40}px, 0)`,
  };
  const blobB = {
    transform: `translate3d(${pointer.x * -55}px, ${scrollY * 0.28 + pointer.y * -30}px, 0)`,
  };
  const gridStyle = { transform: `translate3d(0, ${scrollY * 0.12}px, 0)` };
  const contentStyle = { transform: `translate3d(0, ${scrollY * -0.04}px, 0)` };

  return (
    <>
      <SEO
        title="Digital Trust Infrastructure for Nonprofits"
        description="NGOreality is the missing layer between intention and trust. We verify, certify, and build digital infrastructure so nonprofits can be understood, trusted, and engaged with."
        path="/"
      />
      <OrganizationJsonLd />
      <div>
        {/* Hero — parallax layers over a deep slate gradient */}
        <section
          ref={heroRef}
          className="relative isolate overflow-hidden border-b-3 border-ink-950 text-white"
          style={{ background: 'radial-gradient(120% 120% at 15% 0%, #24404b 0%, #172830 45%, #0f1c22 100%)' }}
        >
          {/* Decorative parallax layers */}
          <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
            <div className="bg-grid-hero will-parallax absolute inset-0 opacity-60" style={gridStyle} />
            <div
              className="animate-float-slow will-parallax absolute -left-24 top-[-6rem] h-[26rem] w-[26rem] rounded-full opacity-40 blur-3xl"
              style={{ ...blobA, background: 'radial-gradient(circle, #2dd4bf 0%, transparent 70%)' }}
            />
            <div
              className="animate-float-slower will-parallax absolute right-[-8rem] top-24 h-[30rem] w-[30rem] rounded-full opacity-30 blur-3xl"
              style={{ ...blobB, background: 'radial-gradient(circle, #38bdf8 0%, transparent 70%)' }}
            />
            <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0f1c22] to-transparent" />
          </div>

          <div className="mx-auto max-w-7xl px-6 py-20 md:py-28" style={contentStyle}>
            <div className="max-w-3xl">
              <div className="mb-6 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-px w-12 bg-glow-teal" />
                  <span className="font-mono text-2xs uppercase tracking-[0.3em] text-glow-mint">
                    Digital Trust Infrastructure
                  </span>
                </div>
                <LiveClock />
              </div>

              <h1 className="mb-6 text-5xl font-black uppercase leading-[0.9] tracking-tight md:text-7xl">
                Building trust
                <br />
                <span className="text-gradient-teal">in nonprofits</span>
              </h1>

              <p className="mb-8 max-w-xl text-lg leading-relaxed text-ink-100">
                NGOreality is the missing layer between intention and trust. We verify, certify, and build digital
                infrastructure so nonprofits can be understood, trusted, and engaged with.
              </p>

              {/* Search bar */}
              <div className="mb-6 max-w-2xl">
                <DirectorySearch />
                <p className="mt-2 font-mono text-2xs uppercase tracking-wider text-ink-300">
                  Search 30,000+ registered charities &middot; filter by country &amp; cause
                </p>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row">
                <Link
                  to="/public/contact"
                  className="btn-brutal-accent flex items-center justify-center gap-2 text-base"
                >
                  Get Verified <ArrowRight size={18} />
                </Link>
                <Link
                  to="/public/directory"
                  className="btn-brutal-outline flex items-center justify-center gap-2 border-white bg-transparent text-base text-white hover:bg-white hover:text-ink-950"
                >
                  View Directory
                </Link>
              </div>
            </div>

            {/* Trust stats */}
            <div className="mt-14 grid max-w-3xl grid-cols-2 gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-4">
              {[
                { value: '30,000+', label: 'Charities listed' },
                { value: '3', label: 'Layers of trust' },
                { value: 'Live', label: 'Verification' },
                { value: '24/7', label: 'Public directory' },
              ].map((stat) => (
                <div key={stat.label} className="bg-[#132229]/80 px-5 py-5 backdrop-blur-sm">
                  <div className="text-2xl font-black tracking-tight text-white md:text-3xl">{stat.value}</div>
                  <div className="mt-1 font-mono text-2xs uppercase tracking-wider text-ink-300">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Problem */}
        <section className="relative overflow-hidden border-b-3 border-ink-950">
          <div className="pointer-events-none absolute -right-24 top-10 -z-10 h-72 w-72 rounded-full bg-accent/5 blur-3xl" aria-hidden />
          <div className="mx-auto max-w-7xl px-6 py-16 md:py-24">
            <div className="mb-12 max-w-2xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="h-px w-12 bg-accent" />
                <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-400">The Problem</span>
              </div>
              <h2 className="text-3xl font-black uppercase tracking-tight md:text-4xl">Trust is not standardized</h2>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {[
                {
                  title: 'Fragmented Trust',
                  description:
                    'There is no simple way for the public to verify whether a nonprofit is legitimate, active, and transparent.',
                },
                {
                  title: 'No Digital Baseline',
                  description:
                    'Many nonprofits lack functional websites, clear communication, or basic contact channels. No standard exists.',
                },
                {
                  title: 'Donor Friction',
                  description:
                    'When people want to give, they encounter poor experience and lack confidence. Intention does not convert to action.',
                },
              ].map((item, i) => (
                <div key={item.title} className="card-brutal-hover p-6">
                  <div className="mb-3 font-mono text-2xs font-semibold tracking-widest text-accent">
                    0{i + 1}
                  </div>
                  <h3 className="mb-3 text-lg font-black uppercase tracking-tight">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-ink-500">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Solution */}
        <section className="relative overflow-hidden border-b-3 border-ink-950 bg-surface-overlay">
          <div className="pointer-events-none absolute -left-20 bottom-0 -z-10 h-80 w-80 rounded-full bg-teal/5 blur-3xl" aria-hidden />
          <div className="mx-auto max-w-7xl px-6 py-16 md:py-24">
            <div className="mb-12 max-w-2xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="h-px w-12 bg-teal" />
                <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-400">The Solution</span>
              </div>
              <h2 className="text-3xl font-black uppercase tracking-tight md:text-4xl">Three layers of trust</h2>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {[
                {
                  icon: <Globe size={22} />,
                  title: 'Digital Foundation',
                  description:
                    'Every nonprofit gets a functional, responsive website with clear mission, contact methods, and legal pages.',
                  border: 'border-t-ink-950',
                  chip: 'bg-ink-950 text-white',
                },
                {
                  icon: <Shield size={22} />,
                  title: 'Verification',
                  description:
                    'Organizations that meet our standards receive a public verification badge — a clear, instant trust signal.',
                  border: 'border-t-teal',
                  chip: 'bg-teal text-white',
                },
                {
                  icon: <Eye size={22} />,
                  title: 'Transparency',
                  description:
                    'Impact updates and public dashboards convert complex reporting into clear trust signals. Financial transparency tools coming soon.',
                  border: 'border-t-accent',
                  chip: 'bg-accent text-white',
                },
              ].map((item) => (
                <div key={item.title} className={`card-brutal-hover border-t-4 p-6 ${item.border}`}>
                  <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center ${item.chip}`}>
                    {item.icon}
                  </div>
                  <h3 className="mb-3 text-lg font-black uppercase tracking-tight">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-ink-500">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Value Props */}
        <section className="border-b-3 border-ink-950">
          <div className="mx-auto max-w-7xl px-6 py-16 md:py-24">
            <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
              <div>
                <div className="mb-4 flex items-center gap-3">
                  <div className="h-px w-12 bg-teal" />
                  <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-400">For Nonprofits</span>
                </div>
                <h2 className="mb-6 text-3xl font-black uppercase tracking-tight">
                  Increased credibility and trust
                </h2>
                <ul className="space-y-3">
                  {[
                    'Increased credibility and public trust',
                    'Improved donation conversion rates',
                    'Professional digital presence',
                    'Reduced technical burden',
                    'Ongoing support and maintenance',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <CheckCircle size={16} className="mt-0.5 shrink-0 text-teal" />
                      <span className="text-sm text-ink-600">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-4 flex items-center gap-3">
                  <div className="h-px w-12 bg-accent" />
                  <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-400">For The Public</span>
                </div>
                <h2 className="mb-6 text-3xl font-black uppercase tracking-tight">Instant trust signal</h2>
                <ul className="space-y-3">
                  {[
                    'Instant verification of legitimacy',
                    'Easier decision-making',
                    'Clear understanding of impact',
                    'Reduced risk of fraud or confusion',
                    'Standardized digital expectations',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <CheckCircle size={16} className="mt-0.5 shrink-0 text-accent" />
                      <span className="text-sm text-ink-600">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section
          className="relative overflow-hidden text-white"
          style={{ background: 'radial-gradient(120% 120% at 85% 100%, #24404b 0%, #172830 50%, #0f1c22 100%)' }}
        >
          <div className="bg-grid-hero pointer-events-none absolute inset-0 opacity-40" aria-hidden />
          <div className="relative mx-auto max-w-7xl px-6 py-16 text-center md:py-24">
            <h2 className="mb-6 text-3xl font-black uppercase tracking-tight md:text-5xl">
              Ready to <span className="text-gradient-teal">build trust?</span>
            </h2>
            <p className="mx-auto mb-8 max-w-lg text-ink-200">
              Join the organizations that are setting the standard for nonprofit transparency and digital credibility.
            </p>
            <Link to="/public/contact" className="btn-brutal-accent inline-flex items-center gap-2 text-base">
              Get Verified <ArrowRight size={18} />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
