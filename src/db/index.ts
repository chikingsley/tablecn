import postgres from "postgres";
import { env } from "@/env";
import { DATABASE_PREFIX } from "@/lib/constants";

export const db = postgres(env.DATABASE_URL);

export const DB_TABLES = {
  tasks: `${DATABASE_PREFIX}_tasks`,
  skaters: `${DATABASE_PREFIX}_skaters`,
  mails: `${DATABASE_PREFIX}_mails`,
} as const;
