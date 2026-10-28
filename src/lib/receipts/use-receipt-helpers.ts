'use client'

import { useToast } from '@/components/ui/use-toast'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import { useCallback } from 'react'

/**
 * Shared by every receipt mutation: refreshes everything a receipt change can
 * touch, and maps errors to the user-facing messages in `Receipts.Errors`.
 */
export function useReceiptHelpers() {
  const utils = trpc.useUtils()
  const t = useTranslations('Receipts.Errors')
  const { toast } = useToast()

  const invalidate = useCallback(
    () =>
      Promise.all([
        utils.groups.receipts.invalidate(),
        utils.groups.expenses.invalidate(),
        utils.groups.balances.invalidate(),
        utils.groups.stats.invalidate(),
      ]),
    [utils],
  )

  const showError = useCallback(
    (error: unknown) => {
      const code = (error as { data?: { code?: string } } | null)?.data?.code
      toast({
        description: code === 'FORBIDDEN' ? t('notAllowed') : t('generic'),
        variant: 'destructive',
      })
    },
    [t, toast],
  )

  return { invalidate, showError, toast, t }
}
