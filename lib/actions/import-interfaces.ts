"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
    DEFAULT_IMPORT_INTERFACES,
    getEnabledImportInterfaces,
    normalizeImportInterfaces,
    type ImportInterfaceCategory,
    type ImportInterfaceConfig,
} from "@/lib/utils/importInterfaces";

const updateImportInterfaceSchema = z.object({
    id: z.string().min(1),
    enabled: z.coerce.boolean(),
    title: z.string().min(1).max(80),
    description: z.string().min(1).max(240),
    sortOrder: z.coerce.number().int().min(0).max(1000),
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

    if (profile?.role !== "superadmin") throw new Error("Forbidden");
    return supabase;
}

function rowToConfig(row: Record<string, unknown>): Partial<ImportInterfaceConfig> {
    return {
        id: String(row.id ?? ""),
        category: row.category as ImportInterfaceCategory,
        adapterKey: row.adapter_key as ImportInterfaceConfig["adapterKey"],
        title: String(row.title ?? ""),
        description: String(row.description ?? ""),
        inputLabel: String(row.input_label ?? ""),
        uploadLabel: String(row.upload_label ?? ""),
        placeholder: String(row.placeholder ?? ""),
        hints: Array.isArray(row.hints) ? row.hints.map(String) : undefined,
        acceptedFileTypes: String(row.accepted_file_types ?? ""),
        enabled: Boolean(row.enabled),
        sortOrder: Number(row.sort_order ?? 0),
        schoolName: row.school_name ? String(row.school_name) : undefined,
    };
}

async function readImportInterfaceRows() {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("import_interfaces")
        .select("*")
        .order("sort_order", { ascending: true });

    if (error) return null;
    return data.map((row) => rowToConfig(row as Record<string, unknown>));
}

export async function getAllImportInterfaces() {
    const rows = await readImportInterfaceRows();
    return normalizeImportInterfaces(rows);
}

export async function getEnabledScheduleImportInterfaces() {
    const rows = await readImportInterfaceRows();
    return getEnabledImportInterfaces(rows);
}

export async function resetImportInterfacesToDefaults() {
    const supabase = await assertSuperAdmin();
    const rows = DEFAULT_IMPORT_INTERFACES.map((item) => ({
        id: item.id,
        category: item.category,
        adapter_key: item.adapterKey,
        title: item.title,
        description: item.description,
        input_label: item.inputLabel,
        upload_label: item.uploadLabel,
        placeholder: item.placeholder,
        hints: item.hints,
        accepted_file_types: item.acceptedFileTypes,
        enabled: item.enabled,
        sort_order: item.sortOrder,
        school_name: item.schoolName ?? null,
    }));

    const { error } = await supabase.from("import_interfaces").upsert(rows, { onConflict: "id" });
    if (error) return { error: `保存默认接口失败：${error.message}` };
    revalidatePath("/admin/settings");
    revalidatePath("/dashboard/profile");
    return { success: true };
}

export async function updateImportInterface(formData: FormData) {
    const parsed = updateImportInterfaceSchema.safeParse({
        id: formData.get("id"),
        enabled: formData.get("enabled") === "on",
        title: formData.get("title"),
        description: formData.get("description"),
        sortOrder: formData.get("sortOrder"),
    });

    if (!parsed.success) return { error: "请检查接口配置" };

    const current = normalizeImportInterfaces(await readImportInterfaceRows()).find((item) => item.id === parsed.data.id);
    if (!current) return { error: "接口不存在" };

    const supabase = await assertSuperAdmin();
    const { error } = await supabase.from("import_interfaces").upsert({
        id: current.id,
        category: current.category,
        adapter_key: current.adapterKey,
        title: parsed.data.title,
        description: parsed.data.description,
        input_label: current.inputLabel,
        upload_label: current.uploadLabel,
        placeholder: current.placeholder,
        hints: current.hints,
        accepted_file_types: current.acceptedFileTypes,
        enabled: parsed.data.enabled,
        sort_order: parsed.data.sortOrder,
        school_name: current.schoolName ?? null,
        updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

    if (error) return { error: `保存接口失败：${error.message}` };
    revalidatePath("/admin/settings");
    revalidatePath("/dashboard/profile");
    return { success: true };
}
