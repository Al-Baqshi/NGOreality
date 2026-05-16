import { Link } from 'react-router-dom';
import { Shield, Globe, Eye, ArrowRight, CheckCircle } from 'lucide-react';
import SEO, { OrganizationJsonLd } from '../../components/SEO';

export default function Homepage() {
  return (
    <>
      <SEO
        title="Digital Trust Infrastructure for Nonprofits"
        description="NGOreality is the missing layer between intention and trust. We verify, certify, and build digital infrastructure so nonprofits can be understood, trusted, and engaged with."
        path="/public"
      />
      <OrganizationJsonLd />
    <div>
      {/* Hero */}
      <section className="border-b-3 border-ink-950 bg-ink-950 text-white">
        <div className="max-w-7xl mx-auto px-6 py-20 md:py-32">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px w-12 bg-accent" />
              <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-300">Digital Trust Infrastructure</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tight leading-[0.9] mb-6">
              Building trust
              <br />
              <span className="text-accent">in nonprofits</span>
            </h1>
            <p className="text-lg text-ink-300 leading-relaxed max-w-xl mb-8">
              NGOreality is the missing layer between intention and trust. We verify, certify, and build digital infrastructure so nonprofits can be understood, trusted, and engaged with.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/public/contact" className="btn-brutal-accent text-base flex items-center justify-center gap-2">
                Get Verified <ArrowRight size={18} />
              </Link>
              <Link to="/public/directory" className="btn-brutal-outline border-white text-white bg-transparent hover:bg-white hover:text-ink-950 text-base flex items-center justify-center gap-2">
                View Directory
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="border-b-3 border-ink-950">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
          <div className="max-w-2xl mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px w-12 bg-accent" />
              <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-400">The Problem</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight">
              Trust is not standardized
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                title: 'Fragmented Trust',
                description: 'There is no simple way for the public to verify whether a nonprofit is legitimate, active, and transparent.',
              },
              {
                title: 'No Digital Baseline',
                description: 'Many nonprofits lack functional websites, clear communication, or basic contact channels. No standard exists.',
              },
              {
                title: 'Donor Friction',
                description: 'When people want to give, they encounter poor experience and lack confidence. Intention does not convert to action.',
              },
            ].map((item) => (
              <div key={item.title} className="card-brutal p-6">
                <h3 className="text-lg font-black uppercase tracking-tight mb-3">{item.title}</h3>
                <p className="text-sm text-ink-500 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Solution */}
      <section className="border-b-3 border-ink-950 bg-surface-overlay">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
          <div className="max-w-2xl mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px w-12 bg-teal" />
              <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-400">The Solution</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight">
              Three layers of trust
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: <Globe size={24} />,
                title: 'Digital Foundation',
                description: 'Every nonprofit gets a functional, responsive website with clear mission, contact methods, and legal pages.',
                color: 'border-ink-950',
              },
              {
                icon: <Shield size={24} />,
                title: 'Verification',
                description: 'Organizations that meet our standards receive a public verification badge — a clear, instant trust signal.',
                color: 'border-teal',
              },
              {
                icon: <Eye size={24} />,
                title: 'Transparency',
                description: 'Impact updates, simplified financial snapshots, and public dashboards convert complex reporting into clear signals.',
                color: 'border-accent',
              },
            ].map((item) => (
              <div key={item.title} className={`card-brutal p-6 border-t-0 ${item.color} border-t-4`}>
                <div className="text-ink-400 mb-4">{item.icon}</div>
                <h3 className="text-lg font-black uppercase tracking-tight mb-3">{item.title}</h3>
                <p className="text-sm text-ink-500 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Value Props */}
      <section className="border-b-3 border-ink-950">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px w-12 bg-teal" />
                <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-400">For Nonprofits</span>
              </div>
              <h2 className="text-3xl font-black uppercase tracking-tight mb-6">Increased credibility and trust</h2>
              <ul className="space-y-3">
                {[
                  'Increased credibility and public trust',
                  'Improved donation conversion rates',
                  'Professional digital presence',
                  'Reduced technical burden',
                  'Ongoing support and maintenance',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle size={16} className="text-teal mt-0.5 shrink-0" />
                    <span className="text-sm text-ink-600">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px w-12 bg-accent" />
                <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-400">For The Public</span>
              </div>
              <h2 className="text-3xl font-black uppercase tracking-tight mb-6">Instant trust signal</h2>
              <ul className="space-y-3">
                {[
                  'Instant verification of legitimacy',
                  'Easier decision-making',
                  'Clear understanding of impact',
                  'Reduced risk of fraud or confusion',
                  'Standardized digital expectations',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle size={16} className="text-accent mt-0.5 shrink-0" />
                    <span className="text-sm text-ink-600">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-ink-950 text-white">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24 text-center">
          <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tight mb-6">
            Ready to build trust?
          </h2>
          <p className="text-ink-300 max-w-lg mx-auto mb-8">
            Join the organizations that are setting the standard for nonprofit transparency and digital credibility.
          </p>
          <Link to="/public/contact" className="btn-brutal-accent text-base inline-flex items-center gap-2">
            Get Verified <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </div>
    </>
  );
}
