"use server";

import { createClient } from "@/lib/supabase/server";
import { parseTextSchedule, type ParsedTextSchedule, type TextScheduleImportMode } from "@/lib/utils/textSchedule";
import { revalidatePath } from "next/cache";
import { z } from "zod";

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

const updateCourseSchema = manualCourseSchema.extend({
    courseId: z.string().uuid(),
});

export async function importTextSchedule(text: string, importModeOverride?: TextScheduleImportMode) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "????" };
    if (text.length > 100_000) return { error: "??????" };

    let parsed: ParsedTextSchedule;
    try {
        parsed = parseTextSchedule(text);
    } catch (e) {
        return { error: e instanceof Error ? e.message : "????????" };
    }

    const importMode = importModeOverride ?? parsed.importMode;
    if (!["replace", "append", "new"].includes(importMode)) return { error: "???????" };

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
        return { error: `??????????${profile.schedule_quota} ??` };
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
        if (error || !data) return { error: `???????${error?.message || "????"}` };
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
        if (error || !data) return { error: `???????${error?.message || "????"}` };
        schedule = data;
        if (importMode === "replace") {
            const { error: deleteErr } = await supabase.from("courses").delete().eq("schedule_id", schedule.id);
            if (deleteErr) return { error: `?????????${deleteErr.message}` };
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
        if (error || !data) return { error: `???????${error?.message || "????"}` };
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
    if (insertErr) return { error: `???????${insertErr.message}` };

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
    if (!user) return { error: "请先登录" };

    const parsed = manualCourseSchema.safeParse({
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

    const { error } = await supabase.from("courses").insert({
        schedule_id: parsed.data.scheduleId,
        user_id: user.id,
        name: parsed.data.name,
        room: parsed.data.room || null,
        teacher: parsed.data.teacher || null,
        day_of_week: parsed.data.dayOfWeek,
        start_time: parsed.data.startTime,
        end_time: parsed.data.endTime,
        start_week: parsed.data.startWeek,
        end_week: parsed.data.endWeek,
    });

    if (error) return { error: "添加课程失败" };
    revalidatePath("/dashboard/profile");
    return { success: true };
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
