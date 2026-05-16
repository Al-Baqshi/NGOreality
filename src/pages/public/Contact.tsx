import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { CATEGORIES } from '../../types';
import { Send, CheckCircle } from 'lucide-react';
import SEO from '../../components/SEO';

export default function Contact() {
  const [form, setForm] = useState({
    organization_name: '',
    contact_name: '',
    email: '',
    phone: '',
    category: '',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const { error: insertError } = await supabase
      .from('inquiry_submissions')
      .insert(form);

    if (insertError) {
      setError('Something went wrong. Please try again.');
      return;
    }

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
      {/* Hero */}
      <section className="border-b-3 border-ink-950 bg-ink-950 text-white">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px w-12 bg-accent" />
              <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-300">Get in Touch</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tight mb-4">
              Get verified
            </h1>
            <p className="text-ink-300 text-lg">
              Start the process of building trust for your nonprofit. Fill out the form below and we will be in touch.
            </p>
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="max-w-2xl mx-auto px-6 py-16 md:py-24">
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
                className="input-brutal w-full"
                value={form.organization_name}
                onChange={(e) => setForm({ ...form, organization_name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label-brutal">Category</label>
              <select
                className="input-brutal w-full"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="">Select category</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="border-t-3 border-ink-950 pt-5 mt-5">
              <div className="label-brutal">Contact Information</div>
            </div>
            <div>
              <label className="label-brutal">Contact Name *</label>
              <input
                className="input-brutal w-full"
                value={form.contact_name}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label-brutal">Email *</label>
              <input
                className="input-brutal w-full"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label-brutal">Phone</label>
              <input
                className="input-brutal w-full"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>

            <div className="border-t-3 border-ink-950 pt-5 mt-5">
              <div className="label-brutal">Your Message</div>
            </div>
            <div>
              <label className="label-brutal">Message</label>
              <textarea
                className="input-brutal w-full h-32"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Tell us about your organization and why you want to get verified..."
              />
            </div>

            {error && (
              <p className="text-accent text-sm font-mono">{error}</p>
            )}

            <button type="submit" className="btn-brutal-accent w-full flex items-center justify-center gap-2 text-base">
              <Send size={16} /> Submit Inquiry
            </button>
          </form>
        )}
      </section>
    </div>
    </>
  );
}
