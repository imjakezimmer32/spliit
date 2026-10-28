import { z } from 'zod'

export const MAX_RECEIPT_AMOUNT = 10_000_000 // minor units, see PLAN C.3
const id = z.string().min(1).max(64)
const minor = z.number().int().min(0).max(MAX_RECEIPT_AMOUNT)
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/) // sent by the client as yyyy-mm-dd
const claimShares = z.number().int().min(1).max(100)

export const groupActorInput = z.object({ groupId: id, actorId: id })
export const receiptRefInput = groupActorInput.extend({ receiptId: id })

export const listReceiptsInput = z.object({ groupId: id })
export const getReceiptInput = z.object({ groupId: id, receiptId: id })
export const inboxInput = z.object({ groupId: id, participantId: id })

export const createReceiptInput = groupActorInput.extend({
  paidById: id,
  title: z.string().trim().min(2).max(200).default('Receipt'),
  receiptDate: dateOnly.optional(),
  categoryId: z.number().int().min(0).default(0),
  image: z
    .object({
      url: z.string().url().max(2000),
      width: z.number().int().min(1),
      height: z.number().int().min(1),
    })
    .optional(),
})

export const updateReceiptInput = receiptRefInput.extend({
  title: z.string().trim().min(2).max(200),
  receiptDate: dateOnly,
  categoryId: z.number().int().min(0),
  paidById: id, // may only differ from the current payer while DRAFT
})

export const receiptItemInput = z.object({
  id: id.optional(), // present = update existing item, absent = create
  name: z.string().trim().min(1).max(100),
  quantity: z.number().int().min(1).max(999),
  amount: minor,
  taxable: z.boolean(),
})

export const receiptAdjustmentInput = z
  .object({
    kind: z.enum(['TAX', 'TIP', 'DISCOUNT', 'FEE']),
    label: z.string().trim().min(1).max(50),
    amount: z.number().int().min(-MAX_RECEIPT_AMOUNT).max(MAX_RECEIPT_AMOUNT),
  })
  .refine(
    (a) => (a.kind === 'DISCOUNT' ? a.amount < 0 : a.amount > 0),
    'adjustmentSign',
  )

export const saveItemsInput = receiptRefInput
  .extend({
    items: z.array(receiptItemInput).min(1).max(150),
    adjustments: z.array(receiptAdjustmentInput).max(20),
    printedTotal: z.number().int().min(0).max(MAX_RECEIPT_AMOUNT).nullable(),
  })
  .refine(
    (v) => v.items.reduce((s, i) => s + i.amount, 0) <= MAX_RECEIPT_AMOUNT,
    'subtotalTooLarge',
  )
  .refine(
    (v) =>
      v.items.reduce((s, i) => s + i.amount, 0) +
        v.adjustments.reduce((s, a) => s + a.amount, 0) >
      0,
    'totalNotPositive',
  )

export const claimItemInput = receiptRefInput.extend({
  itemId: id,
  shares: claimShares.default(1),
})
export const assignItemInput = receiptRefInput.extend({
  itemId: id,
  participantId: id,
  shares: claimShares.default(1),
})
export const splitItemInput = receiptRefInput.extend({
  itemId: id,
  participants: z
    .array(z.object({ participantId: id, shares: claimShares }))
    .min(2)
    .max(100)
    .refine(
      (ps) => new Set(ps.map((p) => p.participantId)).size === ps.length,
      'duplicateParticipant',
    ),
})
export const unclaimInput = receiptRefInput.extend({ claimId: id })
export const respondInput = groupActorInput.extend({
  claimId: id,
  decision: z.enum(['APPROVE', 'REJECT']),
})
export const approveAllInput = groupActorInput.extend({
  receiptId: id.optional(),
})
export const scanReceiptInput = receiptRefInput
