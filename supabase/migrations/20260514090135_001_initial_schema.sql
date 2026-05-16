/*
  # Baqshi Initial Database Schema

  1. New Tables
    - `organizations`
      - `id` (uuid, primary key) — Unique organization identifier
      - `name` (text) — Organization name
      - `slug` (text, unique) — URL-friendly identifier
      - `description` (text) — Short description
      - `mission_statement` (text) — Organization mission
      - `category` (text) — Nonprofit category (e.g., Education, Health, Environment)
      - `location` (text) — Geographic location
      - `website_url` (text) — Organization website
      - `email` (text) — Primary contact email
      - `phone` (text) — Primary contact phone
      - `status` (text) — Pipeline status: onboarding, under_review, verified, active, lapsed
      - `verification_level` (text) — Verification tier: none, basic, standard, advanced
      - `onboarding_stage` (text) — Current onboarding step
      - `logo_url` (text) — URL to organization logo
      - `created_at` (timestamptz) — Record creation time
      - `updated_at` (timestamptz) — Last update time

    - `contacts`
      - `id` (uuid, primary key)
      - `organization_id` (uuid, FK → organizations) — Linked organization
      - `name` (text) — Contact name
      - `role` (text) — Role at organization
      - `email` (text) — Contact email
      - `phone` (text) — Contact phone
      - `is_primary` (boolean) — Whether this is the primary contact
      - `notes` (text) — Internal notes
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `verification_criteria`
      - `id` (uuid, primary key)
      - `organization_id` (uuid, FK → organizations) — Linked organization
      - `criterion_key` (text) — Machine-readable key (e.g., website_functional, mission_clear)
      - `criterion_label` (text) — Human-readable label
      - `status` (text) — pass, fail, pending
      - `notes` (text) — Evaluator notes
      - `evaluated_at` (timestamptz) — When evaluated
      - `created_at` (timestamptz)

    - `verification_badges`
      - `id` (uuid, primary key)
      - `organization_id` (uuid, FK → organizations) — Linked organization
      - `verification_id` (text, unique) — Public-facing verification ID (e.g., BAQ-2024-001)
      - `level` (text) — Badge level: basic, standard, advanced
      - `issued_at` (timestamptz) — When issued
      - `expires_at` (timestamptz) — Expiry date
      - `is_active` (boolean) — Whether badge is currently valid
      - `created_at` (timestamptz)

    - `activity_log`
      - `id` (uuid, primary key)
      - `organization_id` (uuid, FK → organizations) — Linked organization
      - `action` (text) — Action type (e.g., status_change, note_added, verification_updated)
      - `description` (text) — What happened
      - `performed_by` (text) — Who performed the action
      - `metadata` (jsonb) — Additional structured data
      - `created_at` (timestamptz)

    - `inquiry_submissions`
      - `id` (uuid, primary key)
      - `organization_name` (text) — Inquiring organization
      - `contact_name` (text) — Person inquiring
      - `email` (text) — Contact email
      - `phone` (text) — Contact phone
      - `message` (text) — Inquiry message
      - `category` (text) — Interest category
      - `status` (text) — new, contacted, qualified, closed
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to perform CRUD on all internal tables
    - Add policy for anyone to insert into inquiry_submissions (public contact form)
    - Add policy for anyone to read verified organizations (public directory)

  3. Indexes
    - Index on organizations.status for pipeline filtering
    - Index on organizations.slug for public profile lookups
    - Index on contacts.organization_id for joins
    - Index on verification_criteria.organization_id for joins
    - Index on activity_log.organization_id for timeline queries
    - Index on inquiry_submissions.status for filtering
*/

-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text DEFAULT '',
  mission_statement text DEFAULT '',
  category text DEFAULT '',
  location text DEFAULT '',
  website_url text DEFAULT '',
  email text DEFAULT '',
  phone text DEFAULT '',
  status text NOT NULL DEFAULT 'onboarding',
  verification_level text NOT NULL DEFAULT 'none',
  onboarding_stage text DEFAULT 'intake',
  logo_url text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

-- Contacts
CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text DEFAULT '',
  email text DEFAULT '',
  phone text DEFAULT '',
  is_primary boolean DEFAULT false,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_organization_id ON contacts(organization_id);

-- Verification Criteria
CREATE TABLE IF NOT EXISTS verification_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  criterion_key text NOT NULL,
  criterion_label text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  notes text DEFAULT '',
  evaluated_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_criteria_organization_id ON verification_criteria(organization_id);

-- Verification Badges
CREATE TABLE IF NOT EXISTS verification_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  verification_id text UNIQUE NOT NULL,
  level text NOT NULL DEFAULT 'basic',
  issued_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Activity Log
CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  action text NOT NULL,
  description text DEFAULT '',
  performed_by text DEFAULT '',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_organization_id ON activity_log(organization_id);

-- Inquiry Submissions
CREATE TABLE IF NOT EXISTS inquiry_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_name text NOT NULL,
  contact_name text NOT NULL,
  email text NOT NULL,
  phone text DEFAULT '',
  message text DEFAULT '',
  category text DEFAULT '',
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inquiry_submissions_status ON inquiry_submissions(status);

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiry_submissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for organizations (authenticated CRUD, public read verified)
CREATE POLICY "Authenticated users can read all organizations"
  ON organizations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert organizations"
  ON organizations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update organizations"
  ON organizations FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can read verified organizations"
  ON organizations FOR SELECT
  TO anon
  USING (status = 'verified' OR status = 'active');

-- RLS Policies for contacts (authenticated only)
CREATE POLICY "Authenticated users can read contacts"
  ON contacts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert contacts"
  ON contacts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update contacts"
  ON contacts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete contacts"
  ON contacts FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for verification_criteria (authenticated only)
CREATE POLICY "Authenticated users can read verification criteria"
  ON verification_criteria FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert verification criteria"
  ON verification_criteria FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update verification criteria"
  ON verification_criteria FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete verification criteria"
  ON verification_criteria FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for verification_badges (authenticated CRUD, public read active)
CREATE POLICY "Authenticated users can read all badges"
  ON verification_badges FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert badges"
  ON verification_badges FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update badges"
  ON verification_badges FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can read active badges"
  ON verification_badges FOR SELECT
  TO anon
  USING (is_active = true);

-- RLS Policies for activity_log (authenticated only)
CREATE POLICY "Authenticated users can read activity log"
  ON activity_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert activity log"
  ON activity_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for inquiry_submissions (public can insert, authenticated can read)
CREATE POLICY "Authenticated users can read inquiries"
  ON inquiry_submissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update inquiries"
  ON inquiry_submissions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can submit inquiries"
  ON inquiry_submissions FOR INSERT
  TO anon
  WITH CHECK (true);
