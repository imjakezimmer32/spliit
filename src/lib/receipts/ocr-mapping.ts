import type { Currency } from '@/lib/currency'
import { amountAsMinorUnits } from '@/lib/utils'
import type { ExtractedReceipt } from './ocr'
import { MAX_RECEIPT_AMOUNT } from './schemas'

// Matches receiptItemInput / receiptAdjustmentInput in schemas.ts.
const MAX_ITEMS = 150
const MAX_ITEM_NAME = 100
const MAX_ADJUSTMENT_LABEL = 50
const MAX_QUANTITY = 999
const MAX_TITLE = 200

export type MappedItem = {
  name: string
  quantity: number
  amount: number
  taxable: boolean
}

export type MappedAdjustment = {
  kind: 'TAX' | 'TIP' | 'DISCOUNT' | 'FEE'
  label: string
  amount: number // signed minor units: TAX/TIP/FEE > 0, DISCOUNT < 0
}

export type MappedReceipt = {
  items: MappedItem[]
  adjustments: MappedAdjustment[]
  printedTotal: number | null
  title?: string
  receiptDate?: string
}

const clampAmount = (minor: number) =>
  Math.min(MAX_RECEIPT_AMOUNT, Math.max(-MAX_RECEIPT_AMOUNT, minor))

const toMinor = (major: number, currency: Currency) =>
  clampAmount(amountAsMinorUnits(major, currency))

/**
 * Converts the model's extraction into receipt rows (PLAN Phase 4, step 2).
 * Pure, so the rules can be tested without the database.
 *
 * - A negative line is a discount printed as an item: it becomes a DISCOUNT
 *   adjustment instead of an item.
 * - Lines past 150 are dropped; amounts are clamped to MAX_RECEIPT_AMOUNT.
 * - Tax, tip, fees and receipt discounts are only kept when they are positive
 *   after conversion to minor units.
 */
export function mapExtractedReceipt(
  extracted: ExtractedReceipt,
  currency: Currency,
): MappedReceipt {
  const items: MappedItem[] = []
  const adjustments: MappedAdjustment[] = []

  for (const line of extracted.items.slice(0, MAX_ITEMS)) {
    const amount = toMinor(line.lineTotal, currency)
    const name = line.name.trim()
    if (amount < 0) {
      adjustments.push({
        kind: 'DISCOUNT',
        label: name.slice(0, MAX_ADJUSTMENT_LABEL) || 'Discount',
        amount,
      })
    } else {
      items.push({
        name: name.slice(0, MAX_ITEM_NAME) || 'Item',
        quantity: Math.min(
          MAX_QUANTITY,
          Math.max(1, Math.round(line.quantity)),
        ),
        amount,
        taxable: line.taxable,
      })
    }
  }

  const addPositive = (
    kind: MappedAdjustment['kind'],
    label: string,
    major: number | null,
  ) => {
    if (major === null) return
    const amount = toMinor(major, currency)
    if (amount > 0) adjustments.push({ kind, label, amount })
  }

  addPositive('TAX', 'Tax', extracted.tax)
  addPositive('TIP', 'Tip', extracted.tip)
  for (const fee of extracted.fees) {
    addPositive(
      'FEE',
      fee.label.trim().slice(0, MAX_ADJUSTMENT_LABEL) || 'Fee',
      fee.amount,
    )
  }
  for (const discount of extracted.discounts) {
    const amount = toMinor(discount.amount, currency)
    if (amount > 0) {
      adjustments.push({
        kind: 'DISCOUNT',
        label:
          discount.label.trim().slice(0, MAX_ADJUSTMENT_LABEL) || 'Discount',
        amount: -amount,
      })
    }
  }

  const merchant = toDisplayCase(extracted.merchant?.trim() ?? '')
  const date = extracted.date?.trim() ?? ''

  return {
    items,
    adjustments,
    printedTotal:
      extracted.total === null
        ? null
        : Math.max(0, toMinor(extracted.total, currency)),
    title: merchant.length >= 2 ? merchant.slice(0, MAX_TITLE) : undefined,
    receiptDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
  }
}

/**
 * Receipts print store names in capitals ("GREEN VALLEY MARKET"); as a title
 * that reads like shouting. All-caps names become Title Case; anything with
 * lowercase letters (a deliberate brand spelling) is kept as printed.
 */
export function toDisplayCase(name: string): string {
  if (!/[A-Z]/.test(name) || /[a-z]/.test(name)) return name
  return name
    .toLowerCase()
    .replace(
      /(^|[\s\-/&(])(\p{L})/gu,
      (_, sep: string, ch: string) => sep + ch.toUpperCase(),
    )
}
