'use client'

import { DeletePopup } from '@/components/delete-popup'
import { ErrorState } from '@/components/error-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { canManageReceipt } from '@/lib/receipts/permissions'
import type { ReceiptDetail } from '@/lib/receipts/service'
import { useReceiptHelpers } from '@/lib/receipts/use-receipt-helpers'
import { formatDate, formatDateOnly } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { RotateCcw } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useCurrentGroup } from '../../current-group-context'
import { RequireActiveParticipant } from '../require-active-participant'
import { ClaimItems } from './claim-items'
import { ReceiptSummary } from './receipt-summary'
import { ReadOnlyReview, ReviewItems } from './review-items'

export function ReceiptPageClient({
  groupId,
  receiptId,
  enableReceiptExtract,
}: {
  groupId: string
  receiptId: string
  enableReceiptExtract: boolean
}) {
  return (
    <RequireActiveParticipant>
      {(participantId) => (
        <ReceiptBody
          groupId={groupId}
          receiptId={receiptId}
          actorId={participantId}
          enableReceiptExtract={enableReceiptExtract}
        />
      )}
    </RequireActiveParticipant>
  )
}

function ReceiptBody({
  groupId,
  receiptId,
  actorId,
  enableReceiptExtract,
}: {
  groupId: string
  receiptId: string
  actorId: string
  enableReceiptExtract: boolean
}) {
  const t = useTranslations('Receipts')
  const locale = useLocale()
  const { group } = useCurrentGroup()
  const { data, isLoading, error, refetch } = trpc.groups.receipts.get.useQuery(
    { groupId, receiptId },
  )
  // Owner of "Edit items" on an OPEN receipt; DRAFT always shows the editor.
  const [editing, setEditing] = useState(false)
  // Bumped after each save so the editor re-reads the saved items.
  const [revision, setRevision] = useState(0)

  if (isLoading || !group) return <Skeleton className="h-64 w-full" />
  if (error || !data) {
    return (
      <ErrorState
        error={error}
        retry={() => refetch()}
        title={t('Errors.generic')}
      />
    )
  }

  const { receipt } = data
  const manager = canManageReceipt(
    { paidById: receipt.paidBy.id, createdById: receipt.createdById },
    actorId,
  )
  const reviewing = receipt.status === 'DRAFT' || editing

  const onSaved = () => {
    setEditing(false)
    setRevision((r) => r + 1)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        {!reviewing && (
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold">{receipt.title}</h2>
            <p className="text-sm text-muted-foreground">
              {formatDateOnly(receipt.receiptDate, locale, {
                dateStyle: 'medium',
              })}
            </p>
          </div>
        )}
        <Badge
          variant="outline"
          data-testid="receipt-status"
          data-status={receipt.status}
          className="ml-auto shrink-0"
        >
          {t(`Status.${receipt.status}`)}
        </Badge>
      </div>

      {receipt.status === 'FINALIZED' ? (
        <FinalizedView
          groupId={groupId}
          actorId={actorId}
          receipt={receipt}
          manager={manager}
        />
      ) : reviewing ? (
        manager ? (
          <ReviewItems
            key={`${revision}-${receipt.scanCount}`}
            groupId={groupId}
            actorId={actorId}
            receipt={receipt}
            enableReceiptExtract={enableReceiptExtract}
            onSaved={onSaved}
            onCancel={
              receipt.status === 'OPEN' ? () => setEditing(false) : undefined
            }
          />
        ) : (
          <ReadOnlyReview receipt={receipt} />
        )
      ) : (
        <ClaimItems
          groupId={groupId}
          actorId={actorId}
          receipt={receipt}
          manager={manager}
          onEditItems={() => setEditing(true)}
        />
      )}
    </div>
  )
}

function FinalizedView({
  groupId,
  actorId,
  receipt,
  manager,
}: {
  groupId: string
  actorId: string
  receipt: ReceiptDetail
  manager: boolean
}) {
  const t = useTranslations('Receipts')
  const locale = useLocale()
  const router = useRouter()
  const { invalidate, showError } = useReceiptHelpers()
  const reopen = trpc.groups.receipts.reopen.useMutation()
  const remove = trpc.groups.receipts.delete.useMutation()
  const ref = { groupId, actorId, receiptId: receipt.id }

  const onReopen = async () => {
    try {
      await reopen.mutateAsync(ref)
      await invalidate()
    } catch (error) {
      showError(error)
    }
  }

  const onDelete = async () => {
    try {
      await remove.mutateAsync(ref)
      await invalidate()
      router.push(`/groups/${groupId}/receipts`)
    } catch (error) {
      showError(error)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Summary.title')}</CardTitle>
        {receipt.finalizedAt && (
          <CardDescription>
            {t('Finalize.finalizedOn', {
              date: formatDate(receipt.finalizedAt, locale, {
                dateStyle: 'medium',
              }),
            })}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ReceiptSummary receipt={receipt} />
        {receipt.expenseId && (
          <Button asChild variant="outline">
            <Link
              href={`/groups/${groupId}/expenses/${receipt.expenseId}/edit`}
            >
              {t('Summary.openExpense')}
            </Link>
          </Button>
        )}
        {manager && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={onReopen}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {t('Finalize.reopen')}
            </Button>
            <DeletePopup namespace="Receipts.DeletePopup" onDelete={onDelete} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
