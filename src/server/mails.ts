import { DB_TABLES, db } from "@/db";
import type { Mail } from "@/db/schema";

type SqlParam = string | number | boolean | Date | null | string[];

interface RawMailRow {
  id: string;
  name: string;
  email: string;
  subject: string;
  body: string;
  folder: Mail["folder"];
  read: boolean;
  labels: string | string[];
  createdAt: Date | string;
  updatedAt: Date | string | null;
}

function mapMailRow(row: RawMailRow): Mail {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    subject: row.subject,
    body: row.body,
    folder: row.folder,
    read: Boolean(row.read),
    labels: (typeof row.labels === "string"
      ? JSON.parse(row.labels)
      : row.labels) as Mail["labels"],
    createdAt:
      row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
  };
}

export interface GetMailsInput {
  folder: Mail["folder"];
  search: string;
  unreadOnly: boolean;
}

export async function getMails(input: GetMailsInput): Promise<Mail[]> {
  const whereClauses: string[] = ["folder = $1"];
  const values: SqlParam[] = [input.folder];

  if (input.search) {
    const paramIndex = values.length + 1;
    whereClauses.push(
      `(subject ILIKE $${paramIndex} OR name ILIKE $${paramIndex} OR body ILIKE $${paramIndex})`
    );
    values.push(`%${input.search}%`);
  }

  if (input.unreadOnly) {
    whereClauses.push("read = false");
  }

  const rows = await db.unsafe<RawMailRow[]>(
    `SELECT id, name, email, subject, body, folder, read, labels,
       created_at AS "createdAt", updated_at AS "updatedAt"
     FROM ${DB_TABLES.mails}
     WHERE ${whereClauses.join(" AND ")}
     ORDER BY created_at DESC`,
    values
  );

  return rows.map(mapMailRow);
}

export async function getMailById(id: string): Promise<Mail | null> {
  const [row] = await db.unsafe<RawMailRow[]>(
    `SELECT id, name, email, subject, body, folder, read, labels,
       created_at AS "createdAt", updated_at AS "updatedAt"
     FROM ${DB_TABLES.mails}
     WHERE id = $1`,
    [id]
  );

  return row ? mapMailRow(row) : null;
}

export interface UpdateMailInput {
  id: string;
  read?: boolean;
  folder?: Mail["folder"];
  labels?: Mail["labels"];
}

export async function updateMail(input: UpdateMailInput) {
  const fields: string[] = [];
  const values: SqlParam[] = [];

  if (input.read !== undefined) {
    fields.push(`read = $${values.length + 1}`);
    values.push(input.read);
  }
  if (input.folder !== undefined) {
    fields.push(`folder = $${values.length + 1}`);
    values.push(input.folder);
  }
  if (input.labels !== undefined) {
    fields.push(`labels = $${values.length + 1}::jsonb`);
    values.push(JSON.stringify(input.labels));
  }

  if (fields.length === 0) {
    return;
  }

  values.push(input.id);
  await db.unsafe(
    `UPDATE ${DB_TABLES.mails}
     SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${values.length}`,
    values
  );
}

export async function deleteMail(id: string) {
  await db.unsafe(`DELETE FROM ${DB_TABLES.mails} WHERE id = $1`, [id]);
}

export async function getMailFolderCounts(): Promise<Record<string, number>> {
  const rows = await db.unsafe<Array<{ folder: string; count: string }>>(
    `SELECT folder, COUNT(*)::text AS count
     FROM ${DB_TABLES.mails}
     GROUP BY folder`
  );

  const counts: Record<string, number> = {};
  for (const { folder, count } of rows) {
    counts[folder] = Number(count);
  }
  return counts;
}
