import "server-only";

import { EmailDirection, OutreachStatus, StartupStatus } from "@/generated/prisma/enums";
import { emailAddresses, isEmailAddress } from "@/lib/application-email";
import { prisma } from "@/lib/prisma";
import { loadProfile } from "@/lib/profile-data";

import { loadGoogleAccount } from "./google/account";
import { GoogleError } from "./google/errors";
import { sendMail } from "./google/gmail";
import { startupEmailSchema, type StartupEmail } from "./startups/types";
import { outreachDraft } from "./outreach-draft";

function emailsOf(value: unknown): StartupEmail[] {
  return startupEmailSchema.array().catch([]).parse(value ?? []);
}

/** Role/general addresses only: personal addresses need an application or an explicit manual choice. */
function publicContact(emails: StartupEmail[]): StartupEmail | null {
  return emails.find((email) => !email.onRequest) ?? null;
}

export type OutreachView = {
  id: string;
  startupId: string;
  company: string;
  website: string;
  recipient: string;
  contactType: string;
  sourceUrl: string;
  subject: string;
  body: string;
  status: OutreachStatus;
  threadId: string | null;
  sentAt: string | null;
  createdAt: string;
};

function view(row: Awaited<ReturnType<typeof prisma.outreach.findFirstOrThrow>> & { startup: { company: string; website: string } }): OutreachView {
  return {
    id: row.id,
    startupId: row.startupId,
    company: row.startup.company,
    website: row.startup.website,
    recipient: row.recipient,
    contactType: row.contactType,
    sourceUrl: row.sourceUrl,
    subject: row.subject,
    body: row.body,
    status: row.status,
    threadId: row.threadId,
    sentAt: row.sentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createStartupOutreach(startupId: string): Promise<string> {
  const startup = await prisma.startup.findUnique({ where: { id: startupId } });
  if (!startup) throw new Error("That startup is no longer in the list. Refresh the page.");
  if (startup.noApplicationsFrom) throw new Error("Their site says they don't take unsolicited applications. Apply through a posted job instead.");

  const contact = publicContact(emailsOf(startup.emails));
  if (!contact) throw new Error("This startup has no published hiring or general address. Find addresses on their site first.");

  const existing = await prisma.outreach.findUnique({ where: { startupId_recipient: { startupId, recipient: contact.email } } });
  if (existing) return existing.id;

  const profile = await loadProfile();
  const draft = outreachDraft({
    company: startup.company,
    contactType: contact.label,
    headline: profile.basics.headline,
    summary: profile.basics.summary,
    name: profile.basics.name,
  });
  const created = await prisma.outreach.create({
    data: {
      startupId,
      recipient: contact.email,
      contactType: contact.label,
      sourceUrl: contact.from,
      subject: draft.subject,
      body: draft.body,
    },
  });
  return created.id;
}

export async function getOutreach(id: string): Promise<OutreachView | null> {
  const row = await prisma.outreach.findUnique({ where: { id }, include: { startup: { select: { company: true, website: true } } } });
  return row ? view(row) : null;
}

export async function listOutreach(): Promise<OutreachView[]> {
  const rows = await prisma.outreach.findMany({ orderBy: [{ status: "asc" }, { updatedAt: "desc" }], include: { startup: { select: { company: true, website: true } } } });
  return rows.map(view);
}

export async function saveOutreach(id: string, changes: { recipient: string; subject: string; body: string }): Promise<void> {
  if (!isEmailAddress(changes.recipient.trim())) throw new Error("Enter one valid recipient address.");
  if (!changes.subject.trim()) throw new Error("Write a subject first.");
  if (!changes.body.trim()) throw new Error("Write a message first.");
  const { count } = await prisma.outreach.updateMany({ where: { id, status: OutreachStatus.DRAFT }, data: { recipient: changes.recipient.trim(), subject: changes.subject.trim(), body: changes.body.trim() } });
  if (count === 0) throw new Error("That outreach is already sent or no longer exists.");
}

async function sender(address: string): Promise<string> {
  const name = (await loadProfile()).basics.name.trim().replace(/[<>\"]/g, "");
  return name ? `${name} <${address}>` : address;
}

export async function sendOutreach(id: string): Promise<{ threadId: string }> {
  const account = await loadGoogleAccount();
  if (!account) throw new GoogleError("not-connected", "Connect your Google account in Settings → Google first.");
  const outreach = await prisma.outreach.findUnique({ where: { id }, include: { startup: { select: { id: true, company: true } } } });
  if (!outreach) throw new GoogleError("unavailable", "That outreach no longer exists.");
  if (outreach.status === OutreachStatus.SENT) throw new GoogleError("unavailable", "That outreach was already sent.");
  if (!isEmailAddress(outreach.recipient) || !outreach.subject.trim() || !outreach.body.trim()) throw new GoogleError("unavailable", "Finish the recipient, subject and message first.");

  const sent = await sendMail({ from: await sender(account.email), to: outreach.recipient, subject: outreach.subject, body: outreach.body });
  const name = (await loadProfile()).basics.name.trim();
  await prisma.$transaction([
    prisma.outreach.update({ where: { id, status: OutreachStatus.DRAFT }, data: { status: OutreachStatus.SENT, gmailId: sent.id, threadId: sent.threadId, sentAt: new Date() } }),
    prisma.emailMessage.create({
      data: {
        gmailId: sent.id,
        threadId: sent.threadId,
        outreachId: id,
        direction: EmailDirection.OUTGOING,
        fromName: name,
        fromAddress: account.email.toLowerCase(),
        toAddress: outreach.recipient,
        subject: outreach.subject,
        body: outreach.body,
        sentAt: new Date(),
        handledAt: new Date(),
      },
    }),
    prisma.startup.update({ where: { id: outreach.startup.id }, data: { status: StartupStatus.CONTACTED } }),
  ]);
  return { threadId: sent.threadId };
}

export function sourceLabel(contactType: string, sourceUrl: string): string {
  return `${contactType} address${sourceUrl ? ` published at ${sourceUrl}` : ""}`;
}

export { emailAddresses };
