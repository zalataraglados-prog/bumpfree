"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { z } from "zod";

const SITE_URL =
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://bumpfree.ztlearn.xyz";

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
});

const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    displayName: z.string().min(1).max(50),
});

type AuthErrorLike = {
    message?: string;
    status?: number;
    code?: string;
};

function authErrorMessage(error: AuthErrorLike | null): string {
    const message = error?.message ?? "";
    const normalized = message.toLowerCase();

    if (error?.status === 429 || normalized.includes("rate limit")) {
        return "\u90ae\u4ef6\u53d1\u9001\u9891\u7387\u8d85\u9650\u3002\u5df2\u5173\u95ed\u90ae\u7bb1\u9a8c\u8bc1\u540e\uff0c\u8bf7\u7a0d\u7b49\u51e0\u5206\u949f\u518d\u8bd5\u3002";
    }

    if (normalized.includes("already registered") || normalized.includes("user already registered")) {
        return "\u8be5\u90ae\u7bb1\u5df2\u6ce8\u518c\uff0c\u8bf7\u76f4\u63a5\u767b\u5f55\u6216\u627e\u56de\u5bc6\u7801\u3002";
    }

    if (normalized.includes("invalid login credentials")) {
        return "\u90ae\u7bb1\u6216\u5bc6\u7801\u9519\u8bef\u3002";
    }

    if (normalized.includes("email not confirmed")) {
        return "\u90ae\u7bb1\u8fd8\u672a\u9a8c\u8bc1\u3002\u5982\u679c\u5df2\u5173\u95ed\u90ae\u7bb1\u9a8c\u8bc1\uff0c\u8bf7\u7a0d\u7b49\u914d\u7f6e\u751f\u6548\u540e\u91cd\u8bd5\u3002";
    }

    return message || "\u64cd\u4f5c\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002";
}

export async function loginAction(formData: FormData) {
    const parsed = loginSchema.safeParse({
        email: formData.get("email"),
        password: formData.get("password"),
    });
    if (!parsed.success) return { error: "\u8bf7\u586b\u5199\u6709\u6548\u7684\u90ae\u7bb1\u548c\u5bc6\u7801\uff08\u81f3\u5c11 6 \u4f4d\uff09\u3002" };

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) return { error: authErrorMessage(error) };

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (user) {
        const displayName =
            (user.user_metadata?.display_name as string | undefined) ||
            (user.email ? user.email.split("@")[0] : null);

        await supabase.from("profiles").upsert({
            id: user.id,
            display_name: displayName,
        });
    }

    redirect("/dashboard");
}

export async function registerAction(formData: FormData) {
    const parsed = registerSchema.safeParse({
        email: formData.get("email"),
        password: formData.get("password"),
        displayName: formData.get("displayName"),
    });
    if (!parsed.success) return { error: "\u8bf7\u68c0\u67e5\u6635\u79f0\u3001\u90ae\u7bb1\u548c\u5bc6\u7801\u683c\u5f0f\u3002" };

    const supabase = await createClient();

    const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
            data: {
                display_name: parsed.data.displayName,
            },
            emailRedirectTo: `${SITE_URL}/auth/callback`,
        },
    });
    if (error) return { error: authErrorMessage(error) };
    if (!data.user) return { error: "\u6ce8\u518c\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002" };

    await supabase.from("profiles").upsert({
        id: data.user.id,
        display_name: parsed.data.displayName,
    });

    if (!data.session) {
        return { success: true, message: "\u6ce8\u518c\u6210\u529f\u3002\u5982\u679c\u9875\u9762\u672a\u81ea\u52a8\u8df3\u8f6c\uff0c\u8bf7\u76f4\u63a5\u767b\u5f55\u3002" };
    }

    redirect("/dashboard");
}

export async function logoutAction() {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/");
}

export async function requestPasswordResetAction(formData: FormData) {
    const email = formData.get("email") as string;
    if (!email) return { error: "\u8bf7\u8f93\u5165\u6709\u6548\u7684\u90ae\u7bb1\u3002" };

    const supabase = await createClient();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${SITE_URL}/auth/update-password`,
    });

    if (error) return { error: authErrorMessage(error) };

    return { success: true, message: "\u5bc6\u7801\u91cd\u7f6e\u90ae\u4ef6\u5df2\u53d1\u9001\uff0c\u8bf7\u68c0\u67e5\u6536\u4ef6\u7bb1\u3002" };
}

export async function updatePasswordFromRecoveryAction(formData: FormData) {
    const password = formData.get("password") as string;
    if (!password || password.length < 6) return { error: "\u5bc6\u7801\u81f3\u5c11\u9700\u8981 6 \u4f4d\u3002" };

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) return { error: authErrorMessage(error) };

    redirect("/dashboard");
}

export async function getCurrentUser() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

    return profile;
}
