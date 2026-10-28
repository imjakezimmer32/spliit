'use client'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Activity,
  BarChart3,
  Info,
  Receipt,
  Scale,
  ScanLine,
  Settings,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { usePathname, useRouter } from 'next/navigation'
import { ComponentType } from 'react'
import { PendingCountBadge } from './receipts/pending-count-badge'

type Props = {
  groupId: string
  enableReceiptClaims?: boolean
}

export function GroupTabs({ groupId, enableReceiptClaims = false }: Props) {
  const t = useTranslations()
  const pathname = usePathname()
  const value =
    pathname.replace(/\/groups\/[^\/]+\/([^/]+).*/, '$1') || 'expenses'
  const router = useRouter()

  const tabs: { value: string; label: string; Icon: ComponentType<any> }[] = [
    { value: 'expenses', label: t('Expenses.title'), Icon: Receipt },
    ...(enableReceiptClaims
      ? [{ value: 'receipts', label: t('Receipts.title'), Icon: ScanLine }]
      : []),
    { value: 'balances', label: t('Balances.title'), Icon: Scale },
    { value: 'information', label: t('Information.title'), Icon: Info },
    { value: 'stats', label: t('Stats.title'), Icon: BarChart3 },
    { value: 'activity', label: t('Activity.title'), Icon: Activity },
    { value: 'edit', label: t('Settings.title'), Icon: Settings },
  ]

  return (
    <Tabs
      value={value}
      className="[&>*]:border flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      onValueChange={(value) => {
        router.push(`/groups/${groupId}/${value}`)
      }}
    >
      <TabsList>
        {tabs.map(({ value, label, Icon }) => (
          <TabsTrigger
            key={value}
            value={value}
            title={label}
            aria-label={label}
            className="gap-2"
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
            {value === 'receipts' && <PendingCountBadge groupId={groupId} />}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
