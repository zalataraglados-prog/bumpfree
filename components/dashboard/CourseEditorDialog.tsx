"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { addManualCourse, updateCourse } from "@/lib/actions/courses";
import { Plus, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";

const DAY_OPTIONS = [
    { value: "1", label: "周一" },
    { value: "2", label: "周二" },
    { value: "3", label: "周三" },
    { value: "4", label: "周四" },
    { value: "5", label: "周五" },
    { value: "6", label: "周六" },
    { value: "7", label: "周日" },
];

interface CourseEditorDialogProps {
    scheduleId: string;
    scheduleName: string;
    course?: {
        id: string;
        name: string;
        room: string | null;
        teacher: string | null;
        day_of_week: number;
        start_time: string;
        end_time: string;
        start_week: number;
        end_week: number;
    };
}

export function CourseEditorDialog({ scheduleId, scheduleName, course }: CourseEditorDialogProps) {
    const [open, setOpen] = useState(false);
    const [dayOfWeek, setDayOfWeek] = useState(String(course?.day_of_week ?? 1));
    const [isPending, startTransition] = useTransition();
    const router = useRouter();
    const isEdit = Boolean(course);

    function handleSubmit(formData: FormData) {
        formData.set("scheduleId", scheduleId);
        formData.set("dayOfWeek", dayOfWeek);
        if (course) formData.set("courseId", course.id);

        startTransition(async () => {
            const result = course ? await updateCourse(formData) : await addManualCourse(formData);
            if (result.error) {
                toast.error(result.error);
                return;
            }

            toast.success(course ? "课程已更新" : "课程已添加");
            setOpen(false);
            router.refresh();
        });
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                setOpen(nextOpen);
                if (!nextOpen) setDayOfWeek(String(course?.day_of_week ?? 1));
            }}
        >
            <DialogTrigger asChild>
                {isEdit ? (
                    <Button variant="ghost" size="sm" className="h-8 px-2">
                        <Pencil className="w-4 h-4" />
                    </Button>
                ) : (
                    <Button variant="outline" size="sm" className="gap-1.5">
                        <Plus className="w-3.5 h-3.5" />
                        手动加课
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{isEdit ? "编辑课程" : `为 ${scheduleName} 添加课程`}</DialogTitle>
                </DialogHeader>
                <form
                    action={handleSubmit}
                    className="space-y-4 mt-2"
                >
                    <div className="space-y-2">
                        <Label htmlFor={`course-name-${course?.id ?? scheduleId}`}>课程名称 *</Label>
                        <Input
                            id={`course-name-${course?.id ?? scheduleId}`}
                            name="name"
                            placeholder="高等数学"
                            defaultValue={course?.name ?? ""}
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label>星期 *</Label>
                            <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                                <SelectTrigger>
                                    <SelectValue placeholder="选择星期" />
                                </SelectTrigger>
                                <SelectContent>
                                    {DAY_OPTIONS.map((day) => (
                                        <SelectItem key={day.value} value={day.value}>
                                            {day.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor={`teacher-${course?.id ?? scheduleId}`}>教师</Label>
                            <Input
                                id={`teacher-${course?.id ?? scheduleId}`}
                                name="teacher"
                                placeholder="张老师"
                                defaultValue={course?.teacher ?? ""}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor={`start-time-${course?.id ?? scheduleId}`}>开始时间 *</Label>
                            <Input
                                id={`start-time-${course?.id ?? scheduleId}`}
                                name="startTime"
                                type="time"
                                defaultValue={course?.start_time ?? "08:00"}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor={`end-time-${course?.id ?? scheduleId}`}>结束时间 *</Label>
                            <Input
                                id={`end-time-${course?.id ?? scheduleId}`}
                                name="endTime"
                                type="time"
                                defaultValue={course?.end_time ?? "09:40"}
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor={`start-week-${course?.id ?? scheduleId}`}>开始周 *</Label>
                            <Input
                                id={`start-week-${course?.id ?? scheduleId}`}
                                name="startWeek"
                                type="number"
                                min={1}
                                defaultValue={course?.start_week ?? 1}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor={`end-week-${course?.id ?? scheduleId}`}>结束周 *</Label>
                            <Input
                                id={`end-week-${course?.id ?? scheduleId}`}
                                name="endWeek"
                                type="number"
                                min={1}
                                defaultValue={course?.end_week ?? 18}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor={`room-${course?.id ?? scheduleId}`}>教室</Label>
                        <Input
                            id={`room-${course?.id ?? scheduleId}`}
                            name="room"
                            placeholder="A-302"
                            defaultValue={course?.room ?? ""}
                        />
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            取消
                        </Button>
                        <Button type="submit" disabled={isPending}>
                            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {isEdit ? "保存修改" : "添加课程"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
