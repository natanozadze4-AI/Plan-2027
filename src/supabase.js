import { createClient } from "@supabase/supabase-js";

// Публичные значения (publishable key защищён RLS); переменные окружения имеют приоритет.
const url = import.meta.env.VITE_SUPABASE_URL || "https://xdcsbvibexhenuyjemof.supabase.co";
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_pGiW4UkgSkalx4ileG4FSw_O6T1Ybfs";

export const configured = Boolean(url && key);
export const supabase = configured ? createClient(url, key) : null;
