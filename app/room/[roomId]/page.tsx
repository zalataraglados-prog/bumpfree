import { createClient } from "@/lib/supabase/server";
import { getMalaysiaPublicHolidays } from "@/lib/utils/holidays";
import { notFound, redirect } from "next/navigation";
import { RoomCalendar } from "@/components/calendar/RoomCalendar";
import { Badge } from "@/components/ui/badge";
import { Lock, Globe, Users, Zap } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getDisplayMemberColor } from "@/lib/utils/colors";
import type { BusyBlock, Course, Schedule } from "@/lib/types";

interface RoomPageProps { params: Promise<{ roomId: string }>; }

type ActiveSchedule = Pick<Schedule, "id" | "user_id" | "semester_tag" | "start_date" | "max_weeks">;
type MemberRow = {
    user_id: string;
    color: string;
    profile: { id: string; display_name: string | null } | { id: string; display_name: string | null }[] | null;
};

export default async function RoomPage({ params }: RoomPageProps) {
    const { roomId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: room } = await supabase.from("rooms").select("*").eq("id", roomId).single();
    if (!room) notFound();

    let isMember = false;
    if (user) {
        const { data: membership } = await supabase.from("room_members").select("color").eq("room_id", roomId).eq("user_id", user.id).single();
        isMember = !!membership;
    }

    if (!isMember && !room.is_public) {
        if (!user) redirect("/auth/login");
        return (
            <div className="min-h-screen flex items-center justify-center bg-background px-4">
                <div className="text-center max-w-sm">
                    <Lock className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <h1 className="text-xl font-semibold mb-2">{ "\u65e0\u8bbf\u95ee\u6743\u9650" }</h1>
                    <p className="text-muted-foreground text-sm mb-6">{ "\u4f60\u9700\u8981\u662f\u8be5 Room \u7684\u6210\u5458\u624d\u80fd\u67e5\u770b\u65e5\u5386\u3002\u8bf7\u8054\u7cfb Room \u7ba1\u7406\u5458\u83b7\u53d6\u9080\u8bf7\u3002" }</p>
                    <Link href="/dashboard"><Button variant="outline">{ "\u8fd4\u56de Dashboard" }</Button></Link>
                </div>
            </div>
        );
    }

    const { data: members } = await supabase
        .from("room_members")
        .select("user_id, color, profile:profiles(id, display_name)")
        .eq("room_id", roomId);

    const memberRows = (members ?? []) as MemberRow[];
    const memberIds = memberRows.map((member) => member.user_id);

    const [
        { data: schedules },
        { data: busyBlocks },
    ] = memberIds.length > 0
        ? await Promise.all([
            supabase
                .from("schedules")
                .select("id, user_id, semester_tag, start_date, max_weeks")
                .in("user_id", memberIds)
                .eq("is_active", true)
                .order("imported_at", { ascending: false }),
            supabase
                .from("busy_blocks")
                .select("*")
                .in("user_id", memberIds)
                .order("starts_at", { ascending: true }),
        ])
        : [{ data: [] }, { data: [] }];

    const scheduleRows = (schedules ?? []) as ActiveSchedule[];
    const scheduleByUserId = new Map<string, ActiveSchedule>();
    for (const schedule of scheduleRows) {
        if (!scheduleByUserId.has(schedule.user_id)) scheduleByUserId.set(schedule.user_id, schedule);
    }

    const scheduleIds = Array.from(scheduleByUserId.values()).map((schedule) => schedule.id);
    const { data: courses } = scheduleIds.length > 0
        ? await supabase
            .from("courses")
            .select("*")
            .in("schedule_id", scheduleIds)
            .order("day_of_week", { ascending: true })
            .order("start_time", { ascending: true })
        : { data: [] };

    const coursesByScheduleId = groupBy((courses ?? []) as Course[], (course) => course.schedule_id);
    const busyBlocksByUserId = groupBy((busyBlocks ?? []) as BusyBlock[], (block) => block.user_id);

    const usedDisplayColors: string[] = [];
    const memberData = memberRows.map((member) => {
        const displayColor = getDisplayMemberColor(member.user_id, member.color, usedDisplayColors);
        usedDisplayColors.push(displayColor);
        const schedule = scheduleByUserId.get(member.user_id);
        if (!schedule) return null;
        const profile = Array.isArray(member.profile) ? member.profile[0] : member.profile;
        return {
            userId: member.user_id,
            displayName: profile?.display_name ?? "\u672a\u77e5\u7528\u6237",
            color: displayColor,
            schedule,
            courses: coursesByScheduleId.get(schedule.id) ?? [],
            busyBlocks: busyBlocksByUserId.get(member.user_id) ?? [],
        };
    });

    const validMemberData = memberData.filter(Boolean) as NonNullable<typeof memberData[0]>[];
    const years = validMemberData.flatMap((member) => {
        const start = new Date(`${member.schedule.start_date}T00:00:00`);
        const end = new Date(start.getTime() + member.schedule.max_weeks * 7 * 24 * 60 * 60 * 1000);
        return [start.getFullYear(), end.getFullYear()];
    });
    const holidays = await getMalaysiaPublicHolidays([new Date().getFullYear(), ...years]);

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <header className="border-b border-border/60 sticky top-0 z-40 bg-background/80 backdrop-blur">
                <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <Link href="/" className="flex items-center gap-1.5 flex-shrink-0"><Zap className="w-4 h-4 text-primary" /><span className="font-semibold text-sm hidden sm:block">BumpFree</span></Link>
                        <span className="text-border">/</span><h1 className="font-semibold text-sm truncate">{room.name}</h1>
                        {room.is_public && !isMember && <Badge variant="secondary" className="text-xs gap-1 flex-shrink-0"><Globe className="w-3 h-3" />{"\u53ea\u8bfb"}</Badge>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground"><Users className="w-4 h-4" /><span>{validMemberData.length}</span></div>
                        <div className="flex -space-x-1">{validMemberData.slice(0, 5).map((m) => <div key={m.userId} className="w-6 h-6 rounded-full border-2 border-background" style={{ backgroundColor: m.color }} title={m.displayName} />)}</div>
                        {user ? <Link href="/dashboard"><Button variant="outline" size="sm">Dashboard</Button></Link> : <Link href="/auth/login"><Button variant="outline" size="sm">{"\u767b\u5f55"}</Button></Link>}
                    </div>
                </div>
            </header>
            <main className="flex-1 overflow-hidden">
                <RoomCalendar memberData={validMemberData} holidays={holidays} roomId={roomId} roomName={room.name} currentUserId={user?.id ?? null} isReadOnly={!isMember} />
            </main>
        </div>
    );
}

function groupBy<T>(items: T[], getKey: (item: T) => string): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const item of items) {
        const key = getKey(item);
        const group = groups.get(key);
        if (group) group.push(item);
        else groups.set(key, [item]);
    }
    return groups;
}
