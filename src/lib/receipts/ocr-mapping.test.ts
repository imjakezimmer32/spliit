import { getCurrency } from '@/lib/currency'
import type { ExtractedReceipt } from './ocr'
import { mapExtractedReceipt, toDisplayCase } from './ocr-mapping'
import { MAX_RECEIPT_AMOUNT } from './schemas'

const EUR = getCurrency('EUR')
const JPY = getCurrency('JPY')

function receipt(overrides: Partial<ExtractedReceipt> = {}): ExtractedReceipt {
  return {
    merchant: null,
    date: null,
    items: [],
    tax: null,
    tip: null,
    fees: [],
    discounts: [],
    subtotal: null,
    total: null,
    ...overrides,
  }
}

describe('mapExtractedReceipt', () => {
  it('turns a negative line into a DISCOUNT adjustment, not an item', () => {
    const mapped = mapExtractedReceipt(
      receipt({
        items: [
          { name: 'Coffee', quantity: 1, lineTotal: 3.5, taxable: true },
          { name: 'Coupon', quantity: 1, lineTotal: -0.5, taxable: true },
        ],
      }),
      EUR,
    )
    expect(mapped.items).toEqual([
      { name: 'Coffee', quantity: 1, amount: 350, taxable: true },
    ])
    expect(mapped.adjustments).toEqual([
      { kind: 'DISCOUNT', label: 'Coupon', amount: -50 },
    ])
  })

  it('converts JPY with zero decimal digits', () => {
    const mapped = mapExtractedReceipt(
      receipt({
        items: [{ name: 'Ramen', quantity: 2, lineTotal: 1200, taxable: true }],
        tax: 120,
        total: 1320,
      }),
      JPY,
    )
    expect(mapped.items).toEqual([
      { name: 'Ramen', quantity: 2, amount: 1200, taxable: true },
    ])
    expect(mapped.adjustments).toEqual([
      { kind: 'TAX', label: 'Tax', amount: 120 },
    ])
    expect(mapped.printedTotal).toBe(1320)
  })

  it('skips null and zero tax, tip and fees', () => {
    const mapped = mapExtractedReceipt(
      receipt({
        items: [{ name: 'Tea', quantity: 1, lineTotal: 2, taxable: false }],
        tax: null,
        tip: 0,
        fees: [{ label: 'Bag', amount: 0 }],
      }),
      EUR,
    )
    expect(mapped.adjustments).toEqual([])
  })

  it('keeps tip, fees and receipt discounts with the right signs', () => {
    const mapped = mapExtractedReceipt(
      receipt({
        tip: 4,
        fees: [{ label: 'Bag fee', amount: 0.1 }],
        discounts: [{ label: 'Member', amount: 1 }],
      }),
      EUR,
    )
    expect(mapped.adjustments).toEqual([
      { kind: 'TIP', label: 'Tip', amount: 400 },
      { kind: 'FEE', label: 'Bag fee', amount: 10 },
      { kind: 'DISCOUNT', label: 'Member', amount: -100 },
    ])
  })

  it('leaves printedTotal null when the total is not printed', () => {
    expect(
      mapExtractedReceipt(receipt({ total: null }), EUR).printedTotal,
    ).toBe(null)
  })

  it('clamps amounts to MAX_RECEIPT_AMOUNT', () => {
    const mapped = mapExtractedReceipt(
      receipt({
        items: [
          { name: 'Gold bar', quantity: 1, lineTotal: 1e9, taxable: true },
        ],
        total: 1e9,
      }),
      EUR,
    )
    expect(mapped.items[0].amount).toBe(MAX_RECEIPT_AMOUNT)
    expect(mapped.printedTotal).toBe(MAX_RECEIPT_AMOUNT)
  })

  it('keeps at most 150 lines', () => {
    const items = Array.from({ length: 151 }, (_, i) => ({
      name: `Item ${i}`,
      quantity: 1,
      lineTotal: 1,
      taxable: true,
    }))
    const mapped = mapExtractedReceipt(receipt({ items }), EUR)
    expect(mapped.items).toHaveLength(150)
    expect(mapped.items.at(-1)?.name).toBe('Item 149')
  })

  it('rounds and bounds quantity to 1..999', () => {
    const mapped = mapExtractedReceipt(
      receipt({
        items: [
          { name: 'a', quantity: 0.4, lineTotal: 1, taxable: true },
          { name: 'b', quantity: 2.6, lineTotal: 1, taxable: true },
          { name: 'c', quantity: 5000, lineTotal: 1, taxable: true },
        ],
      }),
      EUR,
    )
    expect(mapped.items.map((i) => i.quantity)).toEqual([1, 3, 999])
  })

  it('uses the merchant as title only when it has at least two characters', () => {
    expect(
      mapExtractedReceipt(receipt({ merchant: '  Lidl ' }), EUR).title,
    ).toBe('Lidl')
    expect(mapExtractedReceipt(receipt({ merchant: 'X' }), EUR).title).toBe(
      undefined,
    )
  })

  it('accepts only yyyy-mm-dd dates', () => {
    expect(
      mapExtractedReceipt(receipt({ date: '2026-03-01' }), EUR).receiptDate,
    ).toBe('2026-03-01')
    expect(
      mapExtractedReceipt(receipt({ date: '01/03/2026' }), EUR).receiptDate,
    ).toBe(undefined)
  })
})

describe('toDisplayCase', () => {
  it('title-cases all-caps store names and keeps mixed case', () => {
    expect(toDisplayCase('GREEN VALLEY MARKET')).toBe('Green Valley Market')
    expect(toDisplayCase("TRADER JOE'S")).toBe("Trader Joe's")
    expect(toDisplayCase("McDonald's")).toBe("McDonald's")
    expect(toDisplayCase('7-ELEVEN')).toBe('7-Eleven')
  })
})
