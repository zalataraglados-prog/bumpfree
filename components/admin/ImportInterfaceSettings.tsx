"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { updateImportInterface, resetImportInterfacesToDefaults } from "@/lib/actions/import-interfaces";
import type { ImportInterfaceConfig } from "@/lib/utils/importInterfaces";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { FileCog, PlugZap, RotateCcw, School } from "lucide-react";

export function ImportInterfaceSettings({ interfaces }: { interfaces: ImportInterfaceConfig[] }) {
    const [isPending, startTransition] = useTransition();
    const general = interfaces.filter((item) => item.category === "general");
    const schools = interfaces.filter((item) => item.category === "school");

    function handleReset() {
        startTransition(async () => {
            try {
                const result = await resetImportInterfacesToDefaults();
                if (result.error) {
                    toast.error(result.error);
                    return;
                }
                toast.success("已重置导入接口");
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
                        后台统一控制用户侧可见的导入入口；新增学校格式时只需要新增适配器和默认接口配置。
                    </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={handleReset} disabled={isPending}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    重置默认
                </Button>
            </div>

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
                    description="像加 MOD 一样逐个启用学校专用解析器。"
                    icon={School}
                    items={schools}
                    isPending={isPending}
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
}: {
    title: string;
    description: string;
    icon: typeof PlugZap;
    items: ImportInterfaceConfig[];
    isPending: boolean;
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
                    <InterfaceForm key={item.id} item={item} isPending={isPending} />
                ))}
            </CardContent>
        </Card>
    );
}

function InterfaceForm({ item, isPending }: { item: ImportInterfaceConfig; isPending: boolean }) {
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
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                        {item.schoolName ? `${item.schoolName} · ` : ""}{item.adapterKey}
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

            <Button type="submit" size="sm" variant="outline" className="w-full" disabled={isPending}>
                保存
            </Button>
        </form>
    );
}
