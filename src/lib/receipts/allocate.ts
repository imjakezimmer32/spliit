import { apportionByWeights } from '@/lib/shares'

export type ClaimStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type AdjustmentKind = 'TAX' | 'TIP' | 'DISCOUNT' | 'FEE'
export type AllocItem = { id: string; amount: number; taxable: boolean }
export type AllocClaim = {
  id: string
  itemId: string
  participantId: string
  shares: number
  status: ClaimStatus
  approvedAmount: number | null
}
export type AllocAdjustment = { kind: AdjustmentKind; amount: number }
export type ParticipantAllocation = {
  participantId: string
  items: number // item portions carried (payer: incl. absorbed)
  absorbed: number // payer only: unclaimed + pending portions of others
  pending: number // this participant's portions awaiting their approval (not in total)
  tax: number
  other: number // tip + fees + discounts (signed)
  total: number // items + tax + other
}
export type ReceiptAllocation = {
  itemsSubtotal: number
  adjustmentsTotal: number
  total: number
  unclaimed: number
  participants: ParticipantAllocation[] // sorted by participantId; always contains the payer
}

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const sum = (values: number[]) => values.reduce((s, v) => s + v, 0)

export function itemPortions(
  item: AllocItem,
  claims: AllocClaim[],
): Map<string, number> {
  const active = claims
    .filter((c) => c.itemId === item.id && c.status !== 'REJECTED')
    .sort((a, b) => compareIds(a.participantId, b.participantId))
  const amounts = apportionByWeights(
    item.amount,
    active.map((c) => c.shares),
  )
  return new Map(active.map((c, i) => [c.participantId, amounts[i]]))
}

export function allocateReceipt(input: {
  payerId: string
  items: AllocItem[]
  claims: AllocClaim[]
  adjustments: AllocAdjustment[]
}): ReceiptAllocation {
  const { payerId, items, claims, adjustments } = input
  type Row = {
    items: number
    taxable: number
    absorbed: number
    pending: number
  }
  const rows = new Map<string, Row>()
  const row = (id: string) => {
    let r = rows.get(id)
    if (!r) {
      r = { items: 0, taxable: 0, absorbed: 0, pending: 0 }
      rows.set(id, r)
    }
    return r
  }
  row(payerId)
  let unclaimed = 0

  for (const item of items) {
    const portions = itemPortions(item, claims)
    if (portions.size === 0) {
      unclaimed += item.amount
      const payer = row(payerId)
      payer.items += item.amount
      payer.absorbed += item.amount
      if (item.taxable) payer.taxable += item.amount
      continue
    }
    for (const [participantId, portion] of portions) {
      const claim = claims.find(
        (c) => c.itemId === item.id && c.participantId === participantId,
      )!
      const ownerId = claim.status === 'APPROVED' ? participantId : payerId
      const owner = row(ownerId)
      owner.items += portion
      if (item.taxable) owner.taxable += portion
      if (ownerId !== participantId) {
        owner.absorbed += portion
        row(participantId).pending += portion
      }
    }
  }

  const ids = [...rows.keys()].sort(compareIds)
  const itemWeights = ids.map((id) => rows.get(id)!.items)
  const taxableWeights = ids.map((id) => rows.get(id)!.taxable)
  const taxTotal = sum(
    adjustments.filter((a) => a.kind === 'TAX').map((a) => a.amount),
  )
  const otherTotal = sum(
    adjustments.filter((a) => a.kind !== 'TAX').map((a) => a.amount),
  )
  const toPayer = (amount: number) =>
    ids.map((id) => (id === payerId ? amount : 0))
  const split = (amount: number, weights: number[]) =>
    sum(weights) > 0 ? apportionByWeights(amount, weights) : toPayer(amount)

  const tax = split(
    taxTotal,
    sum(taxableWeights) > 0 ? taxableWeights : itemWeights,
  )
  const other = split(otherTotal, itemWeights)

  const participants = ids.map((participantId, i) => {
    const r = rows.get(participantId)!
    return {
      participantId,
      items: r.items,
      absorbed: r.absorbed,
      pending: r.pending,
      tax: tax[i],
      other: other[i],
      total: r.items + tax[i] + other[i],
    }
  })
  const itemsSubtotal = sum(items.map((i) => i.amount))
  const adjustmentsTotal = taxTotal + otherTotal
  return {
    itemsSubtotal,
    adjustmentsTotal,
    total: itemsSubtotal + adjustmentsTotal,
    unclaimed,
    participants,
  }
}

export type ClaimChange = {
  id: string
  status: ClaimStatus
  approvedAmount: number | null
}

/** See PLAN D.3. Returns only the claims whose status/approvedAmount must change. */
export function revalidateItemClaims(input: {
  item: AllocItem
  claims: AllocClaim[]
  actorId: string
  payerId: string
  autoApproveActor: boolean
}): ClaimChange[] {
  const { item, claims, actorId, payerId, autoApproveActor } = input
  const portions = itemPortions(item, claims)
  const changes: ClaimChange[] = []
  for (const claim of claims) {
    if (claim.itemId !== item.id || claim.status === 'REJECTED') continue
    const portion = portions.get(claim.participantId) ?? 0
    const isPayer = claim.participantId === payerId
    const isActor = claim.participantId === actorId
    if (
      isPayer ||
      (isActor && (autoApproveActor || claim.status === 'APPROVED'))
    ) {
      if (claim.status !== 'APPROVED' || claim.approvedAmount !== portion) {
        changes.push({
          id: claim.id,
          status: 'APPROVED',
          approvedAmount: portion,
        })
      }
    } else if (
      claim.status === 'APPROVED' &&
      portion > (claim.approvedAmount ?? 0)
    ) {
      changes.push({
        id: claim.id,
        status: 'PENDING',
        approvedAmount: claim.approvedAmount,
      })
    }
  }
  return changes
}
