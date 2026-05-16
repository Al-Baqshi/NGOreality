import { Link } from 'react-router-dom';
import { ArrowRight, Target, Eye, Lightbulb } from 'lucide-react';
import SEO, { OrganizationJsonLd, BreadcrumbJsonLd } from '../../components/SEO';

export default function About() {
  return (
    <>
      <SEO
        title="About"
        description="NGOreality is a digital trust infrastructure for nonprofits, established in New Zealand. We build the missing layer between intention and trust."
        path="/public/about"
      />
      <OrganizationJsonLd />
      <BreadcrumbJsonLd items={[{ name: 'Home', path: '/public' }, { name: 'About', path: '/public/about' }]} />
    <div>
      {/* Hero */}
      <section className="border-b-3 border-ink-950 bg-ink-950 text-white">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px w-12 bg-accent" />
              <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-300">About</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tight mb-4">
              Why NGOreality exists
            </h1>
            <p className="text-ink-300 text-lg">
              We are building the missing layer between intention and trust.
            </p>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="border-b-3 border-ink-950">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="card-brutal p-6">
              <div className="text-accent mb-4"><Target size={28} /></div>
              <h3 className="text-lg font-black uppercase tracking-tight mb-3">Mission</h3>
              <p className="text-sm text-ink-600 leading-relaxed">
                To establish trust, transparency, and accessibility standards for nonprofit organizations through independent digital verification and infrastructure.
              </p>
            </div>
            <div className="card-brutal p-6">
              <div className="text-teal mb-4"><Eye size={28} /></div>
              <h3 className="text-lg font-black uppercase tracking-tight mb-3">Vision</h3>
              <p className="text-sm text-ink-600 leading-relaxed">
                A global system where every nonprofit is digitally accessible, transparent, and trusted by default.
              </p>
            </div>
            <div className="card-brutal p-6">
              <div className="text-ink-400 mb-4"><Lightbulb size={28} /></div>
              <h3 className="text-lg font-black uppercase tracking-tight mb-3">Purpose</h3>
              <p className="text-sm text-ink-600 leading-relaxed">
                To solve the fundamental problem in the nonprofit ecosystem: the lack of consistent, reliable, and user-friendly digital presence and public trust signals.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What we are / are not */}
      <section className="border-b-3 border-ink-950 bg-surface-overlay">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div>
              <h2 className="text-3xl font-black uppercase tracking-tight mb-6">NGOreality is</h2>
              <ul className="space-y-4">
                {[
                  { label: 'An independent verification body', desc: 'We assess organizations against defined standards without bias.' },
                  { label: 'A digital infrastructure provider', desc: 'We build the technical foundation nonprofits need to be trusted online.' },
                  { label: 'A public trust enabler', desc: 'We create the signals that allow the public to engage with confidence.' },
                ].map((item) => (
                  <li key={item.label} className="border-l-3 border-teal pl-4">
                    <div className="text-sm font-bold mb-1">{item.label}</div>
                    <p className="text-xs text-ink-500 leading-relaxed">{item.desc}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-3xl font-black uppercase tracking-tight mb-6">NGOreality is not</h2>
              <ul className="space-y-4">
                {[
                  { label: 'A government regulator', desc: 'We do not have legal or regulatory authority over organizations.' },
                  { label: 'A legal authority', desc: 'Our verification does not replace legal compliance or regulatory oversight.' },
                  { label: 'A replacement for compliance', desc: 'We complement existing frameworks by improving usability and accessibility.' },
                ].map((item) => (
                  <li key={item.label} className="border-l-3 border-ink-200 pl-4">
                    <div className="text-sm font-bold mb-1 text-ink-500">{item.label}</div>
                    <p className="text-xs text-ink-400 leading-relaxed">{item.desc}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Long-term vision */}
      <section className="border-b-3 border-ink-950">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
          <div className="max-w-2xl mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px w-12 bg-accent" />
              <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-400">Long-term</span>
            </div>
            <h2 className="text-3xl font-black uppercase tracking-tight">
              Where we are heading
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { title: 'Registry Integration', desc: 'Connecting with public nonprofit registries for real-time validation.' },
              { title: 'Cross-Country Scaling', desc: 'Expanding verification standards across borders and jurisdictions.' },
              { title: 'API Verification', desc: 'Programmatic verification systems for platforms and partners.' },
              { title: 'Real-Time Metrics', desc: 'Live transparency dashboards and accountability infrastructure.' },
            ].map((item) => (
              <div key={item.title} className="border-l-3 border-ink-950 pl-4 py-2">
                <h3 className="text-sm font-bold mb-1">{item.title}</h3>
                <p className="text-xs text-ink-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-ink-950 text-white">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24 text-center">
          <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight mb-6">
            Join the standard
          </h2>
          <p className="text-ink-300 max-w-lg mx-auto mb-8">
            NGOreality is building the infrastructure for nonprofit trust. Be part of it.
          </p>
          <Link to="/public/contact" className="btn-brutal-accent text-base inline-flex items-center gap-2">
            Get in Touch <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </div>
    </>
  );
}
