import { addDays, addWeeks, parseISO, setHours, setMinutes, startOfWeek } from "date-fns";
import type { CalendarEvent, Course, Schedule } from "@/lib/types";

/**
 * Given a semester's schedule config and course rows, expand all weekly
 * recurring course slots into concrete CalendarEvent instances.
 *
 * @param courses - Course rows from the DB for a given member
 * @param schedule - The schedule row (contains startDate, maxWeeks)
 * @param userId - Member's user ID
 * @param displayName - Member's display name
 * @param memberColor - Color assigned to this member in the room
 */
export function expandCourses(
    courses: Course[],
    schedule: Schedule,
    userId: string,
    displayName: string,
    memberColor: string
): CalendarEvent[] {
    const events: CalendarEvent[] = [];

    // WakeUp startDate is week 1's Monday
    // day_of_week: 1=Mon, 7=Sun (matches WakeUp convention)
    const semesterStart = parseISO(schedule.start_date);
    // Normalize to Monday of that week
    const week1Monday = startOfWeek(semesterStart, { weekStartsOn: 1 });

    for (const course of courses) {
        for (let week = course.start_week; week <= course.end_week; week++) {
            // Monday of the target week
            const weekMonday = addWeeks(week1Monday, week - 1);

            // day_of_week: 1=Mon(+0), 2=Tue(+1), ..., 7=Sun(+6)
            const dayOffset = course.day_of_week - 1;
            const courseDay = addDays(weekMonday, dayOffset);

            // Parse time strings "HH:MM"
            const startDate = applyTime(courseDay, course.start_time);
            const endDate = applyTime(courseDay, course.end_time);

            events.push({
                id: `${course.id}-w${week}`,
                title: `${displayName}: ${course.name}`,
                start: startDate,
                end: endDate,
                resource: {
                    userId,
                    displayName,
                    color: memberColor,
                    courseName: course.name,
                    room: course.room,
                    teacher: course.teacher,
                },
            });
        }
    }

    return events;
}

function applyTime(date: Date, timeStr: string): Date {
    const [h, m] = timeStr.split(":").map(Number);
    return setMinutes(setHours(new Date(date), h), m);
}

/**
 * Group events by date string "YYYY-MM-DD" for month view.
 */
export function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
        const key = ev.start.toISOString().slice(0, 10);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(ev);
    }
    return map;
}

/**
 * Get unique user IDs that have a course on a given date.
 */
export function getUsersOnDate(events: CalendarEvent[], date: Date): string[] {
    const dateStr = date.toISOString().slice(0, 10);
    const usersOnDate = new Set<string>();
    for (const ev of events) {
        if (ev.start.toISOString().slice(0, 10) === dateStr) {
            usersOnDate.add(ev.resource.userId);
        }
    }
    return Array.from(usersOnDate);
}
