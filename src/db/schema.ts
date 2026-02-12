import type { FileCellData } from "@/types/data-grid";

export const TASK_STATUS = ["todo", "in-progress", "done", "canceled"] as const;
export const TASK_PRIORITY = ["low", "medium", "high"] as const;
export const TASK_LABEL = [
  "bug",
  "feature",
  "enhancement",
  "documentation",
] as const;

export const SKATER_STANCE = ["regular", "goofy"] as const;
export const SKATER_STYLE = [
  "street",
  "vert",
  "park",
  "freestyle",
  "all-around",
] as const;
export const SKATER_STATUS = ["amateur", "sponsored", "pro", "legend"] as const;

export interface Task {
  id: string;
  code: string;
  title: string | null;
  status: (typeof TASK_STATUS)[number];
  priority: (typeof TASK_PRIORITY)[number];
  label: (typeof TASK_LABEL)[number];
  estimatedHours: number;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date | null;
}

export type NewTask = Omit<Task, "createdAt" | "updatedAt"> & {
  createdAt?: Date;
  updatedAt?: Date | null;
};

export interface Skater {
  id: string;
  order: number;
  name: string | null;
  email: string | null;
  stance: (typeof SKATER_STANCE)[number];
  style: (typeof SKATER_STYLE)[number];
  status: (typeof SKATER_STATUS)[number];
  yearsSkating: number;
  startedSkating: Date | null;
  isPro: boolean;
  tricks: string[] | null;
  media: Array<FileCellData> | null;
  createdAt: Date;
  updatedAt: Date | null;
}

export type NewSkater = Omit<Skater, "createdAt" | "updatedAt"> & {
  createdAt?: Date;
  updatedAt?: Date | null;
};

export const tasks = {
  label: { enumValues: [...TASK_LABEL] },
  status: { enumValues: [...TASK_STATUS] },
  priority: { enumValues: [...TASK_PRIORITY] },
} as const;

export const skaters = {
  stance: { enumValues: [...SKATER_STANCE] },
  style: { enumValues: [...SKATER_STYLE] },
  status: { enumValues: [...SKATER_STATUS] },
} as const;
