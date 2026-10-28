import { inboxInput } from '@/lib/receipts/schemas'
import { listInbox } from '@/lib/receipts/service'
import { receiptProcedure } from '@/trpc/routers/groups/receipts/receipt-procedure'

export const groupReceiptInboxProcedure = receiptProcedure
  .input(inboxInput)
  .query(({ input }) => listInbox(input))
