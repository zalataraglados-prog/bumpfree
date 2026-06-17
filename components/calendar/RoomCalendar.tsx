"use client";

import { useState, useMemo } from "react";
import { Calendar, dateFnsLocalizer, Views, type View } from "react-big-calendar";
import {
    format,
    parse,
    startOfWeek,
    getDay,
    addWeeks,
    parseISO,
} from "date-fns";
import { zhCN } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { expandCourses } from "@/lib/utils/calendar";
import type { CalendarEvent, Course, Schedule } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { hexToRgba } from "@/lib/utils/colors";
import { Calendar as CalendarIcon, User, LayoutGrid, ChevronLeft, ChevronRight } from "lucide-react";

const locales = { "zh-CN": zhCN };

const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
    getDay,
    locales,
});

interface MemberData {
    userId: string;
    displayName: string;
    color: string;
    schedule: Pick<Schedule, "id" | "semester_tag" | "start_date" | "max_weeks">;
    courses: Course[];
}

interface RoomCalendarProps {
    memberData: MemberData[];
    roomName: string;
    isReadOnly: boolean;
}

type ViewMode = "month" | "week" | "person";

export function RoomCalendar({ memberData, roomName, isReadOnly }: RoomCalendarProps) {
    const [viewMode, setViewMode] = useState<ViewMode>("week");
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [currentDate, setCurrentDate] = useState(new Date());

    // Expand all members' courses into events
    const allEvents = useMemo(() => {
        const events: CalendarEvent[] = [];
        for (const member of memberData) {
            const memberEvents = expandCourses(
                member.courses,
                member.schedule as Schedule,
                member.userId,
                member.displayName,
                member.color
            );
            events.push(...memberEvents);
        }
        return events;
    }, [memberData]);

    // Filter events by selected user (person view)
    const displayEvents = useMemo(() => {
        if (viewMode === "person" && selectedUserId) {
            return allEvents.filter((e) => e.resource.userId === selectedUserId);
        }
        return allEvents;
    }, [allEvents, viewMode, selectedUserId]);

    const rbcView: View = viewMode === "person" ? "week" : viewMode === "month" ? "month" : "week";

    function eventStyleGetter(event: CalendarEvent) {
        const color = event.resource.color;
        return {
            style: {
                backgroundColor: hexToRgba(color, 0.85),
                borderLeft: `3px solid ${color}`,
                color: "#fff",
                borderRadius: "4px",
                fontSize: "0.72rem",
                padding: "1px 4px",
            },
        };
    }

    function EventComponent({ event }: { event: CalendarEvent }) {
        return (
            <div className="leading-tight">
                <div className="font-medium truncate">{event.resource.courseName}</div>
                <div className="opacity-80 truncate text-[0.65rem]">
                    {event.resource.displayName}
                    {event.resource.room && ` · ${event.resource.room}`}
                </div>
            </div>
        );
    }

    function MonthEventComponent({ event }: { event: CalendarEvent }) {
        return (
            <div
                className="flex items-center gap-1 px-1"
                style={{ color: event.resource.color }}
            >
                <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: event.resource.color }}
                />
                <span className="truncate text-xs font-medium">{event.resource.displayName}</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-3.5rem)]">
            {/* Toolbar */}
            <div className="border-b border-border/60 px-4 py-3 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                {/* View switcher */}
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                    <Button
                        variant={viewMode === "month" ? "default" : "ghost"}
                        size="sm"
                        className="h-7 px-3 text-xs gap-1"
                        onClick={() => setViewMode("month")}
                    >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        月视图
                    </Button>
                    <Button
                        variant={viewMode === "week" ? "default" : "ghost"}
                        size="sm"
                        className="h-7 px-3 text-xs gap-1"
                        onClick={() => setViewMode("week")}
                    >
                        <CalendarIcon className="w-3.5 h-3.5" />
                        周视图
                    </Button>
                    <Button
                        variant={viewMode === "person" ? "default" : "ghost"}
                        size="sm"
                        className="h-7 px-3 text-xs gap-1"
                        onClick={() => { setViewMode("person"); if (!selectedUserId && memberData.length > 0) setSelectedUserId(memberData[0].userId); }}
                    >
                        <User className="w-3.5 h-3.5" />
                        按人
                    </Button>
                </div>

                {/* Navigation */}
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => {
                        const d = new Date(currentDate);
                        if (viewMode === "month") d.setMonth(d.getMonth() - 1);
                        else d.setDate(d.getDate() - 7);
                        setCurrentDate(d);
                    }}>
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setCurrentDate(new Date())}>
                        今天
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => {
                        const d = new Date(currentDate);
                        if (viewMode === "month") d.setMonth(d.getMonth() + 1);
                        else d.setDate(d.getDate() + 7);
                        setCurrentDate(d);
                    }}>
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                </div>

                {/* Member legend / person filter */}
                <div className="flex items-center gap-2 flex-wrap">
                    {memberData.map((m) => (
                        <button
                            key={m.userId}
                            onClick={() => {
                                if (viewMode === "person") {
                                    setSelectedUserId(m.userId);
                                }
                            }}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors ${viewMode === "person" && selectedUserId === m.userId
                                    ? "ring-2 ring-offset-1 bg-muted"
                                    : "hover:bg-muted"
                                }`}
                            style={{ "--ring-color": m.color } as React.CSSProperties}
                        >
                            <span
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: m.color }}
                            />
                            <span className="font-medium">{m.displayName}</span>
                        </button>
                    ))}
                    {isReadOnly && (
                        <Badge variant="outline" className="text-xs">只读模式</Badge>
                    )}
                </div>
            </div>

            {/* Calendar */}
            <div className="flex-1 overflow-hidden p-2">
                <style>{`
          .rbc-calendar { height: 100% !important; font-family: var(--font-geist-sans), sans-serif; }
          .rbc-toolbar { display: none; }
          .rbc-time-view { border: none; }
          .rbc-month-view { border: none; }
          .rbc-header { padding: 8px 4px; font-size: 0.8rem; font-weight: 500; color: hsl(var(--muted-foreground)); border-bottom: 1px solid hsl(var(--border)); }
          .rbc-day-bg + .rbc-day-bg { border-left: 1px solid hsl(var(--border)); }
          .rbc-month-row + .rbc-month-row { border-top: 1px solid hsl(var(--border)); }
          .rbc-off-range-bg { background: hsl(var(--muted) / 30%); }
          .rbc-today { background: hsl(var(--primary) / 5%); }
          .rbc-event { border: none !important; }
          .rbc-event.rbc-selected { box-shadow: 0 0 0 2px hsl(var(--primary)); }
          .rbc-slot-selection { background: hsl(var(--primary) / 20%); }
          .rbc-time-content { border-top: 1px solid hsl(var(--border)); }
          .rbc-time-slot { border-top: 1px solid hsl(var(--border) / 40%); }
          .rbc-timeslot-group { border-bottom: 1px solid hsl(var(--border)); }
          .rbc-time-header-content { border-left: 1px solid hsl(var(--border)); }
          .rbc-day-slot .rbc-time-slot { border-top: 1px solid hsl(var(--border) / 30%); }
          .rbc-time-gutter .rbc-time-slot { font-size: 0.7rem; color: hsl(var(--muted-foreground)); }
          .dark .rbc-calendar { color-scheme: dark; }
          .dark .rbc-month-view, .dark .rbc-time-view { background: hsl(var(--background)); }
          .dark .rbc-header { background: hsl(var(--background)); }
          .dark .rbc-off-range-bg { background: hsl(var(--muted) / 20%); }
          .dark .rbc-today { background: hsl(var(--primary) / 8%); }
          .dark .rbc-time-content { background: hsl(var(--background)); }
        `}</style>

                <Calendar
                    localizer={localizer}
                    events={displayEvents}
                    view={rbcView}
                    onView={() => { }}
                    date={currentDate}
                    onNavigate={setCurrentDate}
                    eventPropGetter={eventStyleGetter}
                    components={{
                        event: viewMode === "month" ? MonthEventComponent : EventComponent,
                    }}
                    culture="zh-CN"
                    min={new Date(0, 0, 0, 7, 0)}
                    max={new Date(0, 0, 0, 22, 0)}
                    popup
                    selectable={false}
                    style={{ height: "100%" }}
                    messages={{
                        noEventsInRange: "该时间段内没有课程",
                        showMore: (total) => `还有 ${total} 节课`,
                    }}
                />
            </div>

            {/* No data fallback */}
            {memberData.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center text-muted-foreground">
                        <CalendarIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p>暂无成员课表数据</p>
                        <p className="text-sm mt-1">邀请成员加入并让他们导入课表</p>
                    </div>
                </div>
            )}
        </div>
    );
}
