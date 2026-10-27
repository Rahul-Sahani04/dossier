-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('DRAFT', 'SENT');

-- CreateTable
CREATE TABLE "Outreach" (
    "id" TEXT NOT NULL,
    "startupId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "contactType" TEXT NOT NULL DEFAULT 'General',
    "sourceUrl" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "status" "OutreachStatus" NOT NULL DEFAULT 'DRAFT',
    "gmailId" TEXT,
    "threadId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Outreach_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN "outreachId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Outreach_gmailId_key" ON "Outreach"("gmailId");
CREATE UNIQUE INDEX "Outreach_startupId_recipient_key" ON "Outreach"("startupId", "recipient");
CREATE INDEX "Outreach_status_updatedAt_idx" ON "Outreach"("status", "updatedAt");
CREATE INDEX "EmailMessage_outreachId_sentAt_idx" ON "EmailMessage"("outreachId", "sentAt");

-- AddForeignKey
ALTER TABLE "Outreach" ADD CONSTRAINT "Outreach_startupId_fkey" FOREIGN KEY ("startupId") REFERENCES "Startup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_outreachId_fkey" FOREIGN KEY ("outreachId") REFERENCES "Outreach"("id") ON DELETE CASCADE ON UPDATE CASCADE;
