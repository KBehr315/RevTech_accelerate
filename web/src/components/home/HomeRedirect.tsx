import { Navigate } from 'react-router-dom'
import { destinations, hasPlatformRole, useSession } from '@/hooks/useSession'
import { FullPageMessage } from '@/components/auth/ProtectedRoute'
import { ErrorText } from '@/components/common/PageHeader'

/** One place to work goes straight there; several go to the picker; none explains why. */
export function HomeRedirect() {
  const { data: session, isLoading, error } = useSession()

  if (isLoading) return <FullPageMessage>Loading…</FullPageMessage>
  if (error || !session) return <FullPageMessage><ErrorText error={error} /></FullPageMessage>

  const options = destinations(session)
  if (options.length === 1 && !hasPlatformRole(session, 'client_creator')) return <Navigate to={options[0].to} replace />
  return <Navigate to="/contexts" replace />
}
