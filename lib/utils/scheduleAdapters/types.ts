import type { ParsedTextSchedule } from "@/lib/utils/textSchedule";

export type ImportInterfaceCategory = "general" | "school";

export interface ScheduleAdapterFeatures {
    showTemplateTools?: boolean;
}

export interface ScheduleAdapterConfig {
    id: string;
    category: ImportInterfaceCategory;
    adapterKey: string;
    title: string;
    description: string;
    inputLabel: string;
    uploadLabel: string;
    placeholder: string;
    hints: string[];
    acceptedFileTypes: string;
    enabled: boolean;
    sortOrder: number;
    schoolName?: string;
    features?: ScheduleAdapterFeatures;
}

export interface ScheduleAdapter {
    key: string;
    config: ScheduleAdapterConfig;
    parse(input: string): ParsedTextSchedule;
}
