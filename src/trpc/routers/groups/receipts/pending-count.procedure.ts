import { inboxInput } from '@/lib/receipts/schemas'
import { countPendingClaims } from '@/lib/receipts/service'
import { receiptProcedure } from '@/trpc/routers/groups/receipts/receipt-procedure'

export const groupReceiptPendingCountProcedure = receiptProcedure
  .input(inboxInput)
  .query(({ input }) => countPendingClaims(input))
