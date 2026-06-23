"use server";

import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import * as XLSX from "xlsx";

export async function extractScheduleFileText(formData: FormData) {
    const file = formData.get("file");
    if (!(file instanceof File)) return { error: "请选择文件" };
    if (file.size > 10 * 1024 * 1024) return { error: "文件不能超过 10MB" };

    const fileName = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    try {
        if (file.type === "application/pdf" || fileName.endsWith(".pdf")) {
            const parser = new PDFParse({ data: buffer });
            try {
                const result = await parser.getText();
                return { text: result.text };
            } finally {
                await parser.destroy();
            }
        }

        if (
            file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
            fileName.endsWith(".docx")
        ) {
            const result = await mammoth.extractRawText({ buffer });
            return { text: result.value };
        }

        if (
            file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
            file.type === "application/vnd.ms-excel" ||
            fileName.endsWith(".xlsx") ||
            fileName.endsWith(".xls") ||
            fileName.endsWith(".csv")
        ) {
            const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
            const sheets = workbook.SheetNames.map((sheetName) => {
                const sheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, blankrows: false, raw: false });
                return [`# ${sheetName}`, ...rows.map((row) => row.map((cell) => String(cell ?? "").trim()).join("\t"))].join("\n");
            });
            return { text: sheets.join("\n\n") };
        }

        return { text: buffer.toString("utf8") };
    } catch (error) {
        return { error: error instanceof Error ? error.message : "文件文本抽取失败" };
    }
}
