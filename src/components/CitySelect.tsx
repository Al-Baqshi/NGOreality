import { useEffect, useState } from 'react';
import { citiesForCountry, matchListedCity } from '../data/cities';
import { COUNTRY_NAMES } from '../data/countryNames';
import { cn } from '@/lib/utils';

const OTHER = '__other__';

type CitySelectProps = {
  id?: string;
  /** ISO country code; picks the list. Countries without a list get a text box. */
  country: string;
  value: string;
  onChange: (city: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
};

/**
 * City dropdown shared by portal and CRM forms. Values not in the list
 * (legacy registry suburbs, small towns) stay editable under "Other".
 */
export default function CitySelect({
  id,
  country,
  value,
  onChange,
  onBlur,
  invalid,
  describedBy,
  className,
}: CitySelectProps) {
  const cities = citiesForCountry(country);
  const listed = matchListedCity(country, value);
  const [otherMode, setOtherMode] = useState(Boolean(value.trim()) && !listed);

  useEffect(() => {
    // A value arriving from the server (or a country change) decides the mode.
    if (value.trim() && !matchListedCity(country, value)) setOtherMode(true);
  }, [country, value]);

  const fieldClass = cn(
    'input-brutal w-full text-base min-h-[48px]',
    invalid && 'border-accent ring-2 ring-accent/30',
    className,
  );

  if (cities.length === 0) {
    return (
      <input
        id={id}
        type="text"
        autoComplete="address-level2"
        className={fieldClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder="City or town"
        aria-invalid={invalid}
        aria-describedby={describedBy}
      />
    );
  }

  return (
    <div className="space-y-2">
      <select
        id={id}
        className={fieldClass}
        value={otherMode ? OTHER : (listed ?? '')}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setOtherMode(true);
            onChange('');
            return;
          }
          setOtherMode(false);
          onChange(e.target.value);
        }}
        onBlur={otherMode ? undefined : onBlur}
        aria-invalid={invalid}
        aria-describedby={describedBy}
      >
        <option value="">Select city or town</option>
        {cities.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value={OTHER}>Other (type it)</option>
      </select>
      {otherMode ? (
        <input
          type="text"
          autoComplete="address-level2"
          className={fieldClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder="Town name"
          aria-label="City or town (not in list)"
          aria-invalid={invalid}
          aria-describedby={describedBy}
          autoFocus={!value}
        />
      ) : null}
    </div>
  );
}

/** Split a stored "City, Country" location into its city part. */
export function cityFromLocation(location: string | null | undefined): string {
  return location?.split(',')[0]?.trim() ?? '';
}

/**
 * City dropdown for forms that store a single "City, Country" location string
 * (registration, CRM lead / organisation forms).
 */
export function LocationCitySelect({
  country = 'NZ',
  value,
  onChange,
  ...rest
}: Omit<CitySelectProps, 'country' | 'value' | 'onChange'> & {
  country?: string;
  value: string;
  onChange: (location: string) => void;
}) {
  const countryName = COUNTRY_NAMES[country.toUpperCase()] ?? country;
  return (
    <CitySelect
      {...rest}
      country={country}
      value={cityFromLocation(value)}
      onChange={(city) => onChange(city.trim() ? `${city}, ${countryName}` : '')}
    />
  );
}
