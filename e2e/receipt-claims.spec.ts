import { expect, Page } from '@playwright/test'
import {
  createGroup,
  expectBalance,
  expenseCard,
  EXPENSES_URL,
  openExpense,
  openTab,
  setActiveUser,
  uniqueSuffix,
} from './app'
import { test } from './fixtures'
import { fillStable, money, setChecked } from './ui'

/**
 * Manual entry only: the e2e stack has no S3 or OpenAI, so the scan path is
 * covered by unit tests. Desktop viewport, so item actions and the split
 * picker are Dialogs.
 */

// Plan D.4: Milk and Steak untaxed; the rest taxed. Items total 50.22 before
// adjustments (TAX 2.30, Coupon -2.00, Bag fee 0.10) -> receipt total 50.62.
const ITEMS = [
  { name: 'Milk', amount: '4.99', taxable: false },
  { name: 'Paper towels', amount: '13.00', taxable: true },
  { name: 'Chips', amount: '3.49', taxable: true },
  { name: 'Steak', amount: '18.75', taxable: false },
  { name: 'Batteries', amount: '9.99', taxable: true },
]

const PARTICIPANTS = ['Alex', 'Jake', 'Sam']

type Participant = { id: string; name: string }

async function readParticipants(
  page: Page,
  groupId: string,
): Promise<Participant[]> {
  const input = encodeURIComponent(JSON.stringify({ json: { groupId } }))
  const response = await page.request.get(`/api/trpc/groups.get?input=${input}`)
  const body = await response.json()
  return body.result.data.json.group.participants
}

/**
 * The plan's exact numbers assume alex < jake < sam by participant id: the
 * allocator breaks 1-cent ties by id (src/lib/receipts/allocate.ts), and ids
 * are random per group. Renaming keeps the ids, so the smallest id is renamed
 * Alex, the next Jake, the largest Sam. Then every expected cent is exact.
 */
async function alignIdOrder(page: Page, groupId: string): Promise<void> {
  const participants = await readParticipants(page, groupId)
  const byId = [...participants].sort((a, b) => (a.id < b.id ? -1 : 1))
  const wanted = new Map(byId.map((p, i) => [p.id, PARTICIPANTS[i]]))
  if (participants.every((p) => p.name === wanted.get(p.id))) return

  await openTab(page, 'Settings')
  const firstRow = page.locator('input[name="participants.0.name"]')
  await expect(firstRow).not.toHaveValue('')

  for (let i = 0; i < participants.length; i++) {
    const input = page.locator(`input[name="participants.${i}.name"]`)
    const current = await input.inputValue()
    const participant = participants.find((p) => p.name === current)
    if (!participant) throw new Error(`No participant named ${current}`)
    await fillStable(input, wanted.get(participant.id) ?? current)
  }

  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect
    .poll(
      async () =>
        (await readParticipants(page, groupId)).every(
          (p) => p.name === wanted.get(p.id),
        ),
      { timeout: 30_000 },
    )
    .toBe(true)
}

/** Creates a receipt as Jake, enters the D.4 items, and starts claiming. */
async function enterReceiptManually(
  page: Page,
  groupId: string,
): Promise<string> {
  await setActiveUser(page, groupId, 'Jake')
  await page.goto(`/groups/${groupId}/receipts/new`)

  await page.getByRole('radio', { name: 'Jake', exact: true }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Enter items manually' }).click()
  // Not "/receipts/new": that is where the wizard starts.
  await page.waitForURL(/\/receipts\/(?!new$)[^/?]+$/, { timeout: 30_000 })
  const receiptId = /\/receipts\/([^/?]+)$/.exec(page.url())?.[1]
  if (!receiptId) throw new Error(`No receipt id in ${page.url()}`)

  for (const [i, item] of ITEMS.entries()) {
    await page.getByRole('button', { name: 'Add item' }).click()
    await fillStable(page.getByLabel('Item', { exact: true }).nth(i), item.name)
    await fillStable(
      page.getByLabel('Amount', { exact: true }).nth(i),
      item.amount,
    )
    await setChecked(
      page.getByRole('checkbox', { name: 'Taxed' }).nth(i),
      item.taxable,
    )
  }

  // Adjustment labels are "Title" inputs; index 0 is the receipt title.
  await page.getByRole('button', { name: 'Add Tax' }).click()
  await fillStable(page.getByLabel('Amount', { exact: true }).nth(5), '2.30')

  await page.getByRole('button', { name: 'Add Discount' }).click()
  await fillStable(page.getByLabel('Title', { exact: true }).nth(2), 'Coupon')
  await fillStable(page.getByLabel('Amount', { exact: true }).nth(6), '2.00')

  await page.getByRole('button', { name: 'Add Fee' }).click()
  await fillStable(page.getByLabel('Title', { exact: true }).nth(3), 'Bag fee')
  await fillStable(page.getByLabel('Amount', { exact: true }).nth(7), '0.10')

  await expect(page.getByTestId('review-total').first()).toContainText(
    money(50.62),
  )

  await page
    .getByRole('button', { name: 'Start claiming', exact: true })
    .click()
  await expect(page.getByTestId('receipt-status')).toHaveText('Claiming')
  return receiptId
}

function itemRow(page: Page, name: string) {
  return page.locator(`[data-testid="receipt-item"][data-item-name="${name}"]`)
}

async function openItem(page: Page, name: string): Promise<void> {
  await itemRow(page, name).click()
  await expect(page.getByTestId('item-actions')).toBeVisible()
}

async function claimItem(page: Page, name: string): Promise<void> {
  await openItem(page, name)
  await page.getByRole('button', { name: /It.s mine/ }).click()
  await expect(page.getByTestId('item-actions')).toBeHidden()
}

async function openReceipt(
  page: Page,
  groupId: string,
  receiptId: string,
): Promise<void> {
  await page.goto(`/groups/${groupId}/receipts/${receiptId}`)
  await expect(page.getByTestId('receipt-status')).toBeVisible()
}

test('itemized receipt: claims, approvals, balances and finalize', async ({
  page,
}) => {
  const groupId = await createGroup(page, {
    name: `E2E Receipts ${uniqueSuffix()}`,
    participants: PARTICIPANTS,
  })
  await alignIdOrder(page, groupId)

  // Step 2
  const receiptId = await enterReceiptManually(page, groupId)
  const receiptPath = `/groups/${groupId}/receipts/${receiptId}`

  // Step 3: Jake claims as himself, splits towels, assigns chips to Sam.
  await openReceipt(page, groupId, receiptId)
  await claimItem(page, 'Milk')

  await openItem(page, 'Paper towels')
  await page.getByRole('button', { name: 'Split…', exact: true }).click()
  const split = page.getByTestId('split-dialog')
  await setChecked(
    split.getByRole('checkbox', { name: 'Alex', exact: true }),
    true,
  )
  await setChecked(
    split.getByRole('checkbox', { name: 'Sam', exact: true }),
    true,
  )
  await split.getByRole('button', { name: 'Propose split' }).click()
  await expect(page.getByTestId('item-actions')).toBeHidden()

  await openItem(page, 'Chips')
  await page.getByRole('button', { name: 'Assign to…' }).click()
  await page
    .locator('[data-testid="assign-option"][data-participant-name="Sam"]')
    .click()
  await expect(page.getByTestId('item-actions')).toBeHidden()

  // Step 4: everything still sits on Jake, so nobody owes anything yet.
  await openTab(page, 'Balances')
  await expectBalance(page, 'Alex', 0)
  await expectBalance(page, 'Jake', 0)
  await expectBalance(page, 'Sam', 0)
  await expect(page.locator('[data-testid="reimbursement-row"]')).toHaveCount(0)

  // Step 5: Sam sees two approvals and approves all.
  await setActiveUser(page, groupId, 'Sam')
  await page.goto(`/groups/${groupId}/receipts`)
  await expect(page.getByTestId('pending-count')).toHaveText('2')
  await page.getByRole('button', { name: 'Approve all', exact: true }).click()
  await expect(page.getByTestId('pending-count')).toBeHidden()

  // Step 6: Alex claims the steak but leaves the towels pending.
  await setActiveUser(page, groupId, 'Alex')
  await openReceipt(page, groupId, receiptId)
  await claimItem(page, 'Steak')

  // Step 7
  await openTab(page, 'Balances')
  await expectBalance(page, 'Jake', 26.24)
  await expectBalance(page, 'Alex', -18.04)
  await expectBalance(page, 'Sam', -8.2)

  // Step 8: approving the towels moves Alex's share onto the balances.
  await page.goto(`/groups/${groupId}/receipts`)
  await expect(
    page.getByTestId('inbox-entry').filter({ hasText: 'Paper towels' }),
  ).toBeVisible()
  await page
    .getByTestId('inbox-entry')
    .filter({ hasText: 'Paper towels' })
    .getByRole('button', { name: 'Approve', exact: true })
    .click()

  await openTab(page, 'Balances')
  await expectBalance(page, 'Jake', 30.8)
  await expectBalance(page, 'Alex', -22.6)
  await expectBalance(page, 'Sam', -8.2)

  // Step 9: Jake finalizes; the dialog states the unclaimed batteries.
  await setActiveUser(page, groupId, 'Jake')
  await openReceipt(page, groupId, receiptId)
  await page.getByTestId('finalize-button').click()
  await expect(page.getByRole('dialog')).toContainText(
    `${money(9.99)} of unclaimed items will be counted as Jake’s`,
  )
  await page.getByTestId('finalize-confirm').click()
  await expect(page.getByTestId('receipt-status')).toHaveText('Finalized')

  // Step 10: the expense is managed by the receipt.
  await page.goto(`/groups/${groupId}/expenses`)
  await expect(page).toHaveURL(EXPENSES_URL)
  await expect(expenseCard(page, 'Receipt')).toContainText(money(50.62))
  await expect(
    expenseCard(page, 'Receipt').getByTestId('receipt-icon'),
  ).toBeVisible()

  await openExpense(page, 'Receipt')
  await expect(
    page.getByText('Itemized receipt', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Open receipt' }),
  ).toHaveAttribute('href', receiptPath)
  await expect(page.locator('input[name="amount"]')).toHaveCount(0)
})

test('reject flow: a declined assignment returns to Unclaimed', async ({
  page,
}) => {
  const groupId = await createGroup(page, {
    name: `E2E Receipts Reject ${uniqueSuffix()}`,
    participants: PARTICIPANTS,
  })

  // Step 11
  const receiptId = await enterReceiptManually(page, groupId)
  const receiptPath = `/groups/${groupId}/receipts/${receiptId}`

  await openReceipt(page, groupId, receiptId)
  await openItem(page, 'Chips')
  await page.getByRole('button', { name: 'Assign to…' }).click()
  await page
    .locator('[data-testid="assign-option"][data-participant-name="Sam"]')
    .click()
  await expect(page.getByTestId('item-actions')).toBeHidden()

  await setActiveUser(page, groupId, 'Sam')
  await page.goto(`/groups/${groupId}/receipts`)
  await page
    .getByTestId('inbox-entry')
    .filter({ hasText: 'Chips' })
    .getByRole('button', { name: 'Reject', exact: true })
    .click()
  await expect(page.getByTestId('inbox-entry')).toHaveCount(0)

  await setActiveUser(page, groupId, 'Jake')
  await page.goto(`/groups/${groupId}/receipts`)
  await expect(page.getByTestId('declined-entry')).toContainText(
    'Sam declined Chips',
  )

  await openReceipt(page, groupId, receiptId)
  await expect(itemRow(page, 'Chips')).toContainText('Unclaimed')
  await expect(page.getByTestId('pending-count')).toHaveCount(0)

  await page.getByTestId('finalize-button').click()
  await expect(page.getByTestId('finalize-confirm')).toBeEnabled()
  await page.getByTestId('finalize-confirm').click()
  await expect(page.getByTestId('receipt-status')).toHaveText('Finalized')
  await expect(page).toHaveURL(new RegExp(`${receiptPath}$`))
})
