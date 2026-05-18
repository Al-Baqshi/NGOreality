import { supabase } from './supabase';

export interface UserProfile {
  id: string;
  full_name: string;
  is_staff: boolean;
}

export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, is_staff')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}
