'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useActiveParticipantId } from '@/lib/receipts/use-active-participant'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useCurrentGroup } from '../current-group-context'

/** Points the active participant at approvals waiting for them on the Receipts tab. */
export function ReceiptsPendingBanner({ groupId }: { groupId: string }) {
  const t = useTranslations('Receipts')
  const { group } = useCurrentGroup()
  const { activeParticipantId } = useActiveParticipantId(
    groupId,
    group?.participants,
  )
  const { data } = trpc.groups.receipts.pendingCount.useQuery(
    { groupId, participantId: activeParticipantId ?? '' },
    { enabled: !!activeParticipantId, refetchInterval: 30_000 },
  )

  if (!data?.count) return null

  return (
    <Alert className="mb-4">
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>{t('PendingBanner', { count: data.count })}</span>
        <Button asChild size="sm" variant="outline">
          <Link href={`/groups/${groupId}/receipts`}>{t('Inbox.title')}</Link>
        </Button>
      </AlertDescription>
    </Alert>
  )
}
