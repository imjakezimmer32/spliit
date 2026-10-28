type ReceiptLike = { paidById: string; createdById: string | null }
type ClaimLike = {
  participantId: string
  assignedById: string | null
  status: string
}

export const isActiveClaim = (c: { status: string }) =>
  c.status === 'PENDING' || c.status === 'APPROVED'

/** The payer or the creator of the receipt. */
export function canManageReceipt(r: ReceiptLike, actorId: string): boolean {
  return actorId === r.paidById || actorId === r.createdById
}

export function canRemoveClaim(
  r: ReceiptLike,
  claim: ClaimLike,
  actorId: string,
): boolean {
  return (
    claim.participantId === actorId ||
    claim.assignedById === actorId ||
    canManageReceipt(r, actorId)
  )
}

export function canSplitItem(
  r: ReceiptLike,
  itemClaims: ClaimLike[],
  actorId: string,
): boolean {
  return (
    !itemClaims.some(isActiveClaim) ||
    itemClaims.some((c) => c.participantId === actorId && isActiveClaim(c)) ||
    canManageReceipt(r, actorId)
  )
}

/** Only the claimant can respond to their own pending claim. */
export function canRespond(claim: ClaimLike, actorId: string): boolean {
  return claim.participantId === actorId && claim.status === 'PENDING'
}
