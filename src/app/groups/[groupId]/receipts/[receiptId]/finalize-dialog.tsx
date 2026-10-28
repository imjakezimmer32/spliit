'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ReceiptDetail } from '@/lib/receipts/service'
import { useReceiptHelpers } from '@/lib/receipts/use-receipt-helpers'
import { formatCurrency, getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { useLocale, useTranslations } from 'next-intl'
import { useCurrentGroup } from '../../current-group-context'
import { ReceiptSummary } from './receipt-summary'

type Props = {
  groupId: string
  actorId: string
  receipt: ReceiptDetail
  onOpenChange: (open: boolean) => void
}

export function FinalizeDialog({
  groupId,
  actorId,
  receipt,
  onOpenChange,
}: Props) {
  const t = useTranslations('Receipts')
  const locale = useLocale()
  const { group } = useCurrentGroup()
  const { invalidate, showError } = useReceiptHelpers()
  const finalize = trpc.groups.receipts.finalize.useMutation()
  if (!group) return null

  const currency = getCurrencyFromGroup(group)
  const money = (amount: number) => formatCurrency(currency, amount, locale)
  const blocked = receipt.pendingCount > 0

  const confirm = async () => {
    try {
      await finalize.mutateAsync({
        groupId,
        actorId,
        receiptId: receipt.id,
      })
      await invalidate()
      onOpenChange(false)
    } catch (error) {
      showError(error)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Finalize.title')}</DialogTitle>
          <DialogDescription>{t('Finalize.description')}</DialogDescription>
        </DialogHeader>

        <ReceiptSummary receipt={receipt} />

        {receipt.allocation.unclaimed > 0 && (
          <p className="text-sm">
            {t('Finalize.unclaimedNote', {
              amount: money(receipt.allocation.unclaimed),
              payer: receipt.paidBy.name,
            })}
          </p>
        )}

        {blocked && (
          <Alert>
            <AlertDescription>
              {t('Finalize.blockedPending', { count: receipt.pendingCount })}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            data-testid="finalize-confirm"
            disabled={blocked || finalize.isPending}
            onClick={confirm}
          >
            {t('Finalize.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
