export interface ParsedRescheduleNotice {
    courseName: string;
    startsAt: string;
    endsAt: string;
    room: string;
    teacher: string;
    note: string;
    warnings: string[];
}

const HEADER = "BumpFree Reschedule Notice v1";

export function getRescheduleNoticeTemplate(): string {
    return `${HEADER}\nDate: 2026-06-19\nTime: 14:00-16:00\nCourse: CST309 - Computer Networks and Communication\nTeacher: Li Jing\nRoom: A2#203\nNote: Single-class reschedule notice`;
}

export function getRescheduleAiPrompt(): string {
    return `\u8bf7\u628a\u8001\u5e08\u53d1\u5e03\u7684\u5355\u8282\u8bfe\u8c03\u8bfe\u901a\u77e5\u6574\u7406\u6210 BumpFree Reschedule Notice v1 \u683c\u5f0f\u3002\n\u8981\u6c42\uff1a\n- Date \u5fc5\u987b\u662f YYYY-MM-DD\uff0c\u4e0d\u80fd\u731c\u5c31\u95ee\u6211\n- Time \u5fc5\u987b\u662f 24 \u5c0f\u65f6\u5236 HH:mm-HH:mm\n- Course \u586b\u8bfe\u7a0b\u540d\n- Room/Teacher \u6ca1\u6709\u5c31\u7559\u7a7a\n- \u53ea\u8f93\u51fa\u53ef\u5bfc\u5165\u6587\u672c\uff0c\u4e0d\u8981\u89e3\u91ca\n\n\u539f\u59cb\u901a\u77e5\uff1a\n[\u7c98\u8d34\u5728\u8fd9\u91cc]`;
}

export function parseRescheduleNotice(input: string): ParsedRescheduleNotice {
    const text = normalize(input);
    if (!text.trim()) throw new Error("\u8bf7\u5148\u7c98\u8d34\u8c03\u8bfe\u901a\u77e5");
    const fields = parseFields(text.includes(HEADER) ? text.replace(HEADER, "") : text);
    const date = fields.get("date") || fields.get("\u65e5\u671f") || extractDate(text);
    if (!date) throw new Error("\u6ca1\u627e\u5230\u8c03\u8bfe\u65e5\u671f\uff0c\u8bf7\u4f7f\u7528 YYYY-MM-DD \u6216\u6807\u51c6\u683c\u5f0f");
    validateDate(date);
    const [startTime, endTime] = parseTimeRange(fields.get("time") || fields.get("\u65f6\u95f4") || text);
    const courseName = fields.get("course") || fields.get("name") || fields.get("\u8bfe\u7a0b") || inferCourseName(text);
    if (!courseName) throw new Error("\u6ca1\u627e\u5230\u8bfe\u7a0b\u540d\uff0c\u8bf7\u4f7f\u7528 Course: \u6807\u660e");
    const teacher = fields.get("teacher") || fields.get("\u8001\u5e08") || "";
    const room = fields.get("room") || fields.get("venue") || fields.get("\u6559\u5ba4") || "";
    const warnings: string[] = [];
    if (!teacher) warnings.push("\u672a\u8bc6\u522b\u4efb\u8bfe\u8001\u5e08");
    if (!room) warnings.push("\u672a\u8bc6\u522b\u6559\u5ba4");
    return { courseName: courseName.trim(), startsAt: `${date}T${startTime}:00+08:00`, endsAt: `${date}T${endTime}:00+08:00`, room: room.trim(), teacher: teacher.trim(), note: (fields.get("note") || text).slice(0, 500), warnings };
}

function normalize(input: string) { return input.replace(/\r\n?/g, "\n").replace(/[\uFF0D\u2013\u2014]/g, "-").replace(/\u00a0/g, " "); }
function parseFields(block: string): Map<string, string> {
    const fields = new Map<string, string>();
    for (const raw of block.split("\n")) {
        const match = raw.trim().match(/^([^:\uFF1A]+)[:\uFF1A]\s*(.*)$/);
        if (match) fields.set(match[1].trim().toLowerCase().replace(/\s+/g, ""), match[2].trim());
    }
    return fields;
}
function extractDate(text: string): string | null {
    const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
    if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
    const cn = text.match(/(?:(20\d{2})\s*\u5e74\s*)?(\d{1,2})\s*\u6708\s*(\d{1,2})\s*[\u65e5\u53f7]/);
    if (!cn) return null;
    return `${cn[1] || new Date().getFullYear()}-${cn[2].padStart(2, "0")}-${cn[3].padStart(2, "0")}`;
}
function inferCourseName(text: string): string {
    return text.match(/(?:\u8bfe\u7a0b|\u8bfe|course|name)\s*[:\uFF1A]?\s*([^\n,\uFF0C;\uFF1B]+)/i)?.[1]?.trim() || "";
}
function parseTimeRange(value: string): [string, string] {
    const match = value.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!match) throw new Error("\u6ca1\u627e\u5230\u4e0a\u8bfe\u65f6\u95f4");
    const start = clock(match[1], match[2] || "00", match[3], match[6]);
    const end = clock(match[4], match[5] || "00", match[6], match[3]);
    if (start >= end) throw new Error("\u7ed3\u675f\u65f6\u95f4\u5fc5\u987b\u665a\u4e8e\u5f00\u59cb\u65f6\u95f4");
    return [start, end];
}
function clock(hh: string, mm: string, marker?: string, fallback?: string): string {
    let hour = Number(hh); const minute = Number(mm); const period = (marker || fallback || "").toLowerCase();
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error("\u65f6\u95f4\u683c\u5f0f\u4e0d\u6b63\u786e");
    if (period === "pm" && hour < 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;
    if (hour < 0 || hour > 23) throw new Error("\u5c0f\u65f6\u5fc5\u987b\u5728 0-23 \u4e4b\u95f4");
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
function validateDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00+08:00`).getTime())) throw new Error("Date \u5fc5\u987b\u662f YYYY-MM-DD");
}
