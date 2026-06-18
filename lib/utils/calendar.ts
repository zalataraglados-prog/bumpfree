import { addDays, addWeeks, parseISO, setHours, setMinutes, startOfWeek } from "date-fns";
import type { BusyBlock, CalendarEvent, Course, MalaysiaHoliday, Schedule } from "@/lib/types";

export function expandCourses(courses: Course[], schedule: Schedule, userId: string, displayName: string, memberColor: string): CalendarEvent[] {
    const events: CalendarEvent[] = [];
    const week1Monday = startOfWeek(parseISO(schedule.start_date), { weekStartsOn: 1 });
    for (const course of courses) {
        for (let week = course.start_week; week <= course.end_week; week++) {
            const courseDay = addDays(addWeeks(week1Monday, week - 1), course.day_of_week - 1);
            events.push({
                id: `${course.id}-w${week}`,
                title: `${displayName}: ${course.name}`,
                start: applyTime(courseDay, course.start_time),
                end: applyTime(courseDay, course.end_time),
                resource: { kind: "course", userId, displayName, color: memberColor, courseName: course.name, room: course.room, teacher: course.teacher },
            });
        }
    }
    return events;
}

export function expandBusyBlocks(blocks: BusyBlock[], userId: string, displayName: string, memberColor: string): CalendarEvent[] {
    return blocks.map((block) => ({
        id: block.id,
        title: `${displayName}: ${block.title}`,
        start: new Date(block.starts_at),
        end: new Date(block.ends_at),
        resource: { kind: "busy", userId, displayName, color: memberColor, courseName: block.title, room: null, teacher: null, note: block.note },
    }));
}

export function expandMalaysiaHolidays(holidays: MalaysiaHoliday[]): CalendarEvent[] {
    return holidays.map((holiday) => ({
        id: holiday.id,
        title: holiday.localName || holiday.name,
        start: new Date(`${holiday.date}T07:00:00+08:00`),
        end: new Date(`${holiday.date}T22:00:00+08:00`),
        resource: { kind: "holiday", userId: "holiday-my", displayName: "MY", color: "#64748b", courseName: holiday.localName || holiday.name, room: null, teacher: null, note: holiday.name },
    }));
}

function applyTime(date: Date, timeStr: string): Date {
    const [h, m] = timeStr.split(":").map(Number);
    return setMinutes(setHours(new Date(date), h), m);
}

export function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
        const key = ev.start.toISOString().slice(0, 10);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(ev);
    }
    return map;
}

export function getUsersOnDate(events: CalendarEvent[], date: Date): string[] {
    const dateStr = date.toISOString().slice(0, 10);
    const usersOnDate = new Set<string>();
    for (const ev of events) if (ev.start.toISOString().slice(0, 10) === dateStr) usersOnDate.add(ev.resource.userId);
    return Array.from(usersOnDate);
}
