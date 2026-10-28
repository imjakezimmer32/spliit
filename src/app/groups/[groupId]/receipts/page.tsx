import { ReceiptsPageClient } from '@/app/groups/[groupId]/receipts/page.client'
import { getRuntimeFeatureFlags } from '@/lib/featureFlags'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'

// Render at request time so the flag reflects the current environment.
export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('Receipts')

  return {
    title: t('title'),
  }
}

export default async function ReceiptsPage({
  params,
}: {
  params: Promise<{ groupId: string }>
}) {
  const { groupId } = await params
  const { enableReceiptClaims } = await getRuntimeFeatureFlags()
  if (!enableReceiptClaims) notFound()

  return <ReceiptsPageClient groupId={groupId} />
}
