import {
    getDefaultImportInterfaceConfigs,
    type ImportInterfaceCategory,
    type ScheduleAdapterConfig,
    type ScheduleAdapterFeatures,
} from "@/lib/utils/scheduleAdapters/registry";

export type { ImportInterfaceCategory, ScheduleAdapterFeatures };

export interface ImportInterfaceConfig extends ScheduleAdapterConfig {
    category: ImportInterfaceCategory;
    features?: ScheduleAdapterFeatures;
}

export const DEFAULT_IMPORT_INTERFACES: ImportInterfaceConfig[] = getDefaultImportInterfaceConfigs();

export function normalizeImportInterfaces(rows: Partial<ImportInterfaceConfig>[] | null | undefined) {
    const byId = new Map(DEFAULT_IMPORT_INTERFACES.map((item) => [item.id, item]));
    for (const row of rows ?? []) {
        if (!row.id) continue;
        const base = byId.get(row.id);
        if (!base) continue;
        byId.set(row.id, {
            ...base,
            ...row,
            hints: Array.isArray(row.hints) ? row.hints : base.hints,
            features: row.features && typeof row.features === "object" ? row.features : base.features,
            enabled: typeof row.enabled === "boolean" ? row.enabled : base.enabled,
            sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : base.sortOrder,
        });
    }
    return [...byId.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getEnabledImportInterfaces(rows: Partial<ImportInterfaceConfig>[] | null | undefined) {
    return normalizeImportInterfaces(rows).filter((item) => item.enabled);
}
