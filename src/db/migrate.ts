import { DB_TABLES, db } from "@/db";

const createTasksTable = `
CREATE TABLE IF NOT EXISTS ${DB_TABLES.tasks} (
  id varchar(30) PRIMARY KEY,
  code varchar(128) NOT NULL UNIQUE,
  title varchar(128),
  status varchar(30) NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in-progress', 'done', 'canceled')),
  priority varchar(30) NOT NULL DEFAULT 'low' CHECK (priority IN ('low', 'medium', 'high')),
  label varchar(30) NOT NULL DEFAULT 'bug' CHECK (label IN ('bug', 'feature', 'enhancement', 'documentation')),
  estimated_hours real NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp DEFAULT CURRENT_TIMESTAMP
);`;

const createSkatersTable = `
CREATE TABLE IF NOT EXISTS ${DB_TABLES.skaters} (
  id varchar(30) PRIMARY KEY,
  "order" integer NOT NULL DEFAULT 0,
  name varchar(128),
  email varchar(256),
  stance varchar(30) NOT NULL DEFAULT 'regular' CHECK (stance IN ('regular', 'goofy')),
  style varchar(30) NOT NULL DEFAULT 'street' CHECK (style IN ('street', 'vert', 'park', 'freestyle', 'all-around')),
  status varchar(30) NOT NULL DEFAULT 'amateur' CHECK (status IN ('amateur', 'sponsored', 'pro', 'legend')),
  years_skating integer NOT NULL DEFAULT 0,
  started_skating timestamp,
  is_pro boolean NOT NULL DEFAULT false,
  tricks jsonb,
  media jsonb,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp DEFAULT CURRENT_TIMESTAMP
);`;

export async function runMigrate() {
  console.log("⏳ Running SQL migrations...");
  const start = Date.now();

  await db.unsafe(createTasksTable);
  await db.unsafe(createSkatersTable);

  console.log(`✅ Migrations completed in ${Date.now() - start}ms`);
  process.exit(0);
}

runMigrate().catch((err) => {
  console.error("❌ Migration failed");
  console.error(err);
  process.exit(1);
});
