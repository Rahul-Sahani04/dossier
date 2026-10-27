import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { googleConnection } from "@/lib/google/account";
import { getOutreach } from "@/lib/outreach";

import { OutreachScreen } from "../outreach-screen";

export async function generateMetadata({ params }: PageProps<"/outreach/[id]">): Promise<Metadata> {
  const { id } = await params;
  const outreach = await getOutreach(id);
  return { title: outreach ? `Outreach · ${outreach.company}` : "Outreach" };
}

export default async function OutreachDetailPage({ params }: PageProps<"/outreach/[id]">) {
  const { id } = await params;
  const outreach = await getOutreach(id);
  if (!outreach) notFound();
  return <OutreachScreen outreach={outreach} google={await googleConnection()} />;
}
