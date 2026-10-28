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
            <CardTitle>Library</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            <p>
              RevTech's own documents: Global for every client, Shared for chosen clients, and RevTech Reference for
              RevTech only, which AI checks first when building training.
            </p>
            <Link to="/global/library" className="mt-2 inline-block text-brand-600 hover:underline">
              Open the library
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
