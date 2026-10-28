'use client'

import type { ReceiptDetail } from '@/lib/receipts/service'
import { formatCurrency, getCurrencyFromGroup } from '@/lib/utils'
import { useLocale, useTranslations } from 'next-intl'
import { useCurrentGroup } from '../../current-group-context'

/** Per-person totals, straight from `receipt.allocation` (no math here). */
export function ReceiptSummary({ receipt }: { receipt: ReceiptDetail }) {
  const t = useTranslations('Receipts')
  const locale = useLocale()
  const { group } = useCurrentGroup()
  if (!group) return null

  const currency = getCurrencyFromGroup(group)
  const money = (amount: number) => formatCurrency(currency, amount, locale)
  const nameOf = (participantId: string) =>
    group.participants.find((p) => p.id === participantId)?.name ?? ''
  const payerId = receipt.paidBy.id
  const rows = receipt.allocation.participants.filter(
    (p) => p.total > 0 || p.participantId === payerId,
  )

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{t('Summary.title')}</h3>
      <ul className="flex flex-col divide-y">
        {rows.map((row) => (
          <li
            key={row.participantId}
            data-testid="summary-row"
            data-participant-name={nameOf(row.participantId)}
            className="flex flex-col gap-1 py-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{nameOf(row.participantId)}</span>
              <span className="font-semibold tabular-nums">
                {money(row.total)}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              <span>
                {t('Summary.items')}: {money(row.items)}
              </span>
              {row.tax + row.other !== 0 && (
                <span>
                  {t('Summary.taxAndFees')}: {money(row.tax + row.other)}
                </span>
              )}
              {row.participantId === payerId &&
                receipt.allocation.unclaimed > 0 && (
                  <span>
                    {t('Summary.includesUnclaimed', {
                      amount: money(receipt.allocation.unclaimed),
                    })}
                  </span>
                )}
              {row.pending > 0 && (
                <span>
                  {t('Summary.pending', { amount: money(row.pending) })}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex justify-between border-t pt-3 font-semibold">
        <span>{t('Summary.total')}</span>
        <span className="tabular-nums">{money(receipt.total)}</span>
      </div>
    </section>
  )
}
