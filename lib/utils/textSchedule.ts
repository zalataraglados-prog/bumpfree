import { MEMBER_COLORS } from "@/lib/utils/colors";

export type TextScheduleImportMode = "replace" | "append" | "new";

export interface TextScheduleCourse {
    name: string;
    teacher: string;
    room: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    startWeek: number;
    endWeek: number;
    note?: string;
    color: string;
}

export interface ParsedTextSchedule {
    format: "strict" | "loose";
    semesterTag: string;
    startDate: string;
    timezone: string;
    maxWeeks: number;
    school: string;
    importMode: TextScheduleImportMode;
    courses: TextScheduleCourse[];
    warnings: string[];
}

const DAY_MAP: Record<string, number> = {
    monday: 1,
    mon: 1,
    "\u5468\u4e00": 1,
    "\u661f\u671f\u4e00": 1,
    tuesday: 2,
    tue: 2,
    "\u5468\u4e8c": 2,
    "\u661f\u671f\u4e8c": 2,
    wednesday: 3,
    wed: 3,
    "\u5468\u4e09": 3,
    "\u661f\u671f\u4e09": 3,
    thursday: 4,
    thu: 4,
    "\u5468\u56db": 4,
    "\u661f\u671f\u56db": 4,
    friday: 5,
    fri: 5,
    "\u5468\u4e94": 5,
    "\u661f\u671f\u4e94": 5,
    saturday: 6,
    sat: 6,
    "\u5468\u516d": 6,
    "\u661f\u671f\u516d": 6,
    sunday: 7,
    sun: 7,
    "\u5468\u65e5": 7,
    "\u5468\u5929": 7,
    "\u661f\u671f\u65e5": 7,
    "\u661f\u671f\u5929": 7,
};

const STRICT_HEADER = "BumpFree Schedule Import v1";

export function parseTextSchedule(input: string): ParsedTextSchedule {
    const text = normalizeText(input);
    if (!text.trim()) throw new Error("\u8bf7\u5148\u7c98\u8d34\u8bfe\u8868\u6587\u672c");
    return text.includes(STRICT_HEADER) ? parseStrictSchedule(text) : parseLooseSchedule(text);
}

export function getScheduleTemplate(): string {
    return `${STRICT_HEADER}
Semester: 2026/04
StartDate: 2026-04-06
Timezone: Asia/Shanghai
MaxWeeks: 14
School: Manual Import
ImportMode: replace

---
Day: Monday
Time: 10:00-12:00
Name: CST402* - ARM Assembly Language
Teacher: Mohammed N. M. Ali
Room: A3#602
Weeks: 1-14

---
Day: Monday
Time: 13:00-14:00
Name: CST402* - ARM Assembly Language
Teacher: Mohammed N. M. Ali
Room: A1#G10
Weeks: 1-14`;
}

export function getAiCleanupPrompt(): string {
    return `\u8bf7\u628a\u4e0b\u9762\u7684\u8bfe\u8868\u6574\u7406\u6210 BumpFree Schedule Import v1 \u683c\u5f0f\u3002
\u8981\u6c42\uff1a
- StartDate \u662f\u7b2c 1 \u5468\u5468\u4e00\uff0c\u82e5\u539f\u6587\u6ca1\u6709\u8bf7\u5411\u6211\u786e\u8ba4\uff0c\u4e0d\u8981\u731c
- \u6bcf\u4e2a\u4e0a\u8bfe\u65f6\u95f4\u6bb5\u5355\u72ec\u4e00\u4e2a\u8bfe\u7a0b\u5757
- Day \u4f7f\u7528\u82f1\u6587 Monday-Sunday
- Time \u4f7f\u7528 24 \u5c0f\u65f6\u5236 HH:mm-HH:mm
- Weeks \u4f7f\u7528 1-14 \u6216 1-8,10-14 \u683c\u5f0f
- \u4e0d\u8981\u6dfb\u52a0\u89e3\u91ca\uff0c\u53ea\u8f93\u51fa\u53ef\u5bfc\u5165\u6587\u672c

\u539f\u59cb\u8bfe\u8868\uff1a
[\u7c98\u8d34\u5728\u8fd9\u91cc]`;
}

function parseStrictSchedule(text: string): ParsedTextSchedule {
    const warnings: string[] = [];
    const parts = text.split(/^---\s*$/m).map((part) => part.trim()).filter(Boolean);
    const header = parts.shift();
    if (!header?.includes(STRICT_HEADER)) throw new Error("\u7f3a\u5c11 BumpFree Schedule Import v1 \u6807\u5934");

    const globalFields = parseFields(header.replace(STRICT_HEADER, ""));
    const semesterTag = requireField(globalFields, "semester", "Semester");
    const startDate = requireField(globalFields, "startdate", "StartDate");
    validateIsoDate(startDate, "StartDate");

    const timezone = globalFields.get("timezone") || "Asia/Shanghai";
    const school = globalFields.get("school") || "Manual Import";
    const importMode = parseImportMode(globalFields.get("importmode"));
    const courses = parts.flatMap((block, index) => parseStrictCourseBlock(block, index + 1));
    if (courses.length === 0) throw new Error("\u6ca1\u6709\u8bc6\u522b\u5230\u8bfe\u7a0b");

    const inferredMaxWeek = Math.max(...courses.map((course) => course.endWeek));
    const maxWeeks = parsePositiveInt(globalFields.get("maxweeks") || String(inferredMaxWeek), "MaxWeeks");
    for (const course of courses) {
        if (course.endWeek > maxWeeks) throw new Error(`\u8bfe\u7a0b${course.name}\u7684\u5468\u6b21\u8d85\u8fc7 MaxWeeks`);
    }

    return { format: "strict", semesterTag, startDate, timezone, maxWeeks, school, importMode, courses, warnings };
}

function parseStrictCourseBlock(block: string, blockIndex: number): TextScheduleCourse[] {
    const fields = parseFields(block);
    const dayOfWeek = parseDay(requireField(fields, "day", `\u7b2c ${blockIndex} \u4e2a\u8bfe\u7a0b\u5757\u7f3a\u5c11 Day`));
    const [startTime, endTime] = parseTimeRange(requireField(fields, "time", `\u7b2c ${blockIndex} \u4e2a\u8bfe\u7a0b\u5757\u7f3a\u5c11 Time`));
    const name = requireField(fields, "name", `\u7b2c ${blockIndex} \u4e2a\u8bfe\u7a0b\u5757\u7f3a\u5c11 Name`);
    const teacher = fields.get("teacher") || "";
    const room = fields.get("room") || "";
    const note = fields.get("note") || undefined;
    const ranges = parseWeeks(requireField(fields, "weeks", `\u7b2c ${blockIndex} \u4e2a\u8bfe\u7a0b\u5757\u7f3a\u5c11 Weeks`));
    const color = parseColor(fields.get("color")) || colorForCourse(name);

    return ranges.map(([startWeek, endWeek]) => ({ name, teacher, room, dayOfWeek, startTime, endTime, startWeek, endWeek, note, color }));
}

function parseLooseSchedule(text: string): ParsedTextSchedule {
    const warnings: string[] = [];
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    const semesterLine = lines.find((line) => /^semester\s*[:\uFF1A]/i.test(line));
    if (!semesterLine) throw new Error("\u7f3a\u5c11 Semester \u5b57\u6bb5");
    const semesterTag = valueAfterColon(semesterLine);
    if (!semesterTag) throw new Error("Semester \u4e0d\u80fd\u4e3a\u7a7a");

    let startDate = "";
    const startDateLine = lines.find((line) => /^startdate\s*[:\uFF1A]/i.test(line));
    if (startDateLine) {
        startDate = valueAfterColon(startDateLine);
        validateIsoDate(startDate, "StartDate");
    } else {
        startDate = inferFirstMondayFromSemester(semesterTag);
        warnings.push(`\u672a\u63d0\u4f9b StartDate\uff0c\u5df2\u6839\u636e ${semesterTag} \u63a8\u65ad\u7b2c\u4e00\u4e2a\u5468\u4e00\u4e3a ${startDate}`);
    }

    const courses: TextScheduleCourse[] = [];
    let currentDay: number | null = null;

    for (let i = 0; i < lines.length; i++) {
        const compactCourse = parseCompactCourseLine(lines[i]);
        if (compactCourse) {
            courses.push(...compactCourse);
            continue;
        }

        const maybeDay = parseDayOrNull(lines[i]);
        if (maybeDay) {
            currentDay = maybeDay;
            continue;
        }
        if (!currentDay || !looksLikeTimeRange(lines[i])) {
            const orphanTail = parseCourseTail(lines[i]);
            const nextCompact = parseCompactCourseParts(lines[i + 1] || "");
            if (orphanTail && nextCompact && orphanTail.name === nextCompact.tail.name && orphanTail.room === nextCompact.tail.room) {
                for (const [startWeek, endWeek] of parseWeeks(orphanTail.weeks)) {
                    courses.push({ name: orphanTail.name, teacher: "", room: orphanTail.room, dayOfWeek: nextCompact.dayOfWeek, startTime: nextCompact.startTime, endTime: nextCompact.endTime, startWeek, endWeek, color: colorForCourse(orphanTail.name) });
                }
                continue;
            }
            if (orphanTail && !isMetadataLine(lines[i])) {
                warnings.push(`已跳过信息不完整的行：${lines[i]}（缺少星期和时间）`);
            }
            continue;
        }

        const [startTime, endTime] = parseTimeRange(lines[i]);
        const compactTail = parseCourseTail(lines[i + 1] || "");
        if (compactTail) {
            for (const [startWeek, endWeek] of parseWeeks(compactTail.weeks)) {
                courses.push({ name: compactTail.name, teacher: "", room: compactTail.room, dayOfWeek: currentDay, startTime, endTime, startWeek, endWeek, color: colorForCourse(compactTail.name) });
            }
            i += 1;
            continue;
        }

        const name = lines[i + 1]?.trim();
        if (!name || isMetadataLine(name) || looksLikeTimeRange(name)) throw new Error(`\u7b2c ${i + 1} \u884c\u65f6\u95f4\u540e\u7f3a\u5c11\u8bfe\u7a0b\u540d`);

        const teacherLine = lines[i + 2] || "";
        const roomLine = lines[i + 3] || "";
        const weekLine = lines[i + 4] || "";
        const teacher = /^lecturer\s*[:\uFF1A]|^teacher\s*[:\uFF1A]/i.test(teacherLine) ? valueAfterColon(teacherLine) : "";
        const room = /^venue\s*[:\uFF1A]|^room\s*[:\uFF1A]/i.test(roomLine) ? valueAfterColon(roomLine) : "";
        if (!/^week\s*[:\uFF1A]|^weeks\s*[:\uFF1A]/i.test(weekLine)) throw new Error(`\u8bfe\u7a0b${name}\u7f3a\u5c11 Week \u5b57\u6bb5`);

        const ranges = parseWeeks(valueAfterColon(weekLine));
        const cleanName = name.replace(/\s+[\u2014-]\s+/g, " - ");
        for (const [startWeek, endWeek] of ranges) {
            courses.push({ name: cleanName, teacher, room, dayOfWeek: currentDay, startTime, endTime, startWeek, endWeek, color: colorForCourse(cleanName) });
        }
        i += 4;
    }

    if (courses.length === 0) throw new Error("\u6ca1\u6709\u8bc6\u522b\u5230\u53ef\u5bfc\u5165\u8bfe\u7a0b\uff1b\u677e\u6563\u683c\u5f0f\u81f3\u5c11\u9700\u8981 Semester\u3001\u661f\u671f\u3001\u65f6\u95f4\u3001\u8bfe\u7a0b\u540d\u548c\u5468\u6b21");
    const maxWeeks = Math.max(...courses.map((course) => course.endWeek));
    return { format: "loose", semesterTag, startDate, timezone: "Asia/Shanghai", maxWeeks, school: "Manual Import", importMode: "replace", courses, warnings };
}

function normalizeText(input: string): string {
    return input.replace(/\r\n?/g, "\n").replace(/[\uFF0D\u2013\u2014]/g, "-").replace(/\u00a0/g, " ");
}

function parseFields(block: string): Map<string, string> {
    const fields = new Map<string, string>();
    for (const rawLine of block.split("\n")) {
        const line = rawLine.trim();
        if (!line || line === STRICT_HEADER) continue;
        const match = line.match(/^([^:\uFF1A]+)[:\uFF1A]\s*(.*)$/);
        if (!match) continue;
        fields.set(match[1].trim().toLowerCase().replace(/\s+/g, ""), match[2].trim());
    }
    return fields;
}

function requireField(fields: Map<string, string>, key: string, label: string): string {
    const value = fields.get(key)?.trim();
    if (!value) throw new Error(`${label} \u4e0d\u80fd\u4e3a\u7a7a`);
    return value;
}

function parseImportMode(value: string | undefined): TextScheduleImportMode {
    if (!value) return "replace";
    const normalized = value.trim().toLowerCase();
    if (normalized === "replace" || normalized === "append" || normalized === "new") return normalized;
    throw new Error("ImportMode \u53ea\u80fd\u662f replace\u3001append \u6216 new");
}

function parseDay(value: string): number {
    const day = parseDayOrNull(value);
    if (!day) throw new Error(`\u65e0\u6cd5\u8bc6\u522b\u5468\u6b21\uff1a${value}`);
    return day;
}

function parseDayOrNull(value: string): number | null {
    const normalized = value.trim().toLowerCase();
    return DAY_MAP[normalized] ?? null;
}

function parseCompactCourseLine(line: string): TextScheduleCourse[] | null {
    const parts = parseCompactCourseParts(line);
    if (!parts) return null;
    return parseWeeks(parts.tail.weeks).map(([startWeek, endWeek]) => ({
        name: parts.tail.name,
        teacher: "",
        room: parts.tail.room,
        dayOfWeek: parts.dayOfWeek,
        startTime: parts.startTime,
        endTime: parts.endTime,
        startWeek,
        endWeek,
        color: colorForCourse(parts.tail.name),
    }));
}

function parseCompactCourseParts(line: string): { dayOfWeek: number; startTime: string; endTime: string; tail: { name: string; room: string; weeks: string } } | null {
    const dayPattern = "(?:\\u5468[\\u4e00\\u4e8c\\u4e09\\u56db\\u4e94\\u516d\\u65e5\\u5929]|\\u661f\\u671f[\\u4e00\\u4e8c\\u4e09\\u56db\\u4e94\\u516d\\u65e5\\u5929]|monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat|sunday|sun)";
    const timePattern = "(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?\\s*-\\s*\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?)";
    const match = line.match(new RegExp(`^(${dayPattern})\\s*${timePattern}\\s*(.+)$`, "i"));
    if (!match) return null;
    const dayOfWeek = parseDay(match[1]);
    const [startTime, endTime] = parseTimeRange(match[2]);
    const tail = parseCourseTail(match[3]);
    if (!tail) return null;
    return { dayOfWeek, startTime, endTime, tail };
}

function parseCourseTail(value: string): { name: string; room: string; weeks: string } | null {
    const normalized = value.trim();
    const weekSuffix = findWeekSuffix(normalized);
    if (!weekSuffix) return null;
    const beforeWeeks = normalized.slice(0, weekSuffix.index).trim();
    if (!beforeWeeks) return null;
    const roomMatch = beforeWeeks.match(/^(.*)([A-Z][A-Za-z0-9]*#?[A-Za-z0-9]+)$/);
    const name = (roomMatch ? roomMatch[1] : beforeWeeks).trim();
    const room = (roomMatch ? roomMatch[2] : "").trim();
    if (!name) return null;
    return { name: name.replace(/\s+[\u2014-]\s+/g, " - "), room, weeks: weekSuffix.weeks };
}

function findWeekSuffix(value: string): { weeks: string; index: number } | null {
    for (let index = 0; index < value.length; index++) {
        const suffix = value.slice(index).trim().replace(/\s+/g, "").replace(/\u5468$/, "");
        if (!/^\d{1,2}-\d{1,2}(?:,\d{1,2}-\d{1,2})*$|^\d{1,2}$/.test(suffix)) continue;
        if (isPlausibleWeekList(suffix)) return { weeks: suffix, index };
    }
    return null;
}

function isPlausibleWeekList(value: string): boolean {
    for (const part of value.split(",")) {
        const [startText, endText = startText] = part.split("-");
        const start = Number(startText);
        const end = Number(endText);
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > 30) return false;
    }
    return true;
}

function parseTimeRange(value: string): [string, string] {
    const match = value.trim().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!match) throw new Error(`\u65e0\u6cd5\u8bc6\u522b\u65f6\u95f4\uff1a${value}`);
    const start = normalizeClock(match[1], match[2] || "00", match[3], match[6]);
    const end = normalizeClock(match[4], match[5] || "00", match[6], match[3]);
    if (start >= end) throw new Error(`\u7ed3\u675f\u65f6\u95f4\u5fc5\u987b\u665a\u4e8e\u5f00\u59cb\u65f6\u95f4\uff1a${value}`);
    return [start, end];
}

function normalizeClock(hourText: string, minuteText: string, marker: string | undefined, fallbackMarker: string | undefined): string {
    let hour = Number(hourText);
    const minute = Number(minuteText);
    const period = (marker || fallbackMarker || "").toLowerCase();
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error("\u65f6\u95f4\u683c\u5f0f\u4e0d\u6b63\u786e");
    if (period === "pm" && hour < 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;
    if (hour < 0 || hour > 23) throw new Error("\u5c0f\u65f6\u5fc5\u987b\u5728 0-23 \u4e4b\u95f4");
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function looksLikeTimeRange(value: string): boolean {
    return /\d{1,2}(?::\d{2})?\s*(am|pm)?\s*-\s*\d{1,2}(?::\d{2})?\s*(am|pm)?/i.test(value);
}

function parseWeeks(value: string): [number, number][] {
    const normalized = value.trim().toLowerCase();
    const parity = /\bodd\b|\u5355\u5468/.test(normalized) ? "odd" : /\beven\b|\u53cc\u5468/.test(normalized) ? "even" : null;
    const body = normalized.replace(/\bodd\b|\beven\b|\u5355\u5468|\u53cc\u5468/g, "").trim();
    const ranges: [number, number][] = [];

    for (const part of body.split(",").map((item) => item.trim()).filter(Boolean)) {
        const rangeMatch = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
        if (!rangeMatch) throw new Error(`\u65e0\u6cd5\u8bc6\u522b\u5468\u6b21\uff1a${value}`);
        const start = Number(rangeMatch[1]);
        const end = Number(rangeMatch[2] || rangeMatch[1]);
        if (start < 1 || end < start) throw new Error(`\u5468\u6b21\u8303\u56f4\u4e0d\u6b63\u786e\uff1a${value}`);
        if (parity) {
            for (let week = start; week <= end; week++) {
                if ((parity === "odd" && week % 2 === 1) || (parity === "even" && week % 2 === 0)) ranges.push([week, week]);
            }
        } else {
            ranges.push([start, end]);
        }
    }
    if (ranges.length === 0) throw new Error(`\u65e0\u6cd5\u8bc6\u522b\u5468\u6b21\uff1a${value}`);
    return ranges;
}

function parsePositiveInt(value: string, label: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} \u5fc5\u987b\u662f\u6b63\u6574\u6570`);
    return parsed;
}

function validateIsoDate(value: string, label: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00`).getTime())) throw new Error(`${label} \u5fc5\u987b\u662f YYYY-MM-DD \u683c\u5f0f`);
}

function parseColor(value: string | undefined): string | null {
    if (!value) return null;
    if (!/^#[0-9a-f]{6}$/i.test(value.trim())) throw new Error(`Color \u5fc5\u987b\u662f #rrggbb \u683c\u5f0f\uff1a${value}`);
    return value.trim().toLowerCase();
}

function colorForCourse(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    return MEMBER_COLORS[Math.abs(hash) % MEMBER_COLORS.length];
}

function valueAfterColon(line: string): string {
    return line.replace(/^[^:\uFF1A]+[:\uFF1A]\s*/, "").trim();
}

function isMetadataLine(line: string): boolean {
    return /^[a-z]+\s*[:\uFF1A]|^[\u4e00-\u9fa5]+\s*[:\uFF1A]/i.test(line);
}

function inferFirstMondayFromSemester(semesterTag: string): string {
    const match = semesterTag.match(/(\d{4})\D+(\d{1,2})/);
    if (!match) throw new Error("\u7f3a\u5c11 StartDate\uff0c\u4e14\u65e0\u6cd5\u4ece Semester \u63a8\u65ad");
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const date = new Date(year, monthIndex, 1);
    while (date.getDay() !== 1) date.setDate(date.getDate() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
