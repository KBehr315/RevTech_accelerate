import { GraduationCap } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/common/PageHeader'
import { useAuthStore } from '@/store/authStore'
import { useSession } from '@/hooks/useSession'

/** The learner dashboard arrives with the LMS (roadmap phase 4); until then, say so plainly. */
export function MyTrainingPage() {
  const profile = useAuthStore((s) => s.profile)
  const { data: session } = useSession()
  const learnerIn = session?.workspaces.filter((w) => w.roles.includes('learner')) ?? []

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Welcome, ${profile?.full_name.split(' ')[0] ?? ''}`} />
      <Card>
        <CardContent className="flex items-start gap-4 p-6">
          <GraduationCap className="mt-0.5 h-6 w-6 shrink-0 text-brand-600" aria-hidden />
          <div className="text-sm text-slate-600">
            <p className="font-medium text-slate-900">Your training will appear here once your administrator assigns it.</p>
            {learnerIn.length > 0 && (
              <p className="mt-1">You're enrolled as a learner with {learnerIn.map((w) => w.client.name).join(', ')}.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
