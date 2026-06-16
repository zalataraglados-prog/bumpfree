import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SUPABASE_URL =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://spsadfojhcwyjvhyxouz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "sb_publishable_82x2ID0VJPhyPBClK3AWPQ_IJDE53i7";

export async function createClient() {
    const cookieStore = await cookies();

    return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        cookies: {
            getAll() {
                return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
                try {
                    cookiesToSet.forEach(({ name, value, options }) =>
                        cookieStore.set(name, value, options)
                    );
                } catch {
                    // Server Component context - cookies can't be set
                }
            },
        },
    });
}
