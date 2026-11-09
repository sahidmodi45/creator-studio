"use client";

import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Toast } from "@/components/ui";
import { rescheduleContent } from "@/lib/actions/content";
import { WEEKDAYS } from "@/lib/calendar";
import { STATUS_LABEL, type ContentStatus } from "@/lib/constants";

export type CalendarEntry = { id: string; title: string; status: ContentStatus; scheduledDate: string; scheduledTime: string | null };

function Entry({ entry, slug }: { entry: CalendarEntry; slug: string }) {
  const { setNodeRef, listeners, attributes, transform, isDragging } = useDraggable({ id: entry.id });
  const router = useRouter();
  const href = `/admin/${slug}/content/${entry.id}`;
  return (
    <div
      ref={setNodeRef}
      className={`calendar-item st-${entry.status}${isDragging ? " is-dragging" : ""}`}
      style={{ transform: CSS.Translate.toString(transform), cursor: "grab", zIndex: isDragging ? 10 : undefined, position: "relative" }}
      title={`${entry.title} · ${STATUS_LABEL[entry.status]}`}
      data-testid="calendar-entry"
      data-title={entry.title}
      {...listeners}
      {...attributes}
      role="link"
      onClick={() => router.push(href)}
      onKeyDown={(event) => {
        if (event.key === "Enter") router.push(href);
      }}
    >
      {entry.scheduledTime ? `${entry.scheduledTime} ` : ""}{entry.title}
    </div>
  );
}

function Day({ day, today, entries, slug }: { day: { date: string; day: number; inMonth: boolean }; today: string; entries: CalendarEntry[]; slug: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: day.date });
  return (
    <div ref={setNodeRef} data-date={day.date} data-testid={`day-${day.date}`} className={`calendar-day${day.inMonth ? "" : " other"}${day.date === today ? " today" : ""}${isOver ? " is-over" : ""}`}>
      <span className="calendar-num">{day.day}</span>
      {entries.map((entry) => <Entry key={entry.id} entry={entry} slug={slug} />)}
    </div>
  );
}

export function CalendarBoard({
  days,
  entries: initial,
  today,
  slug,
}: {
  days: { date: string; day: number; inMonth: boolean }[];
  entries: CalendarEntry[];
  today: string;
  slug: string;
}) {
  const [entries, setEntries] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  useEffect(() => setEntries(initial), [initial]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const date = event.over?.id ? String(event.over.id) : null;
    const id = String(event.active.id);
    const entry = entries.find((row) => row.id === id);
    if (!date || !entry || entry.scheduledDate === date) return;
    const previous = entries;
    setEntries((current) => current.map((row) => (row.id === id ? { ...row, scheduledDate: date } : row)));
    start(async () => {
      const result = await rescheduleContent(id, date);
      if (result?.error) {
        setEntries(previous);
        setError(result.error);
      }
    });
  };

  return (
    <DndContext id="calendar" sensors={sensors} onDragEnd={onDragEnd}>
      <div className="calendar" data-testid="calendar">
        {WEEKDAYS.map((day) => <div className="calendar-head" key={day}>{day}</div>)}
        {days.map((day) => (
          <Day key={day.date} day={day} today={today} slug={slug} entries={entries.filter((entry) => entry.scheduledDate === day.date)} />
        ))}
      </div>
      {error && <Toast message={error} tone="error" onDone={() => setError(null)} />}
    </DndContext>
  );
}
