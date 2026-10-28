'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'

// Placeholder: the review / claim screens are built on top of this.
export function ReceiptPageClient({
  groupId,
  receiptId,
}: {
  groupId: string
  receiptId: string
}) {
  const t = useTranslations('Receipts')
  const { data, isLoading, error } = trpc.groups.receipts.get.useQuery({
    groupId,
    receiptId,
  })

  if (isLoading) return <Skeleton className="h-8 w-48" />
  if (error || !data)
    return <p className="text-sm text-destructive">{t('Errors.generic')}</p>

  return <h2 className="text-xl font-bold">{data.receipt.title}</h2>
}
