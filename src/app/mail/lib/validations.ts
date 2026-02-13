import * as z from "zod";

import { MAIL_FOLDER, MAIL_LABEL } from "@/db/schema";

export const mailSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  subject: z.string(),
  body: z.string(),
  folder: z.enum(MAIL_FOLDER),
  read: z.boolean(),
  labels: z.array(z.enum(MAIL_LABEL)),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date().nullable(),
});

export const updateMailSchema = z.object({
  read: z.boolean().optional(),
  folder: z.enum(MAIL_FOLDER).optional(),
  labels: z.array(z.enum(MAIL_LABEL)).optional(),
});

export type UpdateMailSchema = z.infer<typeof updateMailSchema>;
