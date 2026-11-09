import 'server-only';
import { cache } from 'react';
import { DEMO_DATASET, makeView, type View } from '@/src/demo/view.ts';
import { authConfigured } from '@/lib/supabase/env';
import { loadLive } from './live';

export const liveMode = () => authConfigured() && !!(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY);

/** The screens' data for this request: the live database when connected, otherwise the invented demo data. */
export const getView = cache(async (): Promise<View> => (liveMode() ? makeView(await loadLive()) : makeView(DEMO_DATASET)));
