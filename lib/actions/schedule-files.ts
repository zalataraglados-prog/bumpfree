"use server";

import { PDFParse } from "pdf-parse";

export async function extractScheduleFileText(formData: FormData) {
    const file = formData.get("file");
    if (!(file instanceof File)) return { error: "请选择文件" };
    if (file.size > 5 * 1024 * 1024) return { error: "文件不能超过 5MB" };

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const buffer = Buffer.from(await file.arrayBuffer());

    if (!isPdf) {
        return { text: buffer.toString("utf8") };
    }

    const parser = new PDFParse({ data: buffer });
    try {
        const result = await parser.getText();
        return { text: result.text };
    } catch (error) {
        return { error: error instanceof Error ? error.message : "PDF 文本抽取失败" };
    } finally {
        await parser.destroy();
    }
}
