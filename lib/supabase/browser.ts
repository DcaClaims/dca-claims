'use client';
import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './env';

export const browserClient = () => createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
