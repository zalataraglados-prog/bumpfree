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
    if (profileDisplayName?.trim()) return profileDisplayName;
    if (typeof metadataDisplayName === "string" && metadataDisplayName.trim()) return metadataDisplayName;
    if (email) return email.split("@")[0];
    return "未命名用户";
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
            throw new Error(`Failed to list users: ${error.message}`);
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
