'use client'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { InboxList } from './inbox-list'
import { ReceiptList } from './receipt-list'
import { RequireActiveParticipant } from './require-active-participant'

export function ReceiptsPageClient({ groupId }: { groupId: string }) {
  const t = useTranslations('Receipts')

  return (
    <RequireActiveParticipant>
      {(participantId) => (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('title')}</CardTitle>
              <CardDescription>{t('description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full sm:w-auto">
                <Link href={`/groups/${groupId}/receipts/new`}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('new')}
                </Link>
              </Button>
            </CardContent>
          </Card>

          <InboxList groupId={groupId} participantId={participantId} />
          <ReceiptList groupId={groupId} />
        </div>
      )}
    </RequireActiveParticipant>
  )
}
