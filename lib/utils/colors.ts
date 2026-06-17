// Member color palette - 12 high-contrast, aesthetically pleasing colors
// Used to assign distinct colors to room members in the calendar

export const MEMBER_COLORS = [
    "#6366f1", // Indigo
    "#f43f5e", // Rose
    "#10b981", // Emerald
    "#f59e0b", // Amber
    "#3b82f6", // Blue
    "#8b5cf6", // Violet
    "#06b6d4", // Cyan
    "#ef4444", // Red
    "#14b8a6", // Teal
    "#f97316", // Orange
    "#84cc16", // Lime
    "#ec4899", // Pink
];

/**
 * Get a color for a member based on their user ID.
 * Assigns deterministically by hashing the userId.
 */
export function getColorForUser(userId: string, palette = MEMBER_COLORS): string {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
    }
    return palette[Math.abs(hash) % palette.length];
}

/**
 * Get a color that's not yet used in a room (for new member assignment).
 */
export function getNextAvailableColor(usedColors: string[]): string {
    for (const color of MEMBER_COLORS) {
        if (!usedColors.includes(color)) return color;
    }
    // Fallback: cycle from beginning
    return MEMBER_COLORS[usedColors.length % MEMBER_COLORS.length];
}

/**
 * Convert hex color to rgba with opacity.
 */
export function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
