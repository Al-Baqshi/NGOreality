import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CATEGORIES } from '../../types';
import { Send, CheckCircle, AlertCircle } from 'lucide-react';
import SEO from '../../components/SEO';
import Turnstile from '../../components/Turnstile';
import { usePublicOrganizationBySlug } from '../../hooks/useSupabase';
import { isRegistryListed } from '../../types';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '');

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string): boolean {
  if (!phone.trim()) return true;
  return /^[\d\s+\-()]{7,}$/.test(phone);
}

export default function Contact() {
  const [searchParams] = useSearchParams();
  const orgSlug = searchParams.get('org') || undefined;
  const { organization: listedOrg } = usePublicOrganizationBySlug(orgSlug);

  const [form, setForm] = useState({
    organization_name: '',
    contact_name: '',
    email: '',
    phone: '',
    category: '',
    message: '',
  });
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!listedOrg) return;
    setOrganizationId(listedOrg.id);
    setForm((prev) => ({
      ...prev,
      organization_name: listedOrg.name,
      message:
        prev.message ||
        `We would like to claim our directory listing and begin NGOreality verification for ${listedOrg.name}.`,
    }));
  }, [listedOrg]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!form.organization_name.trim()) {
      newErrors.organization_name = 'Organization name is required';
    }
    if (!form.contact_name.trim()) {
      newErrors.contact_name = 'Contact name is required';
    }
    if (!form.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!isValidEmail(form.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    if (form.phone.trim() && !isValidPhone(form.phone)) {
      newErrors.phone = 'Please enter a valid phone number';
    }
    if (!form.message.trim()) {
      newErrors.message = 'Message is required';
    } else if (form.message.trim().length < 20) {
      newErrors.message = 'Message must be at least 20 characters';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!validateForm()) return;

    if (!turnstileToken) {
      setError('Please complete the security check.');
      return;
    }

    setSubmitting(true);

    let response: Response;
    try {
      response = await fetch(`${SUPABASE_URL}/functions/v1/submit-inquiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_name: form.organization_name,
          contact_name: form.contact_name,
          email: form.email,
          phone: form.phone,
          message: form.message,
          category: form.category,
          organization_id: organizationId,
          turnstile_token: turnstileToken,
        }),
      });
    } catch {
      setError('Could not reach us just now. Please check your connection and try again.');
      setTurnstileToken(null);
      setSubmitting(false);
      return;
    }

    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      setError(detail?.error ?? 'Something went wrong. Please try again.');
      setTurnstileToken(null);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setSubmitted(true);
  };

  const [error, setError] = useState('');

  return (
    <>
      <SEO
        title="Contact"
        description="Apply for NGOreality Reality Badge verification or get in touch with our team. Start building trust for your nonprofit today."
        path="/public/contact"
      />
      <div>
        <section className="border-b-3 border-ink-950 bg-ink-950 text-white">
          <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px w-12 bg-accent" />
                <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-300">Get in Touch</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tight mb-4">
                {listedOrg && isRegistryListed(listedOrg) ? 'Claim your listing' : 'Get verified'}
              </h1>
              <p className="text-ink-300 text-lg">
                {listedOrg && isRegistryListed(listedOrg)
                  ? 'Confirm your organization’s directory listing and start the NGOreality verification process.'
                  : 'Start the process of building trust for your nonprofit. Fill out the form below and we will be in touch.'}
              </p>
            </div>
          </div>
        </section>

        <section className="max-w-2xl mx-auto px-6 py-16 md:py-24">
          {listedOrg && isRegistryListed(listedOrg) && !submitted && (
            <div className="card-brutal p-4 mb-6 border-l-4 border-l-sky-500">
              <p className="text-sm text-ink-600 leading-relaxed">
                You are requesting verification for{' '}
                <Link to={`/public/org/${listedOrg.slug}`} className="text-teal font-semibold hover:underline">
                  {listedOrg.name}
                </Link>
                {listedOrg.charity_registration_number
                  ? ` (${listedOrg.charity_registration_number})`
                  : ''}
                .
              </p>
            </div>
          )}

          {submitted ? (
            <div className="card-brutal p-8 text-center">
              <CheckCircle size={48} className="text-teal mx-auto mb-4" />
              <h2 className="text-2xl font-black uppercase tracking-tight mb-3">Inquiry Submitted</h2>
              <p className="text-sm text-ink-500 leading-relaxed">
                Thank you for your interest in NGOreality verification. We will review your inquiry and get back to you shortly.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="card-brutal p-6 md:p-8 space-y-5">
              <div className="label-brutal">Organization Information</div>
              <div>
                <label className="label-brutal">Organization Name *</label>
                <input
                  className={`input-brutal w-full ${errors.organization_name ? 'border-accent' : ''}`}
                  value={form.organization_name}
                  onChange={(e) => {
                    setForm({ ...form, organization_name: e.target.value });
                    if (errors.organization_name) setErrors({ ...errors, organization_name: '' });
                  }}
                  required
                />
                {errors.organization_name && <p className="text-accent text-xs font-mono mt-1" role="alert">{errors.organization_name}</p>}
              </div>
              <div>
                <label className="label-brutal">Category</label>
                <select
                  className="input-brutal w-full"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  <option value="">Select category</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="border-t-3 border-ink-950 pt-5 mt-5">
                <div className="label-brutal">Contact Information</div>
              </div>
              <div>
                <label className="label-brutal">Contact Name *</label>
                <input
                  className={`input-brutal w-full ${errors.contact_name ? 'border-accent' : ''}`}
                  value={form.contact_name}
                  onChange={(e) => {
                    setForm({ ...form, contact_name: e.target.value });
                    if (errors.contact_name) setErrors({ ...errors, contact_name: '' });
                  }}
                  required
                />
                {errors.contact_name && <p className="text-accent text-xs font-mono mt-1" role="alert">{errors.contact_name}</p>}
              </div>
              <div>
                <label className="label-brutal">Email *</label>
                <input
                  className={`input-brutal w-full ${errors.email ? 'border-accent' : ''}`}
                  type="email"
                  value={form.email}
                  onChange={(e) => {
                    setForm({ ...form, email: e.target.value });
                    if (errors.email) setErrors({ ...errors, email: '' });
                  }}
                  required
                />
                {errors.email && <p className="text-accent text-xs font-mono mt-1" role="alert">{errors.email}</p>}
              </div>
              <div>
                <label className="label-brutal">Phone</label>
                <input
                  className={`input-brutal w-full ${errors.phone ? 'border-accent' : ''}`}
                  value={form.phone}
                  onChange={(e) => {
                    setForm({ ...form, phone: e.target.value });
                    if (errors.phone) setErrors({ ...errors, phone: '' });
                  }}
                />
                {errors.phone && <p className="text-accent text-xs font-mono mt-1" role="alert">{errors.phone}</p>}
              </div>

              <div className="border-t-3 border-ink-950 pt-5 mt-5">
                <div className="label-brutal">Your Message</div>
              </div>
              <div>
                <label className="label-brutal">Message</label>
                <textarea
                  className={`input-brutal w-full h-32 text-base ${errors.message ? 'border-accent' : ''}`}
                  value={form.message}
                  onChange={(e) => {
                    setForm({ ...form, message: e.target.value });
                    if (errors.message) setErrors({ ...errors, message: '' });
                  }}
                  placeholder="Tell us about your organization and why you want to get verified..."
                />
                {errors.message && <p className="text-accent text-xs font-mono mt-1" role="alert">{errors.message}</p>}
              </div>

              {error && <p className="text-accent text-sm font-mono flex items-center gap-1"><AlertCircle size={14} /> {error}</p>}

              <Turnstile
                onSuccess={setTurnstileToken}
                onExpire={() => setTurnstileToken(null)}
                onError={() => setTurnstileToken(null)}
              />

              <button
                type="submit"
                disabled={submitting || !turnstileToken}
                className="btn-brutal-accent w-full flex items-center justify-center gap-2 text-base min-h-[44px] disabled:opacity-60"
              >
                <Send size={16} /> {submitting ? 'Submitting...' : 'Submit Inquiry'}
              </button>
            </form>
          )}
        </section>
      </div>
    </>
  );
}
