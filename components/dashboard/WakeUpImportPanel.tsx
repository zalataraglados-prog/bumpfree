"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { importTextSchedule, importWakeUpSchedule } from "@/lib/actions/courses";
import { getAiCleanupPrompt, getScheduleTemplate, parseTextSchedule, type ParsedTextSchedule, type TextScheduleImportMode } from "@/lib/utils/textSchedule";
import { Clipboard, Download, FileText, Loader2, CheckCircle2, Upload } from "lucide-react";
import { toast } from "sonner";

interface ImportPanelProps {
    hasSchedule: boolean;
}

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function WakeUpImportPanel({ hasSchedule }: ImportPanelProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    Import schedule
                </CardTitle>
                <CardDescription>
                    Use WakeUp share code, or paste text prepared in BumpFree v1 format.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="wakeup" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="wakeup">WakeUp code</TabsTrigger>
                        <TabsTrigger value="text">Text import</TabsTrigger>
                    </TabsList>
                    <TabsContent value="wakeup" className="pt-3">
                        <WakeUpCodeImport hasSchedule={hasSchedule} />
                    </TabsContent>
                    <TabsContent value="text" className="pt-3">
                        <TextScheduleImport />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}

function WakeUpCodeImport({ hasSchedule }: ImportPanelProps) {
    const [token, setToken] = useState("");
    const [isPending, startTransition] = useTransition();

    function handleImport() {
        if (!token.trim()) return;
        startTransition(async () => {
            const result = await importWakeUpSchedule(token.trim());
            if (result.error) {
                toast.error(result.error);
            } else {
                toast.success(`Imported ${result.semesterTag}, ${result.courseCount} courses`);
                setToken("");
            }
        });
    }

    return (
        <div className="space-y-3">
            <div className="space-y-2">
                <Label htmlFor="wakeup-token">Share code or full WakeUp message</Label>
                <Textarea
                    id="wakeup-token"
                    placeholder="Paste the full WakeUp share message, or the 32-character key..."
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    rows={3}
                    className="font-mono text-sm resize-none"
                />
            </div>
            <Button onClick={handleImport} disabled={isPending || !token.trim()} className="w-full">
                {isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing...</>
                ) : (
                    <><Download className="w-4 h-4 mr-2" />Import from WakeUp</>
                )}
            </Button>
            {hasSchedule && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    Importing the same semester will replace existing courses.
                </p>
            )}
        </div>
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
            () => toast.success(`${label} copied`),
            () => toast.error(`Failed to copy ${label}`)
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
            setParseError(e instanceof Error ? e.message : "Failed to parse schedule text");
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
            toast.success(`Imported ${result.semesterTag}, ${result.courseCount} courses`);
            setText("");
            setPreview(null);
            setParseError(null);
        });
    }

    return (
        <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
                <Button type="button" variant="outline" size="sm" onClick={() => copyText(getScheduleTemplate(), "template")}> 
                    <FileText className="w-4 h-4 mr-2" />Copy format template
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => copyText(getAiCleanupPrompt(), "AI prompt")}> 
                    <Clipboard className="w-4 h-4 mr-2" />Copy AI cleanup prompt
                </Button>
            </div>

            <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                <p>Paste BumpFree Schedule Import v1 text directly, or ask an AI tool to convert a school timetable, OCR text, Excel copy, or chat message into the v1 format first.</p>
                <p>Nothing is saved until the parsed preview is confirmed.</p>
            </div>

            <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="schedule-text">Schedule text</Label>
                    <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />Upload .txt
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
                    placeholder="Paste BumpFree v1 text or a supported loose timetable here..."
                    rows={10}
                    className="font-mono text-xs resize-y"
                />
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                <Button type="button" variant="outline" onClick={handleParse} disabled={!text.trim()}>
                    Parse preview
                </Button>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Mode</span>
                    <Select value={importMode} onValueChange={(value) => setImportMode(value as TextScheduleImportMode)}>
                        <SelectTrigger className="w-32" size="sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="replace">replace</SelectItem>
                            <SelectItem value="append">append</SelectItem>
                            <SelectItem value="new">new copy</SelectItem>
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
                        <Badge variant="secondary">{preview.format}</Badge>
                        <span className="font-medium">{preview.semesterTag}</span>
                        <span className="text-muted-foreground">Start {preview.startDate}</span>
                        <span className="text-muted-foreground">{preview.maxWeeks} weeks</span>
                        <span className="text-muted-foreground">{preview.courses.length} courses</span>
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
                                    <th className="py-1 pr-2 text-left">Day</th>
                                    <th className="py-1 pr-2 text-left">Time</th>
                                    <th className="py-1 pr-2 text-left">Course</th>
                                    <th className="py-1 pr-2 text-left">Room</th>
                                    <th className="py-1 pr-2 text-left">Weeks</th>
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
                        <p className="text-xs text-muted-foreground">...and {preview.courses.length - 8} more courses</p>
                    )}
                    <Button onClick={handleImport} disabled={isPending} className="w-full">
                        {isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing...</> : "Confirm import"}
                    </Button>
                </div>
            )}
        </div>
    );
}
