"use server";

import { createClient } from "@/lib/supabase/server";
import { getNextAvailableColor } from "@/lib/utils/colors";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { redirect } from "next/navigation";

const createRoomSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    expiresAt: z.string().optional(),
});

const updateRoomSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    expiresAt: z.string().nullable().optional(),
    isPublic: z.boolean().optional(),
});

async function ensureCurrentUserProfile() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { supabase, user: null };

    const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

    if (!existingProfile) {
        const displayName =
            (user.user_metadata?.display_name as string | undefined) ||
            (user.email ? user.email.split("@")[0] : null);

        await supabase.from("profiles").upsert({
            id: user.id,
            display_name: displayName,
        });
    }

    return { supabase, user };
}

export async function createRoom(formData: FormData) {
    const { supabase, user } = await ensureCurrentUserProfile();
    if (!user) return { error: "请先登录" };

    const { data: profile } = await supabase
        .from("profiles")
        .select("room_quota")
        .eq("id", user.id)
        .single();

    const { count: currentRooms } = await supabase
        .from("rooms")
        .select("*", { count: "exact", head: true })
        .eq("admin_id", user.id);

    if (profile && currentRooms !== null && currentRooms >= profile.room_quota) {
        return { error: `已达到 Room 创建上限（${profile.room_quota} 个）` };
    }

    const parsed = createRoomSchema.safeParse({
        name: formData.get("name"),
        description: formData.get("description"),
        expiresAt: formData.get("expiresAt"),
    });
    if (!parsed.success) return { error: "请填写 Room 名称" };

    const { data: room, error } = await supabase
        .from("rooms")
        .insert({
            admin_id: user.id,
            name: parsed.data.name,
            description: parsed.data.description || null,
            expires_at: parsed.data.expiresAt || null,
        })
        .select()
        .single();

    if (error || !room) {
        console.error("[createRoom] Error:", error);
        return { error: `创建 Room 失败: ${error?.message || "未知错误"}` };
    }

    const { error: joinError } = await supabase.from("room_members").insert({
        room_id: room.id,
        user_id: user.id,
        color: "#6366f1",
    });

    if (joinError) {
        console.error("[createRoom] join error:", joinError);
        return { error: `自动加入 Room 失败: ${joinError.message}` };
    }

    revalidatePath("/dashboard/rooms");
    return { success: true, roomId: room.id };
}

export async function updateRoom(
    roomId: string,
    updates: { name?: string; description?: string; expiresAt?: string | null; isPublic?: boolean }
) {
    const { supabase, user } = await ensureCurrentUserProfile();
    if (!user) return { error: "请先登录" };

    const parsed = updateRoomSchema.safeParse({
        name: updates.name,
        description: updates.description ?? null,
        expiresAt: updates.expiresAt ?? null,
        isPublic: updates.isPublic,
    });

    if (!parsed.success) return { error: "参数不合法" };

    const payload: {
        name?: string;
        description?: string | null;
        expires_at?: string | null;
        is_public?: boolean;
    } = {};

    if (parsed.data.name !== undefined) payload.name = parsed.data.name;
    if (parsed.data.description !== undefined) payload.description = parsed.data.description || null;
    if (parsed.data.expiresAt !== undefined) payload.expires_at = parsed.data.expiresAt || null;
    if (parsed.data.isPublic !== undefined) payload.is_public = parsed.data.isPublic;

    const { error } = await supabase
        .from("rooms")
        .update(payload)
        .eq("id", roomId)
        .eq("admin_id", user.id);

    if (error) return { error: "更新失败" };
    revalidatePath(`/room/${roomId}`);
    revalidatePath("/dashboard/rooms");
    return { success: true };
}

export async function deleteRoom(roomId: string) {
    const { supabase, user } = await ensureCurrentUserProfile();
    if (!user) return { error: "请先登录" };

    const { error } = await supabase
        .from("rooms")
        .delete()
        .eq("id", roomId)
        .eq("admin_id", user.id);

    if (error) return { error: "删除失败" };
    revalidatePath("/dashboard/rooms");
    return { success: true };
}

export async function getMyRooms() {
    const { supabase, user } = await ensureCurrentUserProfile();
    if (!user) return [];

    const { data } = await supabase
        .from("rooms")
        .select("*, room_members(count)")
        .eq("admin_id", user.id)
        .order("created_at", { ascending: false });

    return data ?? [];
}

export async function searchUsers(query: string) {
    const { supabase, user } = await ensureCurrentUserProfile();
    if (!user) return [];

    let builder = supabase
        .from("profiles")
        .select("id, display_name")
        .neq("id", user.id)
        .order("display_name", { ascending: true, nullsFirst: false })
        .limit(50);

    if (query.trim()) {
        builder = builder.ilike("display_name", `%${query.trim()}%`);
    }

    const { data } = await builder;

    return (data ?? []).map((profile) => ({
        ...profile,
        display_name: profile.display_name || "未命名用户",
    }));
}

export async function inviteUserToRoom(roomId: string, inviteeId: string) {
    const { supabase, user } = await ensureCurrentUserProfile();
    if (!user) return { error: "请先登录" };

    const [{ data: room }, { data: profile }] = await Promise.all([
        supabase
            .from("rooms")
            .select("admin_id")
            .eq("id", roomId)
            .single(),
        supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single(),
    ]);

    const canManageRoom = room && (room.admin_id === user.id || profile?.role === "superadmin");
    if (!canManageRoom) return { error: "权限不足" };

    const { data: existing } = await supabase
        .from("room_members")
        .select("user_id")
        .eq("room_id", roomId)
        .eq("user_id", inviteeId)
        .maybeSingle();

    if (existing) return { error: "该用户已是 Room 成员" };

    const { data: pendingInv } = await supabase
        .from("invitations")
        .select("id")
        .eq("room_id", roomId)
        .eq("invitee_id", inviteeId)
        .eq("status", "pending")
        .maybeSingle();

    const assignDirectly = profile?.role === "superadmin";

    if (assignDirectly) {
        const { data: members } = await supabase
            .from("room_members")
            .select("color")
            .eq("room_id", roomId);

        const usedColors = (members ?? []).map((member) => member.color);
        const { error: memberErr } = await supabase.from("room_members").insert({
            room_id: roomId,
            user_id: inviteeId,
            color: getNextAvailableColor(usedColors),
        });

        if (memberErr) return { error: "自动分配成员失败" };

        if (pendingInv) {
            await supabase
                .from("invitations")
                .update({ status: "accepted" })
                .eq("id", pendingInv.id);
        }

        revalidatePath(`/room/${roomId}`);
        revalidatePath("/dashboard/rooms");
        revalidatePath("/dashboard/invitations");
        return { success: true, mode: "direct" as const };
    }

    if (pendingInv) return { error: "已发送过邀请，等待对方回应" };

    const { error } = await supabase.from("invitations").insert({
        room_id: roomId,
        invitee_id: inviteeId,
        inviter_id: user.id,
        status: "pending",
    });

    if (error) return { error: "发送邀请失败" };
    revalidatePath("/dashboard/invitations");
    return { success: true, mode: "invite" as const };
}

export async function getRoomMembers(roomId: string) {
    const { supabase } = await ensureCurrentUserProfile();

    const { data } = await supabase
        .from("room_members")
        .select("*, profile:profiles(id, display_name, role)")
        .eq("room_id", roomId);

    return data ?? [];
}

export async function removeRoomMember(roomId: string, userId: string) {
    const { supabase, user } = await ensureCurrentUserProfile();
    if (!user) return { error: "请先登录" };

    const { data: room } = await supabase
        .from("rooms")
        .select("admin_id")
        .eq("id", roomId)
        .single();

    if (!room || room.admin_id !== user.id) return { error: "权限不足" };
    if (userId === room.admin_id) return { error: "无法移除 Room 管理员" };

    const { error } = await supabase
        .from("room_members")
        .delete()
        .eq("room_id", roomId)
        .eq("user_id", userId);

    if (error) return { error: "移除失败" };
    revalidatePath(`/room/${roomId}`);
    return { success: true };
}
