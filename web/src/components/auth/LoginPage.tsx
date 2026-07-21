import { LoginForm } from './LoginForm'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'

export function LoginPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-brand-900 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <img src="/revtech-logo.png" alt="RevTech" className="mb-2 h-10 w-auto" />
          <CardDescription>Sign in with the account your admin set up for you.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  )
}
