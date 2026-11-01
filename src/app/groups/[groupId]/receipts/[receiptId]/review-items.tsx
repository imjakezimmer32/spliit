'use client'

import { CategorySelector } from '@/components/category-selector'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ReceiptDetail } from '@/lib/receipts/service'
import { useReceiptHelpers } from '@/lib/receipts/use-receipt-helpers'
import {
  amountAsMinorUnits,
  formatAmountAsDecimal,
  formatCurrency,
  getCurrencyFromGroup,
} from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { Loader2, Plus, ScanLine, Trash2, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Image from 'next/image'
import { useState } from 'react'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useCurrentGroup } from '../../current-group-context'

const ADJUSTMENT_KINDS = ['TAX', 'TIP', 'DISCOUNT', 'FEE'] as const
type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number]
const MAX_SCANS = 3

type FormValues = {
  title: string
  receiptDate: string
  categoryId: number
  paidById: string
  items: {
    id?: string
    name: string
    quantity: string
    amount: string
    taxable: boolean
  }[]
  adjustments: { kind: AdjustmentKind; label: string; amount: string }[]
}

type Currency = ReturnType<typeof getCurrencyFromGroup>
type Busy = 'save' | 'start' | 'scan' | null

const isMoney = (value: string) => /^\d+([.,]\d+)?$/.test(value.trim())
const toMinor = (value: string, currency: Currency) =>
  amountAsMinorUnits(Number(value.trim().replace(',', '.')), currency)
// DISCOUNT is typed positive and stored negative (PLAN C.3).
const signedAdjustment = (kind: AdjustmentKind, minor: number): number =>
  kind === 'DISCOUNT' ? -minor : minor

function defaultValues(receipt: ReceiptDetail, currency: Currency): FormValues {
  return {
    title: receipt.title,
    receiptDate: receipt.receiptDate.toISOString().slice(0, 10),
    categoryId: receipt.categoryId,
    paidById: receipt.paidBy.id,
    items: receipt.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: String(item.quantity),
      amount: formatAmountAsDecimal(item.amount, currency),
      taxable: item.taxable,
    })),
    adjustments: receipt.adjustments.map((adjustment) => ({
      kind: adjustment.kind,
      label: adjustment.label,
      amount: formatAmountAsDecimal(Math.abs(adjustment.amount), currency),
    })),
  }
}

type Props = {
  groupId: string
  actorId: string
  receipt: ReceiptDetail
  enableReceiptExtract: boolean
  /** Only set while an OPEN receipt is being edited. */
  onCancel?: () => void
  onSaved: () => void
}

/** Editor for DRAFT receipts and for "Edit items" on OPEN receipts (manager only). */
export function ReviewItems({
  groupId,
  actorId,
  receipt,
  enableReceiptExtract,
  onCancel,
  onSaved,
}: Props) {
  const t = useTranslations('Receipts')
  const locale = useLocale()
  const { group } = useCurrentGroup()
  const { data: categoriesData } = trpc.categories.list.useQuery()
  const { invalidate, showError, toast } = useReceiptHelpers()
  const update = trpc.groups.receipts.update.useMutation()
  const saveItems = trpc.groups.receipts.saveItems.useMutation()
  const open = trpc.groups.receipts.open.useMutation()
  const scan = trpc.groups.receipts.scan.useMutation()
  const [busy, setBusy] = useState<Busy>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const currency = getCurrencyFromGroup(group!)
  const money = (minor: number) => formatCurrency(currency, minor, locale)
  const ref = { groupId, actorId, receiptId: receipt.id }

  const form = useForm<FormValues>({
    defaultValues: defaultValues(receipt, currency),
  })
  const items = useFieldArray({
    control: form.control,
    name: 'items',
    keyName: 'fieldKey',
  })
  const adjustments = useFieldArray({
    control: form.control,
    name: 'adjustments',
    keyName: 'fieldKey',
  })

  const values = useWatch({ control: form.control }) as FormValues
  const itemsTotal = values.items.reduce(
    (sum, item) =>
      isMoney(item.amount) ? sum + toMinor(item.amount, currency) : sum,
    0,
  )
  const adjustmentAmounts = values.adjustments.map((adjustment) =>
    isMoney(adjustment.amount)
      ? signedAdjustment(adjustment.kind, toMinor(adjustment.amount, currency))
      : 0,
  )
  const computedTotal =
    itemsTotal + adjustmentAmounts.reduce((sum, amount) => sum + amount, 0)
  const mismatch =
    receipt.printedTotal !== null && receipt.printedTotal !== computedTotal

  const canRescan =
    enableReceiptExtract &&
    receipt.imageUrl !== null &&
    receipt.status === 'DRAFT' &&
    receipt.scanCount < MAX_SCANS

  const onValid = async (v: FormValues, startClaiming: boolean) => {
    if (v.items.length === 0) {
      setSubmitError(t('Review.noItems'))
      return
    }
    if (computedTotal <= 0) {
      setSubmitError(t('Review.totalNotPositive'))
      return
    }
    setSubmitError(null)

    try {
      setBusy(startClaiming ? 'start' : 'save')
      await update.mutateAsync({
        ...ref,
        title: v.title.trim(),
        receiptDate: v.receiptDate,
        categoryId: v.categoryId,
        paidById: v.paidById,
      })
      await saveItems.mutateAsync({
        ...ref,
        items: v.items.map((item) => ({
          id: item.id,
          name: item.name.trim(),
          quantity: Number(item.quantity),
          amount: toMinor(item.amount, currency),
          taxable: item.taxable,
        })),
        adjustments: v.adjustments.map((adjustment) => ({
          kind: adjustment.kind,
          label: adjustment.label.trim(),
          amount: signedAdjustment(
            adjustment.kind,
            toMinor(adjustment.amount, currency),
          ),
        })),
        printedTotal: receipt.printedTotal,
      })
      if (startClaiming) await open.mutateAsync(ref)
      await invalidate()
      if (!startClaiming) onSaved()
    } catch (error) {
      showError(error)
    } finally {
      setBusy(null)
    }
  }

  const rescan = async () => {
    try {
      setBusy('scan')
      await scan.mutateAsync(ref)
      await invalidate()
    } catch {
      toast({ description: t('Errors.scanFailed'), variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  const hasRowErrors = Object.keys(form.formState.errors).length > 0
  const isBusy = busy !== null

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {receipt.imageUrl && receipt.imageWidth && receipt.imageHeight && (
          <ReceiptPhotoDialog
            src={receipt.imageUrl}
            width={receipt.imageWidth}
            height={receipt.imageHeight}
          />
        )}
        <div className="grid flex-1 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="receipt-title">{t('New.titleLabel')}</Label>
            <Input
              id="receipt-title"
              {...form.register('title', {
                validate: (v) => v.trim().length >= 2,
              })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="receipt-date">{t('New.dateLabel')}</Label>
              <Input
                id="receipt-date"
                type="date"
                {...form.register('receiptDate', { required: true })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="receipt-payer">{t('Review.payerLabel')}</Label>
              <Controller
                control={form.control}
                name="paidById"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={receipt.status !== 'DRAFT'}
                  >
                    <SelectTrigger id="receipt-payer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {group!.participants.map((participant) => (
                        <SelectItem key={participant.id} value={participant.id}>
                          {participant.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('Review.categoryLabel')}</Label>
            <Controller
              control={form.control}
              name="categoryId"
              render={({ field }) =>
                // CategorySelector cannot render an empty list, so wait for it.
                categoriesData ? (
                  <CategorySelector
                    categories={categoriesData.categories}
                    defaultValue={field.value}
                    onValueChange={field.onChange}
                    isLoading={false}
                  />
                ) : (
                  <></>
                )
              }
            />
          </div>
        </div>
      </div>

      <section className="flex flex-col gap-2">
        {items.fields.map((field, index) => (
          <div
            key={field.fieldKey}
            className="flex flex-col gap-2 rounded-md border p-3"
          >
            <div className="flex items-center gap-2">
              <Input
                aria-label={t('Review.itemName')}
                placeholder={t('Review.itemName')}
                className="flex-1"
                {...form.register(`items.${index}.name`, {
                  validate: (v) =>
                    v.trim().length > 0 && v.trim().length <= 100,
                })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('Review.removeItem')}
                onClick={() => items.remove(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label={t('Review.quantity')}
                inputMode="numeric"
                className="w-16"
                {...form.register(`items.${index}.quantity`, {
                  validate: (v) => /^\d+$/.test(v) && Number(v) >= 1,
                })}
              />
              <Input
                aria-label={t('Review.amount')}
                inputMode="decimal"
                className="w-28"
                {...form.register(`items.${index}.amount`, {
                  validate: isMoney,
                })}
              />
              <Controller
                control={form.control}
                name={`items.${index}.taxable`}
                render={({ field: taxable }) => (
                  <label className="ml-auto flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={taxable.value}
                      onCheckedChange={taxable.onChange}
                    />
                    {t('Review.taxable')}
                  </label>
                )}
              />
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          onClick={() =>
            items.append({ name: '', quantity: '1', amount: '', taxable: true })
          }
        >
          <Plus className="mr-2 h-4 w-4" />
          {t('Review.addItem')}
        </Button>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{t('Review.adjustments')}</h3>
        {adjustments.fields.map((field, index) => (
          <div
            key={field.fieldKey}
            className="flex flex-wrap items-center gap-2"
          >
            <Controller
              control={form.control}
              name={`adjustments.${index}.kind`}
              render={({ field: kind }) => (
                <Select value={kind.value} onValueChange={kind.onChange}>
                  <SelectTrigger
                    className="w-28 sm:w-32"
                    aria-label={t('Review.adjustments')}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ADJUSTMENT_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {t(`Review.Kinds.${k}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <Input
              aria-label={t('New.titleLabel')}
              className="min-w-[5rem] flex-1"
              {...form.register(`adjustments.${index}.label`, {
                validate: (v) => v.trim().length > 0,
              })}
            />
            <Input
              aria-label={t('Review.amount')}
              inputMode="decimal"
              className="w-20 sm:w-24"
              {...form.register(`adjustments.${index}.amount`, {
                validate: (v) => isMoney(v) && Number(v) > 0,
              })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('Review.removeItem')}
              onClick={() => adjustments.remove(index)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          {ADJUSTMENT_KINDS.map((kind) => (
            <Button
              key={kind}
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                adjustments.append({
                  kind,
                  label: t(`Review.Kinds.${kind}`),
                  amount: '',
                })
              }
            >
              <Plus className="mr-1 h-3 w-3" />
              {t('Review.addAdjustment', {
                kind: t(`Review.Kinds.${kind}`),
              })}
            </Button>
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-1 rounded-md bg-muted/50 p-3 text-sm">
        <div className="flex justify-between gap-2">
          <span>{t('Review.itemsSubtotal')}</span>
          <span className="tabular-nums">{money(itemsTotal)}</span>
        </div>
        {values.adjustments.map((adjustment, index) => (
          <div
            key={adjustment.kind + index}
            className="flex justify-between gap-2"
          >
            <span>
              {adjustment.label || t(`Review.Kinds.${adjustment.kind}`)}
            </span>
            <span className="tabular-nums">
              {money(adjustmentAmounts[index])}
            </span>
          </div>
        ))}
        <div className="flex justify-between gap-2 border-t pt-2 font-semibold">
          <span>{t('Review.total')}</span>
          <span data-testid="review-total" className="tabular-nums">
            {money(computedTotal)}
          </span>
        </div>
      </div>

      {mismatch && receipt.printedTotal !== null && (
        <Alert>
          <AlertDescription>
            {t('Review.mismatch', {
              computed: money(computedTotal),
              printed: money(receipt.printedTotal),
            })}
          </AlertDescription>
        </Alert>
      )}

      {(submitError || hasRowErrors) && (
        <p className="text-sm text-destructive">
          {submitError ?? t('Review.invalidRow')}
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-wrap gap-2 border-t bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:mx-0 sm:flex-nowrap sm:justify-end sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            className="flex-1 sm:flex-none"
            onClick={onCancel}
          >
            {t('Review.doneEditing')}
          </Button>
        )}
        {canRescan && (
          <Button
            type="button"
            variant="outline"
            className="flex-1 sm:flex-none"
            disabled={isBusy}
            onClick={rescan}
          >
            {busy === 'scan' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ScanLine className="mr-2 h-4 w-4" />
            )}
            {busy === 'scan' ? t('New.scanning') : t('Review.rescan')}
          </Button>
        )}
        <Button
          type="button"
          variant={receipt.status === 'DRAFT' ? 'outline' : 'default'}
          className="flex-1 sm:flex-none"
          disabled={isBusy}
          onClick={form.handleSubmit((v) => onValid(v, false))}
        >
          {t('Review.save')}
        </Button>
        {receipt.status === 'DRAFT' && (
          <Button
            type="button"
            className="order-first w-full sm:order-none sm:w-auto"
            disabled={isBusy}
            onClick={form.handleSubmit((v) => onValid(v, true))}
          >
            {busy === 'start' && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t('Review.startClaiming')}
          </Button>
        )}
      </div>
    </div>
  )
}

/** Non-managers (and anyone viewing a DRAFT they cannot edit). */
export function ReadOnlyReview({ receipt }: { receipt: ReceiptDetail }) {
  const t = useTranslations('Receipts')
  const locale = useLocale()
  const { group } = useCurrentGroup()
  if (!group) return null
  const currency = getCurrencyFromGroup(group)
  const money = (minor: number) => formatCurrency(currency, minor, locale)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {t('Review.readOnly', { payer: receipt.paidBy.name })}
      </p>
      <ul className="flex flex-col gap-2">
        {receipt.items.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-2 rounded-md border p-3"
          >
            <span>
              {item.quantity > 1 ? `${item.quantity} × ` : ''}
              {item.name}
              {item.taxable && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {t('Review.taxable')}
                </span>
              )}
            </span>
            <span className="tabular-nums">{money(item.amount)}</span>
          </li>
        ))}
        {receipt.adjustments.map((adjustment) => (
          <li
            key={adjustment.id}
            className="flex items-center justify-between gap-2 px-3 text-sm"
          >
            <span>{adjustment.label}</span>
            <span className="tabular-nums">{money(adjustment.amount)}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-between border-t pt-2 font-semibold">
        <span>{t('Review.total')}</span>
        <span data-testid="review-total" className="tabular-nums">
          {money(receipt.total)}
        </span>
      </div>
    </div>
  )
}

function ReceiptPhotoDialog({
  src,
  width,
  height,
}: {
  src: string
  width: number
  height: number
}) {
  const t = useTranslations('Receipts.Review')
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={t('viewImage')}
          className="shrink-0 overflow-hidden rounded-md border"
        >
          <Image
            src={src}
            width={width}
            height={height}
            alt=""
            className="h-24 w-auto"
          />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{t('receiptPhoto')}</DialogTitle>
        <Image
          src={src}
          width={width}
          height={height}
          alt={t('receiptPhoto')}
          className="h-auto w-full object-contain"
        />
      </DialogContent>
    </Dialog>
  )
}
