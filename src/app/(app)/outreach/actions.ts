"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { action, ActionError } from "@/lib/action";
import { GoogleError } from "@/lib/google/errors";
import { saveOutreach, sendOutreach } from "@/lib/outreach";

const id = z.string().min(1).max(64);

export const saveOutreachDraft = action(
  z.object({ id, recipient: z.string().trim().max(300), subject: z.string().max(500), body: z.string().max(20_000) }),
  async ({ id: outreachId, recipient, subject, body }) => {
    try {
      await saveOutreach(outreachId, { recipient, subject, body });
    } catch (error) {
      throw new ActionError(error instanceof Error ? error.message : "That outreach could not be saved.");
    }
    revalidatePath(`/outreach/${outreachId}`);
    revalidatePath("/outreach");
    return null;
  },
);

export const sendOutreachDraft = action(z.object({ id }), async ({ id: outreachId }, { toast }) => {
  try {
    const sent = await sendOutreach(outreachId);
    revalidatePath(`/outreach/${outreachId}`);
    revalidatePath("/outreach");
    revalidatePath("/startups");
    toast("Sent. I’ll keep the Gmail thread with your outreach.");
    return sent;
  } catch (error) {
    if (error instanceof GoogleError) throw new ActionError(error.message);
    throw new ActionError(error instanceof Error ? error.message : "That outreach could not be sent.");
  }
});
