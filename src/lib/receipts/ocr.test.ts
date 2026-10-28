import { env } from '../env'
import { extractReceiptItems } from './ocr'

// See the note in src/components/expense-form-actions.test.ts on why this is a
// `var` reached through an arrow.
var mockCreate = jest.fn()

jest.mock('openai', () => ({
  __esModule: true,
  default: class {
    chat = {
      completions: { create: (...args: unknown[]) => mockCreate(...args) },
    }
  },
}))
jest.mock('../env', () => ({
  env: {
    OPENAI_API_KEY: 'sk-test',
    OPENAI_BASE_URL: undefined,
    OPENAI_MODEL_RECEIPT_ITEMS: 'test-vision-model',
    OPENAI_RECEIPT_ITEMS_REASONING_EFFORT: undefined,
  },
}))

const IMAGE = 'https://uploads.test/receipt.jpg'

function respondWith(content: string | null) {
  mockCreate.mockResolvedValue({ choices: [{ message: { content } }] })
}

const THREE_ITEMS = {
  merchant: 'Corner Shop',
  date: '2026-03-01',
  items: [
    { name: 'Milk', quantity: 1, lineTotal: 1.2, taxable: false },
    { name: 'Bread', quantity: 2, lineTotal: 4.5, taxable: true },
    { name: 'Eggs', quantity: 1, lineTotal: 3, taxable: true },
  ],
  tax: 0.5,
  tip: null,
  fees: [],
  discounts: [],
  subtotal: 9.2,
  total: 9.7,
}

describe('extractReceiptItems', () => {
  beforeEach(() => {
    mockCreate.mockReset()
    env.OPENAI_RECEIPT_ITEMS_REASONING_EFFORT = undefined
  })

  it('parses a 3-item receipt', async () => {
    respondWith(JSON.stringify(THREE_ITEMS))
    expect(await extractReceiptItems(IMAGE)).toEqual(THREE_ITEMS)
  })

  it('returns null on malformed JSON', async () => {
    respondWith('{"items": [')
    expect(await extractReceiptItems(IMAGE)).toBeNull()
  })

  it('returns null when the response violates the schema', async () => {
    respondWith(JSON.stringify({ items: 'not an array' }))
    expect(await extractReceiptItems(IMAGE)).toBeNull()
  })

  it('returns null on empty content', async () => {
    respondWith(null)
    expect(await extractReceiptItems(IMAGE)).toBeNull()
  })

  it('returns null when the API call throws', async () => {
    mockCreate.mockRejectedValue(new Error('network down'))
    expect(await extractReceiptItems(IMAGE)).toBeNull()
  })

  it("sends detail 'high', the configured model and the output cap", async () => {
    respondWith(JSON.stringify(THREE_ITEMS))
    await extractReceiptItems(IMAGE)

    const request = mockCreate.mock.calls[0][0]
    expect(request.model).toBe('test-vision-model')
    expect(request.max_completion_tokens).toBe(4000)
    expect(request.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: { name: 'receipt_items', strict: true },
    })
    expect(request.messages[1].content).toEqual([
      { type: 'image_url', image_url: { url: IMAGE, detail: 'high' } },
    ])
  })

  it('omits reasoning_effort when the env var is not set', async () => {
    respondWith(JSON.stringify(THREE_ITEMS))
    await extractReceiptItems(IMAGE)

    expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('reasoning_effort')
  })

  it('sends reasoning_effort when the env var is set', async () => {
    env.OPENAI_RECEIPT_ITEMS_REASONING_EFFORT = 'low'
    respondWith(JSON.stringify(THREE_ITEMS))
    await extractReceiptItems(IMAGE)

    expect(mockCreate.mock.calls[0][0].reasoning_effort).toBe('low')
  })
})
