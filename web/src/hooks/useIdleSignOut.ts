import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { usePlatformSettings } from './usePlatform'

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'visibilitychange'] as const

/** Signs out after the platform's idle timeout (platform_settings.session_idle_minutes). */
export function useIdleSignOut() {
  const profile = useAuthStore((s) => s.profile)
  const signOut = useAuthStore((s) => s.signOut)
  const { data: settings } = usePlatformSettings()
  const minutes = profile ? settings?.session_idle_minutes : undefined

  useEffect(() => {
    if (!minutes) return
    let timer = window.setTimeout(expire, minutes * 60_000)

    function expire() {
      void signOut()
    }
    function reset() {
      window.clearTimeout(timer)
      timer = window.setTimeout(expire, minutes! * 60_000)
    }

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    return () => {
      window.clearTimeout(timer)
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [minutes, signOut])
}
