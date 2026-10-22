import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { queryClient } from '@/lib/queryClient'
import { useAuthStore } from '@/store/authStore'
import { LoginPage } from '@/components/auth/LoginPage'
import { ProtectedRoute, AdminRoute } from '@/components/auth/ProtectedRoute'
import { AppShell } from '@/components/shell/AppShell'
import { EmployeeDashboardPage } from '@/components/employee/EmployeeDashboardPage'
import { TrainingPlayerPage } from '@/components/player/TrainingPlayerPage'
import { DashboardPage } from '@/components/admin/DashboardPage'
import { ModuleListPage } from '@/components/admin/modules/ModuleListPage'
import { ModuleEditPage } from '@/components/admin/modules/ModuleEditPage'
import { AssignmentsPage } from '@/components/admin/assignments/AssignmentsPage'
import { UsersPage } from '@/components/admin/users/UsersPage'

function App() {
  const initialize = useAuthStore((s) => s.initialize)
  const profile = useAuthStore((s) => s.profile)

  useEffect(() => {
    void initialize()
  }, [initialize])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={profile ? <Navigate to="/" replace /> : <LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<EmployeeDashboardPage />} />
              <Route path="/training/:assignmentId" element={<TrainingPlayerPage />} />

              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<DashboardPage />} />
                <Route path="/admin/modules" element={<ModuleListPage />} />
                <Route path="/admin/modules/new" element={<ModuleEditPage />} />
                <Route path="/admin/modules/:moduleId" element={<ModuleEditPage />} />
                <Route path="/admin/assignments" element={<AssignmentsPage />} />
                <Route path="/admin/users" element={<UsersPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  )
}

export default App
