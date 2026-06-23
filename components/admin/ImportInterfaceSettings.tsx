"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
    deleteCustomImportInterface,
    resetImportInterfacesToDefaults,
    updateImportInterface,
    uploadCustomImportInterface,
} from "@/lib/actions/import-interfaces";
import type { ImportInterfaceConfig } from "@/lib/utils/importInterfaces";
import { CUSTOM_IMPORT_INTERFACE_PROMPT } from "@/lib/utils/customImportInterfacePrompt";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Clipboard, FileCog, PlugZap, RotateCcw, School, Trash2, Upload } from "lucide-react";

export function ImportInterfaceSettings({ interfaces }: { interfaces: ImportInterfaceConfig[] }) {
    const [isPending, startTransition] = useTransition();
    const general = interfaces.filter((item) => item.category === "general");
    const schools = interfaces.filter((item) => item.category === "school");

    function copyManifestPrompt() {
        void navigator.clipboard.writeText(CUSTOM_IMPORT_INTERFACE_PROMPT).then(
            () => toast.success("已复制入口生成提示词"),
            () => toast.error("复制失败")
        );
    }

    function handleReset() {
        startTransition(async () => {
            try {
                const result = await resetImportInterfacesToDefaults();
                if (result.error) {
                    toast.error(result.error);
                    return;
                }
                toast.success("已重置默认导入接口");
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "重置导入接口失败");
            }
        });
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-lg font-semibold">课表导入接口</h2>
                    <p className="text-sm text-muted-foreground">
                        后台统一控制用户侧可见的导入入口；学校格式可以通过 JSON 清单像安装 MOD 一样追加。
                    </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={handleReset} disabled={isPending}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    重置默认
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Upload className="w-4 h-4" />
                        新增导入入口
                    </CardTitle>
                    <CardDescription>
                        先复制提示词让 AI 生成入口清单 JSON，再把 JSON 文件上传。刷新后用户侧会出现新格式入口。
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
                    <div className="space-y-2">
                        <div className="rounded-md border border-border/70 bg-muted/25 p-3 text-xs text-muted-foreground space-y-1">
                            <p>上传文件只保存元数据和 AI 整理提示词，不执行任何上传代码。</p>
                            <p>课表原文件可以是 PDF、Word、Excel、CSV、HTML 或纯文本；入口会指导 AI 统一整理成 BumpFree 文本再导入。</p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={copyManifestPrompt}>
                            <Clipboard className="w-4 h-4 mr-2" />
                            复制入口生成提示词
                        </Button>
                    </div>
                    <form
                        action={async (formData) => {
                            const result = await uploadCustomImportInterface(formData);
                            if (result.error) {
                                toast.error(result.error);
                                return;
                            }
                            toast.success("已新增导入入口，刷新后可在用户侧使用");
                        }}
                        className="flex flex-col gap-2 sm:flex-row sm:items-center"
                    >
                        <Input name="manifest" type="file" accept=".json,application/json" className="h-9" />
                        <Button type="submit" size="sm" disabled={isPending}>
                            上传清单
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
                <InterfaceColumn
                    title="常规接口管理"
                    description="面向所有学校的通用文本、AI 整理和标准格式导入。"
                    icon={PlugZap}
                    items={general}
                    isPending={isPending}
                />
                <InterfaceColumn
                    title="学校专用接口管理"
                    description="逐个启用学校专用解析器，或管理上传清单生成的自定义入口。"
                    icon={School}
                    items={schools}
                    isPending={isPending}
                    onDelete={(id) => {
                        startTransition(async () => {
                            const result = await deleteCustomImportInterface(id);
                            if (result.error) {
                                toast.error(result.error);
                                return;
                            }
                            toast.success("已删除自定义导入入口");
                        });
                    }}
                />
            </div>
        </div>
    );
}

function InterfaceColumn({
    title,
    description,
    icon: Icon,
    items,
    isPending,
    onDelete,
}: {
    title: string;
    description: string;
    icon: typeof PlugZap;
    items: ImportInterfaceConfig[];
    isPending: boolean;
    onDelete?: (id: string) => void;
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    {title}
                </CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {items.map((item) => (
                    <InterfaceForm key={item.id} item={item} isPending={isPending} onDelete={onDelete} />
                ))}
            </CardContent>
        </Card>
    );
}

function InterfaceForm({
    item,
    isPending,
    onDelete,
}: {
    item: ImportInterfaceConfig;
    isPending: boolean;
    onDelete?: (id: string) => void;
}) {
    function copyPrompt() {
        if (!item.customMeta?.aiPrompt) return;
        void navigator.clipboard.writeText(item.customMeta.aiPrompt).then(
            () => toast.success("已复制该入口 AI 提示词"),
            () => toast.error("复制失败")
        );
    }

    return (
        <form
            action={async (formData) => {
                const result = await updateImportInterface(formData);
                if (result.error) {
                    toast.error(result.error);
                    return;
                }
                toast.success("接口配置已保存");
            }}
            className="rounded-md border border-border/70 p-3 space-y-3"
        >
            <input type="hidden" name="id" value={item.id} />
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-sm">{item.title}</p>
                        <Badge variant={item.enabled ? "default" : "secondary"} className="text-xs">
                            {item.enabled ? "已启用" : "已关闭"}
                        </Badge>
                        {item.isCustom && <Badge variant="outline" className="text-xs">自定义</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                        {item.schoolName ? `${item.schoolName} / ` : ""}{item.adapterKey}
                    </p>
                </div>
                <FileCog className="w-4 h-4 text-muted-foreground mt-0.5" />
            </div>

            <div className="flex items-center gap-2">
                <Checkbox id={`${item.id}-enabled`} name="enabled" defaultChecked={item.enabled} />
                <Label htmlFor={`${item.id}-enabled`} className="text-sm">在用户导入面板显示</Label>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_5rem]">
                <div className="space-y-1.5">
                    <Label htmlFor={`${item.id}-title`} className="text-xs">显示名称</Label>
                    <Input id={`${item.id}-title`} name="title" defaultValue={item.title} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor={`${item.id}-order`} className="text-xs">排序</Label>
                    <Input id={`${item.id}-order`} name="sortOrder" type="number" defaultValue={item.sortOrder} className="h-8 text-sm" />
                </div>
            </div>

            <div className="space-y-1.5">
                <Label htmlFor={`${item.id}-desc`} className="text-xs">说明</Label>
                <Input id={`${item.id}-desc`} name="description" defaultValue={item.description} className="h-8 text-sm" />
            </div>

            {item.customMeta?.aiPrompt && (
                <Button type="button" size="sm" variant="outline" className="w-full" onClick={copyPrompt}>
                    <Clipboard className="w-4 h-4 mr-2" />
                    复制该入口 AI 提示词
                </Button>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
                <Button type="submit" size="sm" variant="outline" className="w-full" disabled={isPending}>
                    保存
                </Button>
                {item.isCustom && onDelete && (
                    <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="w-full"
                        disabled={isPending}
                        onClick={() => onDelete(item.id)}
                    >
                        <Trash2 className="w-4 h-4 mr-2" />
                        删除
                    </Button>
                )}
            </div>
        </form>
    );
}
