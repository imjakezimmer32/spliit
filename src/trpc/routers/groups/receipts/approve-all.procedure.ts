import { approveAllInput } from '@/lib/receipts/schemas'
import { approveAllClaims } from '@/lib/receipts/service'
import { receiptProcedure } from '@/trpc/routers/groups/receipts/receipt-procedure'

export const approveAllGroupReceiptClaimsProcedure = receiptProcedure
  .input(approveAllInput)
  .mutation(({ input }) => approveAllClaims(input))
