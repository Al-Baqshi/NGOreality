import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Palette } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  getProfileCompletionItems,
  profileCompletionPercent,
} from '../../lib/ngoProfileCompletion';
import type { Organization } from '../../types';

type NgoProfilePanelProps = {
  organization: Organization;
  onUpdated: () => void;
};

export default function NgoProfilePanel({ organization, onUpdated }: NgoProfilePanelProps) {
  const completionItems = useMemo(() => getProfileCompletionItems(organization), [organization]);
  const completionPct = profileCompletionPercent(completionItems);

  const [profileForm, setProfileForm] = useState({
    mission_statement: organization.mission_statement ?? '',
    description: organization.description ?? '',
    website_url: organization.website_url ?? '',
    logo_url: organization.logo_url ?? '',
    phone: organization.phone ?? '',
    email: organization.email ?? '',
    brand_primary: organization.brand_primary ?? '',
    brand_secondary: organization.brand_secondary ?? '',
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');

  useEffect(() => {
    setProfileForm({
      mission_statement: organization.mission_statement ?? '',
      description: organization.description ?? '',
      website_url: organization.website_url ?? '',
      logo_url: organization.logo_url ?? '',
      phone: organization.phone ?? '',
      email: organization.email ?? '',
      brand_primary: organization.brand_primary ?? '',
      brand_secondary: organization.brand_secondary ?? '',
    });
  }, [organization.id, organization.updated_at]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMessage('');
    const { error } = await supabase
      .from('organizations')
      .update({
        mission_statement: profileForm.mission_statement.trim(),
        description: profileForm.description.trim(),
        website_url: profileForm.website_url.trim(),
        logo_url: profileForm.logo_url.trim(),
        phone: profileForm.phone.trim(),
        email: profileForm.email.trim(),
        brand_primary: profileForm.brand_primary.trim(),
        brand_secondary: profileForm.brand_secondary.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', organization.id);

    setProfileSaving(false);
    if (error) {
      setProfileMessage(error.message);
      return;
    }
    setProfileMessage('Profile saved.');
    onUpdated();
  };

  return (
    <div className="card-brutal p-5 sm:p-6 space-y-6">
      <p className="text-xs text-ink-500 leading-relaxed">
        Complete your public trust profile. Need a landing page or package? Use{' '}
        <Link to="/ngo/setup-request" className="font-semibold underline text-ink-950 dark:text-foreground">
          Setup request
        </Link>
        .
      </p>

      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="label-brutal text-ink-400">Completion</span>
          <span className="font-mono text-2xs uppercase">{completionPct}%</span>
        </div>
        <div className="h-2 border-2 border-ink-950 dark:border-border bg-ink-100 dark:bg-muted">
          <div
            className="h-full bg-teal transition-all"
            style={{ width: `${completionPct}%` }}
            role="progressbar"
            aria-valuenow={completionPct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
          {completionItems.map((item) => (
            <li key={item.key} className="flex items-center gap-2">
              {item.complete ? (
                <CheckCircle size={14} className="text-teal shrink-0" aria-hidden />
              ) : (
                <span className="w-3.5 h-3.5 border border-ink-300 shrink-0" aria-hidden />
              )}
              <span className={item.complete ? 'text-ink-600' : 'text-ink-950 font-medium'}>{item.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <form onSubmit={saveProfile} className="space-y-4">
        <div>
          <label className="label-brutal" htmlFor="ngo-mission">Mission</label>
          <textarea
            id="ngo-mission"
            className="input-brutal w-full min-h-[88px] text-base"
            value={profileForm.mission_statement}
            onChange={(e) => setProfileForm((f) => ({ ...f, mission_statement: e.target.value }))}
            placeholder="What your organisation does and who you serve"
          />
        </div>
        <div>
          <label className="label-brutal" htmlFor="ngo-description">Short description</label>
          <textarea
            id="ngo-description"
            className="input-brutal w-full min-h-[72px] text-base"
            value={profileForm.description}
            onChange={(e) => setProfileForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label-brutal" htmlFor="ngo-email">Contact email</label>
            <input
              id="ngo-email"
              type="email"
              className="input-brutal w-full text-base"
              value={profileForm.email}
              onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div>
            <label className="label-brutal" htmlFor="ngo-phone">Phone</label>
            <input
              id="ngo-phone"
              type="tel"
              className="input-brutal w-full text-base"
              value={profileForm.phone}
              onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
        </div>
        <div>
          <label className="label-brutal" htmlFor="ngo-website">Website URL</label>
          <input
            id="ngo-website"
            type="url"
            className="input-brutal w-full text-base"
            value={profileForm.website_url}
            onChange={(e) => setProfileForm((f) => ({ ...f, website_url: e.target.value }))}
            placeholder="https://"
          />
        </div>
        <div>
          <label className="label-brutal" htmlFor="ngo-logo">Logo URL</label>
          <input
            id="ngo-logo"
            type="url"
            className="input-brutal w-full text-base"
            value={profileForm.logo_url}
            onChange={(e) => setProfileForm((f) => ({ ...f, logo_url: e.target.value }))}
            placeholder="Link to your logo image (PNG or SVG)"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label-brutal flex items-center gap-1" htmlFor="ngo-brand-primary">
              <Palette size={12} aria-hidden /> Brand colour (optional)
            </label>
            <input
              id="ngo-brand-primary"
              type="text"
              className="input-brutal w-full text-base"
              value={profileForm.brand_primary}
              onChange={(e) => setProfileForm((f) => ({ ...f, brand_primary: e.target.value }))}
              placeholder="#0d9488 or teal"
            />
          </div>
          <div>
            <label className="label-brutal" htmlFor="ngo-brand-secondary">Secondary colour (optional)</label>
            <input
              id="ngo-brand-secondary"
              type="text"
              className="input-brutal w-full text-base"
              value={profileForm.brand_secondary}
              onChange={(e) => setProfileForm((f) => ({ ...f, brand_secondary: e.target.value }))}
            />
          </div>
        </div>

        {profileMessage && (
          <p className="text-xs font-mono text-teal" role="status">{profileMessage}</p>
        )}

        <button
          type="submit"
          disabled={profileSaving}
          className="btn-brutal w-full sm:w-auto min-h-[48px] px-8 disabled:opacity-60"
        >
          {profileSaving ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </div>
  );
}
