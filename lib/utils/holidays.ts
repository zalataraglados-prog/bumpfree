import type { MalaysiaHoliday } from "@/lib/types";

interface NagerHoliday {
    date: string;
    localName: string;
    name: string;
    countryCode: string;
}

export async function getMalaysiaPublicHolidays(years: number[]): Promise<MalaysiaHoliday[]> {
    const uniqueYears = Array.from(new Set(years.filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2100))).sort();
    const lists = await Promise.all(uniqueYears.map(fetchYear));
    return lists.flat().sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchYear(year: number): Promise<MalaysiaHoliday[]> {
    try {
        const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/MY`, { next: { revalidate: 86400 } });
        if (!response.ok) return [];

        const text = await response.text();
        if (!text.trim()) return [];

        const data = JSON.parse(text) as unknown;
        if (!Array.isArray(data)) return [];

        return data
            .filter(isNagerHoliday)
            .filter((item) => item.countryCode === "MY")
            .map((item) => ({ id: `my-holiday-${item.date}`, date: item.date, localName: item.localName, name: item.name }));
    } catch {
        return [];
    }
}

function isNagerHoliday(value: unknown): value is NagerHoliday {
    if (!value || typeof value !== "object") return false;
    const item = value as Partial<NagerHoliday>;
    return typeof item.date === "string"
        && typeof item.localName === "string"
        && typeof item.name === "string"
        && typeof item.countryCode === "string";
}
