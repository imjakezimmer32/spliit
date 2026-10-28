-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('DRAFT', 'OPEN', 'FINALIZED');

-- CreateEnum
CREATE TYPE "ItemClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReceiptAdjustmentKind" AS ENUM ('TAX', 'TIP', 'DISCOUNT', 'FEE');

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "receiptDate" DATE NOT NULL DEFAULT CURRENT_DATE,
    "categoryId" INTEGER NOT NULL DEFAULT 0,
    "paidById" TEXT NOT NULL,
    "createdById" TEXT,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "imageUrl" TEXT,
    "imageWidth" INTEGER,
    "imageHeight" INTEGER,
    "printedTotal" INTEGER,
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "ocrModel" TEXT,
    "ocrRaw" JSONB,
    "expenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptItem" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "amount" INTEGER NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptAdjustment" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "ReceiptAdjustmentKind" NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "ReceiptAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemClaim" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "assignedById" TEXT,
    "shares" INTEGER NOT NULL DEFAULT 1,
    "status" "ItemClaimStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAmount" INTEGER,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_expenseId_key" ON "Receipt"("expenseId");

-- CreateIndex
CREATE INDEX "Receipt_groupId_status_idx" ON "Receipt"("groupId", "status");

-- CreateIndex
CREATE INDEX "ReceiptItem_receiptId_position_idx" ON "ReceiptItem"("receiptId", "position");

-- CreateIndex
CREATE INDEX "ReceiptAdjustment_receiptId_idx" ON "ReceiptAdjustment"("receiptId");

-- CreateIndex
CREATE INDEX "ItemClaim_groupId_participantId_status_idx" ON "ItemClaim"("groupId", "participantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ItemClaim_itemId_participantId_key" ON "ItemClaim"("itemId", "participantId");

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Participant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptAdjustment" ADD CONSTRAINT "ReceiptAdjustment_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemClaim" ADD CONSTRAINT "ItemClaim_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ReceiptItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemClaim" ADD CONSTRAINT "ItemClaim_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemClaim" ADD CONSTRAINT "ItemClaim_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "Participant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
