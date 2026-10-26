import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/common/PageHeader'

export function GlobalHomePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Global Context"
        description="Knowledge maintained once and referenced by authorized clients, without copying it into each workspace."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Client groups</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            <p>Define the audiences that Shared/Restricted knowledge is released to.</p>
            <Link to="/global/client-groups" className="mt-2 inline-block text-brand-600 hover:underline">
              Manage client groups
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Global and Shared libraries</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            <p>
              Uploading, classifying and searching knowledge arrives in the next phase (Knowledge). Items uploaded here will
              wait in Pending Classification and stay unavailable to AI until you classify them.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
