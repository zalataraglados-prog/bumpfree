import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://spsadfojhcwyjvhyxouz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "sb_publishable_82x2ID0VJPhyPBClK3AWPQ_IJDE53i7";

export function createClient() {
    return createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}
