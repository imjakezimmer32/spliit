'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { isActiveClaim } from '@/lib/receipts/permissions'
import type { ReceiptDetail } from '@/lib/receipts/service'
import { useReceiptHelpers } from '@/lib/receipts/use-receipt-helpers'
import { cn, formatCurrency, getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { Clock, MoreHorizontal } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useState } from 'react'
import { useCurrentGroup } from '../../current-group-context'
import { FinalizeDialog } from './finalize-dialog'
import { ItemActions } from './item-actions'
import { ReceiptSummary } from './receipt-summary'
import { SplitDialog } from './split-dialog'

type Filter = 'all' | 'unclaimed' | 'mine'
type Item = ReceiptDetail['items'][number]
type Claim = Item['claims'][number]

type Props = {
  groupId: string
  actorId: string
  receipt: ReceiptDetail
  manager: boolean
  onEditItems: () => void
}

/** OPEN receipt: everyone taps items to claim, assign, split or approve. */
export function ClaimItems({
  groupId,
  actorId,
  receipt,
  manager,
  onEditItems,
}: Props) {
  const t = useTranslations('Receipts')
  const locale = useLocale()
  const { group } = useCurrentGroup()
  const { invalidate, showError } = useReceiptHelpers()
  const split = trpc.groups.receipts.split.useMutation()
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [splitItemId, setSplitItemId] = useState<string | null>(null)
  const [bulkSplitOpen, setBulkSplitOpen] = useState(false)
  const [finalizeOpen, setFinalizeOpen] = useState(false)

  if (!group) return null

  const currency = getCurrencyFromGroup(group)
  const money = (amount: number) => formatCurrency(currency, amount, locale)
  const nameOf = (participantId: string) =>
    group.participants.find((p) => p.id === participantId)?.name ?? ''

  const isUnclaimed = (item: Item) => !item.claims.some(isActiveClaim)
  const isMine = (item: Item) =>
    item.claims.some((c) => c.participantId === actorId && isActiveClaim(c))
  const visibleItems = receipt.items.filter((item) => {
    if (filter === 'unclaimed') return isUnclaimed(item)
    if (filter === 'mine') return isMine(item)
    return true
  })
  const unclaimedItems = receipt.items.filter(isUnclaimed)
  const selectedItem = receipt.items.find((i) => i.id === selectedId)
  const splitItem = receipt.items.find((i) => i.id === splitItemId)
  const myShare =
    receipt.allocation.participants.find((p) => p.participantId === actorId)
      ?.total ?? 0
  const waitingForMe = receipt.items.reduce(
    (count, item) =>
      count +
      item.claims.filter(
        (c) => c.participantId === actorId && c.status === 'PENDING',
      ).length,
    0,
  )

  // Items are split one request at a time so each claim goes through
  // the same validation as a single split.
  const splitItems = async (
    itemIds: string[],
    participants: { participantId: string; shares: number }[],
  ) => {
    try {
      for (const itemId of itemIds) {
        await split.mutateAsync({
          groupId,
          actorId,
          receiptId: receipt.id,
          itemId,
          participants,
        })
      }
    } catch (error) {
      showError(error)
    } finally {
      await invalidate()
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <Card>
        <CardContent className="flex flex-col gap-2 p-4">
          <p className="text-sm">
            {t('List.paidBy', {
              payer: receipt.paidBy.name,
              total: money(receipt.total),
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            {receipt.allocation.unclaimed > 0 && (
              <Badge variant="secondary">
                {t('List.unclaimed', {
                  amount: money(receipt.allocation.unclaimed),
                })}
              </Badge>
            )}
            {receipt.pendingCount > 0 && (
              <Badge variant="outline">
                {t('List.pending', { count: receipt.pendingCount })}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-2">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">{t('Claim.filterAll')}</TabsTrigger>
            <TabsTrigger value="unclaimed">
              {t('Claim.filterUnclaimed')}
            </TabsTrigger>
            <TabsTrigger value="mine">{t('Claim.filterMine')}</TabsTrigger>
          </TabsList>
        </Tabs>
        {manager && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label={t('Claim.moreActions')}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={unclaimedItems.length === 0}
                onSelect={() => setBulkSplitOpen(true)}
              >
                {t('Claim.splitRemaining')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {visibleItems.length === 0 && (
          <li className="text-sm text-muted-foreground">
            {t('Claim.noMatches')}
          </li>
        )}
        {visibleItems.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              data-testid="receipt-item"
              data-item-name={item.name}
              onClick={() => setSelectedId(item.id)}
              className="flex w-full flex-col gap-2 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/50"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">
                  {item.quantity > 1 && `${item.quantity} × `}
                  {item.name}
                </span>
                <span className="shrink-0 tabular-nums">
                  {money(item.amount)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {/* A rejected claim no longer counts, so the item is unclaimed. */}
                {item.claims.every((claim) => claim.status === 'REJECTED') && (
                  <span className="text-xs text-muted-foreground">
                    {t('Claim.unclaimed')}
                  </span>
                )}
                {item.claims.map((claim) => (
                  <ClaimChip
                    key={claim.id}
                    claim={claim}
                    name={nameOf(claim.participantId)}
                    pendingLabel={t('Claim.pendingBy', {
                      name: nameOf(claim.participantId),
                    })}
                    rejectedLabel={t('Claim.rejectedBy', {
                      name: nameOf(claim.participantId),
                    })}
                  />
                ))}
              </div>
            </button>
          </li>
        ))}
      </ul>

      <ReceiptSummary receipt={receipt} />

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t bg-background/95 p-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        <div className="flex flex-col">
          <span className="text-sm font-semibold tabular-nums">
            {t('Claim.yourShare', { amount: money(myShare) })}
          </span>
          {waitingForMe > 0 && (
            <Link
              href={`/groups/${groupId}/receipts`}
              className="text-xs text-primary underline"
            >
              {t('Claim.waitingForYou', { count: waitingForMe })}
            </Link>
          )}
        </div>
        {manager && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={onEditItems}>
              {t('Claim.editItems')}
            </Button>
            <Button
              data-testid="finalize-button"
              onClick={() => setFinalizeOpen(true)}
            >
              {t('Finalize.button')}
            </Button>
          </div>
        )}
      </div>

      {selectedItem && (
        <ItemActions
          groupId={groupId}
          actorId={actorId}
          receipt={receipt}
          item={selectedItem}
          onClose={() => setSelectedId(null)}
          onSplit={() => {
            setSplitItemId(selectedItem.id)
            setSelectedId(null)
          }}
        />
      )}

      {splitItem && (
        <SplitDialog
          title={t('Split.title', { item: splitItem.name })}
          item={splitItem}
          actorId={actorId}
          onOpenChange={(open) => {
            if (!open) setSplitItemId(null)
          }}
          onSubmit={(participants) => splitItems([splitItem.id], participants)}
        />
      )}

      {bulkSplitOpen && (
        <SplitDialog
          title={t('Claim.splitRemaining')}
          actorId={actorId}
          onOpenChange={setBulkSplitOpen}
          onSubmit={(participants) =>
            splitItems(
              unclaimedItems.map((i) => i.id),
              participants,
            )
          }
        />
      )}

      {manager && finalizeOpen && (
        <FinalizeDialog
          groupId={groupId}
          actorId={actorId}
          receipt={receipt}
          onOpenChange={setFinalizeOpen}
        />
      )}
    </div>
  )
}

function ClaimChip({
  claim,
  name,
  pendingLabel,
  rejectedLabel,
}: {
  claim: Claim
  name: string
  pendingLabel: string
  rejectedLabel: string
}) {
  const title =
    claim.status === 'PENDING'
      ? pendingLabel
      : claim.status === 'REJECTED'
        ? rejectedLabel
        : name
  return (
    <span
      data-testid="claim-chip"
      data-status={claim.status}
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs',
        claim.status === 'APPROVED' && 'bg-primary text-primary-foreground',
        claim.status === 'PENDING' &&
          'border border-dashed border-foreground/60',
        claim.status === 'REJECTED' && 'text-muted-foreground line-through',
      )}
    >
      {claim.status === 'PENDING' && (
        <Clock className="h-3 w-3" aria-hidden="true" />
      )}
      {name}
    </span>
  )
}
