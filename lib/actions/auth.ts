"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { z } from "zod";

const SITE_URL =
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://bumpfree-zalataraglados-1455s-projects.vercel.app";

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
});

const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    displayName: z.string().min(1).max(50),
});

export async function loginAction(formData: FormData) {
    const parsed = loginSchema.safeParse({
        email: formData.get("email"),
        password: formData.get("password"),
    });
    if (!parsed.success) return { error: "请填写有效的邮箱和密码（至少6位）" };

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) return { error: "邮箱或密码错误" };

    redirect("/dashboard");
}

export async function registerAction(formData: FormData) {
    const parsed = registerSchema.safeParse({
        email: formData.get("email"),
        password: formData.get("password"),
        displayName: formData.get("displayName"),
    });
    if (!parsed.success) return { error: "请检查输入格式" };

    const supabase = await createClient();

    const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
            emailRedirectTo: `${SITE_URL}/auth/callback`,
        },
    });
    if (error) return { error: error.message };
    if (!data.user) return { error: "注册失败，请重试" };

    await supabase.from("profiles").upsert({
        id: data.user.id,
        display_name: parsed.data.displayName,
    });

    if (!data.session) {
        return { success: true, message: "注册成功！请前往您的邮箱点击验证链接。" };
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
    if (!email) return { error: "请输入有效的邮箱" };

    const supabase = await createClient();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${SITE_URL}/auth/update-password`,
    });

    if (error) return { error: error.message };

    return { success: true, message: "密码重置邮件已发送，请检查收件箱" };
}

export async function updatePasswordFromRecoveryAction(formData: FormData) {
    const password = formData.get("password") as string;
    if (!password || password.length < 6) return { error: "密码至少需要6位" };

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) return { error: error.message };

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
