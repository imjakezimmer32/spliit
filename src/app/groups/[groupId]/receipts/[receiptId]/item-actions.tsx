'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { useMediaQuery } from '@/lib/hooks'
import {
  canRemoveClaim,
  canRespond,
  canSplitItem,
  isActiveClaim,
} from '@/lib/receipts/permissions'
import type { ReceiptDetail } from '@/lib/receipts/service'
import { useReceiptHelpers } from '@/lib/receipts/use-receipt-helpers'
import { formatCurrency, getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { useCurrentGroup } from '../../current-group-context'

type Item = ReceiptDetail['items'][number]

type Props = {
  groupId: string
  actorId: string
  receipt: ReceiptDetail
  item: Item
  onClose: () => void
  onSplit: () => void
}

/** Opened by tapping an item row. Drawer on phones, Dialog on desktop. */
export function ItemActions(props: Props) {
  const locale = useLocale()
  const { group } = useCurrentGroup()
  const isDesktop = useMediaQuery('(min-width: 640px)')
  if (!group) return null

  const money = formatCurrency(
    getCurrencyFromGroup(group),
    props.item.amount,
    locale,
  )
  const onOpenChange = (open: boolean) => {
    if (!open) props.onClose()
  }

  if (isDesktop) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent data-testid="item-actions">
          <DialogHeader>
            <DialogTitle>{props.item.name}</DialogTitle>
            <DialogDescription>{money}</DialogDescription>
          </DialogHeader>
          <ItemActionsBody {...props} />
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open onOpenChange={onOpenChange}>
      <DrawerContent data-testid="item-actions">
        <DrawerHeader className="text-left">
          <DrawerTitle>{props.item.name}</DrawerTitle>
          <DrawerDescription>{money}</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-6">
          <ItemActionsBody {...props} />
        </div>
      </DrawerContent>
    </Drawer>
  )
}

function ItemActionsBody({
  groupId,
  actorId,
  receipt,
  item,
  onClose,
  onSplit,
}: Props) {
  const t = useTranslations('Receipts.Claim')
  const { group } = useCurrentGroup()
  const { invalidate, showError } = useReceiptHelpers()
  const claim = trpc.groups.receipts.claim.useMutation()
  const assign = trpc.groups.receipts.assign.useMutation()
  const unclaim = trpc.groups.receipts.unclaim.useMutation()
  const respond = trpc.groups.receipts.respond.useMutation()
  const [assignOpen, setAssignOpen] = useState(false)

  if (!group) return null
  const busy =
    claim.isPending ||
    assign.isPending ||
    unclaim.isPending ||
    respond.isPending
  const receiptLike = {
    paidById: receipt.paidBy.id,
    createdById: receipt.createdById,
  }
  const ref = { groupId, actorId, receiptId: receipt.id }

  const ownClaim = item.claims.find(
    (c) => c.participantId === actorId && isActiveClaim(c),
  )
  const pendingForMe = item.claims.find((c) => canRespond(c, actorId))
  const claimedIds = new Set(
    item.claims.filter(isActiveClaim).map((c) => c.participantId),
  )
  const assignees = group.participants.filter(
    (p) => p.id !== actorId && !claimedIds.has(p.id),
  )
  const othersToRemove = item.claims.filter(
    (c) =>
      c.participantId !== actorId && canRemoveClaim(receiptLike, c, actorId),
  )
  const nameOf = (participantId: string) =>
    group.participants.find((p) => p.id === participantId)?.name ?? ''

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action()
      await invalidate()
      onClose()
    } catch (error) {
      showError(error)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {!ownClaim && (
        <Button
          disabled={busy}
          onClick={() =>
            run(() => claim.mutateAsync({ ...ref, itemId: item.id, shares: 1 }))
          }
        >
          {t('itsMine')}
        </Button>
      )}

      {ownClaim && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            run(() => unclaim.mutateAsync({ ...ref, claimId: ownClaim.id }))
          }
        >
          {t('removeMine')}
        </Button>
      )}

      {pendingForMe && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            disabled={busy}
            onClick={() =>
              run(() =>
                respond.mutateAsync({
                  groupId,
                  actorId,
                  claimId: pendingForMe.id,
                  decision: 'APPROVE',
                }),
              )
            }
          >
            {t('approve')}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              run(() =>
                respond.mutateAsync({
                  groupId,
                  actorId,
                  claimId: pendingForMe.id,
                  decision: 'REJECT',
                }),
              )
            }
          >
            {t('reject')}
          </Button>
        </div>
      )}

      {assignees.length > 0 && (
        <Button
          variant="outline"
          disabled={busy}
          aria-expanded={assignOpen}
          onClick={() => setAssignOpen((open) => !open)}
        >
          {t('assignTo')}
        </Button>
      )}
      {assignOpen &&
        assignees.map((participant) => (
          <Button
            key={participant.id}
            variant="secondary"
            disabled={busy}
            data-testid="assign-option"
            data-participant-name={participant.name}
            onClick={() =>
              run(() =>
                assign.mutateAsync({
                  ...ref,
                  itemId: item.id,
                  participantId: participant.id,
                  shares: 1,
                }),
              )
            }
          >
            {participant.name}
          </Button>
        ))}

      {canSplitItem(receiptLike, item.claims, actorId) && (
        <Button variant="outline" disabled={busy} onClick={onSplit}>
          {t('split')}
        </Button>
      )}

      {othersToRemove.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2 border-t pt-3">
          {othersToRemove.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2">
              <span className="text-sm">{nameOf(c.participantId)}</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  run(() => unclaim.mutateAsync({ ...ref, claimId: c.id }))
                }
              >
                {t('remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
