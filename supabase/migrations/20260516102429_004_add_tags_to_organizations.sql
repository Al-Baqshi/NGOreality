/*
  # Add tags field to organizations

  1. Modified Tables
    - `organizations`
      - `tags` (text array) — Array of situational/taxonomy tags (e.g., {'education', 'climate', 'healthcare'})

  2. Notes
    - Uses PostgreSQL text[] array type for flexible tagging
    - Tags are dynamically created as organizations are added
    - Default empty array for backward compatibility
    - GIN index for efficient array containment queries
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'tags'
  ) THEN
    ALTER TABLE organizations ADD COLUMN tags text[] DEFAULT '{}';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_organizations_tags ON organizations USING GIN (tags);
