"use server";

import { customAlphabet } from "nanoid";
import { updateTag } from "next/cache";
import { DB_TABLES, db } from "@/db/index";
import type { Task } from "@/db/schema";

import { getErrorMessage } from "@/lib/handle-error";

import { generateRandomTask } from "./utils";
import type { CreateTaskSchema, UpdateTaskSchema } from "./validations";

export async function seedTasks(input: { count: number }) {
  const count = input.count ?? 100;

  try {
    const allTasks: Task[] = [];
    for (let i = 0; i < count; i++) allTasks.push(generateRandomTask());

    await db.unsafe(`DELETE FROM ${DB_TABLES.tasks}`);
    console.log("📝 Inserting tasks", allTasks.length);

    for (const task of allTasks) {
      await db.unsafe(
        `INSERT INTO ${DB_TABLES.tasks} (id, code, title, status, priority, label, estimated_hours, archived)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [
          task.id,
          task.code,
          task.title,
          task.status,
          task.priority,
          task.label,
          task.estimatedHours,
          task.archived,
        ],
      );
    }
  } catch (err) {
    console.error(err);
  }
}

export async function createTask(input: CreateTaskSchema) {
  try {
    await db.begin(async (tx) => {
      const [newTask] = await tx.unsafe<Array<{ id: string }>>(
        `INSERT INTO ${DB_TABLES.tasks} (code, title, status, label, priority)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          `TASK-${customAlphabet("0123456789", 4)()}`,
          input.title,
          input.status,
          input.label,
          input.priority,
        ],
      );

      const [oldest] = await tx.unsafe<Array<{ id: string }>>(
        `SELECT id FROM ${DB_TABLES.tasks} WHERE id != $1 ORDER BY created_at ASC LIMIT 1`,
        [newTask?.id ?? ""],
      );
      if (oldest?.id) {
        await tx.unsafe(`DELETE FROM ${DB_TABLES.tasks} WHERE id = $1`, [
          oldest.id,
        ]);
      }
    });

    updateTag("tasks");
    updateTag("task-status-counts");
    updateTag("task-priority-counts");
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

export async function updateTask(input: UpdateTaskSchema & { id: string }) {
  try {
    await db.unsafe(
      `UPDATE ${DB_TABLES.tasks}
       SET title = $1, label = $2, status = $3, priority = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [
        input.title ?? null,
        input.label ?? null,
        input.status ?? null,
        input.priority ?? null,
        input.id,
      ],
    );

    updateTag("tasks");
    updateTag("task-status-counts");
    updateTag("task-priority-counts");
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

export async function updateTasks(input: {
  ids: string[];
  label?: Task["label"];
  status?: Task["status"];
  priority?: Task["priority"];
}) {
  try {
    await db.unsafe(
      `UPDATE ${DB_TABLES.tasks}
       SET label = COALESCE($1, label),
           status = COALESCE($2, status),
           priority = COALESCE($3, priority),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($4)`,
      [
        input.label ?? null,
        input.status ?? null,
        input.priority ?? null,
        input.ids,
      ],
    );

    updateTag("tasks");
    updateTag("task-status-counts");
    updateTag("task-priority-counts");
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

export async function deleteTask(input: { id: string }) {
  try {
    await db.begin(async (tx) => {
      await tx.unsafe(`DELETE FROM ${DB_TABLES.tasks} WHERE id = $1`, [
        input.id,
      ]);
      const task = generateRandomTask();
      await tx.unsafe(
        `INSERT INTO ${DB_TABLES.tasks} (id, code, title, status, priority, label, estimated_hours, archived)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          task.id,
          task.code,
          task.title,
          task.status,
          task.priority,
          task.label,
          task.estimatedHours,
          task.archived,
        ],
      );
    });

    updateTag("tasks");
    updateTag("task-status-counts");
    updateTag("task-priority-counts");
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

export async function deleteTasks(input: { ids: string[] }) {
  try {
    await db.begin(async (tx) => {
      await tx.unsafe(`DELETE FROM ${DB_TABLES.tasks} WHERE id = ANY($1)`, [
        input.ids,
      ]);
      for (const _ of input.ids) {
        const task = generateRandomTask();
        await tx.unsafe(
          `INSERT INTO ${DB_TABLES.tasks} (id, code, title, status, priority, label, estimated_hours, archived)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            task.id,
            task.code,
            task.title,
            task.status,
            task.priority,
            task.label,
            task.estimatedHours,
            task.archived,
          ],
        );
      }
    });

    updateTag("tasks");
    updateTag("task-status-counts");
    updateTag("task-priority-counts");
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
