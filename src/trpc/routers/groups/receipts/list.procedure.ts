import { listReceiptsInput } from '@/lib/receipts/schemas'
import { listReceipts } from '@/lib/receipts/service'
import { receiptProcedure } from '@/trpc/routers/groups/receipts/receipt-procedure'

export const listGroupReceiptsProcedure = receiptProcedure
  .input(listReceiptsInput)
  .query(({ input }) => listReceipts(input))
