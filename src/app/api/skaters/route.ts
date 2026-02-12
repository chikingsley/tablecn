import { NextResponse } from "next/server";
import {
  deleteSkatersSchema,
  insertSkaterSchema,
  insertSkatersSchema,
  updateSkatersSchema,
} from "@/app/data-grid-live/lib/validation";
import { DB_TABLES, db } from "@/db";
import type { Skater } from "@/db/schema";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET() {
  try {
    const allSkaters = await db.unsafe(
      `SELECT * FROM ${DB_TABLES.skaters} ORDER BY "order" ASC`,
    );
    return NextResponse.json(allSkaters);
  } catch (error) {
    console.error({ error });
    return NextResponse.json(
      { error: "Failed to fetch skaters" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit();
  if (!rateLimit.success) return rateLimitResponse(rateLimit);

  try {
    const body: unknown = await request.json();
    const bulkResult = insertSkatersSchema.safeParse(body);

    if (bulkResult.success) {
      const inserted: unknown[] = [];
      for (const skater of bulkResult.data.skaters) {
        const [row] = await db.unsafe(
          `INSERT INTO ${DB_TABLES.skaters} (id, "order", name, email, stance, style, status, years_skating, started_skating, is_pro, tricks, media)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb)
           RETURNING *`,
          [
            skater.id ?? null,
            skater.order ?? 0,
            skater.name ?? null,
            skater.email ?? null,
            skater.stance ?? "regular",
            skater.style ?? "street",
            skater.status ?? "amateur",
            skater.yearsSkating ?? 0,
            skater.startedSkating ?? null,
            skater.isPro ?? false,
            JSON.stringify(skater.tricks ?? []),
            JSON.stringify(skater.media ?? []),
          ],
        );
        if (row) inserted.push(row);
      }

      return NextResponse.json({
        inserted: inserted.length,
        skaters: inserted,
      });
    }

    const singleResult = insertSkaterSchema.safeParse(body);
    if (!singleResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: singleResult.error.flatten(),
        },
        { status: 400 },
      );
    }

    const [newSkater] = await db.unsafe(
      `INSERT INTO ${DB_TABLES.skaters} (id, "order", name, email, stance, style, status, years_skating, started_skating, is_pro, tricks, media)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb)
       RETURNING *`,
      [
        singleResult.data.id ?? null,
        singleResult.data.order ?? 0,
        singleResult.data.name ?? null,
        singleResult.data.email ?? null,
        singleResult.data.stance ?? "regular",
        singleResult.data.style ?? "street",
        singleResult.data.status ?? "amateur",
        singleResult.data.yearsSkating ?? 0,
        singleResult.data.startedSkating ?? null,
        singleResult.data.isPro ?? false,
        JSON.stringify(singleResult.data.tricks ?? []),
        JSON.stringify(singleResult.data.media ?? []),
      ],
    );

    return NextResponse.json(newSkater);
  } catch (error) {
    console.error({ error });
    return NextResponse.json(
      { error: "Failed to create skater" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const rateLimit = await checkRateLimit();
  if (!rateLimit.success) return rateLimitResponse(rateLimit);

  try {
    const body: unknown = await request.json();
    const result = updateSkatersSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: result.error.flatten() },
        { status: 400 },
      );
    }

    const { updates } = result.data;
    const updated = await db.begin(async (tx) => {
      let count = 0;
      for (const { id, changes } of updates) {
        const fields: string[] = [];
        const values: Array<string | number | boolean | Date | null> = [];

        if (changes.order !== undefined) {
          fields.push(`"order" = $${values.length + 1}`);
          values.push(changes.order);
        }
        if (changes.name !== undefined) {
          fields.push(`name = $${values.length + 1}`);
          values.push(changes.name);
        }
        if (changes.email !== undefined) {
          fields.push(`email = $${values.length + 1}`);
          values.push(changes.email);
        }
        if (changes.stance !== undefined) {
          fields.push(`stance = $${values.length + 1}`);
          values.push(changes.stance);
        }
        if (changes.style !== undefined) {
          fields.push(`style = $${values.length + 1}`);
          values.push(changes.style);
        }
        if (changes.status !== undefined) {
          fields.push(`status = $${values.length + 1}`);
          values.push(changes.status);
        }
        if (changes.yearsSkating !== undefined) {
          fields.push(`years_skating = $${values.length + 1}`);
          values.push(changes.yearsSkating);
        }
        if (changes.startedSkating !== undefined) {
          fields.push(`started_skating = $${values.length + 1}`);
          values.push(changes.startedSkating);
        }
        if (changes.isPro !== undefined) {
          fields.push(`is_pro = $${values.length + 1}`);
          values.push(changes.isPro);
        }
        if (changes.tricks !== undefined) {
          fields.push(`tricks = $${values.length + 1}::jsonb`);
          values.push(JSON.stringify(changes.tricks));
        }
        if (changes.media !== undefined) {
          fields.push(`media = $${values.length + 1}::jsonb`);
          values.push(JSON.stringify(changes.media));
        }

        if (fields.length === 0) continue;
        values.push(id);
        const resultRows = await tx.unsafe(
          `UPDATE ${DB_TABLES.skaters} SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length} RETURNING id`,
          values,
        );
        count += resultRows.length;
      }
      return count;
    });

    return NextResponse.json({ updated });
  } catch (error) {
    console.error({ error });
    return NextResponse.json(
      { error: "Failed to update skaters" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const rateLimit = await checkRateLimit();
  if (!rateLimit.success) return rateLimitResponse(rateLimit);

  try {
    const body: unknown = await request.json();
    const result = deleteSkatersSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: result.error.flatten() },
        { status: 400 },
      );
    }

    const deleted = await db.unsafe(
      `DELETE FROM ${DB_TABLES.skaters} WHERE id = ANY($1) RETURNING id`,
      [result.data.ids],
    );
    return NextResponse.json({ deleted: deleted.length });
  } catch (error) {
    console.error({ error });
    return NextResponse.json(
      { error: "Failed to delete skaters" },
      { status: 500 },
    );
  }
}
