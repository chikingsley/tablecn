import type { Mail } from "@/db/schema";

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

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function getMails(input: {
  folder: Mail["folder"];
  search?: string;
  unreadOnly?: boolean;
}): Promise<Mail[]> {
  try {
    const params = new URLSearchParams();
    params.set("folder", input.folder);
    if (input.search) {
      params.set("search", input.search);
    }
    if (input.unreadOnly) {
      params.set("unreadOnly", "true");
    }

    const rows = await fetchJson<RawMailRow[]>(
      `/api/mails?${params.toString()}`
    );
    return rows.map(mapMailRow);
  } catch {
    return [];
  }
}

export async function getMailFolderCounts(): Promise<Record<string, number>> {
  try {
    return await fetchJson<Record<string, number>>("/api/mails/folder-counts");
  } catch {
    return {};
  }
}
