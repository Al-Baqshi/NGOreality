import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CATEGORIES } from '../../types';
import { Send, CheckCircle, AlertCircle } from 'lucide-react';
import SEO from '../../components/SEO';
import Turnstile, { isTurnstileEnabled } from '../../components/Turnstile';
import { usePublicOrganizationBySlug } from '../../hooks/useSupabase';
import { captureError } from '../../lib/errorReporting';
import { isRegistryListed } from '../../types';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const FIELD_MAX = {
  organization_name: 200,
  contact_name: 120,
  email: 254,
  phone: 40,
  message: 2000,
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const PHONE_RE = /^\+?[\d\s\-().]+$/;
const FIELD_ORDER = ['organization_name', 'contact_name', 'email', 'phone', 'message'] as const;

function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

function isValidPhone(phone: string): boolean {
  const trimmed = phone.trim();
  if (!trimmed) return true;
  const digits = trimmed.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15 && PHONE_RE.test(trimmed);
}

type InquiryForm = {
  organization_name: string;
  contact_name: string;
  email: string;
  phone: string;
  category: string;
  message: string;
};

function validateInquiryForm(form: InquiryForm): Record<string, string> {
  const errors: Record<string, string> = {};
  const org = form.organization_name.trim();
  const contact = form.contact_name.trim();
  const email = form.email.trim();
  const phone = form.phone.trim();
  const message = form.message.trim();
  const category = form.category.trim();

  if (!org) {
    errors.organization_name = 'Organisation name is required';
  } else if (org.length < 2) {
    errors.organization_name = 'Organisation name must be at least 2 characters';
  }

  if (!contact) {
    errors.contact_name = 'Contact name is required';
  } else if (contact.length < 2) {
    errors.contact_name = 'Contact name must be at least 2 characters';
  }

  if (!email) {
    errors.email = 'Email is required';
  } else if (!isValidEmail(email)) {
    errors.email = 'Please enter a valid email address';
  }

  if (phone && !isValidPhone(phone)) {
    errors.phone = 'Please enter a valid phone number';
  }

  if (category && !CATEGORIES.includes(category)) {
    errors.category = 'Select a category from the list';
  }

  if (!message) {
    errors.message = 'Message is required';
  } else if (message.length < 20) {
    errors.message = 'Message must be at least 20 characters';
  }

  return errors;
}

export default function Contact() {
  const [searchParams] = useSearchParams();
  const orgSlug = searchParams.get('org') || undefined;
  const { organization: listedOrg, error: listingError } = usePublicOrganizationBySlug(orgSlug);

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
  const [error, setError] = useState('');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const newErrors = validateInquiryForm(form);
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      const first = FIELD_ORDER.find((key) => newErrors[key]) ?? 'category';
      document.getElementById(`contact-${first}`)?.focus();
      return;
    }

    if (isTurnstileEnabled() && !turnstileToken) {
      setError('Please complete the security check.');
      return;
    }

    setSubmitting(true);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (SUPABASE_ANON_KEY) {
      headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
      headers.apikey = SUPABASE_ANON_KEY;
    }

    let response: Response;
    try {
      response = await fetch(`${SUPABASE_URL}/functions/v1/submit-inquiry`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          organization_name: form.organization_name.trim(),
          contact_name: form.contact_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          message: form.message.trim(),
          category: form.category.trim(),
          organization_id: organizationId,
          turnstile_token: turnstileToken,
        }),
      });
    } catch (err) {
      setError(captureError(err, { where: 'Contact.submitInquiry' }));
      setTurnstileToken(null);
      setSubmitting(false);
      return;
    }

    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      const message =
        detail?.error ?? detail?.message ?? detail?.msg ?? 'Something went wrong. Please try again.';
      captureError(new Error(message), { where: 'Contact.submitInquiry', detail: { status: response.status } });
      setError(message);
      setTurnstileToken(null);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setSubmitted(true);
  };

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
          {listingError && (
            <p className="mb-6 text-sm text-accent border-2 border-accent px-3 py-2" role="alert">
              Could not load that directory listing. You can still send an inquiry below.
            </p>
          )}
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
            <form noValidate onSubmit={handleSubmit} className="card-brutal p-6 md:p-8 space-y-5">
              <div className="label-brutal">Organization Information</div>
              <div>
                <label htmlFor="contact-organization_name" className="label-brutal">Organisation Name *</label>
                <input
                  id="contact-organization_name"
                  name="organization_name"
                  autoComplete="organization"
                  maxLength={FIELD_MAX.organization_name}
                  aria-invalid={Boolean(errors.organization_name)}
                  aria-describedby={errors.organization_name ? 'contact-organization_name-error' : undefined}
                  className={`input-brutal w-full ${errors.organization_name ? 'border-accent' : ''}`}
                  value={form.organization_name}
                  onChange={(e) => {
                    setForm({ ...form, organization_name: e.target.value });
                    if (errors.organization_name) setErrors({ ...errors, organization_name: '' });
                  }}
                  required
                />
                {errors.organization_name && <p id="contact-organization_name-error" className="text-accent text-xs font-mono mt-1" role="alert">{errors.organization_name}</p>}
              </div>
              <div>
                <label htmlFor="contact-category" className="label-brutal">Category</label>
                <select
                  id="contact-category"
                  name="category"
                  aria-invalid={Boolean(errors.category)}
                  aria-describedby={errors.category ? 'contact-category-error' : undefined}
                  className={`input-brutal w-full ${errors.category ? 'border-accent' : ''}`}
                  value={form.category}
                  onChange={(e) => {
                    setForm({ ...form, category: e.target.value });
                    if (errors.category) setErrors({ ...errors, category: '' });
                  }}
                >
                  <option value="">Select category</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {errors.category && <p id="contact-category-error" className="text-accent text-xs font-mono mt-1" role="alert">{errors.category}</p>}
              </div>

              <div className="border-t-3 border-ink-950 pt-5 mt-5">
                <div className="label-brutal">Contact Information</div>
              </div>
              <div>
                <label htmlFor="contact-contact_name" className="label-brutal">Contact Name *</label>
                <input
                  id="contact-contact_name"
                  name="contact_name"
                  autoComplete="name"
                  maxLength={FIELD_MAX.contact_name}
                  aria-invalid={Boolean(errors.contact_name)}
                  aria-describedby={errors.contact_name ? 'contact-contact_name-error' : undefined}
                  className={`input-brutal w-full ${errors.contact_name ? 'border-accent' : ''}`}
                  value={form.contact_name}
                  onChange={(e) => {
                    setForm({ ...form, contact_name: e.target.value });
                    if (errors.contact_name) setErrors({ ...errors, contact_name: '' });
                  }}
                  required
                />
                {errors.contact_name && <p id="contact-contact_name-error" className="text-accent text-xs font-mono mt-1" role="alert">{errors.contact_name}</p>}
              </div>
              <div>
                <label htmlFor="contact-email" className="label-brutal">Email *</label>
                <input
                  id="contact-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  maxLength={FIELD_MAX.email}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'contact-email-error' : undefined}
                  className={`input-brutal w-full ${errors.email ? 'border-accent' : ''}`}
                  value={form.email}
                  onChange={(e) => {
                    setForm({ ...form, email: e.target.value });
                    if (errors.email) setErrors({ ...errors, email: '' });
                  }}
                  required
                />
                {errors.email && <p id="contact-email-error" className="text-accent text-xs font-mono mt-1" role="alert">{errors.email}</p>}
              </div>
              <div>
                <label htmlFor="contact-phone" className="label-brutal">Phone</label>
                <input
                  id="contact-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  maxLength={FIELD_MAX.phone}
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={errors.phone ? 'contact-phone-error' : undefined}
                  className={`input-brutal w-full ${errors.phone ? 'border-accent' : ''}`}
                  value={form.phone}
                  onChange={(e) => {
                    setForm({ ...form, phone: e.target.value });
                    if (errors.phone) setErrors({ ...errors, phone: '' });
                  }}
                />
                {errors.phone && <p id="contact-phone-error" className="text-accent text-xs font-mono mt-1" role="alert">{errors.phone}</p>}
              </div>

              <div className="border-t-3 border-ink-950 pt-5 mt-5">
                <div className="label-brutal">Your Message</div>
              </div>
              <div>
                <label htmlFor="contact-message" className="label-brutal">Message *</label>
                <textarea
                  id="contact-message"
                  name="message"
                  maxLength={FIELD_MAX.message}
                  aria-invalid={Boolean(errors.message)}
                  aria-describedby={errors.message ? 'contact-message-error' : undefined}
                  className={`input-brutal w-full h-32 text-base ${errors.message ? 'border-accent' : ''}`}
                  value={form.message}
                  onChange={(e) => {
                    setForm({ ...form, message: e.target.value });
                    if (errors.message) setErrors({ ...errors, message: '' });
                  }}
                  placeholder="Tell us about your organisation and why you want to get verified..."
                  required
                />
                {errors.message && <p id="contact-message-error" className="text-accent text-xs font-mono mt-1" role="alert">{errors.message}</p>}
              </div>

              {error && <p className="text-accent text-sm font-mono flex items-center gap-1"><AlertCircle size={14} /> {error}</p>}

              <Turnstile
                onSuccess={(token) => {
                  setTurnstileToken(token);
                  setError('');
                }}
                onExpire={() => setTurnstileToken(null)}
                onError={() => {
                  setTurnstileToken(null);
                  setError('Security check failed to load. Please refresh and try again.');
                }}
              />

              <button
                type="submit"
                disabled={submitting || (isTurnstileEnabled() && !turnstileToken)}
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
