import { useCallback, useRef, useState } from 'react'

export function useActionLock<Args extends unknown[]>(
  action: (...args: Args) => Promise<void>,
) {
  const lockedRef = useRef(false)
  const [isPending, setIsPending] = useState(false)

  const run = useCallback(
    async (...args: Args) => {
      if (lockedRef.current) return

      lockedRef.current = true
      setIsPending(true)
      try {
        await action(...args)
      } finally {
        lockedRef.current = false
        setIsPending(false)
      }
    },
    [action],
  )

  return { isPending, run }
}
