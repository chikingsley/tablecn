import { DB_TABLES, db } from "@/db/index";
import type { Mail, Skater, Task } from "@/db/schema";

import {
  generateRandomMail,
  generateRandomSkater,
  generateRandomTask,
} from "./utils";

export async function seedTasks(input: { count: number }) {
  const count = input.count ?? 100;

  try {
    const allTasks: Task[] = [];
    for (let i = 0; i < count; i++) {
      allTasks.push(generateRandomTask());
    }

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
        ]
      );
    }
  } catch (err) {
    console.error(err);
  }
}

export async function seedSkaters(input: { count: number }) {
  const count = input.count ?? 100;

  try {
    const allSkaters: Skater[] = [];
    for (let i = 0; i < count; i++) {
      allSkaters.push(generateRandomSkater({ order: i }));
    }

    await db.unsafe(`DELETE FROM ${DB_TABLES.skaters}`);
    console.log("🛹 Inserting skaters", allSkaters.length);

    for (const skater of allSkaters) {
      await db.unsafe(
        `INSERT INTO ${DB_TABLES.skaters} (id, "order", name, email, stance, style, status, years_skating, started_skating, is_pro, tricks, media)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb)
         ON CONFLICT (id) DO NOTHING`,
        [
          skater.id,
          skater.order,
          skater.name,
          skater.email,
          skater.stance,
          skater.style,
          skater.status,
          skater.yearsSkating,
          skater.startedSkating,
          skater.isPro,
          JSON.stringify(skater.tricks ?? []),
          JSON.stringify(skater.media ?? []),
        ]
      );
    }
  } catch (err) {
    console.error(err);
  }
}

export async function seedMails(input: { count: number }) {
  const count = input.count ?? 50;

  try {
    const allMails: Mail[] = [];
    for (let i = 0; i < count; i++) {
      allMails.push(generateRandomMail());
    }

    await db.unsafe(`DELETE FROM ${DB_TABLES.mails}`);
    console.log("📧 Inserting mails", allMails.length);

    for (const mail of allMails) {
      await db.unsafe(
        `INSERT INTO ${DB_TABLES.mails} (id, name, email, subject, body, folder, read, labels, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
         ON CONFLICT (id) DO NOTHING`,
        [
          mail.id,
          mail.name,
          mail.email,
          mail.subject,
          mail.body,
          mail.folder,
          mail.read,
          JSON.stringify(mail.labels),
          mail.createdAt,
        ]
      );
    }
  } catch (err) {
    console.error(err);
  }
}
