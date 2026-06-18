"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { importTextSchedule } from "@/lib/actions/courses";
import { getAiCleanupPrompt, getScheduleTemplate, parseTextSchedule, type ParsedTextSchedule, type TextScheduleImportMode } from "@/lib/utils/textSchedule";
import { Clipboard, FileText, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

const TEXT = {
    title: "\u6587\u672c\u5bfc\u5165\u8bfe\u8868",
    description: "\u7c98\u8d34 BumpFree v1 \u6587\u672c\uff0c\u6216\u5148\u8ba9 AI \u628a\u5b66\u6821\u8bfe\u8868\u3001\u622a\u56fe OCR\u3001Excel \u5185\u5bb9\u6574\u7406\u6210\u53ef\u5bfc\u5165\u683c\u5f0f\u3002",
    copied: "\u5df2\u590d\u5236",
    copyFailed: "\u590d\u5236\u5931\u8d25",
    parseFailed: "\u89e3\u6790\u8bfe\u8868\u6587\u672c\u5931\u8d25",
    importedPrefix: "\u5df2\u5bfc\u5165\u300c",
    importedMiddle: "\u300d\uff0c\u5171 ",
    importedSuffix: " \u6761\u8bfe\u7a0b",
    copyTemplate: "\u590d\u5236\u683c\u5f0f\u6a21\u677f",
    copyAiPrompt: "\u590d\u5236 AI \u6574\u7406\u63d0\u793a\u8bcd",
    templateLabel: "\u683c\u5f0f\u6a21\u677f",
    aiPromptLabel: "AI \u6574\u7406\u63d0\u793a\u8bcd",
    hint1: "\u53ef\u4ee5\u76f4\u63a5\u7c98\u8d34 BumpFree Schedule Import v1 \u6587\u672c\uff0c\u4e5f\u53ef\u4ee5\u5148\u8ba9 AI \u628a\u5b66\u6821\u8bfe\u8868\u3001\u622a\u56fe OCR\u3001Excel \u5185\u5bb9\u6216\u804a\u5929\u8bb0\u5f55\u6574\u7406\u6210 v1 \u683c\u5f0f\u3002",
    hint2: "\u89e3\u6790\u9884\u89c8\u786e\u8ba4\u524d\u4e0d\u4f1a\u4fdd\u5b58\u4efb\u4f55\u8bfe\u7a0b\u3002",
    scheduleText: "\u8bfe\u8868\u6587\u672c",
    uploadTxt: "\u4e0a\u4f20 .txt",
    placeholder: "\u7c98\u8d34 BumpFree v1 \u6587\u672c\uff0c\u6216\u53d7\u652f\u6301\u7684\u677e\u6563\u8bfe\u8868\u6587\u672c...",
    parsePreview: "\u89e3\u6790\u9884\u89c8",
    importMode: "\u5bfc\u5165\u65b9\u5f0f",
    replace: "\u8986\u76d6",
    append: "\u8ffd\u52a0",
    newCopy: "\u65b0\u5efa\u526f\u672c",
    strict: "\u6807\u51c6\u683c\u5f0f",
    loose: "\u677e\u6563\u683c\u5f0f",
    start: "\u8d77\u59cb",
    weeksUnit: " \u5468",
    coursesUnit: " \u6761\u8bfe\u7a0b",
    day: "\u661f\u671f",
    time: "\u65f6\u95f4",
    course: "\u8bfe\u7a0b",
    room: "\u6559\u5ba4",
    weeks: "\u5468\u6b21",
    morePrefix: "\u8fd8\u6709 ",
    moreSuffix: " \u6761\u8bfe\u7a0b\u672a\u5c55\u793a",
    importing: "\u6b63\u5728\u5bfc\u5165...",
    confirmImport: "\u786e\u8ba4\u5bfc\u5165",
};

const DAY_NAMES = ["", "\u5468\u4e00", "\u5468\u4e8c", "\u5468\u4e09", "\u5468\u56db", "\u5468\u4e94", "\u5468\u516d", "\u5468\u65e5"];

export function ScheduleImportPanel() {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    {TEXT.title}
                </CardTitle>
                <CardDescription>{TEXT.description}</CardDescription>
            </CardHeader>
            <CardContent>
                <TextScheduleImport />
            </CardContent>
        </Card>
    );
}

function TextScheduleImport() {
    const [text, setText] = useState("");
    const [preview, setPreview] = useState<ParsedTextSchedule | null>(null);
    const [parseError, setParseError] = useState<string | null>(null);
    const [importMode, setImportMode] = useState<TextScheduleImportMode>("replace");
    const [isPending, startTransition] = useTransition();

    function copyText(value: string, label: string) {
        void navigator.clipboard.writeText(value).then(
            () => toast.success(`${TEXT.copied}${label}`),
            () => toast.error(`${label}${TEXT.copyFailed}`)
        );
    }

    function handleParse() {
        try {
            const parsed = parseTextSchedule(text);
            setPreview(parsed);
            setImportMode(parsed.importMode);
            setParseError(null);
        } catch (e) {
            setPreview(null);
            setParseError(e instanceof Error ? e.message : TEXT.parseFailed);
        }
    }

    function handleFile(file: File | undefined) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            setText(String(reader.result || ""));
            setPreview(null);
            setParseError(null);
        };
        reader.readAsText(file);
    }

    function handleImport() {
        if (!text.trim()) return;
        startTransition(async () => {
            const result = await importTextSchedule(text, importMode);
            if (result.error) {
                toast.error(result.error);
                return;
            }
            toast.success(`${TEXT.importedPrefix}${result.semesterTag}${TEXT.importedMiddle}${result.courseCount}${TEXT.importedSuffix}`);
            setText("");
            setPreview(null);
            setParseError(null);
        });
    }

    return (
        <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
                <Button type="button" variant="outline" size="sm" onClick={() => copyText(getScheduleTemplate(), TEXT.templateLabel)}>
                    <FileText className="w-4 h-4 mr-2" />{TEXT.copyTemplate}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => copyText(getAiCleanupPrompt(), TEXT.aiPromptLabel)}>
                    <Clipboard className="w-4 h-4 mr-2" />{TEXT.copyAiPrompt}
                </Button>
            </div>

            <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                <p>{TEXT.hint1}</p>
                <p>{TEXT.hint2}</p>
            </div>

            <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="schedule-text">{TEXT.scheduleText}</Label>
                    <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />{TEXT.uploadTxt}
                        <input
                            type="file"
                            accept=".txt,text/plain"
                            className="hidden"
                            onChange={(e) => handleFile(e.target.files?.[0])}
                        />
                    </label>
                </div>
                <Textarea
                    id="schedule-text"
                    value={text}
                    onChange={(e) => {
                        setText(e.target.value);
                        setPreview(null);
                        setParseError(null);
                    }}
                    placeholder={TEXT.placeholder}
                    rows={10}
                    className="font-mono text-xs resize-y"
                />
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                <Button type="button" variant="outline" onClick={handleParse} disabled={!text.trim()}>
                    {TEXT.parsePreview}
                </Button>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{TEXT.importMode}</span>
                    <Select value={importMode} onValueChange={(value) => setImportMode(value as TextScheduleImportMode)}>
                        <SelectTrigger className="w-32" size="sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="replace">{TEXT.replace}</SelectItem>
                            <SelectItem value="append">{TEXT.append}</SelectItem>
                            <SelectItem value="new">{TEXT.newCopy}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {parseError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    {parseError}
                </div>
            )}

            {preview && (
                <div className="space-y-3 rounded-md border border-border/60 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge variant="secondary">{preview.format === "strict" ? TEXT.strict : TEXT.loose}</Badge>
                        <span className="font-medium">{preview.semesterTag}</span>
                        <span className="text-muted-foreground">{TEXT.start} {preview.startDate}</span>
                        <span className="text-muted-foreground">{preview.maxWeeks}{TEXT.weeksUnit}</span>
                        <span className="text-muted-foreground">{preview.courses.length}{TEXT.coursesUnit}</span>
                    </div>
                    {preview.warnings.length > 0 && (
                        <div className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
                            {preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                        </div>
                    )}
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="text-muted-foreground">
                                <tr className="border-b">
                                    <th className="py-1 pr-2 text-left">{TEXT.day}</th>
                                    <th className="py-1 pr-2 text-left">{TEXT.time}</th>
                                    <th className="py-1 pr-2 text-left">{TEXT.course}</th>
                                    <th className="py-1 pr-2 text-left">{TEXT.room}</th>
                                    <th className="py-1 pr-2 text-left">{TEXT.weeks}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {preview.courses.slice(0, 8).map((course, index) => (
                                    <tr key={`${course.name}-${index}`} className="border-b last:border-0">
                                        <td className="py-1 pr-2 whitespace-nowrap">{DAY_NAMES[course.dayOfWeek]}</td>
                                        <td className="py-1 pr-2 whitespace-nowrap">{course.startTime}-{course.endTime}</td>
                                        <td className="py-1 pr-2 min-w-40">{course.name}</td>
                                        <td className="py-1 pr-2 whitespace-nowrap">{course.room || "-"}</td>
                                        <td className="py-1 pr-2 whitespace-nowrap">{course.startWeek}-{course.endWeek}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {preview.courses.length > 8 && (
                        <p className="text-xs text-muted-foreground">{TEXT.morePrefix}{preview.courses.length - 8}{TEXT.moreSuffix}</p>
                    )}
                    <Button onClick={handleImport} disabled={isPending} className="w-full">
                        {isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{TEXT.importing}</> : TEXT.confirmImport}
                    </Button>
                </div>
            )}
        </div>
    );
}
