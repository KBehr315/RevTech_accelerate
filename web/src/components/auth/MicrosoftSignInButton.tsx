import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'

function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}

export function MicrosoftSignInButton() {
  const signIn = useAuthStore((s) => s.signIn)
  const error = useAuthStore((s) => s.error)
  const [submitting, setSubmitting] = useState(false)

  async function handleClick() {
    setSubmitting(true)
    await signIn()
    // On success the browser navigates away to Microsoft immediately, so this
    // only re-runs if the redirect itself failed to start.
    setSubmitting(false)
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-status-red">{error}</p>}
      <Button
        variant="outline"
        onClick={handleClick}
        disabled={submitting}
        className="w-full justify-center gap-2 bg-white"
      >
        <MicrosoftLogo />
        {submitting ? 'Redirecting…' : 'Sign in with Microsoft'}
      </Button>
    </div>
  )
}
