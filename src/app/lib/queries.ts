"use cache";

import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { DB_TABLES, db } from "@/db";
import type { Task } from "@/db/schema";

import type { GetTasksSchema } from "./validations";

type SqlParam = string | number | boolean | Date | null | string[];

type RawTaskRow = {
  id: string;
  code: string;
  title: string | null;
  status: Task["status"];
  priority: Task["priority"];
  label: Task["label"];
  estimatedHours: number | string;
  archived: boolean;
  createdAt: Date | string;
  updatedAt: Date | string | null;
};

function mapTaskRow(row: RawTaskRow): Task {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    status: row.status,
    priority: row.priority,
    label: row.label,
    estimatedHours: Number(row.estimatedHours ?? 0),
    archived: Boolean(row.archived),
    createdAt:
      row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
  };
}

export async function getTasks(input: GetTasksSchema) {
  cacheLife({ revalidate: 1, stale: 1, expire: 60 });
  cacheTag("tasks");

  try {
    const offset = (input.page - 1) * input.perPage;
    const whereClauses: string[] = [];
    const values: SqlParam[] = [];

    if (input.title) {
      whereClauses.push(`title ILIKE $${values.length + 1}`);
      values.push(`%${input.title}%`);
    }
    if (input.status.length > 0) {
      whereClauses.push(`status = ANY($${values.length + 1})`);
      values.push(input.status);
    }
    if (input.priority.length > 0) {
      whereClauses.push(`priority = ANY($${values.length + 1})`);
      values.push(input.priority);
    }
    if (input.estimatedHours[0]) {
      whereClauses.push(`estimated_hours >= $${values.length + 1}`);
      values.push(input.estimatedHours[0]);
    }
    if (input.estimatedHours[1]) {
      whereClauses.push(`estimated_hours <= $${values.length + 1}`);
      values.push(input.estimatedHours[1]);
    }
    if (input.createdAt[0]) {
      const start = new Date(input.createdAt[0]);
      start.setHours(0, 0, 0, 0);
      whereClauses.push(`created_at >= $${values.length + 1}`);
      values.push(start);
    }
    if (input.createdAt[1]) {
      const end = new Date(input.createdAt[1]);
      end.setHours(23, 59, 59, 999);
      whereClauses.push(`created_at <= $${values.length + 1}`);
      values.push(end);
    }

    const whereSql =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const sortable = new Set([
      "code",
      "title",
      "status",
      "priority",
      "label",
      "estimatedHours",
      "archived",
      "createdAt",
    ]);
    const orderBy =
      input.sort.length > 0
        ? input.sort
            .filter((item) => sortable.has(item.id))
            .map((item) => {
              const column =
                item.id === "estimatedHours"
                  ? "estimated_hours"
                  : item.id === "createdAt"
                    ? "created_at"
                    : item.id;
              return `${column} ${item.desc ? "DESC" : "ASC"}`;
            })
            .join(", ")
        : "created_at ASC";

    const rows = await db.unsafe<RawTaskRow[]>(
      `SELECT id, code, title, status, priority, label, estimated_hours AS "estimatedHours", archived, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM ${DB_TABLES.tasks}
       ${whereSql}
       ORDER BY ${orderBy}
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, input.perPage, offset],
    );

    const countRows = await db.unsafe<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM ${DB_TABLES.tasks} ${whereSql}`,
      values,
    );

    const total = Number(countRows[0]?.count ?? 0);
    return {
      data: rows.map(mapTaskRow),
      pageCount: Math.ceil(total / input.perPage),
    };
  } catch {
    return { data: [], pageCount: 0 };
  }
}

export async function getTaskStatusCounts() {
  cacheLife("hours");
  cacheTag("task-status-counts");
  try {
    const rows = await db.unsafe<Array<{ status: string; count: string }>>(
      `SELECT status, COUNT(*)::text AS count FROM ${DB_TABLES.tasks} GROUP BY status HAVING COUNT(*) > 0`,
    );
    return rows.reduce(
      (acc, { status, count }) => {
        if (status in acc) acc[status as keyof typeof acc] = Number(count);
        return acc;
      },
      { todo: 0, "in-progress": 0, done: 0, canceled: 0 },
    );
  } catch {
    return { todo: 0, "in-progress": 0, done: 0, canceled: 0 };
  }
}

export async function getTaskPriorityCounts() {
  cacheLife("hours");
  cacheTag("task-priority-counts");
  try {
    const rows = await db.unsafe<Array<{ priority: string; count: string }>>(
      `SELECT priority, COUNT(*)::text AS count FROM ${DB_TABLES.tasks} GROUP BY priority HAVING COUNT(*) > 0`,
    );
    return rows.reduce(
      (acc, { priority, count }) => {
        if (priority in acc) acc[priority as keyof typeof acc] = Number(count);
        return acc;
      },
      { low: 0, medium: 0, high: 0 },
    );
  } catch {
    return { low: 0, medium: 0, high: 0 };
  }
}

export async function getEstimatedHoursRange() {
  cacheLife("hours");
  cacheTag("estimated-hours-range");
  try {
    const [result] = await db.unsafe<
      Array<{ min: number | null; max: number | null }>
    >(
      `SELECT COALESCE(MIN(estimated_hours), 0) AS min, COALESCE(MAX(estimated_hours), 0) AS max FROM ${DB_TABLES.tasks}`,
    );
    return { min: Number(result?.min ?? 0), max: Number(result?.max ?? 0) };
  } catch {
    return { min: 0, max: 0 };
  }
}
