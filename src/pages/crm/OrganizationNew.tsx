import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { findRegistryDuplicate } from '../../hooks/useCrm';
import { SectionHeader, FormField } from '../../components/ui';
import { CATEGORIES, DEFAULT_CRITERIA } from '../../types';
import type { OrgStatus } from '../../types';
import { ArrowLeft, Save, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function OrganizationNew() {
  const navigate = useNavigate();
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    mission_statement: '',
    category: '',
    location: '',
    website_url: '',
    email: '',
    phone: '',
    status: 'onboarding' as OrgStatus,
    verification_level: 'none' as const,
    onboarding_stage: 'intake',
    source_registry: '',
    external_id: '',
    charity_registration_number: '',
  });

  const generateSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const checkDuplicate = async () => {
    if (!form.source_registry.trim() || !form.external_id.trim()) {
      setDuplicate(null);
      return;
    }
    const existing = await findRegistryDuplicate(form.source_registry, form.external_id);
    if (existing) {
      setDuplicate({ id: existing.id, name: existing.name });
    } else {
      setDuplicate(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (form.source_registry.trim() && form.external_id.trim()) {
      const existing = await findRegistryDuplicate(form.source_registry, form.external_id);
      if (existing) {
        setDuplicate({ id: existing.id, name: existing.name });
        setError('This registry record already exists in the CRM.');
        return;
      }
    }

    const slug = form.slug || generateSlug(form.name);
    const payload = {
      name: form.name,
      slug,
      description: form.description,
      mission_statement: form.mission_statement,
      category: form.category,
      location: form.location,
      website_url: form.website_url,
      email: form.email,
      phone: form.phone,
      status: form.status,
      verification_level: form.verification_level,
      onboarding_stage: form.onboarding_stage,
      source_registry: form.source_registry.trim(),
      external_id: form.external_id.trim(),
      charity_registration_number: form.charity_registration_number.trim(),
    };

    const { data, error: insertError } = await supabase.from('organizations').insert(payload).select().maybeSingle();

    if (insertError) {
      setError(insertError.message);
      return;
    }

    if (data) {
      const criteriaRows = DEFAULT_CRITERIA.map((c) => ({
        organization_id: data.id,
        ...c,
      }));
      await supabase.from('verification_criteria').insert(criteriaRows);
      await supabase.from('activity_log').insert({
        organization_id: data.id,
        action: 'created',
        description: 'Organization created manually',
        performed_by: 'staff',
      });
      navigate(`/organizations/${data.id}`);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => navigate('/organizations')}
        className="inline-flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-ink-500 hover:text-ink-950 transition-colors mb-6"
      >
        <ArrowLeft size={14} /> Back to Organizations
      </button>

      <SectionHeader>New Organization</SectionHeader>
      <p className="font-mono text-2xs text-ink-500 -mt-4 mb-6 uppercase tracking-wider">
        Prefer registry import for NZ charities. Only add manually if not in the register.
      </p>

      {duplicate && (
        <div className="mb-4 flex gap-3 border-3 border-amber-500 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm">
          <AlertTriangle size={18} className="shrink-0 text-amber-600" />
          <p>
            Already in CRM: <strong>{duplicate.name}</strong>.{' '}
            <Link to={`/organizations/${duplicate.id}`} className="text-accent underline">
              Open existing record
            </Link>
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 border-3 border-accent bg-accent-light px-4 py-3 text-sm text-accent">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="card-brutal p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-b border-ink-100 pb-4">
          <FormField label="Registry source (optional)">
            <input
              className="input-brutal w-full text-base"
              placeholder="nz_charities_register"
              value={form.source_registry}
              onChange={(e) => setForm({ ...form, source_registry: e.target.value })}
              onBlur={checkDuplicate}
            />
          </FormField>
          <FormField label="External ID (optional)">
            <input
              className="input-brutal w-full text-base font-mono"
              value={form.external_id}
              onChange={(e) => setForm({ ...form, external_id: e.target.value })}
              onBlur={checkDuplicate}
            />
          </FormField>
          <FormField label="Charity registration #">
            <input
              className="input-brutal w-full text-base font-mono"
              value={form.charity_registration_number}
              onChange={(e) => setForm({ ...form, charity_registration_number: e.target.value })}
              onBlur={checkDuplicate}
            />
          </FormField>
        </div>

        <FormField label="Organization Name *">
          <input
            className="input-brutal w-full text-base"
            value={form.name}
            onChange={(e) => {
              const name = e.target.value;
              setForm({ ...form, name, slug: generateSlug(name) });
            }}
            required
          />
        </FormField>
        <FormField label="URL Slug">
          <input className="input-brutal w-full font-mono text-base" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
        </FormField>
        <FormField label="Category">
          <select className="input-brutal w-full text-base" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="">Select category</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Location">
          <input className="input-brutal w-full text-base" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        </FormField>
        <FormField label="Website URL">
          <input className="input-brutal w-full text-base" value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} />
        </FormField>
        <FormField label="Email">
          <input className="input-brutal w-full text-base" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </FormField>
        <FormField label="Phone">
          <input className="input-brutal w-full text-base" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </FormField>
        <FormField label="Description">
          <textarea className="input-brutal w-full h-24 text-base" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </FormField>
        <FormField label="Mission Statement">
          <textarea className="input-brutal w-full h-24 text-base" value={form.mission_statement} onChange={(e) => setForm({ ...form, mission_statement: e.target.value })} />
        </FormField>
        <button type="submit" className="btn-brutal-accent w-full flex items-center justify-center gap-2 min-h-[48px]">
          <Save size={16} /> Create Organization
        </button>
      </form>
    </div>
  );
}
