// Database types matching the Supabase schema

export interface Profile {
    id: string;
    display_name: string | null;
    role: "user" | "superadmin";
    room_quota: number;
    schedule_quota: number;
    created_at: string;
}

export interface AdminUser {
    id: string;
    display_name: string;
    email: string | null;
    role: "user" | "superadmin";
    room_quota: number;
    schedule_quota: number;
    created_at: string;
}

export interface Schedule {
    id: string;
    user_id: string;
    semester_tag: string;
    school: string | null;
    start_date: string; // ISO date string
    max_weeks: number;
    is_active: boolean;
    wakeup_raw: unknown | null;
    imported_at: string;
}

export interface Course {
    id: string;
    schedule_id: string;
    user_id: string;
    name: string;
    room: string | null;
    teacher: string | null;
    day_of_week: number; // 1=Mon, 7=Sun
    start_time: string; // HH:MM
    end_time: string; // HH:MM
    start_week: number;
    end_week: number;
    color: string | null;
    created_at: string;
}

export interface Room {
    id: string;
    admin_id: string;
    name: string;
    description: string | null;
    expires_at: string | null;
    is_public: boolean;
    created_at: string;
}

export interface RoomMember {
    room_id: string;
    user_id: string;
    color: string;
    joined_at: string;
    profile?: Profile;
}

export interface Invitation {
    id: string;
    room_id: string;
    invitee_id: string;
    inviter_id: string;
    status: "pending" | "accepted" | "declined";
    created_at: string;
    room?: Room;
    inviter?: Profile;
}

// Calendar event type for react-big-calendar
export interface CalendarEvent {
    id: string;
    title: string;
    start: Date;
    end: Date;
    resource: {
        userId: string;
        displayName: string;
        color: string; // member's room color
        courseName: string;
        room: string | null;
        teacher: string | null;
    };
}
