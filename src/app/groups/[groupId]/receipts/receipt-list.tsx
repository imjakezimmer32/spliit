'use client'

import { ErrorState } from '@/components/error-state'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  formatCurrency,
  formatDateOnly,
  getCurrencyFromGroup,
} from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useCurrentGroup } from '../current-group-context'

const SECTIONS = [
  { status: 'OPEN', title: 'List.open' },
  { status: 'DRAFT', title: 'List.drafts' },
  { status: 'FINALIZED', title: 'List.finalized' },
] as const

export function ReceiptList({ groupId }: { groupId: string }) {
  const t = useTranslations('Receipts')
  const locale = useLocale()
  const { group } = useCurrentGroup()
  const { data, isLoading, error, refetch } =
    trpc.groups.receipts.list.useQuery({ groupId })

  if (!group) return null
  const currency = getCurrencyFromGroup(group)
  const money = (amount: number) => formatCurrency(currency, amount, locale)

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <ErrorState
        error={error}
        retry={() => refetch()}
        title={t('Errors.generic')}
      />
    )
  }

  const receipts = data?.receipts ?? []
  if (receipts.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('empty')}</p>
  }

  return (
    <div className="flex flex-col gap-6">
      {SECTIONS.map((section) => {
        const rows = receipts.filter((r) => r.status === section.status)
        if (rows.length === 0) return null
        return (
          <section key={section.status} className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{t(section.title)}</h2>
            <ul className="flex flex-col gap-2">
              {rows.map((receipt) => (
                <li key={receipt.id}>
                  <Link
                    href={`/groups/${groupId}/receipts/${receipt.id}`}
                    data-testid="receipt-card"
                    data-status={receipt.status}
                    className="block"
                  >
                    <Card className="transition-colors hover:bg-accent/50">
                      <CardContent className="flex flex-col gap-1 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <span className="truncate font-medium">
                            {receipt.title}
                          </span>
                          <Badge variant="outline" className="shrink-0">
                            {t(`Status.${receipt.status}`)}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDateOnly(receipt.receiptDate, locale, {
                            dateStyle: 'medium',
                          })}
                        </span>
                        <span className="text-sm">
                          {t('List.paidBy', {
                            payer: receipt.paidBy.name,
                            total: money(receipt.total),
                          })}
                        </span>
                        <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          {receipt.status === 'OPEN' && (
                            <span>
                              {t('List.unclaimed', {
                                amount: money(receipt.unclaimedAmount),
                              })}
                            </span>
                          )}
                          {receipt.pendingCount > 0 && (
                            <span>
                              {t('List.pending', {
                                count: receipt.pendingCount,
                              })}
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
