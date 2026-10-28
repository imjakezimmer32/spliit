'use client'

import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useReceiptHelpers } from '@/lib/receipts/use-receipt-helpers'
import {
  formatCurrency,
  formatDateOnly,
  getCurrencyFromGroup,
} from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { ReactNode } from 'react'
import { useCurrentGroup } from '../current-group-context'

const POLL_INTERVAL = 30_000

export function InboxList({
  groupId,
  participantId,
}: {
  groupId: string
  participantId: string
}) {
  const t = useTranslations('Receipts')
  const locale = useLocale()
  const { group } = useCurrentGroup()
  const { invalidate, showError } = useReceiptHelpers()
  const inbox = trpc.groups.receipts.inbox.useQuery(
    { groupId, participantId },
    { refetchInterval: POLL_INTERVAL },
  )
  const respond = trpc.groups.receipts.respond.useMutation({
    onSuccess: invalidate,
    onError: showError,
  })
  const approveAll = trpc.groups.receipts.approveAll.useMutation({
    onSuccess: invalidate,
    onError: showError,
  })

  if (!group) return null
  const currency = getCurrencyFromGroup(group)
  const money = (amount: number) => formatCurrency(currency, amount, locale)

  const richTags = {
    strong: (chunks: ReactNode) => <strong>{chunks}</strong>,
    em: (chunks: ReactNode) => <em>{chunks}</em>,
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg">{t('Inbox.title')}</CardTitle>
          {inbox.data && inbox.data.pending.length >= 2 && (
            <Button
              size="sm"
              variant="secondary"
              disabled={approveAll.isPending}
              onClick={() =>
                approveAll.mutate({ groupId, actorId: participantId })
              }
            >
              {t('Inbox.approveAll')}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {inbox.isLoading && (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        )}

        {inbox.error && (
          <ErrorState
            error={inbox.error}
            retry={() => inbox.refetch()}
            title={t('Errors.generic')}
          />
        )}

        {inbox.data && inbox.data.pending.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('Inbox.empty')}</p>
        )}

        {inbox.data && inbox.data.pending.length > 0 && (
          <ul className="flex flex-col gap-2">
            {inbox.data.pending.map((entry) => {
              const busy =
                respond.isPending &&
                respond.variables?.claimId === entry.claimId
              const values = {
                by: entry.assignedBy?.name ?? entry.receipt.paidBy.name,
                item: entry.item.name,
                count: entry.splitCount,
                ...richTags,
              }
              return (
                <li
                  key={entry.claimId}
                  data-testid="inbox-entry"
                  className="flex flex-col gap-2 rounded-md border p-3"
                >
                  <p className="text-sm">
                    {entry.splitCount > 1
                      ? t.rich('Inbox.split', values)
                      : t.rich('Inbox.assigned', values)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('Inbox.fromReceipt', {
                      receipt: entry.receipt.title,
                      date: formatDateOnly(entry.receipt.receiptDate, locale, {
                        dateStyle: 'medium',
                      }),
                    })}
                    {' · '}
                    {t('Inbox.yourPart', { amount: money(entry.portion) })}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 sm:flex-none"
                      disabled={busy}
                      onClick={() =>
                        respond.mutate({
                          groupId,
                          actorId: participantId,
                          claimId: entry.claimId,
                          decision: 'APPROVE',
                        })
                      }
                    >
                      {t('Inbox.approve')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 sm:flex-none"
                      disabled={busy}
                      onClick={() =>
                        respond.mutate({
                          groupId,
                          actorId: participantId,
                          claimId: entry.claimId,
                          decision: 'REJECT',
                        })
                      }
                    >
                      {t('Inbox.reject')}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {inbox.data && inbox.data.declined.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">
              {t('Inbox.declinedTitle')}
            </h3>
            <ul className="flex flex-col gap-2">
              {inbox.data.declined.map((entry) => (
                <li key={entry.claimId} data-testid="declined-entry">
                  <Link
                    href={`/groups/${groupId}/receipts/${entry.receipt.id}`}
                    className="block rounded-md border p-3 text-sm hover:bg-accent"
                  >
                    {t.rich('Inbox.declined', {
                      participant: entry.participant.name,
                      item: entry.item.name,
                      ...richTags,
                    })}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
