'use client'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { useActiveParticipantId } from '@/lib/receipts/use-active-participant'
import { useTranslations } from 'next-intl'
import { ReactNode, useState } from 'react'
import { useCurrentGroup } from '../current-group-context'

/**
 * Receipt pages act "as" one participant. Renders `children` with that id once
 * it is known; otherwise asks who the user is on this device.
 */
export function RequireActiveParticipant({
  children,
}: {
  children: (participantId: string) => ReactNode
}) {
  const { groupId, group } = useCurrentGroup()
  const t = useTranslations('Receipts.ActiveParticipant')
  const tNew = useTranslations('Receipts.New')
  const { activeParticipantId, setActiveParticipantId, ready } =
    useActiveParticipantId(groupId, group?.participants)
  const [changing, setChanging] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  if (!group || !ready) return <Skeleton className="h-32 w-full" />

  if (!activeParticipantId || changing) {
    return (
      <Card data-testid="active-participant-picker">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={selected ?? ''}
            onValueChange={setSelected}
            className="gap-2"
          >
            {group.participants.map((participant) => (
              <div
                key={participant.id}
                className="flex items-center gap-3 rounded-md border p-3"
              >
                <RadioGroupItem
                  value={participant.id}
                  id={`participant-${participant.id}`}
                  data-testid="participant-radio"
                />
                <Label
                  htmlFor={`participant-${participant.id}`}
                  className="flex-1 cursor-pointer"
                >
                  {participant.name}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          {changing && (
            <Button variant="ghost" onClick={() => setChanging(false)}>
              {tNew('back')}
            </Button>
          )}
          <Button
            disabled={!selected}
            onClick={() => {
              if (!selected) return
              setActiveParticipantId(selected)
              setChanging(false)
            }}
          >
            {t('continue')}
          </Button>
        </CardFooter>
      </Card>
    )
  }

  const me = group.participants.find((p) => p.id === activeParticipantId)

  return (
    <>
      <div className="flex items-center justify-end gap-1 text-sm text-muted-foreground">
        <span>{t('notYou', { name: me?.name ?? '' })}</span>
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0"
          onClick={() => {
            setSelected(activeParticipantId)
            setChanging(true)
          }}
        >
          {t('change')}
        </Button>
      </div>
      {children(activeParticipantId)}
    </>
  )
}
