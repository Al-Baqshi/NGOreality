/*
  # Add country field to organizations

  1. Modified Tables
    - `organizations`
      - `country` (text) — ISO 3166-1 alpha-2 country code (e.g., 'NZ', 'US', 'GB')

  2. Notes
    - Uses ISO alpha-2 codes for consistency with SVG map country identifiers
    - Default empty string for backward compatibility
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'country'
  ) THEN
    ALTER TABLE organizations ADD COLUMN country text DEFAULT '';
  END IF;
END $$;
