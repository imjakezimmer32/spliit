'use client'

import { useActiveParticipantId } from '@/lib/receipts/use-active-participant'
import { trpc } from '@/trpc/client'
import { useCurrentGroup } from '../current-group-context'

/** Number of approvals waiting for "me" on this device, shown on the Receipts tab. */
export function PendingCountBadge({ groupId }: { groupId: string }) {
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

  // A span rather than <Badge>: this sits inside a <button> (the tab trigger).
  return (
    <span
      data-testid="pending-count"
      className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground"
    >
      {data.count}
    </span>
  )
}
