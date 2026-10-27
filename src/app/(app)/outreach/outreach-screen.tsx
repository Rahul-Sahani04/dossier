"use client";

import Link from "next/link";
import { AlertDialog } from "radix-ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { toast, toastResult } from "@/components/toast";
import { PageHeader } from "@/components/page-header";
import { Button, buttonClassName } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { OutreachView } from "@/lib/outreach";
import type { GoogleConnection } from "@/lib/google/account";

import { saveOutreachDraft, sendOutreachDraft } from "./actions";

export function OutreachScreen({ outreach: initial, google }: { outreach: OutreachView; google: GoogleConnection }) {
  const router = useRouter();
  const [outreach, setOutreach] = useState(initial);
  const [recipient, setRecipient] = useState(initial.recipient);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [saving, startSaving] = useTransition();
  const [sending, startSending] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const sent = outreach.status === "SENT";

  const save = () =>
    startSaving(async () => {
      const result = toastResult(await saveOutreachDraft({ id: outreach.id, recipient, subject, body }));
      if (!result.ok) return;
      setOutreach({ ...outreach, recipient: recipient.trim(), subject: subject.trim(), body: body.trim() });
      toast("Outreach draft saved.");
      router.refresh();
    });

  const send = () =>
    startSending(async () => {
      const saved = await saveOutreachDraft({ id: outreach.id, recipient, subject, body });
      if (!saved.ok) return toast(saved.error);
      const result = await sendOutreachDraft({ id: outreach.id });
      if (!result.ok) return toast(result.error);
      setConfirm(false);
      setOutreach({ ...outreach, recipient: recipient.trim(), subject: subject.trim(), body: body.trim(), status: "SENT", threadId: result.data.threadId, sentAt: new Date().toISOString() });
      toast(result.toast ?? "Sent.");
      router.refresh();
    });

  return (
    <>
      <PageHeader
        title={`Outreach · ${outreach.company}`}
        description={sent ? "This message was sent through Gmail." : "Review the public contact evidence and edit the message before sending."}
        actions={<Link href="/outreach" className={buttonClassName("secondary", "sm")}>All outreach</Link>}
      />
      <div className="flex max-w-3xl flex-col gap-5 px-10 pb-20">
        <div className="rounded-panel border border-line-card bg-card px-6 py-5 text-sm">
          <h2 className="font-medium">Contact evidence</h2>
          <p className="mt-2 text-muted">{outreach.contactType} address: <strong className="text-ink">{outreach.recipient}</strong></p>
          {outreach.sourceUrl && <p className="mt-1 text-meta text-muted">Published at <a href={outreach.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{outreach.sourceUrl}</a></p>}
          {outreach.website && <p className="mt-1 text-meta text-muted">Company site: <a href={outreach.website} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{outreach.website}</a></p>}
        </div>
        <div className="flex flex-col gap-4 rounded-panel border border-line-card bg-card p-6">
          <Input label="To" value={recipient} disabled={sent} onChange={(event) => setRecipient(event.target.value)} />
          <Input label="Subject" value={subject} disabled={sent} onChange={(event) => setSubject(event.target.value)} />
          <Textarea label="Message" rows={14} value={body} disabled={sent} onChange={(event) => setBody(event.target.value)} />
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {!sent && <Button variant="secondary" aria-disabled={saving || sending || undefined} onClick={save}>{saving ? "Saving…" : "Save draft"}</Button>}
            {sent ? (
              <p className="text-meta text-muted">Sent{outreach.sentAt ? ` ${new Date(outreach.sentAt).toLocaleString()}` : ""}. Thread: {outreach.threadId}</p>
            ) : (
              <SendButton google={google} disabled={saving || sending} onClick={() => setConfirm(true)} />
            )}
          </div>
        </div>
      </div>
      <AlertDialog.Root open={confirm} onOpenChange={setConfirm}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 flex w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-dialog border border-line-popover bg-card p-6 shadow-menu">
            <AlertDialog.Title className="font-serif text-[22px] leading-tight">Send this outreach?</AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-muted">This sends one message from your connected Gmail account to <strong className="text-ink">{recipient}</strong>. It cannot be unsent.</AlertDialog.Description>
            <div className="mt-2 flex justify-end gap-2">
              <AlertDialog.Cancel className={buttonClassName("secondary", "sm")}>Cancel</AlertDialog.Cancel>
              <AlertDialog.Action className={buttonClassName("primary", "sm", "hover:text-on-primary")} onClick={send}>{sending ? "Sending…" : "Send now"}</AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}

function SendButton({ google, disabled, onClick }: { google: GoogleConnection; disabled: boolean; onClick: () => void }) {
  if (google.status === "not-configured") return <Link href="/settings?section=google" className={buttonClassName("secondary", "md")}>Set up Gmail to send</Link>;
  if (google.status !== "connected") return <Link href="/settings?section=google" className={buttonClassName("secondary", "md")}>Connect Gmail to send</Link>;
  if (!google.canSend) return <a href="/api/google/connect?scopes=send" className={buttonClassName("secondary", "md")}>Allow sending with Gmail</a>;
  return <Button aria-disabled={disabled || undefined} onClick={onClick}>{disabled ? "Sending…" : "Send with Gmail"}</Button>;
}
