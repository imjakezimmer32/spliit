import { NewReceiptWizard } from '@/app/groups/[groupId]/receipts/new/new-receipt-wizard'
import { getRuntimeFeatureFlags } from '@/lib/featureFlags'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('Receipts')

  return {
    title: t('new'),
  }
}

export default async function NewReceiptPage({
  params,
}: {
  params: Promise<{ groupId: string }>
}) {
  const { groupId } = await params
  const { enableReceiptClaims, enableReceiptExtract } =
    await getRuntimeFeatureFlags()
  if (!enableReceiptClaims) notFound()

  return (
    <NewReceiptWizard
      groupId={groupId}
      enableReceiptExtract={enableReceiptExtract}
    />
  )
}
