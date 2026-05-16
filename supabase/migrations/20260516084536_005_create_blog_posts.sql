/*
  # Create blog_posts table

  1. New Tables
    - `blog_posts`
      - `id` (uuid, primary key)
      - `title` (text, not null) — Post headline
      - `slug` (text, unique, not null) — URL-friendly identifier
      - `excerpt` (text) — Short summary for listings
      - `content` (text) — Full post body (plain text or markdown)
      - `featured_image_url` (text) — Hero image URL
      - `author` (text) — Author name
      - `status` (text) — 'draft' or 'published'
      - `published_at` (timestamptz) — Publication timestamp
      - `created_at` (timestamptz) — Row creation time
      - `updated_at` (timestamptz) — Last update time

  2. Security
    - Enable RLS on `blog_posts`
    - Authenticated users can read all posts
    - Only authenticated users can insert/update/delete (CRM users)
    - Public can read published posts only
*/

CREATE TABLE IF NOT EXISTS blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  excerpt text DEFAULT '',
  content text DEFAULT '',
  featured_image_url text DEFAULT '',
  author text DEFAULT '',
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published posts"
  ON blog_posts FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

CREATE POLICY "Authenticated can read all posts"
  ON blog_posts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert posts"
  ON blog_posts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update posts"
  ON blog_posts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete posts"
  ON blog_posts FOR DELETE
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts (slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts (status);
