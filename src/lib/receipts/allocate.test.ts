import { apportionByWeights } from '@/lib/shares'
import {
  AllocAdjustment,
  allocateReceipt,
  AllocClaim,
  AllocItem,
  itemPortions,
  revalidateItemClaims,
} from './allocate'

const claim = (
  id: string,
  itemId: string,
  participantId: string,
  shares: number,
  status: AllocClaim['status'],
  approvedAmount: number | null = null,
): AllocClaim => ({ id, itemId, participantId, shares, status, approvedAmount })

describe('apportionByWeights', () => {
  it('splits 100 evenly with the remainder going to the lowest index', () => {
    expect(apportionByWeights(100, [1, 1, 1])).toEqual([34, 33, 33])
  })

  it('handles negative amounts with the same largest remainder rule', () => {
    expect(apportionByWeights(-190, [1875, 2365, 782])).toEqual([-71, -89, -30])
  })

  it('returns zeros when all weights are zero', () => {
    expect(apportionByWeights(5, [0, 0])).toEqual([0, 0])
  })
})

describe('itemPortions', () => {
  it('splits the towels 1300 over alex/jake/sam regardless of claim order', () => {
    const towels: AllocItem = { id: 'towels', amount: 1300, taxable: true }
    const claims = [
      claim('c3', 'towels', 'sam', 1, 'PENDING'),
      claim('c1', 'towels', 'alex', 1, 'PENDING'),
      claim('c2', 'towels', 'jake', 1, 'APPROVED', 433),
    ]
    const portions = itemPortions(towels, claims)
    expect(portions.get('alex')).toBe(434)
    expect(portions.get('jake')).toBe(433)
    expect(portions.get('sam')).toBe(433)
  })

  it('ignores REJECTED claims so the remaining claimant gets the whole amount', () => {
    const item: AllocItem = { id: 'i', amount: 1000, taxable: false }
    const claims = [
      claim('c1', 'i', 'alex', 1, 'APPROVED', 1000),
      claim('c2', 'i', 'jake', 1, 'REJECTED'),
    ]
    const portions = itemPortions(item, claims)
    expect([...portions.entries()]).toEqual([['alex', 1000]])
  })

  it('splits by shares 2:1 on 1000 as 667 / 333', () => {
    const item: AllocItem = { id: 'i', amount: 1000, taxable: false }
    const claims = [
      claim('c1', 'i', 'alex', 2, 'APPROVED', 667),
      claim('c2', 'i', 'jake', 1, 'APPROVED', 333),
    ]
    const portions = itemPortions(item, claims)
    expect(portions.get('alex')).toBe(667)
    expect(portions.get('jake')).toBe(333)
  })
})

describe('allocateReceipt', () => {
  // Group alex, jake, sam. Jake paid. See PLAN D.4.
  const items: AllocItem[] = [
    { id: 'milk', amount: 499, taxable: false },
    { id: 'towels', amount: 1300, taxable: true },
    { id: 'chips', amount: 349, taxable: true },
    { id: 'steak', amount: 1875, taxable: false },
    { id: 'batteries', amount: 999, taxable: true },
  ]
  const adjustments: AllocAdjustment[] = [
    { kind: 'TAX', amount: 230 },
    { kind: 'DISCOUNT', amount: -200 },
    { kind: 'FEE', amount: 10 },
  ]
  const baseClaims: AllocClaim[] = [
    claim('c-milk-jake', 'milk', 'jake', 1, 'APPROVED', 499),
    claim('c-towels-jake', 'towels', 'jake', 1, 'APPROVED', 433),
    claim('c-towels-sam', 'towels', 'sam', 1, 'APPROVED', 433),
    claim('c-towels-alex', 'towels', 'alex', 1, 'PENDING'),
    claim('c-chips-sam', 'chips', 'sam', 1, 'APPROVED', 349),
    claim('c-steak-alex', 'steak', 'alex', 1, 'APPROVED', 1875),
  ]

  it('D.4 scenario 1: alex has not approved the towels yet', () => {
    const result = allocateReceipt({
      payerId: 'jake',
      items,
      claims: baseClaims,
      adjustments,
    })

    expect(result.itemsSubtotal).toBe(5022)
    expect(result.adjustmentsTotal).toBe(40)
    expect(result.total).toBe(5062)
    expect(result.unclaimed).toBe(999)
    expect(result.participants).toEqual([
      {
        participantId: 'alex',
        items: 1875,
        absorbed: 0,
        pending: 434,
        tax: 0,
        other: -71,
        total: 1804,
      },
      {
        participantId: 'jake',
        items: 2365,
        absorbed: 1433,
        pending: 0,
        tax: 162,
        other: -89,
        total: 2438,
      },
      {
        participantId: 'sam',
        items: 782,
        absorbed: 0,
        pending: 0,
        tax: 68,
        other: -30,
        total: 820,
      },
    ])
  })

  it('D.4 scenario 2: alex approves the towels', () => {
    const claims = baseClaims.map((c) =>
      c.id === 'c-towels-alex'
        ? { ...c, status: 'APPROVED' as const, approvedAmount: 434 }
        : c,
    )
    const result = allocateReceipt({
      payerId: 'jake',
      items,
      claims,
      adjustments,
    })

    expect(result.itemsSubtotal).toBe(5022)
    expect(result.adjustmentsTotal).toBe(40)
    expect(result.total).toBe(5062)
    expect(result.unclaimed).toBe(999)
    expect(result.participants).toEqual([
      {
        participantId: 'alex',
        items: 2309,
        absorbed: 0,
        pending: 0,
        tax: 38,
        other: -87,
        total: 2260,
      },
      {
        participantId: 'jake',
        items: 1931,
        absorbed: 999,
        pending: 0,
        tax: 124,
        other: -73,
        total: 1982,
      },
      {
        participantId: 'sam',
        items: 782,
        absorbed: 0,
        pending: 0,
        tax: 68,
        other: -30,
        total: 820,
      },
    ])
    const sumTotals = result.participants.reduce((s, p) => s + p.total, 0)
    expect(sumTotals).toBe(5062)
  })

  it('splits TAX over item weights when no item is taxable', () => {
    const result = allocateReceipt({
      payerId: 'jake',
      items: [
        { id: 'a', amount: 600, taxable: false },
        { id: 'b', amount: 400, taxable: false },
      ],
      claims: [
        claim('c1', 'a', 'alex', 1, 'APPROVED', 600),
        claim('c2', 'b', 'jake', 1, 'APPROVED', 400),
      ],
      adjustments: [{ kind: 'TAX', amount: 100 }],
    })

    expect(result.participants.map((p) => [p.participantId, p.tax])).toEqual([
      ['alex', 60],
      ['jake', 40],
    ])
    expect(result.total).toBe(1100)
  })

  it('gives the payer all the other adjustments when every item is 0', () => {
    const result = allocateReceipt({
      payerId: 'jake',
      items: [{ id: 'free', amount: 0, taxable: false }],
      claims: [
        claim('c1', 'free', 'alex', 1, 'APPROVED', 0),
        claim('c2', 'free', 'sam', 1, 'APPROVED', 0),
      ],
      adjustments: [{ kind: 'FEE', amount: 50 }],
    })

    const jake = result.participants.find((p) => p.participantId === 'jake')
    expect(jake?.other).toBe(50)
    expect(jake?.total).toBe(50)
    expect(
      result.participants.find((p) => p.participantId === 'alex')?.total,
    ).toBe(0)
    expect(
      result.participants.find((p) => p.participantId === 'sam')?.total,
    ).toBe(0)
  })

  it('reconciles exactly and stays integer over 500 seeded random receipts', () => {
    // Seeded LCG (Numerical Recipes constants) so failures are reproducible.
    let state = 20260501
    const rand = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return state / 2 ** 32
    }
    const randInt = (min: number, max: number) =>
      min + Math.floor(rand() * (max - min + 1))

    const pool = ['alex', 'jake', 'sam', 'pat', 'lee']
    for (let receipt = 0; receipt < 500; receipt++) {
      const payerId = pool[randInt(0, pool.length - 1)]
      const itemCount = randInt(1, 20)
      const randomItems: AllocItem[] = []
      const randomClaims: AllocClaim[] = []
      const statuses: AllocClaim['status'][] = [
        'PENDING',
        'APPROVED',
        'REJECTED',
      ]

      for (let i = 0; i < itemCount; i++) {
        const itemId = `item-${i}`
        randomItems.push({
          id: itemId,
          amount: randInt(0, 100000),
          taxable: rand() < 0.5,
        })
        const claimCount = randInt(0, 4)
        const shuffled = [...pool].sort(() => rand() - 0.5)
        for (let j = 0; j < claimCount; j++) {
          randomClaims.push(
            claim(
              `claim-${i}-${j}`,
              itemId,
              shuffled[j],
              randInt(1, 5),
              statuses[randInt(0, 2)],
              rand() < 0.5 ? null : randInt(0, 100000),
            ),
          )
        }
      }

      const adjustments: AllocAdjustment[] = []
      const adjustmentCount = randInt(0, 4)
      for (let k = 0; k < adjustmentCount; k++) {
        const kind = (['TAX', 'TIP', 'FEE', 'DISCOUNT'] as const)[randInt(0, 3)]
        const amount =
          kind === 'DISCOUNT' ? -randInt(0, 3000) : randInt(0, 5000)
        adjustments.push({ kind, amount })
      }
      if (adjustments.reduce((s, a) => s + a.amount, 0) <= 0) {
        adjustments.push({ kind: 'FEE', amount: 1000 })
      }

      const result = allocateReceipt({
        payerId,
        items: randomItems,
        claims: randomClaims,
        adjustments,
      })

      const expectedTotal = result.itemsSubtotal + result.adjustmentsTotal
      const totalSum = result.participants.reduce((s, p) => s + p.total, 0)
      expect(totalSum).toBe(expectedTotal)
      expect(result.total).toBe(expectedTotal)

      for (const p of result.participants) {
        for (const value of [
          p.items,
          p.absorbed,
          p.pending,
          p.tax,
          p.other,
          p.total,
        ]) {
          expect(Number.isInteger(value)).toBe(true)
        }
      }
      expect(Number.isInteger(result.unclaimed)).toBe(true)
    }
  })
})

describe('revalidateItemClaims', () => {
  const item: AllocItem = { id: 'i', amount: 900, taxable: false }

  it('(a) moves an approved claim back to PENDING when its portion grows', () => {
    // alex approved 200, but with three 1:1:1 claimants the portion is 300.
    const claims = [
      claim('c-alex', 'i', 'alex', 1, 'APPROVED', 200),
      claim('c-jake', 'i', 'jake', 1, 'PENDING'),
      claim('c-sam', 'i', 'sam', 1, 'PENDING'),
    ]
    expect(
      revalidateItemClaims({
        item,
        claims,
        actorId: 'pat',
        payerId: 'pat',
        autoApproveActor: false,
      }),
    ).toEqual([{ id: 'c-alex', status: 'PENDING', approvedAmount: 200 }])
  })

  it('(b) leaves an approved claim alone when its portion shrinks', () => {
    // alex approved 500, the portion is now 300.
    const claims = [
      claim('c-alex', 'i', 'alex', 1, 'APPROVED', 500),
      claim('c-jake', 'i', 'jake', 1, 'PENDING'),
      claim('c-sam', 'i', 'sam', 1, 'PENDING'),
    ]
    expect(
      revalidateItemClaims({
        item,
        claims,
        actorId: 'pat',
        payerId: 'pat',
        autoApproveActor: false,
      }),
    ).toEqual([])
  })

  it('(c) auto-approves the payer’s PENDING claim at its portion', () => {
    const claims = [
      claim('c-alex', 'i', 'alex', 1, 'APPROVED', 300),
      claim('c-jake', 'i', 'jake', 1, 'APPROVED', 300),
      claim('c-sam', 'i', 'sam', 1, 'PENDING'),
    ]
    expect(
      revalidateItemClaims({
        item,
        claims,
        actorId: 'pat',
        payerId: 'sam',
        autoApproveActor: false,
      }),
    ).toEqual([{ id: 'c-sam', status: 'APPROVED', approvedAmount: 300 }])
  })

  it('(d) leaves the actor PENDING unless autoApproveActor is set', () => {
    const claims = [
      claim('c-alex', 'i', 'alex', 1, 'APPROVED', 300),
      claim('c-jake', 'i', 'jake', 1, 'PENDING'),
      claim('c-sam', 'i', 'sam', 1, 'APPROVED', 300),
    ]
    const base = {
      item,
      claims,
      actorId: 'jake',
      payerId: 'pat',
    }
    expect(revalidateItemClaims({ ...base, autoApproveActor: false })).toEqual(
      [],
    )
    expect(revalidateItemClaims({ ...base, autoApproveActor: true })).toEqual([
      { id: 'c-jake', status: 'APPROVED', approvedAmount: 300 },
    ])
  })
})
