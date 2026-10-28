'use client'

import { useCallback, useEffect, useState } from 'react'

type Participant = { id: string; name: string }

const ACTIVE_PARTICIPANT_EVENT = 'spliit:active-participant'

/**
 * Moves the expense-era `newGroup-activeUser` / `${groupId}-newUser` keys
 * (which hold a participant name) to `${groupId}-activeUser` (which holds an id).
 * Mirrors the migration in `expense-list.tsx`; whichever page runs first wins.
 */
function migrateLegacyActiveUser(groupId: string, participants: Participant[]) {
  const activeUser = localStorage.getItem('newGroup-activeUser')
  const newUser = localStorage.getItem(`${groupId}-newUser`)
  if (!activeUser && !newUser) return

  localStorage.removeItem('newGroup-activeUser')
  localStorage.removeItem(`${groupId}-newUser`)
  if (activeUser === 'None') {
    localStorage.setItem(`${groupId}-activeUser`, 'None')
    return
  }
  const userId = participants.find(
    (p) => p.name === (activeUser || newUser),
  )?.id
  if (userId) localStorage.setItem(`${groupId}-activeUser`, userId)
}

/**
 * Returns the participant id of "me" for this group, or null when unknown/invalid.
 * Takes participants (not just ids) so that legacy name-based values can be migrated.
 */
export function useActiveParticipantId(
  groupId: string,
  participants: Participant[] | undefined,
) {
  const [state, setState] = useState<{ ready: boolean; id: string | null }>({
    ready: false,
    id: null,
  })

  useEffect(() => {
    if (!participants) return

    migrateLegacyActiveUser(groupId, participants)
    const read = () => {
      const stored = localStorage.getItem(`${groupId}-activeUser`)
      return participants.some((p) => p.id === stored) ? stored : null
    }
    setState({ ready: true, id: read() })

    // Other tabs write through localStorage; other components in this tab
    // write through the custom event dispatched by setActiveParticipantId.
    const sync = (e: Event) => {
      if (
        e instanceof StorageEvent &&
        e.key !== null &&
        e.key !== `${groupId}-activeUser`
      )
        return
      setState({ ready: true, id: read() })
    }
    window.addEventListener('storage', sync)
    window.addEventListener(ACTIVE_PARTICIPANT_EVENT, sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(ACTIVE_PARTICIPANT_EVENT, sync)
    }
  }, [groupId, participants])

  const setActiveParticipantId = useCallback(
    (id: string) => {
      localStorage.setItem(`${groupId}-activeUser`, id)
      setState({ ready: true, id })
      window.dispatchEvent(new Event(ACTIVE_PARTICIPANT_EVENT))
    },
    [groupId],
  )

  return {
    activeParticipantId: state.id,
    setActiveParticipantId,
    ready: state.ready,
  }
}
