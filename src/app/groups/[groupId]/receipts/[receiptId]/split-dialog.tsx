'use client'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { itemPortions } from '@/lib/receipts/allocate'
import { formatCurrency, getCurrencyFromGroup } from '@/lib/utils'
import { Minus, Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { useCurrentGroup } from '../../current-group-context'

const MAX_SHARES = 10

type Props = {
  title: string
  /** Present for a single item: enables the live portion preview. */
  item?: { amount: number; taxable: boolean }
  actorId: string
  onOpenChange: (open: boolean) => void
  onSubmit: (
    participants: { participantId: string; shares: number }[],
  ) => Promise<void>
}

export function SplitDialog({
  title,
  item,
  actorId,
  onOpenChange,
  onSubmit,
}: Props) {
  const t = useTranslations('Receipts')
  const locale = useLocale()
  const { group } = useCurrentGroup()
  // participantId -> shares, only for people who are selected
  const [selected, setSelected] = useState<Record<string, number>>({
    [actorId]: 1,
  })
  const [saving, setSaving] = useState(false)
  if (!group) return null

  const currency = getCurrencyFromGroup(group)
  const money = (amount: number) => formatCurrency(currency, amount, locale)
  const chosen = group.participants.filter((p) => selected[p.id] !== undefined)
  const canSave = chosen.length >= 2 && !saving

  const preview =
    item &&
    itemPortions(
      { id: 'preview', amount: item.amount, taxable: item.taxable },
      chosen.map((p, i) => ({
        id: `preview-${i}`,
        itemId: 'preview',
        participantId: p.id,
        shares: selected[p.id],
        status: 'PENDING',
        approvedAmount: null,
      })),
    )

  const setShares = (participantId: string, shares: number | null) =>
    setSelected((current) => {
      const next = { ...current }
      if (shares === null) delete next[participantId]
      else next[participantId] = shares
      return next
    })

  const submit = async () => {
    setSaving(true)
    try {
      await onSubmit(
        chosen.map((p) => ({
          participantId: p.id,
          shares: selected[p.id],
        })),
      )
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent data-testid="split-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t('Split.description')}</DialogDescription>
        </DialogHeader>

        <p className="text-sm font-medium">{t('Split.shares')}</p>
        <ul className="flex flex-col gap-2">
          {group.participants.map((participant) => {
            const shares = selected[participant.id]
            const checked = shares !== undefined
            return (
              <li
                key={participant.id}
                className="flex items-center gap-3 rounded-md border p-3"
              >
                <Checkbox
                  id={`split-${participant.id}`}
                  data-testid="split-participant"
                  data-participant-name={participant.name}
                  checked={checked}
                  onCheckedChange={(value) =>
                    setShares(participant.id, value === true ? 1 : null)
                  }
                />
                <Label
                  htmlFor={`split-${participant.id}`}
                  className="flex-1 cursor-pointer"
                >
                  {participant.name}
                </Label>
                {checked && (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={t('Split.fewer')}
                      disabled={shares <= 1}
                      onClick={() => setShares(participant.id, shares - 1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center text-sm tabular-nums">
                      {shares}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={t('Split.more')}
                      disabled={shares >= MAX_SHARES}
                      onClick={() => setShares(participant.id, shares + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        {preview && (
          <ul className="flex flex-col gap-1 rounded-md bg-muted/50 p-3 text-sm">
            {chosen.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span>{p.name}</span>
                <span className="tabular-nums">
                  {money(preview.get(p.id) ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {chosen.length < 2 && (
          <p className="text-sm text-muted-foreground">{t('Split.min2')}</p>
        )}

        <DialogFooter className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            {t('cancel')}
          </Button>
          <Button type="button" disabled={!canSave} onClick={submit}>
            {t('Split.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
