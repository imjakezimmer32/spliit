import { getReceiptInput } from '@/lib/receipts/schemas'
import { getReceipt } from '@/lib/receipts/service'
import { receiptProcedure } from '@/trpc/routers/groups/receipts/receipt-procedure'

export const getGroupReceiptProcedure = receiptProcedure
  .input(getReceiptInput)
  .query(({ input }) => getReceipt(input))
