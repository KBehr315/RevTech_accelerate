import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { queryClient } from '@/lib/queryClient'
import { useAuthStore } from '@/store/authStore'
import { useIdleSignOut } from '@/hooks/useIdleSignOut'
import { LoginPage } from '@/components/auth/LoginPage'
import { ProtectedRoute, RequirePlatformRole } from '@/components/auth/ProtectedRoute'
import { AppShell } from '@/components/shell/AppShell'
import { HomeRedirect } from '@/components/home/HomeRedirect'
import { ContextPickerPage } from '@/components/home/ContextPickerPage'
import { MyTrainingPage } from '@/components/home/MyTrainingPage'
import { GlobalHomePage } from '@/components/global/GlobalHomePage'
import { ClientGroupsPage } from '@/components/global/ClientGroupsPage'
import { GlobalLibraryPage } from '@/components/global/GlobalLibraryPage'
import { ClientLayout, RequireClientRole } from '@/components/client/ClientLayout'
import { ClientHomePage } from '@/components/client/ClientHomePage'
import { ClientSetupWizard } from '@/components/client/ClientSetupWizard'
import { LibraryPage } from '@/components/client/LibraryPage'
import { MembersPage } from '@/components/client/MembersPage'
import { ClientAuditPage } from '@/components/client/ClientAuditPage'
import {
  ClientsPage,
  PeoplePage,
  PlatformAuditPage,
  PlatformHomePage,
  PlatformSettingsPage,
} from '@/components/platform/PlatformPages'
import { AiProvidersPage } from '@/components/platform/AiProvidersPage'

function App() {
  const initialize = useAuthStore((s) => s.initialize)
  const profile = useAuthStore((s) => s.profile)

  useEffect(() => {
    void initialize()
  }, [initialize])

  return (
    <QueryClientProvider client={queryClient}>
      <IdleSignOut />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={profile ? <Navigate to="/" replace /> : <LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomeRedirect />} />
              <Route path="/contexts" element={<ContextPickerPage />} />
              <Route path="/learn" element={<MyTrainingPage />} />

              <Route path="/c/:slug" element={<ClientLayout />}>
                <Route index element={<ClientHomePage />} />
                <Route element={<RequireClientRole anyOf={['client_training_admin']} />}>
                  <Route path="setup" element={<ClientSetupWizard />} />
                  <Route path="audit" element={<ClientAuditPage />} />
                </Route>
                <Route element={<RequireClientRole anyOf={['client_training_admin', 'lms_admin']} />}>
                  <Route path="members" element={<MembersPage />} />
                </Route>
                <Route element={<RequireClientRole anyOf={['client_training_admin', 'contributor', 'reviewer']} />}>
                  <Route path="library" element={<LibraryPage />} />
                </Route>
              </Route>

              <Route element={<RequirePlatformRole role="global_knowledge_admin" />}>
                <Route path="/global" element={<GlobalHomePage />} />
                <Route path="/global/library" element={<GlobalLibraryPage />} />
                <Route path="/global/client-groups" element={<ClientGroupsPage />} />
              </Route>

              <Route element={<RequirePlatformRole role="platform_admin" />}>
                <Route path="/platform" element={<PlatformHomePage />} />
                <Route path="/platform/clients" element={<ClientsPage />} />
                <Route path="/platform/people" element={<PeoplePage />} />
                <Route path="/platform/ai-providers" element={<AiProvidersPage />} />
                <Route path="/platform/audit" element={<PlatformAuditPage />} />
                <Route path="/platform/settings" element={<PlatformSettingsPage />} />
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

function IdleSignOut() {
  useIdleSignOut()
  return null
}

export default App
