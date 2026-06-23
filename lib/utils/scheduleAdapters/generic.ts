import { parseGenericTextSchedule } from "@/lib/utils/textSchedule";
import type { ScheduleAdapter } from "./types";

export const genericTextAdapter: ScheduleAdapter = {
    key: "generic-text",
    parse: parseGenericTextSchedule,
    config: {
        id: "generic-text",
        category: "general",
        adapterKey: "generic-text",
        title: "通用文本 / AI 导入",
        description: "适用于 BumpFree v1、手机粘贴文本、OCR、Excel 转文本或 AI 整理后的课表。",
        inputLabel: "课表文本",
        uploadLabel: "上传文本/HTML",
        placeholder: "粘贴 BumpFree v1 文本，或受支持的松散课表文本...",
        hints: [
            "可以直接粘贴 BumpFree Schedule Import v1 文本，也可以先让 AI 把学校课表、截图 OCR、Excel 内容或聊天记录整理成 v1 格式。",
            "解析预览确认前不会保存任何课程。",
        ],
        acceptedFileTypes: ".txt,.html,.htm,text/plain,text/html",
        enabled: true,
        sortOrder: 10,
        features: {
            showTemplateTools: true,
        },
    },
};
