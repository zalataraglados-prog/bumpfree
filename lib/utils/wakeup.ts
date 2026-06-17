// WakeUp API response parser
// API: https://i.wakeup.fun/share_schedule/get?key={key}
// Response is multiple JSON segments separated by newlines

export interface WakeUpTimeNode {
    node: number;
    startTime: string; // "HH:MM"
    endTime: string;
    timeTable: number;
}

export interface WakeUpCourse {
    id: number;
    courseName: string;
    color: string; // "#aarrggbb" format
}

export interface WakeUpCourseSlot {
    id: number; // references WakeUpCourse.id
    day: number; // 1=Mon, 2=Tue, ..., 7=Sun
    startNode: number;
    step: number; // number of nodes
    startWeek: number;
    endWeek: number;
    room: string;
    teacher: string;
    ownTime: boolean;
    startTime: string;
    endTime: string;
    tableId: number;
    level: number;
    type: number;
}

export interface WakeUpTableConfig {
    startDate: string; // "YYYY-M-D"
    maxWeek: number;
    school: string;
    tableName: string;
    showSat: boolean;
    showSun: boolean;
    sundayFirst: boolean;
}

export interface ParsedCourse {
    name: string;
    room: string;
    teacher: string;
    dayOfWeek: number; // 1=Mon, 7=Sun
    startTime: string; // "HH:MM"
    endTime: string;
    startWeek: number;
    endWeek: number;
    color: string; // hex color from WakeUp (converted from ARGB)
}

export interface ParsedSchedule {
    semesterTag: string;
    school: string;
    startDate: string; // ISO "YYYY-MM-DD"
    maxWeeks: number;
    courses: ParsedCourse[];
}

/**
 * Convert WakeUp ARGB hex (#aarrggbb) to CSS hex (#rrggbb)
 */
function argbToCssHex(argb: string): string {
    // argb format: "#ffff1744" → remove # and first 2 chars (alpha)
    const cleaned = argb.replace("#", "");
    if (cleaned.length === 8) {
        return `#${cleaned.slice(2)}`;
    }
    return argb;
}

/**
 * Parse the WakeUp share API response into structured schedule data.
 * The response body contains multiple JSON segments separated by "\n".
 */
export function parseWakeUpResponse(rawText: string): ParsedSchedule {
    // Split into non-empty lines and parse each as JSON
    const lines = rawText
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

    if (lines.length < 5) {
        throw new Error("Invalid WakeUp API response: insufficient segments");
    }

    // Segment 2: time nodes array
    const timeNodes: WakeUpTimeNode[] = JSON.parse(lines[1]);

    // Segment 3: table config
    const tableConfig: WakeUpTableConfig = JSON.parse(lines[2]);

    // Segment 4: course list (maps id → course info)
    const courseList: WakeUpCourse[] = JSON.parse(lines[3]);
    const courseMap = new Map<number, WakeUpCourse>(
        courseList.map((c) => [c.id, c])
    );

    // Segment 5: course slots
    const courseSlots: WakeUpCourseSlot[] = JSON.parse(lines[4]);

    // Build a map from node index to time
    const nodeTimeMap = new Map<number, { startTime: string; endTime: string }>(
        timeNodes.map((n) => [
            n.node,
            { startTime: n.startTime, endTime: n.endTime },
        ])
    );

    // Parse startDate: "YYYY-M-D" → "YYYY-MM-DD"
    const [y, m, d] = tableConfig.startDate.split("-");
    const isoStartDate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;

    // Build ParsedCourse list
    const courses: ParsedCourse[] = [];

    for (const slot of courseSlots) {
        // If ownTime, use slot's own startTime/endTime
        let startTime: string;
        let endTime: string;

        if (slot.ownTime && slot.startTime && slot.endTime) {
            startTime = slot.startTime;
            endTime = slot.endTime;
        } else {
            // Resolve via node map
            const startNode = nodeTimeMap.get(slot.startNode);
            const endNode = nodeTimeMap.get(slot.startNode + slot.step - 1);
            if (!startNode || !endNode) continue;
            startTime = startNode.startTime;
            endTime = endNode.endTime;
        }

        const course = courseMap.get(slot.id);
        if (!course) continue;

        courses.push({
            name: course.courseName,
            room: slot.room || "",
            teacher: slot.teacher || "",
            dayOfWeek: slot.day, // 1=Mon, 7=Sun
            startTime,
            endTime,
            startWeek: slot.startWeek,
            endWeek: slot.endWeek,
            color: argbToCssHex(course.color),
        });
    }

    return {
        semesterTag: tableConfig.tableName,
        school: tableConfig.school || "",
        startDate: isoStartDate,
        maxWeeks: tableConfig.maxWeek,
        courses,
    };
}

/**
 * Extract the hex key from a WakeUp share message.
 * Accepts either the full message or just the key itself.
 */
export function extractWakeUpKey(input: string): string | null {
    // Try to find the key in the share message (case-insensitive)
    const match = input.match(/分享口令为「([a-f0-9]{32})」/i);
    if (match) return match[1].toLowerCase();

    // If it's a direct 32-char hex key
    const trimmed = input.trim();
    if (/^[a-f0-9]{32}$/.test(trimmed)) return trimmed;

    return null;
}
