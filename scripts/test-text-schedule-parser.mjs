import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bumpfree-parser-"));
const source = fs.readFileSync(path.join(root, "lib/utils/textSchedule.ts"), "utf8")
    .replace(/^import .*colors.*;\r?\n/, "const MEMBER_COLORS = [\"#2563eb\", \"#059669\", \"#b45309\", \"#7c3aed\", \"#475569\"];\n")
    .replace(/\bexport\s+(?=(type|interface|function))/g, "");
const modulePath = path.join(tmp, "textSchedule.ts");
fs.writeFileSync(modulePath, `${source}\nexport { parseTextSchedule };\n`, "utf8");

const { parseTextSchedule } = await import(pathToFileURL(modulePath).href);

const samples = [
    {
        label: "mobile compact pasted text",
        text: `Computer NetworksB2#3051-8
周三14:00-16:00Computer NetworksB2#30510-14
周五10:00-12:00Database SystemsLab#42-12`,
        expect: { count: 3, format: "loose", firstName: "Computer Networks", firstRoom: "B2#305", firstDay: 3 },
    },
    {
        label: "strict v1 with corrupted mobile separators",
        text: `BumpFree Schedule Import v1
Semester: 2026/04
StartDate: 2026-04-06
Timezone: Asia/Shanghai
MaxWeeks: 14
School: Manual Import
ImportMode: replace

飧?

Day: Monday
Time: 11:00-13:00
Name: SOF106 - Artificial Intelligence Principles
Teacher: Abdulrah Hakim Qaid Abdullah
Room: A5#G07
Weeks: 1-14

飧?

Day: Tuesday
Time: 09:00-10:00
Name: SOF106 - Artificial Intelligence Principles
Teacher: Abdulrah Hakim Qaid Abdullah
Room: B1#105
Weeks: 1-14`,
        expect: { count: 2, format: "strict", firstName: "SOF106 - Artificial Intelligence Principles", firstDay: 1 },
    },
    {
        label: "loose multiline chinese day",
        text: `Semester: 2026/04
StartDate: 2026-04-06
周一
10:00-12:00
Database Systems
Teacher: Dr Chen
Room: Lab#4
Weeks: 2-12`,
        expect: { count: 1, format: "loose", firstName: "Database Systems", firstRoom: "Lab#4", firstDay: 1 },
    },
    {
        label: "loose english day 12-hour time",
        text: `Semester: 2026/04
Monday 8.00am-10.00am SOF106A5#G071-14`,
        expect: { count: 1, format: "loose", firstName: "SOF106", firstRoom: "A5#G07", firstDay: 1 },
    },
    {
        label: "strict odd/even weeks",
        text: `BumpFree Schedule Import v1
Semester: 2026/04
StartDate: 2026-04-06
MaxWeeks: 14

---
Day: Friday
Time: 08:00-09:00
Name: Lab Rotation
Teacher:
Room: A1#101
Weeks: odd 1-5`,
        expect: { count: 3, format: "strict", firstName: "Lab Rotation", firstDay: 5 },
    },
    {
        label: "minimal xmu html",
        text: `<!doctype html><table><thead><tr><th>Time</th><th>Monday</th><th>Tuesday</th><th>Wednesday</th><th>Thursday</th><th>Friday</th><th>Saturday</th><th>Sunday</th></tr></thead><tbody>
<tr><td>8.00am-9.00am</td><td>&nbsp;</td><td class="row_kb" rowspan="2">SOF106<br />Principles of Artificial Intelligence<br />Abdulrab Hakim<br />B1#105<br />(Week 1-14)</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
<tr><td>9.00am-10.00am</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
<tr><td>10.00am-11.00am</td><td>MAT101<br />Math<br />Teacher<br />A1#101<br />(Week 2-4)</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
</tbody></table>`,
        expect: { count: 2, format: "loose", firstName: "SOF106 - Principles of Artificial Intelligence", firstRoom: "B1#105", firstDay: 2 },
    },
];

const externalSamples = [
    {
        label: "real xmu html file",
        file: path.join("I:", "OneDrive - DRC 创意科技有限责任公司", "桌面", "courselist", "胡博.txt"),
        expect: { count: 9, format: "loose", firstName: "SOF106 - Principles of Artificial Intelligence", firstDay: 2 },
    },
    {
        label: "real strict mobile file",
        file: path.join("I:", "OneDrive - DRC 创意科技有限责任公司", "桌面", "courselist", "温广琛.txt"),
        expect: { count: 9, format: "strict", firstName: "SOF106 - Artificial Intelligence Principles", firstDay: 1 },
    },
];

const negativeSamples = [
    { label: "empty input", text: "", message: "请先粘贴课表文本" },
    { label: "invalid time order", text: "周一14:00-12:00Bad CourseA1#1011-2", message: "结束时间必须晚于开始时间" },
    { label: "invalid weeks", text: "周一10:00-12:00Bad CourseA1#10114-2", message: "没有识别到可导入课程" },
];

let failures = 0;

for (const sample of [...samples, ...externalSamples.map((item) => ({ ...item, text: fs.existsSync(item.file) ? fs.readFileSync(item.file, "utf8") : null }))]) {
    if (sample.text === null) {
        console.log(`SKIP ${sample.label}: file not found`);
        continue;
    }
    try {
        const parsed = parseTextSchedule(sample.text);
        assertEqual(sample.label, "count", parsed.courses.length, sample.expect.count);
        assertEqual(sample.label, "format", parsed.format, sample.expect.format);
        if (sample.expect.firstName) assertEqual(sample.label, "firstName", parsed.courses[0]?.name, sample.expect.firstName);
        if (sample.expect.firstRoom) assertEqual(sample.label, "firstRoom", parsed.courses[0]?.room, sample.expect.firstRoom);
        if (sample.expect.firstDay) assertEqual(sample.label, "firstDay", parsed.courses[0]?.dayOfWeek, sample.expect.firstDay);
        console.log(`PASS ${sample.label}: ${parsed.courses.length} courses`);
    } catch (error) {
        failures += 1;
        console.error(`FAIL ${sample.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

for (const sample of negativeSamples) {
    try {
        parseTextSchedule(sample.text);
        failures += 1;
        console.error(`FAIL ${sample.label}: expected error`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes(sample.message)) {
            failures += 1;
            console.error(`FAIL ${sample.label}: expected "${sample.message}", got "${message}"`);
        } else {
            console.log(`PASS ${sample.label}: rejected`);
        }
    }
}

if (failures > 0) {
    console.error(`${failures} parser sample(s) failed`);
    process.exit(1);
}

function assertEqual(label, field, actual, expected) {
    if (actual !== expected) {
        failures += 1;
        throw new Error(`${field}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}
