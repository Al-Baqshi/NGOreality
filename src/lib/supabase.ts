import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** True when `.env.local` has both Supabase variables set. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// createClient throws if url/key are missing; use placeholders so the UI still mounts in dev.
const url = supabaseUrl ?? 'https://placeholder.supabase.co';
const key =
  supabaseAnonKey ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.placeholder';

export const supabase = createClient(url, key);

if (import.meta.env.DEV && !isSupabaseConfigured) {
  console.warn(
    '[NGOreality] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and add your Supabase credentials.',
  );
}
