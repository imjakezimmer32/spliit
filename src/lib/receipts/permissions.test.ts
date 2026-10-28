import {
  canManageReceipt,
  canRemoveClaim,
  canRespond,
  canSplitItem,
  isActiveClaim,
} from './permissions'

// Payer is jake, creator is alex, everyone else (sam, pat) is a plain participant.
const receipt = { paidById: 'jake', createdById: 'alex' }

describe('isActiveClaim', () => {
  it.each([
    ['PENDING', true],
    ['APPROVED', true],
    ['REJECTED', false],
  ])('%s → %s', (status, expected) => {
    expect(isActiveClaim({ status })).toBe(expected)
  })
})

describe('canManageReceipt', () => {
  it.each([
    ['jake', true, 'payer'],
    ['alex', true, 'creator'],
    ['sam', false, 'plain participant'],
  ])('%s → %s (%s)', (actor, expected) => {
    expect(canManageReceipt(receipt, actor)).toBe(expected)
  })

  it('with no creator recorded, only the payer manages', () => {
    const legacy = { paidById: 'jake', createdById: null }
    expect(canManageReceipt(legacy, 'sam')).toBe(false)
    expect(canManageReceipt(legacy, 'jake')).toBe(true)
  })
})

describe('canRemoveClaim', () => {
  // Claim held by sam, assigned by pat.
  const claim = { participantId: 'sam', assignedById: 'pat', status: 'PENDING' }
  it.each([
    ['sam', true, 'the claimant'],
    ['pat', true, 'the assigner'],
    ['jake', true, 'the payer (manager)'],
    ['alex', true, 'the creator (manager)'],
    ['lee', false, 'an unrelated participant'],
  ])('%s → %s (%s)', (actor, expected) => {
    expect(canRemoveClaim(receipt, claim, actor)).toBe(expected)
  })

  it('a self-claim (assignedById null) can only be removed by its claimant or a manager', () => {
    const selfClaim = {
      participantId: 'sam',
      assignedById: null,
      status: 'APPROVED',
    }
    expect(canRemoveClaim(receipt, selfClaim, 'sam')).toBe(true)
    expect(canRemoveClaim(receipt, selfClaim, 'pat')).toBe(false)
    expect(canRemoveClaim(receipt, selfClaim, 'jake')).toBe(true)
  })
})

describe('canSplitItem', () => {
  const active = (participantId: string) => ({
    participantId,
    assignedById: null,
    status: 'PENDING',
  })
  const rejected = (participantId: string) => ({
    participantId,
    assignedById: null,
    status: 'REJECTED',
  })

  it.each([
    ['no claims at all', [], 'sam', true],
    ['only REJECTED claims', [rejected('alex'), rejected('pat')], 'sam', true],
    ['actor has an active claim', [active('sam'), active('pat')], 'sam', true],
    [
      'actor has only a REJECTED claim, others active',
      [rejected('sam'), active('pat')],
      'sam',
      false,
    ],
    [
      'another participant holds an active claim',
      [active('pat')],
      'sam',
      false,
    ],
    [
      'manager (payer) with another active claim',
      [active('pat')],
      'jake',
      true,
    ],
    [
      'manager (creator) with another active claim',
      [active('pat')],
      'alex',
      true,
    ],
  ])('%s → actor %s is %s', (_label, claims, actor, expected) => {
    expect(canSplitItem(receipt, claims, actor)).toBe(expected)
  })
})

describe('canRespond', () => {
  it.each([
    [
      'PENDING, own claim',
      { participantId: 'sam', status: 'PENDING' },
      'sam',
      true,
    ],
    [
      'APPROVED, own claim',
      { participantId: 'sam', status: 'APPROVED' },
      'sam',
      false,
    ],
    [
      'REJECTED, own claim',
      { participantId: 'sam', status: 'REJECTED' },
      'sam',
      false,
    ],
    [
      "PENDING, someone else's claim",
      { participantId: 'pat', status: 'PENDING' },
      'sam',
      false,
    ],
    [
      "PENDING, payer acting on a participant's claim",
      { participantId: 'sam', status: 'PENDING' },
      'jake',
      false,
    ],
  ])('%s → %s', (_label, claim, actor, expected) => {
    expect(canRespond({ ...claim, assignedById: null }, actor)).toBe(expected)
  })
})
