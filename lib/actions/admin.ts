"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AdminUser, Profile } from "@/lib/types";

const updateQuotaSchema = z.object({
    userId: z.string().uuid(),
    roomQuota: z.coerce.number().min(0).max(100),
});

const updateUserScheduleQuotaSchema = z.object({
    userId: z.string().uuid(),
    scheduleQuota: z.coerce.number().min(0).max(100),
});

const bulkCreateUsersSchema = z.object({
    lines: z.string().min(1),
});

async function assertSuperAdmin() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    if (!profile || profile.role !== "superadmin") throw new Error("Forbidden");
    return supabase;
}

function normalizeDisplayName(
    profileDisplayName: string | null | undefined,
    email: string | null | undefined,
    metadataDisplayName: unknown
) {
    const profileName = profileDisplayName?.trim();
    const emailLocalPart = email?.split("@")[0];
    const isNumericEmailFallback =
        typeof profileName === "string" &&
        typeof emailLocalPart === "string" &&
        profileName === emailLocalPart &&
        /^\d+$/.test(profileName);

    if (profileName && !isNumericEmailFallback) return profileName;
    if (typeof metadataDisplayName === "string" && metadataDisplayName.trim()) return metadataDisplayName.trim();
    if (email) return email;
    if (profileName) return profileName;
    return "\u672a\u547d\u540d\u7528\u6237";
}

function profileToAdminUser(profile: Profile): AdminUser {
    return {
        id: profile.id,
        display_name: normalizeDisplayName(profile.display_name, null, null),
        email: null,
        role: profile.role,
        room_quota: profile.room_quota,
        schedule_quota: profile.schedule_quota ?? 3,
        created_at: profile.created_at,
    };
}

export async function getAllUsers() {
    const supabase = await assertSuperAdmin();
    const adminClient = createAdminClient();

    const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

    const profiles = (data ?? []) as Profile[];

    if (!adminClient) {
        return profiles.map(profileToAdminUser);
    }

    const allUsers = [];
    let page = 1;

    while (true) {
        const { data: authData, error } = await adminClient.auth.admin.listUsers({
            page,
            perPage: 1000,
        });

        if (error) {
            throw new Error(`\u83b7\u53d6\u7ba1\u7406\u5458\u4fe1\u606f\u5931\u8d25\uff1a${error.message}`);
        }

        const users = authData.users ?? [];
        allUsers.push(...users);

        if (users.length < 1000) break;
        page += 1;
    }

    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));

    return allUsers
        .map((authUser) => {
            const profile = profileMap.get(authUser.id);

            return {
                id: authUser.id,
                display_name: normalizeDisplayName(
                    profile?.display_name,
                    authUser.email,
                    authUser.user_metadata?.display_name
                ),
                email: authUser.email ?? null,
                role: profile?.role ?? "user",
                room_quota: profile?.room_quota ?? 3,
                schedule_quota: profile?.schedule_quota ?? 3,
                created_at: profile?.created_at ?? authUser.created_at,
            } satisfies AdminUser;
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function updateUserQuota(formData: FormData) {
    const parsed = updateQuotaSchema.safeParse({
        userId: formData.get("userId"),
        roomQuota: formData.get("roomQuota"),
    });

    if (!parsed.success) return { error: "参数不合法" };

    const supabase = await assertSuperAdmin();
    const { error } = await supabase
        .from("profiles")
        .update({ room_quota: parsed.data.roomQuota })
        .eq("id", parsed.data.userId);

    if (error) return { error: "更新 Room 额度失败" };

    revalidatePath("/admin/users");
    return { success: true };
}

export async function updateUserScheduleQuota(formData: FormData) {
    const parsed = updateUserScheduleQuotaSchema.safeParse({
        userId: formData.get("userId"),
        scheduleQuota: formData.get("scheduleQuota"),
    });

    if (!parsed.success) return { error: "参数不合法" };

    const supabase = await assertSuperAdmin();
    const { error } = await supabase
        .from("profiles")
        .update({ schedule_quota: parsed.data.scheduleQuota })
        .eq("id", parsed.data.userId);

    if (error) return { error: "更新课表额度失败" };

    revalidatePath("/admin/users");
    return { success: true };
}

export async function toggleUserRole(userId: string, currentRole: string) {
    const supabase = await assertSuperAdmin();
    const newRole = currentRole === "superadmin" ? "user" : "superadmin";

    const { error } = await supabase
        .from("profiles")
        .update({ role: newRole })
        .eq("id", userId);

    if (error) return { error: "更新失败" };
    revalidatePath("/admin/users");
    return { success: true };
}

function expandTemplate(value: string, index: number, isEmail: boolean) {
    if (value.includes("{n}")) {
        return value.replaceAll("{n}", String(index));
    }

    if (!isEmail) {
        return `${value}${index}`;
    }

    const atIndex = value.lastIndexOf("@");
    if (atIndex === -1) return `${value}${index}`;
    return `${value.slice(0, atIndex)}${index}${value.slice(atIndex)}`;
}

export async function bulkCreateUsers(formData: FormData) {
    const parsed = bulkCreateUsersSchema.safeParse({
        lines: formData.get("lines"),
    });

    if (!parsed.success) return { error: "请至少填写一行账号信息" };

    await assertSuperAdmin();
    const adminClient = createAdminClient();
    if (!adminClient) return { error: "缺少 Supabase 管理员配置，无法创建账号" };

    const rawLines = parsed.data.lines
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const entries: Array<{ email: string; password: string; displayName: string }> = [];

    for (const line of rawLines) {
        const parts = line.split(",").map((part) => part.trim());
        if (parts.length < 3 || parts.length > 4) {
            return { error: `格式错误：${line}` };
        }

        const [emailTemplate, password, displayNameTemplate, quantityRaw] = parts;
        const quantity = quantityRaw ? Number(quantityRaw) : 1;

        if (!emailTemplate || !password || !displayNameTemplate) {
            return { error: `格式错误：${line}` };
        }
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 200) {
            return { error: `数量不合法：${line}` };
        }
        if (password.length < 6) {
            return { error: `密码至少 6 位：${line}` };
        }

        if (quantity === 1) {
            entries.push({
                email: emailTemplate,
                password,
                displayName: displayNameTemplate,
            });
            continue;
        }

        for (let i = 1; i <= quantity; i += 1) {
            entries.push({
                email: expandTemplate(emailTemplate, i, true),
                password,
                displayName: expandTemplate(displayNameTemplate, i, false),
            });
        }
    }

    const created: string[] = [];
    const failed: string[] = [];

    for (const entry of entries) {
        const { data, error } = await adminClient.auth.admin.createUser({
            email: entry.email,
            password: entry.password,
            email_confirm: true,
            user_metadata: {
                display_name: entry.displayName,
            },
        });

        if (error || !data.user) {
            failed.push(`${entry.email}: ${error?.message || "创建失败"}`);
            continue;
        }

        const profilePayload = {
            id: data.user.id,
            display_name: entry.displayName,
        };

        const { error: profileError } = await adminClient.from("profiles").upsert(profilePayload);
        if (profileError) {
            failed.push(`${entry.email}: ${profileError.message}`);
            continue;
        }

        created.push(entry.email);
    }

    revalidatePath("/admin/users");

    if (created.length === 0) {
        return { error: failed[0] || "没有成功创建任何账号" };
    }

    return {
        success: true,
        createdCount: created.length,
        failed,
    };
}

export async function getGlobalStats() {
    const supabase = await assertSuperAdmin();
    const adminClient = createAdminClient();

    const roomCountPromise = supabase.from("rooms").select("*", { count: "exact", head: true });

    if (!adminClient) {
        const [{ count: userCount }, { count: roomCount }] = await Promise.all([
            supabase.from("profiles").select("*", { count: "exact", head: true }),
            roomCountPromise,
        ]);

        return { userCount: userCount ?? 0, roomCount: roomCount ?? 0 };
    }

    const users = await getAllUsers();
    const { count: roomCount } = await roomCountPromise;

    return { userCount: users.length, roomCount: roomCount ?? 0 };
}
