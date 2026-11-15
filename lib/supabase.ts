import {createClient,type SupabaseClient} from '@supabase/supabase-js';
let client:SupabaseClient|null=null;
export function getSupabase(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;if(!url||!key||url.includes('YOUR-PROJECT')||key.includes('YOUR-PUBLIC'))return null;if(!client)client=createClient(url,key);return client;}
