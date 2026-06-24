"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const ACCEPTED_FILE_TYPES = new Set([
    "text/plain",
    "text/html",
    "image/png",
    "image/jpeg",
    "image/webp",
]);

const statusSchema = z.enum(["pending", "processing", "done", "rejected"]);

export interface ManualScheduleSubmission {
    id: string;
    user_id: string;
    status: "pending" | "processing" | "done" | "rejected";
    text_content: string | null;
    file_name: string | null;
    file_type: string | null;
    file_size: number | null;
    file_data: string | null;
    admin_note: string | null;
    created_at: string;
    updated_at: string;
    profile?: {
        display_name: string | null;
    } | null;
}

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

    if (profile?.role !== "superadmin") throw new Error("Forbidden");
    return supabase;
}

function isAcceptedFile(file: File) {
    const name = file.name.toLowerCase();
    if (ACCEPTED_FILE_TYPES.has(file.type)) return true;
    return [".txt", ".html", ".htm", ".png", ".jpg", ".jpeg", ".webp"].some((suffix) => name.endsWith(suffix));
}

export async function submitManualSchedule(formData: FormData) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "请先登录" };

    const text = String(formData.get("text") ?? "").trim();
    const file = formData.get("file");
    let filePayload: {
        file_name: string;
        file_type: string;
        file_size: number;
        file_data: string;
    } | null = null;

    if (file instanceof File && file.size > 0) {
        if (file.size > MAX_FILE_SIZE) return { error: "文件不能超过 2MB" };
        if (!isAcceptedFile(file)) return { error: "只支持 TXT、HTML、PNG、JPG、WEBP" };
        const buffer = Buffer.from(await file.arrayBuffer());
        filePayload = {
            file_name: file.name,
            file_type: file.type || "application/octet-stream",
            file_size: file.size,
            file_data: buffer.toString("base64"),
        };
    }

    if (!text && !filePayload) return { error: "请填写文本说明或上传图片/文本文件" };

    const { error } = await supabase.from("manual_schedule_submissions").insert({
        user_id: user.id,
        text_content: text || null,
        file_name: filePayload?.file_name ?? null,
        file_type: filePayload?.file_type ?? null,
        file_size: filePayload?.file_size ?? null,
        file_data: filePayload?.file_data ?? null,
    });

    if (error) return { error: `提交失败：${error.message}` };
    revalidatePath("/admin/settings");
    return { success: true };
}

export async function getManualScheduleSubmissions() {
    const supabase = await assertSuperAdmin();
    const { data, error } = await supabase
        .from("manual_schedule_submissions")
        .select("*, profile:profiles(display_name)")
        .order("created_at", { ascending: false })
        .limit(50);

    if (error) return [];
    return data as ManualScheduleSubmission[];
}

export async function updateManualScheduleSubmission(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const status = statusSchema.safeParse(formData.get("status"));
    const adminNote = String(formData.get("adminNote") ?? "").trim();
    if (!id || !status.success) return { error: "请检查处理状态" };

    const supabase = await assertSuperAdmin();
    const { error } = await supabase
        .from("manual_schedule_submissions")
        .update({
            status: status.data,
            admin_note: adminNote || null,
            updated_at: new Date().toISOString(),
        })
        .eq("id", id);

    if (error) return { error: `更新失败：${error.message}` };
    revalidatePath("/admin/settings");
    return { success: true };
}
