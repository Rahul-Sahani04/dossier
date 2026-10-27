import { startupEmailSchema, type StartupEmail } from "./startups/types";

/** A concise, editable first message for a company that publishes a contact. */
export function outreachDraft({ company, contactType, headline, summary, name }: { company: string; contactType: string; headline: string; summary: string; name: string }) {
  const role = headline.trim() || "job seeker";
  const intro = summary.trim() ? `I’m ${name.trim() || "a job seeker"}, a ${role.toLowerCase()}. ${summary.trim()}` : `I’m ${name.trim() || "a job seeker"}, and I’m exploring opportunities where I can contribute as a ${role.toLowerCase()}.`;
  return {
    subject: `Interest in opportunities at ${company}`,
    body: [`Hello ${/founder/i.test(contactType) ? "founders" : "hiring team"},`, "", intro, "", `I’d be grateful to know whether ${company} expects to hire for roles that could be a fit. I’ve included a short overview of my background below and would be happy to share a resume or speak if useful.`, "", "Kind regards,", name.trim()].filter(Boolean).join("\n"),
  };
}

function publicContact(emails: StartupEmail[]): StartupEmail | null {
  return emails.find((email) => !email.onRequest) ?? null;
}

/** Picks an explicitly published role/general address, never a personal lookup. */
export function firstAddress(value: unknown): string {
  return publicContact(startupEmailSchema.array().catch([]).parse(value ?? []))?.email ?? "";
}
