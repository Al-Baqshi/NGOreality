import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Globe, Phone, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  getProfileCompletionItems,
  profileCompletionPercent,
} from '../../lib/ngoProfileCompletion';
import type { Organization } from '../../types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const COUNTRIES = [
  { code: 'NZ', name: 'New Zealand', dialCode: '+64', flag: '🇳🇿' },
  { code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺' },
  { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧' },
  { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦' },
  { code: 'IE', name: 'Ireland', dialCode: '+353', flag: '🇮🇪' },
  { code: 'SG', name: 'Singapore', dialCode: '+65', flag: '🇸🇬' },
  { code: 'HK', name: 'Hong Kong', dialCode: '+852', flag: '🇭🇰' },
  { code: 'DE', name: 'Germany', dialCode: '+49', flag: '🇩🇪' },
  { code: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷' },
  { code: 'JP', name: 'Japan', dialCode: '+81', flag: '🇯🇵' },
  { code: 'CN', name: 'China', dialCode: '+86', flag: '🇨🇳' },
  { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳' },
  { code: 'ZA', name: 'South Africa', dialCode: '+27', flag: '🇿🇦' },
  { code: 'BR', name: 'Brazil', dialCode: '+55', flag: '🇧🇷' },
  { code: 'OTHER', name: 'Other', dialCode: '', flag: '🌐' },
];

function isValidDomain(url: string): boolean {
  if (!url.trim()) return true;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const hostname = parsed.hostname;
    if (!hostname.includes('.')) return false;
    const tld = hostname.split('.').pop() || '';
    return tld.length >= 2 && /^[a-zA-Z0-9-]+$/.test(tld);
  } catch {
    return false;
  }
}

function isValidEmail(email: string): boolean {
  if (!email.trim()) return true; // Email is optional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string, countryCode: string): boolean {
  if (!phone.trim()) return true; // Phone is optional
  // Basic validation: digits, spaces, dashes, parentheses
  const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
  // Must have at least 6 digits after country code
  return /^\d{6,}$/.test(cleanPhone);
}

function extractPhoneParts(phone: string): { countryCode: string; number: string } {
  const match = phone.match(/^(\+\d{1,4})?\s*(.+)$/);
  if (!match) return { countryCode: '+64', number: phone };
  const countryCode = match[1] || '+64';
  const number = match[2] || '';
  const country = COUNTRIES.find(c => c.dialCode === countryCode);
  return { countryCode: country?.dialCode || '+64', number };
}

type NgoProfilePanelProps = {
  organization: Organization;
  onUpdated: () => void;
};

export default function NgoProfilePanel({ organization, onUpdated }: NgoProfilePanelProps) {
  const completionItems = useMemo(() => getProfileCompletionItems(organization), [organization]);
  const completionPct = profileCompletionPercent(completionItems);

  const phoneParts = useMemo(() => extractPhoneParts(organization.phone ?? ''), [organization.phone]);

  type ProfileForm = {
    mission_statement: string;
    description: string;
    website_url: string;
    logo_url: string;
    phone_country_code: string;
    phone_number: string;
    email: string;
    country: string;
    city: string;
  };

  const [profileForm, setProfileForm] = useState<ProfileForm>({
    mission_statement: organization.mission_statement ?? '',
    description: organization.description ?? '',
    website_url: organization.website_url ?? '',
    logo_url: organization.logo_url ?? '',
    phone_country_code: phoneParts.countryCode,
    phone_number: phoneParts.number,
    email: organization.email ?? '',
    country: organization.country ?? 'NZ',
    city: '',
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [websiteError, setWebsiteError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [phoneError, setPhoneError] = useState('');

  useEffect(() => {
    const cityFromLocation = organization.location?.split(',')[0]?.trim() || '';
    setProfileForm({
      mission_statement: organization.mission_statement ?? '',
      description: organization.description ?? '',
      website_url: organization.website_url ?? '',
      logo_url: organization.logo_url ?? '',
      phone_country_code: phoneParts.countryCode,
      phone_number: phoneParts.number,
      email: organization.email ?? '',
      country: organization.country ?? 'NZ',
      city: cityFromLocation,
    });
  }, [organization.id, organization.updated_at, phoneParts.countryCode, phoneParts.number]);

  const validateForm = (): boolean => {
    let valid = true;

    if (profileForm.website_url.trim() && !isValidDomain(profileForm.website_url)) {
      setWebsiteError('Please enter a valid domain (e.g., example.com or https://example.com)');
      valid = false;
    } else {
      setWebsiteError('');
    }

    if (!isValidEmail(profileForm.email)) {
      setEmailError('Please enter a valid email address');
      valid = false;
    } else {
      setEmailError('');
    }

    if (!isValidPhone(profileForm.phone_number, profileForm.phone_country_code)) {
      setPhoneError('Please enter a valid phone number (at least 6 digits)');
      valid = false;
    } else {
      setPhoneError('');
    }

    return valid;
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setProfileSaving(true);
    setProfileMessage('');

    const fullPhone = profileForm.phone_number.trim()
      ? `${profileForm.phone_country_code} ${profileForm.phone_number.trim()}`
      : '';

    const fullLocation = profileForm.city.trim()
      ? `${profileForm.city.trim()}, ${COUNTRIES.find(c => c.code === profileForm.country)?.name || profileForm.country}`
      : '';

    const { error } = await supabase
      .from('organizations')
      .update({
        mission_statement: profileForm.mission_statement.trim(),
        description: profileForm.description.trim(),
        website_url: profileForm.website_url.trim(),
        logo_url: profileForm.logo_url.trim(),
        phone: fullPhone,
        email: profileForm.email.trim(),
        country: profileForm.country,
        location: fullLocation,
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
              className={`input-brutal w-full text-base ${emailError ? 'border-accent' : ''}`}
              value={profileForm.email}
              onChange={(e) => {
                setProfileForm((f) => ({ ...f, email: e.target.value }));
                if (emailError) setEmailError('');
              }}
            />
            {emailError && (
              <p className="text-accent text-xs font-mono mt-1" role="alert">
                <AlertCircle size={12} className="inline mr-1" /> {emailError}
              </p>
            )}
          </div>
          <div>
            <label className="label-brutal flex items-center gap-1" htmlFor="ngo-phone">
              <Phone size={12} aria-hidden /> Phone
            </label>
            <div className="flex gap-2">
<Select
  value={profileForm.phone_country_code}
  onValueChange={(value) => setProfileForm((f) => ({ ...f, phone_country_code: value ?? '+64' }))}
>
                <SelectTrigger className="w-[110px] min-h-[48px]">
                  <SelectValue placeholder="Code" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.dialCode || '+64'}>
                      {c.flag} {c.name} ({c.dialCode || 'Custom'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                id="ngo-phone"
                type="tel"
                className={`input-brutal flex-1 text-base min-h-[48px] ${phoneError ? 'border-accent' : ''}`}
                value={profileForm.phone_number}
                onChange={(e) => {
                  setProfileForm((f) => ({ ...f, phone_number: e.target.value }));
                  if (phoneError) setPhoneError('');
                }}
                placeholder="Phone number"
              />
            </div>
            {phoneError && (
              <p className="text-accent text-xs font-mono mt-1" role="alert">
                <AlertCircle size={12} className="inline mr-1" /> {phoneError}
              </p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label-brutal flex items-center gap-1" htmlFor="ngo-website">
              <Globe size={12} aria-hidden /> Website URL
            </label>
            <input
              id="ngo-website"
              type="url"
              className={`input-brutal w-full text-base ${websiteError ? 'border-accent' : ''}`}
              value={profileForm.website_url}
              onChange={(e) => {
                setProfileForm((f) => ({ ...f, website_url: e.target.value }));
                if (websiteError) setWebsiteError('');
              }}
              placeholder="https://example.com"
            />
            {websiteError && (
              <p className="text-accent text-xs font-mono mt-1" role="alert">{websiteError}</p>
            )}
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
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label-brutal" htmlFor="ngo-country">Country</label>
<Select
  value={profileForm.country}
  onValueChange={(value) => setProfileForm((f) => ({ ...f, country: value ?? 'NZ' }))}
>
              <SelectTrigger className="w-full min-h-[48px]">
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.filter(c => c.code !== 'OTHER').map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.flag} {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="label-brutal" htmlFor="ngo-city">City</label>
            <input
              id="ngo-city"
              type="text"
              className="input-brutal w-full text-base"
              value={profileForm.city}
              onChange={(e) => setProfileForm((f) => ({ ...f, city: e.target.value }))}
              placeholder="City"
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