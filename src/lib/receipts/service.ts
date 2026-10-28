import { ActivityType, Prisma, Receipt } from '@/generated/prisma/client'
import { logActivity, randomId } from '@/lib/api'
import { env } from '@/lib/env'
import { getRuntimeFeatureFlags } from '@/lib/featureFlags'
import { prisma } from '@/lib/prisma'
import { isAllowedUploadUrl } from '@/lib/uploaded-image-url'
import { getCurrencyFromGroup } from '@/lib/utils'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import {
  AdjustmentKind,
  allocateReceipt,
  ClaimChange,
  ClaimStatus,
  itemPortions,
  ReceiptAllocation,
  revalidateItemClaims,
} from './allocate'
import { extractReceiptItems } from './ocr'
import { mapExtractedReceipt } from './ocr-mapping'
import {
  canManageReceipt,
  canRemoveClaim,
  canRespond,
  canSplitItem,
  isActiveClaim,
} from './permissions'
import {
  approveAllInput,
  assignItemInput,
  claimItemInput,
  createReceiptInput,
  getReceiptInput,
  inboxInput,
  listReceiptsInput,
  receiptRefInput,
  respondInput,
  saveItemsInput,
  scanReceiptInput,
  splitItemInput,
  unclaimInput,
  updateReceiptInput,
} from './schemas'

type Tx = Prisma.TransactionClient

export type ReceiptSummary = {
  id: string
  title: string
  receiptDate: Date
  status: 'DRAFT' | 'OPEN' | 'FINALIZED'
  paidBy: { id: string; name: string }
  total: number // Σ items + Σ adjustments
  itemCount: number
  unclaimedAmount: number // allocation.unclaimed
  pendingCount: number // PENDING claims on this receipt
  expenseId: string | null
}

export type ReceiptDetail = ReceiptSummary & {
  categoryId: number
  createdById: string | null
  imageUrl: string | null
  imageWidth: number | null
  imageHeight: number | null
  printedTotal: number | null
  scanCount: number
  finalizedAt: Date | null
  items: {
    id: string
    position: number
    name: string
    quantity: number
    amount: number
    taxable: boolean
    claims: {
      id: string
      participantId: string
      assignedById: string | null
      shares: number
      status: 'PENDING' | 'APPROVED' | 'REJECTED'
      approvedAmount: number | null
      portion: number // from itemPortions(); 0 for REJECTED
    }[]
  }[]
  adjustments: {
    id: string
    position: number
    kind: 'TAX' | 'TIP' | 'DISCOUNT' | 'FEE'
    label: string
    amount: number
  }[]
  allocation: ReceiptAllocation
}

export type InboxEntry = {
  claimId: string
  receipt: {
    id: string
    title: string
    receiptDate: Date
    paidBy: { id: string; name: string }
  }
  item: { id: string; name: string; amount: number }
  assignedBy: { id: string; name: string } | null
  participant: { id: string; name: string }
  splitCount: number // number of active claims on the item (1 = whole item)
  portion: number // item portion for this claim, minor units
  status: 'PENDING' | 'REJECTED'
  updatedAt: Date
}

const DECLINED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

const receiptInclude = {
  paidBy: { select: { id: true, name: true } },
  items: { orderBy: { position: 'asc' }, include: { claims: true } },
  adjustments: { orderBy: { position: 'asc' } },
} satisfies Prisma.ReceiptInclude

const inboxInclude = {
  assignedBy: { select: { id: true, name: true } },
  participant: { select: { id: true, name: true } },
  item: {
    include: {
      receipt: {
        select: {
          id: true,
          title: true,
          receiptDate: true,
          paidBy: { select: { id: true, name: true } },
        },
      },
      claims: true,
    },
  },
} satisfies Prisma.ItemClaimInclude

type ReceiptRow = Prisma.ReceiptGetPayload<{ include: typeof receiptInclude }>
type InboxRow = Prisma.ItemClaimGetPayload<{ include: typeof inboxInclude }>
type ReceiptState = {
  receipt: ReceiptRow
  participants: { id: string; name: string }[]
}

const fail = (code: TRPCError['code'], message: string) =>
  new TRPCError({ code, message })

// --- Conversions between Prisma rows and the pure allocation math ----------

const toAllocItem = (item: {
  id: string
  amount: number
  taxable: boolean
}) => ({
  id: item.id,
  amount: item.amount,
  taxable: item.taxable,
})

const toAllocClaim = (claim: {
  id: string
  itemId: string
  participantId: string
  shares: number
  status: ClaimStatus
  approvedAmount: number | null
}) => ({
  id: claim.id,
  itemId: claim.itemId,
  participantId: claim.participantId,
  shares: claim.shares,
  status: claim.status,
  approvedAmount: claim.approvedAmount,
})

function toAllocInput(receipt: ReceiptRow) {
  return {
    payerId: receipt.paidById,
    items: receipt.items.map(toAllocItem),
    claims: receipt.items.flatMap((item) => item.claims.map(toAllocClaim)),
    adjustments: receipt.adjustments.map((a) => ({
      kind: a.kind as AdjustmentKind,
      amount: a.amount,
    })),
  }
}

function toReceiptSummary(
  receipt: ReceiptRow,
  allocation = allocateReceipt(toAllocInput(receipt)),
): ReceiptSummary {
  return {
    id: receipt.id,
    title: receipt.title,
    receiptDate: receipt.receiptDate,
    status: receipt.status,
    paidBy: receipt.paidBy,
    total: allocation.total,
    itemCount: receipt.items.length,
    unclaimedAmount: allocation.unclaimed,
    pendingCount: receipt.items.reduce(
      (n, item) => n + item.claims.filter((c) => c.status === 'PENDING').length,
      0,
    ),
    expenseId: receipt.expenseId,
  }
}

export function toReceiptDetail(receipt: ReceiptRow): ReceiptDetail {
  const input = toAllocInput(receipt)
  const allocation = allocateReceipt(input)
  return {
    ...toReceiptSummary(receipt, allocation),
    categoryId: receipt.categoryId,
    createdById: receipt.createdById,
    imageUrl: receipt.imageUrl,
    imageWidth: receipt.imageWidth,
    imageHeight: receipt.imageHeight,
    printedTotal: receipt.printedTotal,
    scanCount: receipt.scanCount,
    finalizedAt: receipt.finalizedAt,
    items: receipt.items.map((item) => {
      const portions = itemPortions(toAllocItem(item), input.claims)
      return {
        id: item.id,
        position: item.position,
        name: item.name,
        quantity: item.quantity,
        amount: item.amount,
        taxable: item.taxable,
        claims: item.claims.map((c) => ({
          id: c.id,
          participantId: c.participantId,
          assignedById: c.assignedById,
          shares: c.shares,
          status: c.status,
          approvedAmount: c.approvedAmount,
          portion: portions.get(c.participantId) ?? 0,
        })),
      }
    }),
    adjustments: receipt.adjustments.map((a) => ({
      id: a.id,
      position: a.position,
      kind: a.kind,
      label: a.label,
      amount: a.amount,
    })),
    allocation,
  }
}

function toInboxEntry(claim: InboxRow): InboxEntry {
  const portions = itemPortions(
    toAllocItem(claim.item),
    claim.item.claims.map(toAllocClaim),
  )
  return {
    claimId: claim.id,
    receipt: claim.item.receipt,
    item: {
      id: claim.item.id,
      name: claim.item.name,
      amount: claim.item.amount,
    },
    assignedBy: claim.assignedBy,
    participant: claim.participant,
    splitCount: claim.item.claims.filter(isActiveClaim).length,
    portion: portions.get(claim.participantId) ?? 0,
    status: claim.status === 'REJECTED' ? 'REJECTED' : 'PENDING',
    updatedAt: claim.updatedAt,
  }
}

// --- Locking, loading, actor and permission checks -------------------------

export async function lockReceipt(
  tx: Tx,
  groupId: string,
  receiptId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Receipt"
    WHERE id = ${receiptId} AND "groupId" = ${groupId}
    FOR UPDATE`
  if (rows.length === 0) throw fail('NOT_FOUND', 'Receipt not found.')
}

export async function loadReceiptState(
  tx: Tx,
  receiptId: string,
): Promise<ReceiptState> {
  const receipt = await tx.receipt.findUniqueOrThrow({
    where: { id: receiptId },
    include: receiptInclude,
  })
  const participants = await loadParticipants(tx, receipt.groupId)
  return { receipt, participants }
}

async function loadParticipants(db: Tx, groupId: string) {
  return db.participant.findMany({
    where: { groupId },
    select: { id: true, name: true },
  })
}

export function assertActor(participants: { id: string }[], actorId: string) {
  if (!participants.some((p) => p.id === actorId)) {
    throw fail('FORBIDDEN', 'You are not a participant of this group.')
  }
}

function requireManager(state: ReceiptState, actorId: string) {
  if (!canManageReceipt(state.receipt, actorId)) {
    throw fail('FORBIDDEN', 'Only the payer or the creator can do this.')
  }
}

function requireOpen(receipt: ReceiptRow) {
  if (receipt.status !== 'OPEN') {
    throw fail('CONFLICT', 'The receipt is not open for claiming.')
  }
}

function requireEditable(receipt: ReceiptRow) {
  if (receipt.status === 'FINALIZED') {
    throw fail('CONFLICT', 'The receipt is finalized.')
  }
}

function findItem(state: ReceiptState, itemId: string) {
  const item = state.receipt.items.find((i) => i.id === itemId)
  if (!item) throw fail('NOT_FOUND', 'Item not found.')
  return item
}

function findClaim(state: ReceiptState, claimId: string) {
  const claim = state.receipt.items
    .flatMap((item) => item.claims)
    .find((c) => c.id === claimId)
  if (!claim) throw fail('NOT_FOUND', 'Claim not found.')
  return claim
}

/**
 * Runs `fn` in one transaction after locking the receipt and checking that
 * the actor belongs to the group. Every mutation goes through here.
 */
function mutateReceipt<T>(
  groupId: string,
  receiptId: string,
  actorId: string,
  fn: (tx: Tx, state: ReceiptState) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await lockReceipt(tx, groupId, receiptId)
    const state = await loadReceiptState(tx, receiptId)
    assertActor(state.participants, actorId)
    return fn(tx, state)
  })
}

// --- Balance sync (PLAN D.1, E.6) ------------------------------------------

export async function applyClaimChanges(tx: Tx, changes: ClaimChange[]) {
  for (const change of changes) {
    await tx.itemClaim.update({
      where: { id: change.id },
      data: { status: change.status, approvedAmount: change.approvedAmount },
    })
  }
}

/**
 * Rewrites the generated Expense from the allocation. A no-op while the
 * receipt is DRAFT (there is no expense yet).
 */
export async function syncReceiptExpense(tx: Tx, receiptId: string) {
  const receipt = await tx.receipt.findUniqueOrThrow({
    where: { id: receiptId },
    include: receiptInclude,
  })
  if (receipt.status === 'DRAFT' || receipt.expenseId === null) return

  const alloc = allocateReceipt(toAllocInput(receipt))
  if (alloc.participants.some((p) => p.total < 0)) {
    throw fail('BAD_REQUEST', 'discountsExceedItems')
  }
  const rows = alloc.participants.filter((p) => p.total > 0)

  await tx.expense.update({
    where: { id: receipt.expenseId },
    data: {
      amount: alloc.total,
      title: receipt.title,
      expenseDate: receipt.receiptDate,
      categoryId: receipt.categoryId,
      paidById: receipt.paidById,
      splitMode: 'BY_AMOUNT',
      isReimbursement: false,
      recurrenceRule: 'NONE',
      notes: null,
      paidFor: {
        deleteMany: {},
        createMany: {
          data: rows.map((r) => ({
            participantId: r.participantId,
            shares: r.total,
          })),
        },
      },
    },
  })
}

/**
 * Re-validates the given items against the current state (PLAN D.3), persists
 * the changes and keeps the expense in sync.
 */
async function settleReceipt(
  tx: Tx,
  receiptId: string,
  options: { itemIds?: string[]; actorId: string; autoApproveActor: boolean },
) {
  const itemIds = [...new Set(options.itemIds ?? [])]
  if (itemIds.length > 0) {
    const state = await loadReceiptState(tx, receiptId)
    const input = toAllocInput(state.receipt)
    const changes = itemIds.flatMap((itemId) => {
      const item = input.items.find((i) => i.id === itemId)
      if (!item) return []
      return revalidateItemClaims({
        item,
        claims: input.claims,
        actorId: options.actorId,
        payerId: input.payerId,
        autoApproveActor: options.autoApproveActor,
      })
    })
    await applyClaimChanges(tx, changes)
  }
  await syncReceiptExpense(tx, receiptId)
}

// Activity is logged after the transaction commits (PLAN D.2). No row is
// written when the receipt has no expense.
async function logReceiptActivity(
  groupId: string,
  activityType: ActivityType,
  participantId: string,
  expenseId: string | null,
  title: string,
) {
  if (expenseId === null) return
  await logActivity(groupId, activityType, {
    participantId,
    expenseId,
    data: title,
  })
}

function toReceiptDate(receiptDate?: string): Date {
  const day = receiptDate ?? new Date().toISOString().slice(0, 10)
  return new Date(`${day}T00:00:00.000Z`)
}

// --- Reads -----------------------------------------------------------------

export async function listReceipts(
  input: z.infer<typeof listReceiptsInput>,
): Promise<{ receipts: ReceiptSummary[] }> {
  const rows = await prisma.receipt.findMany({
    where: { groupId: input.groupId },
    include: receiptInclude,
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return { receipts: rows.map((row) => toReceiptSummary(row)) }
}

export async function getReceipt(
  input: z.infer<typeof getReceiptInput>,
): Promise<{ receipt: ReceiptDetail }> {
  const row = await prisma.receipt.findFirst({
    where: { id: input.receiptId, groupId: input.groupId },
    include: receiptInclude,
  })
  if (!row) throw fail('NOT_FOUND', 'Receipt not found.')
  return { receipt: toReceiptDetail(row) }
}

export async function listInbox(
  input: z.infer<typeof inboxInput>,
): Promise<{ pending: InboxEntry[]; declined: InboxEntry[] }> {
  assertActor(
    await loadParticipants(prisma, input.groupId),
    input.participantId,
  )

  const claims = await prisma.itemClaim.findMany({
    where: {
      groupId: input.groupId,
      OR: [
        {
          participantId: input.participantId,
          status: 'PENDING',
          item: { receipt: { status: 'OPEN' } },
        },
        {
          assignedById: input.participantId,
          status: 'REJECTED',
          updatedAt: { gte: new Date(Date.now() - DECLINED_WINDOW_MS) },
        },
      ],
    },
    include: inboxInclude,
    orderBy: { updatedAt: 'desc' },
  })

  const entries = claims.map(toInboxEntry)
  return {
    pending: entries.filter((e) => e.status === 'PENDING'),
    declined: entries.filter((e) => e.status === 'REJECTED'),
  }
}

export async function countPendingClaims(
  input: z.infer<typeof inboxInput>,
): Promise<{ count: number }> {
  const count = await prisma.itemClaim.count({
    where: {
      groupId: input.groupId,
      participantId: input.participantId,
      status: 'PENDING',
      item: { receipt: { status: 'OPEN' } },
    },
  })
  return { count }
}

// --- Mutations -------------------------------------------------------------

export async function createReceipt(
  input: z.infer<typeof createReceiptInput>,
): Promise<{ receiptId: string }> {
  const receiptId = randomId()
  await prisma.$transaction(async (tx) => {
    const participants = await loadParticipants(tx, input.groupId)
    assertActor(participants, input.actorId)
    if (!participants.some((p) => p.id === input.paidById)) {
      throw fail('BAD_REQUEST', 'The payer is not a participant of this group.')
    }
    if (input.image && !isAllowedUploadUrl(input.image.url)) {
      throw fail('BAD_REQUEST', 'The image URL is not an allowed upload URL.')
    }
    await tx.receipt.create({
      data: {
        id: receiptId,
        groupId: input.groupId,
        title: input.title,
        receiptDate: toReceiptDate(input.receiptDate),
        categoryId: input.categoryId,
        paidById: input.paidById,
        createdById: input.actorId,
        imageUrl: input.image?.url ?? null,
        imageWidth: input.image?.width ?? null,
        imageHeight: input.image?.height ?? null,
      },
    })
  })
  return { receiptId }
}

const MAX_SCANS = 3

/** Checks that apply to a scan before and after locking (PLAN E.4). */
function assertScannable(
  receipt: Pick<Receipt, 'status' | 'imageUrl' | 'scanCount'>,
): string {
  if (receipt.status !== 'DRAFT') {
    throw fail('CONFLICT', 'Only a draft receipt can be scanned.')
  }
  if (!receipt.imageUrl) {
    throw fail('FORBIDDEN', 'The receipt has no image to scan.')
  }
  if (receipt.scanCount >= MAX_SCANS) {
    throw fail('FORBIDDEN', 'The scan limit for this receipt is reached.')
  }
  return receipt.imageUrl
}

/**
 * Reads the line items off the receipt image. The OCR call runs outside the
 * transaction, so the row lock is not held while OpenAI responds. The state is
 * checked again under the lock before anything is written.
 */
export async function scanReceipt(
  input: z.infer<typeof scanReceiptInput>,
): Promise<{ itemCount: number; found: boolean }> {
  // Enforce the flag server-side: the UI gate does not stop a direct call.
  const { enableReceiptExtract } = await getRuntimeFeatureFlags()
  if (!enableReceiptExtract) {
    throw fail('FORBIDDEN', 'Receipt scanning is not enabled.')
  }

  // Cheap checks first, so a rejected call never reaches OpenAI.
  const preview = await prisma.receipt.findUnique({
    where: { id: input.receiptId },
  })
  if (!preview || preview.groupId !== input.groupId) {
    throw fail('NOT_FOUND', 'Receipt not found.')
  }
  assertActor(await loadParticipants(prisma, input.groupId), input.actorId)
  if (!canManageReceipt(preview, input.actorId)) {
    throw fail('FORBIDDEN', 'Only the payer or the creator can do this.')
  }
  const imageUrl = assertScannable(preview)
  // Only our own uploads may reach the model. Without this, an arbitrary URL
  // is forwarded to OpenAI (SSRF-via-OpenAI and unbounded spend).
  if (!isAllowedUploadUrl(imageUrl)) {
    throw fail('BAD_REQUEST', 'The image URL is not an allowed upload URL.')
  }

  const group = await prisma.group.findUniqueOrThrow({
    where: { id: input.groupId },
    select: { currency: true, currencyCode: true },
  })
  const extracted = await extractReceiptItems(imageUrl)
  const mapped = extracted
    ? mapExtractedReceipt(extracted, getCurrencyFromGroup(group))
    : null

  return prisma.$transaction(async (tx) => {
    await lockReceipt(tx, input.groupId, input.receiptId)
    const state = await loadReceiptState(tx, input.receiptId)
    assertActor(state.participants, input.actorId)
    requireManager(state, input.actorId)
    assertScannable(state.receipt)

    // A failed read still counts as a scan, because the call was made.
    if (!extracted || !mapped) {
      await tx.receipt.update({
        where: { id: input.receiptId },
        data: { scanCount: { increment: 1 } },
      })
      return { itemCount: 0, found: false }
    }

    await tx.receiptItem.deleteMany({ where: { receiptId: input.receiptId } })
    await tx.receiptAdjustment.deleteMany({
      where: { receiptId: input.receiptId },
    })
    if (mapped.items.length > 0) {
      await tx.receiptItem.createMany({
        data: mapped.items.map((item, position) => ({
          id: randomId(),
          receiptId: input.receiptId,
          position,
          ...item,
        })),
      })
    }
    if (mapped.adjustments.length > 0) {
      await tx.receiptAdjustment.createMany({
        data: mapped.adjustments.map((adjustment, position) => ({
          id: randomId(),
          receiptId: input.receiptId,
          position,
          ...adjustment,
        })),
      })
    }

    await tx.receipt.update({
      where: { id: input.receiptId },
      data: {
        scanCount: { increment: 1 },
        printedTotal: mapped.printedTotal,
        ocrRaw: extracted,
        ocrModel: env.OPENAI_MODEL_RECEIPT_ITEMS,
        title: mapped.title,
        receiptDate: mapped.receiptDate
          ? toReceiptDate(mapped.receiptDate)
          : undefined,
      },
    })
    return { itemCount: mapped.items.length, found: true }
  })
}

export async function updateReceipt(
  input: z.infer<typeof updateReceiptInput>,
): Promise<void> {
  await mutateReceipt(
    input.groupId,
    input.receiptId,
    input.actorId,
    async (tx, state) => {
      const { receipt } = state
      requireManager(state, input.actorId)
      requireEditable(receipt)
      if (input.paidById !== receipt.paidById) {
        if (receipt.status !== 'DRAFT') {
          throw fail(
            'CONFLICT',
            'The payer can only change while the receipt is a draft.',
          )
        }
        if (!state.participants.some((p) => p.id === input.paidById)) {
          throw fail(
            'BAD_REQUEST',
            'The payer is not a participant of this group.',
          )
        }
      }
      await tx.receipt.update({
        where: { id: receipt.id },
        data: {
          title: input.title,
          receiptDate: toReceiptDate(input.receiptDate),
          categoryId: input.categoryId,
          paidById: input.paidById,
        },
      })
      await settleReceipt(tx, receipt.id, {
        actorId: input.actorId,
        autoApproveActor: false,
      })
    },
  )
}

export async function saveReceiptItems(
  input: z.infer<typeof saveItemsInput>,
): Promise<void> {
  await mutateReceipt(
    input.groupId,
    input.receiptId,
    input.actorId,
    async (tx, state) => {
      const { receipt } = state
      requireManager(state, input.actorId)
      requireEditable(receipt)

      const incomingIds = input.items.flatMap((i) => (i.id ? [i.id] : []))
      if (new Set(incomingIds).size !== incomingIds.length) {
        throw fail('BAD_REQUEST', 'Duplicate item id.')
      }
      const existing = new Map(receipt.items.map((i) => [i.id, i]))
      for (const id of incomingIds) {
        if (!existing.has(id)) throw fail('NOT_FOUND', 'Item not found.')
      }

      // Items that were removed in the editor go away; their claims cascade.
      const keep = new Set(incomingIds)
      const removedIds = receipt.items
        .filter((i) => !keep.has(i.id))
        .map((i) => i.id)
      if (removedIds.length > 0) {
        await tx.receiptItem.deleteMany({
          where: { receiptId: receipt.id, id: { in: removedIds } },
        })
      }

      const changedItemIds: string[] = []
      for (const [position, item] of input.items.entries()) {
        const data = {
          position,
          name: item.name,
          quantity: item.quantity,
          amount: item.amount,
          taxable: item.taxable,
        }
        if (item.id) {
          const previous = existing.get(item.id)
          if (previous && previous.amount !== item.amount) {
            changedItemIds.push(item.id)
          }
          await tx.receiptItem.update({ where: { id: item.id }, data })
        } else {
          await tx.receiptItem.create({
            data: { id: randomId(), receiptId: receipt.id, ...data },
          })
        }
      }

      await tx.receiptAdjustment.deleteMany({
        where: { receiptId: receipt.id },
      })
      if (input.adjustments.length > 0) {
        await tx.receiptAdjustment.createMany({
          data: input.adjustments.map((a, position) => ({
            id: randomId(),
            receiptId: receipt.id,
            position,
            kind: a.kind,
            label: a.label,
            amount: a.amount,
          })),
        })
      }

      await tx.receipt.update({
        where: { id: receipt.id },
        data: { printedTotal: input.printedTotal },
      })
      await settleReceipt(tx, receipt.id, {
        itemIds: changedItemIds,
        actorId: input.actorId,
        autoApproveActor: false,
      })
    },
  )
}

export async function openReceipt(
  input: z.infer<typeof receiptRefInput>,
): Promise<{ expenseId: string }> {
  const expenseId = randomId()
  const title = await mutateReceipt(
    input.groupId,
    input.receiptId,
    input.actorId,
    async (tx, state) => {
      const { receipt } = state
      requireManager(state, input.actorId)
      if (receipt.status !== 'DRAFT') {
        throw fail('CONFLICT', 'The receipt is already open.')
      }
      if (receipt.items.length === 0) {
        throw fail('BAD_REQUEST', 'noItems')
      }
      if (allocateReceipt(toAllocInput(receipt)).total <= 0) {
        throw fail('BAD_REQUEST', 'totalNotPositive')
      }

      await tx.expense.create({
        data: {
          id: expenseId,
          groupId: input.groupId,
          title: receipt.title,
          expenseDate: receipt.receiptDate,
          categoryId: receipt.categoryId,
          amount: 0,
          paidById: receipt.paidById,
          splitMode: 'BY_AMOUNT',
          isReimbursement: false,
          recurrenceRule: 'NONE',
          documents:
            receipt.imageUrl && receipt.imageWidth && receipt.imageHeight
              ? {
                  create: [
                    {
                      id: randomId(),
                      url: receipt.imageUrl,
                      width: receipt.imageWidth,
                      height: receipt.imageHeight,
                    },
                  ],
                }
              : undefined,
        },
      })
      await tx.receipt.update({
        where: { id: receipt.id },
        data: { status: 'OPEN', expenseId },
      })
      await syncReceiptExpense(tx, receipt.id)
      return receipt.title
    },
  )

  await logReceiptActivity(
    input.groupId,
    ActivityType.CREATE_EXPENSE,
    input.actorId,
    expenseId,
    title,
  )
  return { expenseId }
}

export async function claimItem(
  input: z.infer<typeof claimItemInput>,
): Promise<void> {
  await mutateReceipt(
    input.groupId,
    input.receiptId,
    input.actorId,
    async (tx, state) => {
      const item = findItem(state, input.itemId)
      requireOpen(state.receipt)

      const own = item.claims.find((c) => c.participantId === input.actorId)
      if (own) {
        await tx.itemClaim.update({
          where: { id: own.id },
          data: {
            status: 'APPROVED',
            assignedById: input.actorId,
            shares: input.shares,
          },
        })
      } else {
        await tx.itemClaim.create({
          data: {
            id: randomId(),
            groupId: input.groupId,
            itemId: item.id,
            participantId: input.actorId,
            assignedById: input.actorId,
            shares: input.shares,
            status: 'APPROVED',
          },
        })
      }
      await settleReceipt(tx, state.receipt.id, {
        itemIds: [item.id],
        actorId: input.actorId,
        autoApproveActor: true,
      })
    },
  )
}

export async function assignItem(
  input: z.infer<typeof assignItemInput>,
): Promise<void> {
  await mutateReceipt(
    input.groupId,
    input.receiptId,
    input.actorId,
    async (tx, state) => {
      const item = findItem(state, input.itemId)
      requireOpen(state.receipt)
      if (input.participantId === input.actorId) {
        throw fail('BAD_REQUEST', 'Use claim to take an item yourself.')
      }
      if (!state.participants.some((p) => p.id === input.participantId)) {
        throw fail('BAD_REQUEST', 'The participant is not in this group.')
      }

      const existing = item.claims.find(
        (c) => c.participantId === input.participantId,
      )
      if (existing && isActiveClaim(existing)) {
        throw fail(
          'CONFLICT',
          'This participant already has a claim on the item.',
        )
      }
      // The payer's own claim needs no approval (their share is carried anyway).
      const status =
        input.participantId === state.receipt.paidById ? 'APPROVED' : 'PENDING'

      if (existing) {
        await tx.itemClaim.update({
          where: { id: existing.id },
          data: {
            status,
            shares: input.shares,
            assignedById: input.actorId,
          },
        })
      } else {
        await tx.itemClaim.create({
          data: {
            id: randomId(),
            groupId: input.groupId,
            itemId: item.id,
            participantId: input.participantId,
            assignedById: input.actorId,
            shares: input.shares,
            status,
          },
        })
      }
      await settleReceipt(tx, state.receipt.id, {
        itemIds: [item.id],
        actorId: input.actorId,
        autoApproveActor: false,
      })
    },
  )
}

export async function splitItem(
  input: z.infer<typeof splitItemInput>,
): Promise<void> {
  await mutateReceipt(
    input.groupId,
    input.receiptId,
    input.actorId,
    async (tx, state) => {
      const item = findItem(state, input.itemId)
      requireOpen(state.receipt)
      if (
        input.participants.some(
          (p) => !state.participants.some((g) => g.id === p.participantId),
        )
      ) {
        throw fail('BAD_REQUEST', 'A participant is not in this group.')
      }
      if (!canSplitItem(state.receipt, item.claims, input.actorId)) {
        throw fail('FORBIDDEN', 'You cannot split this item right now.')
      }

      const wanted = new Set(input.participants.map((p) => p.participantId))
      const unlisted = item.claims
        .filter((c) => !wanted.has(c.participantId))
        .map((c) => c.id)
      if (unlisted.length > 0) {
        await tx.itemClaim.deleteMany({ where: { id: { in: unlisted } } })
      }

      for (const participant of input.participants) {
        const existing = item.claims.find(
          (c) => c.participantId === participant.participantId,
        )
        if (existing) {
          await tx.itemClaim.update({
            where: { id: existing.id },
            data: {
              shares: participant.shares,
              // A rejected share that is listed again goes back to PENDING.
              ...(existing.status === 'REJECTED' ? { status: 'PENDING' } : {}),
            },
          })
        } else {
          await tx.itemClaim.create({
            data: {
              id: randomId(),
              groupId: input.groupId,
              itemId: item.id,
              participantId: participant.participantId,
              assignedById: input.actorId,
              shares: participant.shares,
              status: 'PENDING',
            },
          })
        }
      }

      await settleReceipt(tx, state.receipt.id, {
        itemIds: [item.id],
        actorId: input.actorId,
        autoApproveActor: true,
      })
    },
  )
}

export async function unclaimItem(
  input: z.infer<typeof unclaimInput>,
): Promise<void> {
  await mutateReceipt(
    input.groupId,
    input.receiptId,
    input.actorId,
    async (tx, state) => {
      const claim = findClaim(state, input.claimId)
      requireOpen(state.receipt)
      if (!canRemoveClaim(state.receipt, claim, input.actorId)) {
        throw fail('FORBIDDEN', 'You cannot remove this claim.')
      }
      await tx.itemClaim.delete({ where: { id: claim.id } })
      await settleReceipt(tx, state.receipt.id, {
        itemIds: [claim.itemId],
        actorId: input.actorId,
        autoApproveActor: false,
      })
    },
  )
}

export async function respondToClaim(
  input: z.infer<typeof respondInput>,
): Promise<void> {
  const found = await prisma.itemClaim.findFirst({
    where: { id: input.claimId, groupId: input.groupId },
    select: { item: { select: { receiptId: true } } },
  })
  if (!found) throw fail('NOT_FOUND', 'Claim not found.')

  await mutateReceipt(
    input.groupId,
    found.item.receiptId,
    input.actorId,
    async (tx, state) => {
      const claim = findClaim(state, input.claimId)
      requireOpen(state.receipt)
      if (claim.participantId !== input.actorId) {
        throw fail('FORBIDDEN', 'Only the claimant can respond to this claim.')
      }
      if (!canRespond(claim, input.actorId)) {
        throw fail('CONFLICT', 'This claim is not pending.')
      }

      const respondedAt = new Date()
      if (input.decision === 'APPROVE') {
        const item = findItem(state, claim.itemId)
        const portions = itemPortions(
          toAllocItem(item),
          toAllocInput(state.receipt).claims,
        )
        await tx.itemClaim.update({
          where: { id: claim.id },
          data: {
            status: 'APPROVED',
            approvedAmount: portions.get(claim.participantId) ?? 0,
            respondedAt,
          },
        })
      } else {
        await tx.itemClaim.update({
          where: { id: claim.id },
          data: { status: 'REJECTED', respondedAt },
        })
      }
      // A rejection makes the other claimants' portions grow, which may send
      // them back to PENDING (PLAN D.3).
      await settleReceipt(tx, state.receipt.id, {
        itemIds: [claim.itemId],
        actorId: input.actorId,
        autoApproveActor: false,
      })
    },
  )
}

export async function approveAllClaims(
  input: z.infer<typeof approveAllInput>,
): Promise<{ approved: number }> {
  return prisma.$transaction(async (tx) => {
    assertActor(await loadParticipants(tx, input.groupId), input.actorId)

    const candidates = await tx.receipt.findMany({
      where: {
        groupId: input.groupId,
        status: 'OPEN',
        ...(input.receiptId ? { id: input.receiptId } : {}),
        items: {
          some: {
            claims: {
              some: { participantId: input.actorId, status: 'PENDING' },
            },
          },
        },
      },
      select: { id: true },
      // Locked in id order so two concurrent bulk approvals cannot deadlock.
      orderBy: { id: 'asc' },
    })

    let approved = 0
    for (const { id: receiptId } of candidates) {
      await lockReceipt(tx, input.groupId, receiptId)
      const state = await loadReceiptState(tx, receiptId)
      if (state.receipt.status !== 'OPEN') continue

      const allClaims = toAllocInput(state.receipt).claims
      const touchedItemIds: string[] = []
      for (const item of state.receipt.items) {
        const mine = item.claims.filter(
          (c) => c.participantId === input.actorId && c.status === 'PENDING',
        )
        if (mine.length === 0) continue
        const portion =
          itemPortions(toAllocItem(item), allClaims).get(input.actorId) ?? 0
        for (const claim of mine) {
          await tx.itemClaim.update({
            where: { id: claim.id },
            data: {
              status: 'APPROVED',
              approvedAmount: portion,
              respondedAt: new Date(),
            },
          })
          approved++
        }
        touchedItemIds.push(item.id)
      }

      await settleReceipt(tx, receiptId, {
        itemIds: touchedItemIds,
        actorId: input.actorId,
        autoApproveActor: false,
      })
    }
    return { approved }
  })
}

export async function finalizeReceipt(
  input: z.infer<typeof receiptRefInput>,
): Promise<void> {
  const logged = await mutateReceipt(
    input.groupId,
    input.receiptId,
    input.actorId,
    async (tx, state) => {
      const { receipt } = state
      requireManager(state, input.actorId)
      if (receipt.status !== 'OPEN') {
        throw fail('CONFLICT', 'Only an open receipt can be finalized.')
      }
      const pending = receipt.items.reduce(
        (n, item) =>
          n + item.claims.filter((c) => c.status === 'PENDING').length,
        0,
      )
      if (pending > 0) {
        throw fail('PRECONDITION_FAILED', String(pending))
      }
      await tx.receipt.update({
        where: { id: receipt.id },
        data: { status: 'FINALIZED', finalizedAt: new Date() },
      })
      await syncReceiptExpense(tx, receipt.id)
      return { expenseId: receipt.expenseId, title: receipt.title }
    },
  )

  await logReceiptActivity(
    input.groupId,
    ActivityType.UPDATE_EXPENSE,
    input.actorId,
    logged.expenseId,
    logged.title,
  )
}

export async function reopenReceipt(
  input: z.infer<typeof receiptRefInput>,
): Promise<void> {
  const logged = await mutateReceipt(
    input.groupId,
    input.receiptId,
    input.actorId,
    async (tx, state) => {
      const { receipt } = state
      requireManager(state, input.actorId)
      if (receipt.status !== 'FINALIZED') {
        throw fail('CONFLICT', 'Only a finalized receipt can be reopened.')
      }
      await tx.receipt.update({
        where: { id: receipt.id },
        data: { status: 'OPEN', finalizedAt: null },
      })
      await syncReceiptExpense(tx, receipt.id)
      return { expenseId: receipt.expenseId, title: receipt.title }
    },
  )

  await logReceiptActivity(
    input.groupId,
    ActivityType.UPDATE_EXPENSE,
    input.actorId,
    logged.expenseId,
    logged.title,
  )
}

export async function deleteReceipt(
  input: z.infer<typeof receiptRefInput>,
): Promise<void> {
  const logged = await mutateReceipt(
    input.groupId,
    input.receiptId,
    input.actorId,
    async (tx, state) => {
      const { receipt } = state
      requireManager(state, input.actorId)
      await tx.receipt.delete({ where: { id: receipt.id } })
      if (receipt.expenseId !== null) {
        await tx.expense.delete({ where: { id: receipt.expenseId } })
      }
      return { expenseId: receipt.expenseId, title: receipt.title }
    },
  )

  await logReceiptActivity(
    input.groupId,
    ActivityType.DELETE_EXPENSE,
    input.actorId,
    logged.expenseId,
    logged.title,
  )
}
