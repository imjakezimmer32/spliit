import { ReceiptPageClient } from '@/app/groups/[groupId]/receipts/[receiptId]/page.client'
import { getRuntimeFeatureFlags } from '@/lib/featureFlags'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ groupId: string; receiptId: string }>
}) {
  const { groupId, receiptId } = await params
  const { enableReceiptClaims, enableReceiptExtract } =
    await getRuntimeFeatureFlags()
  if (!enableReceiptClaims) notFound()

  return (
    <ReceiptPageClient
      groupId={groupId}
      receiptId={receiptId}
      enableReceiptExtract={enableReceiptExtract}
    />
  )
}
