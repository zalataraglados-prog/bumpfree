"use server";

import { createClient } from "@/lib/supabase/server";
import { parseTextSchedule, type ParsedTextSchedule, type TextScheduleImportMode } from "@/lib/utils/textSchedule";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const manualCourseSlotSchema = z.object({
    room: z.string().optional(),
    dayOfWeek: z.coerce.number().min(1).max(7),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    startWeek: z.coerce.number().min(1),
    endWeek: z.coerce.number().min(1),
}).refine((slot) => slot.endTime > slot.startTime, { message: "end_after_start" })
    .refine((slot) => slot.endWeek >= slot.startWeek, { message: "week_range" });

const manualCourseSchema = z.object({
    scheduleId: z.string().uuid(),
    name: z.string().min(1),
    room: z.string().optional(),
    teacher: z.string().optional(),
    dayOfWeek: z.coerce.number().min(1).max(7),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    startWeek: z.coerce.number().min(1),
    endWeek: z.coerce.number().min(1),
});

const addManualCourseSchema = z.object({
    scheduleId: z.string().uuid(),
    name: z.string().min(1),
    teacher: z.string().optional(),
    slots: z.array(manualCourseSlotSchema).min(1).max(12),
});

const updateCourseSchema = manualCourseSchema.extend({
    courseId: z.string().uuid(),
});

export async function importTextSchedule(text: string, importModeOverride?: TextScheduleImportMode) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "\u8bf7\u5148\u767b\u5f55" };
    if (text.length > 100_000) return { error: "\u6587\u672c\u8fc7\u957f" };

    let parsed: ParsedTextSchedule;
    try {
        parsed = parseTextSchedule(text);
    } catch (e) {
        return { error: e instanceof Error ? e.message : "\u89e3\u6790\u8bfe\u8868\u5931\u8d25" };
    }

    const importMode = importModeOverride ?? parsed.importMode;
    if (!["replace", "append", "new"].includes(importMode)) return { error: "\u5bfc\u5165\u65b9\u5f0f\u4e0d\u652f\u6301" };

    const { data: profile } = await supabase
        .from("profiles")
        .select("schedule_quota")
        .eq("id", user.id)
        .single();

    const { count: scheduleCount } = await supabase
        .from("schedules")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

    const { data: existingSchedule } = await supabase
        .from("schedules")
        .select("id")
        .eq("user_id", user.id)
        .eq("semester_tag", parsed.semesterTag)
        .maybeSingle();

    const needsNewSchedule = importMode === "new" || !existingSchedule;
    if (needsNewSchedule && profile && scheduleCount !== null && scheduleCount >= profile.schedule_quota) {
        return { error: `\u8bfe\u8868\u6570\u91cf\u5df2\u8fbe\u5230\u4e0a\u9650\uff1a${profile.schedule_quota} \u4efd` };
    }

    let schedule: { id: string } | null = null;
    let semesterTag = parsed.semesterTag;

    if (importMode === "new") {
        semesterTag = await getUniqueSemesterTag(user.id, parsed.semesterTag);
        const { data, error } = await supabase
            .from("schedules")
            .insert({
                user_id: user.id,
                semester_tag: semesterTag,
                school: parsed.school,
                start_date: parsed.startDate,
                max_weeks: parsed.maxWeeks,
                is_active: true,
                wakeup_raw: null,
            })
            .select("id")
            .single();
        if (error || !data) return { error: `\u4fdd\u5b58\u8bfe\u8868\u5931\u8d25\uff1a${error?.message || "\u672a\u77e5\u9519\u8bef"}` };
        schedule = data;
    } else if (existingSchedule) {
        const { data, error } = await supabase
            .from("schedules")
            .update({
                school: parsed.school,
                start_date: parsed.startDate,
                max_weeks: parsed.maxWeeks,
                is_active: true,
                wakeup_raw: null,
                imported_at: new Date().toISOString(),
            })
            .eq("id", existingSchedule.id)
            .select("id")
            .single();
        if (error || !data) return { error: `\u4fdd\u5b58\u8bfe\u8868\u5931\u8d25\uff1a${error?.message || "\u672a\u77e5\u9519\u8bef"}` };
        schedule = data;
        if (importMode === "replace") {
            const { error: deleteErr } = await supabase.from("courses").delete().eq("schedule_id", schedule.id);
            if (deleteErr) return { error: `\u6e05\u7406\u65e7\u8bfe\u7a0b\u5931\u8d25\uff1a${deleteErr.message}` };
        }
    } else {
        const { data, error } = await supabase
            .from("schedules")
            .insert({
                user_id: user.id,
                semester_tag: semesterTag,
                school: parsed.school,
                start_date: parsed.startDate,
                max_weeks: parsed.maxWeeks,
                is_active: true,
                wakeup_raw: null,
            })
            .select("id")
            .single();
        if (error || !data) return { error: `\u4fdd\u5b58\u8bfe\u8868\u5931\u8d25\uff1a${error?.message || "\u672a\u77e5\u9519\u8bef"}` };
        schedule = data;
    }

    const courseRows = parsed.courses.map((course) => ({
        schedule_id: schedule!.id,
        user_id: user.id,
        name: course.name,
        room: course.room || null,
        teacher: course.teacher || null,
        day_of_week: course.dayOfWeek,
        start_time: course.startTime,
        end_time: course.endTime,
        start_week: course.startWeek,
        end_week: course.endWeek,
        color: course.color,
    }));

    const { error: insertErr } = await supabase.from("courses").insert(courseRows);
    if (insertErr) return { error: `\u5bfc\u5165\u8bfe\u7a0b\u5931\u8d25\uff1a${insertErr.message}` };

    revalidatePath("/dashboard/profile");
    return {
        success: true,
        semesterTag,
        courseCount: courseRows.length,
        warnings: parsed.warnings,
    };
}

async function getUniqueSemesterTag(userId: string, baseTag: string) {
    const supabase = await createClient();
    const { data } = await supabase
        .from("schedules")
        .select("semester_tag")
        .eq("user_id", userId)
        .like("semester_tag", `${baseTag}%`);
    const existing = new Set((data ?? []).map((row) => row.semester_tag));
    if (!existing.has(baseTag)) return baseTag;
    let index = 2;
    while (existing.has(`${baseTag} copy ${index}`)) index += 1;
    return `${baseTag} copy ${index}`;
}

/**
 * Manually add a single course to an existing schedule.
 */
export async function addManualCourse(formData: FormData) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "\u8bf7\u5148\u767b\u5f55" };

    const parsed = addManualCourseSchema.safeParse({
        scheduleId: formData.get("scheduleId"),
        name: formData.get("name"),
        teacher: formData.get("teacher"),
        slots: parseManualCourseSlots(formData),
    });

    if (!parsed.success) return { error: "\u8bf7\u68c0\u67e5\u8bfe\u7a0b\u65f6\u95f4\u6bb5" };

    const rows = parsed.data.slots.map((slot) => ({
        schedule_id: parsed.data.scheduleId,
        user_id: user.id,
        name: parsed.data.name,
        room: slot.room || null,
        teacher: parsed.data.teacher || null,
        day_of_week: slot.dayOfWeek,
        start_time: slot.startTime,
        end_time: slot.endTime,
        start_week: slot.startWeek,
        end_week: slot.endWeek,
    }));

    const { error } = await supabase.from("courses").insert(rows);
    if (error) return { error: `\u6dfb\u52a0\u8bfe\u7a0b\u5931\u8d25\uff1a${error.message}` };
    revalidatePath("/dashboard/profile");
    return { success: true, courseCount: rows.length };
}

function parseManualCourseSlots(formData: FormData) {
    const slotsJson = formData.get("slotsJson");
    if (typeof slotsJson === "string" && slotsJson.trim()) {
        try {
            const parsed = JSON.parse(slotsJson) as unknown;
            if (Array.isArray(parsed)) return parsed;
        } catch {
            return [];
        }
    }

    return [{
        room: formData.get("room"),
        dayOfWeek: formData.get("dayOfWeek"),
        startTime: formData.get("startTime"),
        endTime: formData.get("endTime"),
        startWeek: formData.get("startWeek"),
        endWeek: formData.get("endWeek"),
    }];
}

/**
 * Update a single course by ID.
 */
export async function updateCourse(formData: FormData) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "请先登录" };

    const parsed = updateCourseSchema.safeParse({
        courseId: formData.get("courseId"),
        scheduleId: formData.get("scheduleId"),
        name: formData.get("name"),
        room: formData.get("room"),
        teacher: formData.get("teacher"),
        dayOfWeek: formData.get("dayOfWeek"),
        startTime: formData.get("startTime"),
        endTime: formData.get("endTime"),
        startWeek: formData.get("startWeek"),
        endWeek: formData.get("endWeek"),
    });

    if (!parsed.success) return { error: "请检查输入格式" };

    const { error } = await supabase
        .from("courses")
        .update({
            schedule_id: parsed.data.scheduleId,
            name: parsed.data.name,
            room: parsed.data.room || null,
            teacher: parsed.data.teacher || null,
            day_of_week: parsed.data.dayOfWeek,
            start_time: parsed.data.startTime,
            end_time: parsed.data.endTime,
            start_week: parsed.data.startWeek,
            end_week: parsed.data.endWeek,
        })
        .eq("id", parsed.data.courseId)
        .eq("user_id", user.id);

    if (error) return { error: "更新课程失败" };
    revalidatePath("/dashboard/profile");
    return { success: true };
}

/**
 * Delete a course by ID.
 */
export async function deleteCourse(courseId: string) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "请先登录" };

    const { error } = await supabase
        .from("courses")
        .delete()
        .eq("id", courseId)
        .eq("user_id", user.id);

    if (error) return { error: "删除失败" };
    revalidatePath("/dashboard/profile");
    return { success: true };
}

/**
 * Get all schedules for the current user.
 */
export async function getMySchedules() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data } = await supabase
        .from("schedules")
        .select("*, courses(*)")
        .eq("user_id", user.id)
        .order("imported_at", { ascending: false });

    return data ?? [];
}

/**
 * Set a schedule as active (deactivates others).
 */
export async function setActiveSchedule(scheduleId: string) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "请先登录" };

    // Deactivate all
    await supabase
        .from("schedules")
        .update({ is_active: false })
        .eq("user_id", user.id);

    // Activate target
    const { error } = await supabase
        .from("schedules")
        .update({ is_active: true })
        .eq("id", scheduleId)
        .eq("user_id", user.id);

    if (error) return { error: "更新失败" };
    revalidatePath("/dashboard/profile");
    return { success: true };
}

/**
 * Delete an entire schedule and its courses.
 */
export async function deleteSchedule(scheduleId: string) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "请先登录" };

    const { error } = await supabase
        .from("schedules")
        .delete()
        .eq("id", scheduleId)
        .eq("user_id", user.id);

    if (error) return { error: "删除课表失败" };

    // Attempt to make another schedule active if one exists
    const { data: remainingSchedules } = await supabase
        .from("schedules")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

    if (remainingSchedules && remainingSchedules.length > 0) {
        await setActiveSchedule(remainingSchedules[0].id);
    }

    revalidatePath("/dashboard/profile");
    return { success: true };
}
