import { getErrorMessage } from "@/lib/handle-error";

import { emitMailsChanged } from "./mail-events";
import type { UpdateMailSchema } from "./validations";

async function request(path: string, init: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(
      body.error ?? `Request failed with status ${response.status}`
    );
  }

  return response.json().catch(() => null);
}

export async function updateMail(input: UpdateMailSchema & { id: string }) {
  try {
    await request(`/api/mails/${input.id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    emitMailsChanged();
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

export async function deleteMail(input: { id: string }) {
  try {
    await request(`/api/mails/${input.id}`, { method: "DELETE" });
    emitMailsChanged();
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
