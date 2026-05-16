import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { SectionHeader, FormField } from '../../components/ui';
import { CATEGORIES, DEFAULT_CRITERIA } from '../../types';
import type { OrgStatus } from '../../types';
import { ArrowLeft, Save } from 'lucide-react';

export default function OrganizationNew() {
  const navigate = useNavigate();
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
  });

  const generateSlug = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const slug = form.slug || generateSlug(form.name);
    const { data, error } = await supabase
      .from('organizations')
      .insert({ ...form, slug })
      .select()
      .maybeSingle();

    if (!error && data) {
      // Initialize default criteria
      const criteriaRows = DEFAULT_CRITERIA.map((c) => ({
        organization_id: data.id,
        ...c,
      }));
      await supabase.from('verification_criteria').insert(criteriaRows);

      // Log activity
      await supabase.from('activity_log').insert({
        organization_id: data.id,
        action: 'created',
        description: 'Organization created',
        performed_by: 'admin',
      });

      navigate(`/organizations/${data.id}`);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={() => navigate('/organizations')} className="inline-flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-ink-500 hover:text-ink-950 transition-colors mb-6">
        <ArrowLeft size={14} /> Back to Organizations
      </button>

      <SectionHeader>New Organization</SectionHeader>

      <form onSubmit={handleSubmit} className="card-brutal p-6 space-y-4">
        <FormField label="Organization Name *">
          <input
            className="input-brutal w-full"
            value={form.name}
            onChange={(e) => {
              const name = e.target.value;
              setForm({ ...form, name, slug: generateSlug(name) });
            }}
            required
          />
        </FormField>
        <FormField label="URL Slug">
          <input className="input-brutal w-full font-mono" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
        </FormField>
        <FormField label="Category">
          <select className="input-brutal w-full" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="">Select category</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </FormField>
        <FormField label="Location">
          <input className="input-brutal w-full" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        </FormField>
        <FormField label="Website URL">
          <input className="input-brutal w-full" value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} />
        </FormField>
        <FormField label="Email">
          <input className="input-brutal w-full" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </FormField>
        <FormField label="Phone">
          <input className="input-brutal w-full" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </FormField>
        <FormField label="Description">
          <textarea className="input-brutal w-full h-24" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </FormField>
        <FormField label="Mission Statement">
          <textarea className="input-brutal w-full h-24" value={form.mission_statement} onChange={(e) => setForm({ ...form, mission_statement: e.target.value })} />
        </FormField>
        <button type="submit" className="btn-brutal-accent w-full flex items-center justify-center gap-2">
          <Save size={16} /> Create Organization
        </button>
      </form>
    </div>
  );
}
