import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { buttonClassName } from "@/components/ui/button";
import { listOutreach } from "@/lib/outreach";

export const metadata: Metadata = { title: "Outreach" };

export default async function OutreachPage() {
  const rows = await listOutreach();
  return (
    <>
      <PageHeader title="Outreach" description="Reviewable messages to companies about possible job openings, kept separate from applications." />
      <div className="flex flex-col gap-4 px-10 pb-20">
        {rows.length === 0 ? (
          <div className="rounded-panel border border-dashed border-line-strong px-7 py-10 text-center text-sm text-muted">
            <p>No outreach drafts yet.</p>
            <Link href="/startups" className={buttonClassName("primary", "sm", "mt-4 hover:text-on-primary")}>
              Find startups to contact
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((row) => (
              <li key={row.id}>
                <Link href={`/outreach/${row.id}`} className="flex flex-col gap-1 rounded-panel border border-line-card bg-card px-6 py-5 hover:border-line-strong hover:bg-hover">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-serif text-section">{row.company}</h2>
                    <span className="text-meta text-muted">{row.status === "SENT" ? "Sent" : "Draft"}</span>
                  </div>
                  <p className="text-sm">{row.subject}</p>
                  <p className="text-meta text-muted">{row.recipient} · {row.contactType}{row.sentAt ? ` · ${new Date(row.sentAt).toLocaleDateString()}` : ""}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
