import { createClient } from "@/lib/supabase/server";
import { getMalaysiaPublicHolidays } from "@/lib/utils/holidays";
import { notFound, redirect } from "next/navigation";
import { RoomCalendar } from "@/components/calendar/RoomCalendar";
import { Badge } from "@/components/ui/badge";
import { Lock, Globe, Users, Zap } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getDisplayMemberColor } from "@/lib/utils/colors";

interface RoomPageProps { params: Promise<{ roomId: string }>; }

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

    const { data: members } = await supabase.from("room_members").select("user_id, color, profile:profiles(id, display_name)").eq("room_id", roomId);
    const usedDisplayColors: string[] = [];
    const memberData = await Promise.all((members ?? []).map(async (member) => {
        const displayColor = getDisplayMemberColor(member.user_id, member.color, usedDisplayColors);
        usedDisplayColors.push(displayColor);
        const { data: schedule } = await supabase.from("schedules").select("id, semester_tag, start_date, max_weeks").eq("user_id", member.user_id).eq("is_active", true).single();
        const { data: busyBlocks } = await supabase.from("busy_blocks").select("*").eq("user_id", member.user_id).order("starts_at", { ascending: true });
        if (!schedule) return null;
        const { data: courses } = await supabase.from("courses").select("*").eq("schedule_id", schedule.id).eq("user_id", member.user_id);
        const profile = Array.isArray(member.profile) ? member.profile[0] : member.profile;
        return { userId: member.user_id, displayName: (profile as { display_name: string | null } | null)?.display_name ?? "\u672a\u77e5\u7528\u6237", color: displayColor, schedule, courses: courses ?? [], busyBlocks: busyBlocks ?? [] };
    }));

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
