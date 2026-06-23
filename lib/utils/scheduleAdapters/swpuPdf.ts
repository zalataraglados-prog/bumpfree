import { parseSwpuPdfTextSchedule } from "@/lib/utils/textSchedule";
import type { ScheduleAdapter } from "./types";

export const swpuPdfAdapter: ScheduleAdapter = {
    key: "swpu-pdf-text",
    parse: parseSwpuPdfTextSchedule,
    config: {
        id: "swpu-pdf",
        category: "school",
        adapterKey: "swpu-pdf-text",
        schoolName: "西南石油大学",
        title: "西南石油大学 PDF 课表导入",
        description: "适用于西南石油大学教务系统导出的 timeTableForStu PDF 课表。",
        inputLabel: "PDF 抽取文本",
        uploadLabel: "上传 PDF/TXT",
        placeholder: "上传 timeTableForStu*.pdf，或粘贴 PDF 抽取后的课表文本...",
        hints: [
            "PDF 文件会先在服务端抽取文本，再用西南石油大学专用适配器解析课程代码、周次、星期、节次和教室。",
            "节次会按西南石油大学教学日历中的作息时间映射为具体开始/结束时间，预览中仍可手动调整学期信息。",
        ],
        acceptedFileTypes: ".pdf,.txt,application/pdf,text/plain",
        enabled: true,
        sortOrder: 30,
    },
};
