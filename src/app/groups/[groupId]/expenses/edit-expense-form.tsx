'use client'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { RuntimeFeatureFlags } from '@/lib/featureFlags'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ExpenseForm } from './expense-form'

export function EditExpenseForm({
  groupId,
  expenseId,
  runtimeFeatureFlags,
}: {
  groupId: string
  expenseId: string
  runtimeFeatureFlags: RuntimeFeatureFlags
}) {
  const { data: groupData } = trpc.groups.get.useQuery({ groupId })
  const group = groupData?.group

  const { data: categoriesData } = trpc.categories.list.useQuery()
  const categories = categoriesData?.categories

  const { data: expenseData } = trpc.groups.expenses.get.useQuery({
    groupId,
    expenseId,
  })
  const expense = expenseData?.expense

  const { mutateAsync: updateExpenseMutateAsync } =
    trpc.groups.expenses.update.useMutation()
  const { mutateAsync: deleteExpenseMutateAsync } =
    trpc.groups.expenses.delete.useMutation()

  const utils = trpc.useUtils()
  const router = useRouter()
  const tManaged = useTranslations('Receipts.ManagedExpense')

  if (!group || !categories || !expense) return null

  // Receipt-generated expenses are rewritten from their receipt, so they are
  // edited there. The server refuses direct updates and deletes as well.
  if (expense.receipt) {
    return (
      <Card className="m-4 sm:m-6">
        <CardHeader>
          <CardTitle>{tManaged('title')}</CardTitle>
          <CardDescription>{tManaged('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href={`/groups/${groupId}/receipts/${expense.receipt.id}`}>
              {tManaged('open')}
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <ExpenseForm
      group={group}
      expense={expense}
      categories={categories}
      onSubmit={async (expenseFormValues, participantId) => {
        await updateExpenseMutateAsync({
          expenseId,
          groupId,
          expenseFormValues,
          participantId,
        })
        utils.groups.expenses.invalidate()
        utils.groups.stats.invalidate()
        router.push(`/groups/${group.id}`)
      }}
      onDelete={async (participantId) => {
        await deleteExpenseMutateAsync({
          expenseId,
          groupId,
          participantId,
        })
        utils.groups.expenses.invalidate()
        utils.groups.stats.invalidate()
        router.push(`/groups/${group.id}`)
      }}
      runtimeFeatureFlags={runtimeFeatureFlags}
    />
  )
}
