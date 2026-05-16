import { Link } from 'react-router-dom';
import {
  Hammer, Shield, Eye, ArrowRight, GitBranch, Lock, Users, Server,
  FileCode, Key, ShieldCheck, Monitor, Archive, Bell
} from 'lucide-react';
import SEO, { BreadcrumbJsonLd } from '../../components/SEO';

const steps = [
  {
    number: '01',
    icon: <Hammer size={32} />,
    title: 'Build',
    description: 'We establish a minimum viable digital presence for your organization — a functional website, clear mission statement, accessible contact methods, and essential legal pages.',
    details: [
      'Functional, responsive website',
      'Clear mission and purpose statement',
      'Accessible contact method',
      'Basic legal pages (privacy, terms)',
      'Clear explanation of donation usage',
    ],
  },
  {
    number: '02',
    icon: <Shield size={32} />,
    title: 'Verify',
    description: 'We evaluate your infrastructure against the NGOreality Digital Independence Standards (REAL-STD). Organizations that meet the standard receive the NGOreality Verification Badge.',
    details: [
      'Website functionality and uptime',
      'Clarity of mission and communication',
      'Accessibility and responsiveness',
      'Basic transparency indicators',
      'Alignment with public expectations',
    ],
  },
  {
    number: '03',
    icon: <Eye size={32} />,
    title: 'Trust',
    description: 'Verified organizations receive a public trust signal — the NGOreality Verification Badge, a unique Verification ID, and a public profile that allows anyone to instantly confirm credibility.',
    details: [
      'NGOreality Verification Badge for your website',
      'Unique verification ID',
      'Public verification page',
      'Listed in verified directory',
      'Ongoing compliance monitoring',
    ],
  },
];

const digitalStandards = [
  {
    icon: <GitBranch size={20} />,
    title: 'Independent Code Repository',
    slug: 'independent-repo',
    standard: 'REAL-STD-001',
    description: 'Your organization should own and control its source code. An independent repository ensures no single vendor can hold your digital infrastructure hostage.',
    requirements: [
      'Maintain a version-controlled repository (e.g., GitHub, GitLab) for all website and application code',
      'The repository must be owned by an organizational account, not an individual personal account',
      'At least two authorized maintainers must have admin access',
      'Repository must include a README with setup instructions',
      'All deployments must be traceable to a commit in the repository',
    ],
  },
  {
    icon: <Users size={20} />,
    title: 'Access Management',
    slug: 'access-management',
    standard: 'REAL-STD-002',
    description: 'Proper access control ensures continuity. If a team member leaves, your organization does not lose access to its own infrastructure.',
    requirements: [
      'Use a shared organizational account for all platform registrations (hosting, domains, email services)',
      'Never register critical services under a single personal email',
      'Maintain a documented list of all digital services and who has access',
      'Grant access on a need-to-know basis with the minimum required permissions',
      'Remove access within 48 hours when a team member departs',
    ],
  },
  {
    icon: <Lock size={20} />,
    title: 'Password & Credential Management',
    slug: 'credential-management',
    standard: 'REAL-STD-003',
    description: 'Weak or shared passwords are the most common point of failure. A credential management standard protects your organization from unauthorized access.',
    requirements: [
      'Use a shared password manager (e.g., Bitwarden, 1Password) for all organizational credentials',
      'Never store passwords in spreadsheets, documents, or personal browsers',
      'All accounts must use passwords of 16+ characters or passkeys',
      'Enable multi-factor authentication (MFA) on every service that supports it',
      'Master credentials (domain registrar, hosting, email) must have MFA and backup recovery codes stored securely',
    ],
  },
  {
    icon: <Key size={20} />,
    title: 'Domain & DNS Ownership',
    slug: 'domain-ownership',
    standard: 'REAL-STD-004',
    description: 'Your domain is your identity online. Losing control of it means losing your website, email, and public trust.',
    requirements: [
      'The domain must be registered under the organization name, not an individual',
      'DNS records must be managed through the organizational account',
      'Domain auto-renewal must be enabled',
      'Registrar access must be available to at least two authorized administrators',
      'DNS changes must be documented and logged',
    ],
  },
  {
    icon: <Server size={20} />,
    title: 'Hosting & Infrastructure Independence',
    slug: 'hosting-independence',
    standard: 'REAL-STD-005',
    description: 'Your hosting should be portable. If a provider fails or raises prices, you should be able to migrate without rebuilding.',
    requirements: [
      'Use standard, portable technologies (static sites, containerized apps, or widely-supported CMS)',
      'Avoid proprietary platforms that lock in your content or data',
      'Maintain backups in a separate location from your primary hosting',
      'Document the deployment process so any competent developer can redeploy',
      'Ensure you can export all content and data at any time',
    ],
  },
  {
    icon: <ShieldCheck size={20} />,
    title: 'Security Baseline',
    slug: 'security-baseline',
    standard: 'REAL-STD-006',
    description: 'A minimum security standard protects your organization and your visitors from common threats.',
    requirements: [
      'SSL/TLS certificate must be active on all pages (HTTPS enforced)',
      'Security headers must be configured (CSP, X-Frame-Options, HSTS)',
      'Software and dependencies must be updated within 30 days of a security patch',
      'Admin panels and login pages must not be publicly linked or discoverable',
      'Automated vulnerability scanning must be enabled for production deployments',
    ],
  },
  {
    icon: <Monitor size={20} />,
    title: 'Uptime & Monitoring',
    slug: 'uptime-monitoring',
    standard: 'REAL-STD-007',
    description: 'A website that is frequently down erodes trust. Monitoring ensures you know about problems before your visitors do.',
    requirements: [
      'Uptime monitoring must be enabled (e.g., UptimeRobot, Pingdom, or equivalent)',
      'Alerts must be sent to at least two team members via separate channels (email + SMS)',
      'Target uptime of 99.5% or higher',
      'Incident response plan must be documented',
      'Monthly uptime reports must be available for verification review',
    ],
  },
  {
    icon: <Archive size={20} />,
    title: 'Backup & Recovery',
    slug: 'backup-recovery',
    standard: 'REAL-STD-008',
    description: 'Data loss can be catastrophic. A backup standard ensures your organization can recover from hardware failure, human error, or attack.',
    requirements: [
      'Automated daily backups of all databases and content',
      'Backups must be stored in a separate geographic location from the primary server',
      'Backup restoration must be tested at least quarterly',
      'Retention policy: at least 30 days of daily backups and 12 months of monthly backups',
      'Backup encryption must be enabled for any data containing personal information',
    ],
  },
  {
    icon: <Bell size={20} />,
    title: 'Communication Continuity',
    slug: 'communication-continuity',
    standard: 'REAL-STD-009',
    description: 'If your primary communication channel fails, your organization must still be reachable. Continuity planning prevents silence during crises.',
    requirements: [
      'Maintain at least two public contact methods (e.g., form + email, or email + phone)',
      'Organizational email must use the custom domain (not @gmail or @outlook)',
      'Email service must have a backup or failover configured',
      'Auto-responders must acknowledge receipt of inquiries within 24 hours',
      'A named individual must be responsible for monitoring incoming communications',
    ],
  },
  {
    icon: <FileCode size={20} />,
    title: 'Documentation Standard',
    slug: 'documentation-standard',
    standard: 'REAL-STD-010',
    description: 'If the only person who understands your infrastructure leaves, the organization should not grind to a halt. Documentation is institutional memory.',
    requirements: [
      'Maintain a living document describing all digital services, accounts, and credentials',
      'Document the deployment and recovery process for your website',
      'Include contact information for all third-party service providers',
      'Store documentation in a location accessible to at least two authorized people',
      'Review and update documentation at least quarterly',
    ],
  },
];

export default function HowItWorks() {
  return (
    <>
      <SEO
        title="How It Works"
        description="Learn the NGOreality process: Build, Verify, Trust. Plus 10 Digital Independence Standards (REAL-STD) every nonprofit should meet for resilient digital infrastructure."
        path="/public/how-it-works"
      />
      <BreadcrumbJsonLd items={[{ name: 'Home', path: '/public' }, { name: 'How It Works', path: '/public/how-it-works' }]} />
    <div>
      {/* Hero */}
      <section className="border-b-3 border-ink-950 bg-ink-950 text-white">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px w-12 bg-teal" />
              <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-300">Process</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tight">
              Build. Verify. Trust.
            </h1>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section>
        {steps.map((step, i) => (
          <div key={step.number} className={`border-b-3 border-ink-950 ${i % 2 === 1 ? 'bg-surface-overlay' : ''}`}>
            <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
                <div>
                  <div className="flex items-center gap-4 mb-6">
                    <span className="text-6xl font-black text-ink-100">{step.number}</span>
                    <div className="text-accent">{step.icon}</div>
                  </div>
                  <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight mb-4">
                    {step.title}
                  </h2>
                  <p className="text-ink-600 leading-relaxed max-w-lg">
                    {step.description}
                  </p>
                </div>
                <div className="card-brutal p-6">
                  <div className="label-brutal mb-4">What this includes</div>
                  <ul className="space-y-3">
                    {step.details.map((detail) => (
                      <li key={detail} className="flex items-start gap-3">
                        <div className="h-1.5 w-1.5 rounded-full bg-accent mt-2 shrink-0" />
                        <span className="text-sm text-ink-700">{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Digital Independence Standards */}
      <section className="border-b-3 border-ink-950 bg-ink-950 text-white">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px w-12 bg-accent" />
              <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-300">Standards</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tight mb-4">
              Digital Independence Standards
            </h2>
            <p className="text-ink-300 text-lg leading-relaxed">
              Verification is not just about having a website. It is about owning and controlling your digital infrastructure. These standards ensure your organization is resilient, portable, and independent from any single vendor or individual.
            </p>
          </div>
        </div>
      </section>

      {/* Standards List */}
      <section>
        {digitalStandards.map((std, i) => (
          <div key={std.slug} className={`border-b-3 border-ink-950 ${i % 2 === 1 ? 'bg-surface-overlay' : ''}`}>
            <div className="max-w-7xl mx-auto px-6 py-12 md:py-16">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                <div>
                  <div className="flex items-start gap-4 mb-4">
                    <div className="flex h-10 w-10 items-center justify-center border-3 border-ink-950 bg-ink-50 text-ink-600 shrink-0">
                      {std.icon}
                    </div>
                    <div>
                      <div className="font-mono text-2xs uppercase tracking-wider text-ink-400 mb-1">{std.standard}</div>
                      <h3 className="text-xl font-black uppercase tracking-tight">{std.title}</h3>
                    </div>
                  </div>
                  <p className="text-sm text-ink-600 leading-relaxed max-w-lg">
                    {std.description}
                  </p>
                </div>
                <div className="card-brutal p-5">
                  <div className="label-brutal mb-3">Requirements</div>
                  <ol className="space-y-2.5">
                    {std.requirements.map((req, j) => (
                      <li key={j} className="flex items-start gap-3">
                        <span className="font-mono text-2xs text-ink-300 mt-0.5 shrink-0">{String(j + 1).padStart(2, '0')}</span>
                        <span className="text-sm text-ink-700 leading-relaxed">{req}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* CTA */}
      <section className="bg-ink-950 text-white">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24 text-center">
          <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight mb-6">
            Start the process
          </h2>
          <p className="text-ink-300 max-w-lg mx-auto mb-8">
            Get your organization verified and join the growing list of trusted nonprofits.
          </p>
          <Link to="/public/contact" className="btn-brutal-accent text-base inline-flex items-center gap-2">
            Get Started <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </div>
    </>
  );
}
