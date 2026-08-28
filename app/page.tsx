import { Suspense } from 'react'
import WorkhubDashboardDB from '@/components/workhub-dashboard-db'
import { SetupScreen } from '@/components/setup-screen'
import { isDatabaseConfigured } from '@/lib/db'
import { getDashboardData, getSettingsData, getWorkspaceContext } from '@/lib/db/queries'
import type { ComponentProps } from 'react'

type DashboardProps = ComponentProps<typeof WorkhubDashboardDB>

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const params = await searchParams

  if (!isDatabaseConfigured()) {
    return <SetupScreen error="DATABASE_URL is missing. Check .env.local." />
  }

  let errorMessage: string | null = null
  let currentUserId: string | null = null
  let currentUserRoles: string[] = []
  let dashboardData: Awaited<ReturnType<typeof getDashboardData>> | null = null
  let people: Awaited<ReturnType<typeof getWorkspaceContext>>['people'] | null = null
  let settings: Awaited<ReturnType<typeof getSettingsData>> | null = null
  let companyName: string | null = null

  try {
    const { currentUser, people: workspacePeople, company } = await getWorkspaceContext()
    companyName = company?.name ?? 'GCS Operations'
    if (!currentUser) {
      errorMessage = null
      currentUserId = null
      dashboardData = null
      people = null
    } else {
      currentUserId = currentUser.id
      currentUserRoles = currentUser.roles?.map((entry) => entry.role.key) ?? []
      const [data, settingsData] = await Promise.all([getDashboardData(currentUser), getSettingsData(currentUser)])
      dashboardData = data
      settings = settingsData
      people = workspacePeople
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : 'Unknown error'
  }

  if (errorMessage) {
    return <SetupScreen error={errorMessage} />
  }

  if (!currentUserId || !dashboardData || !people) {
    return <SetupScreen missingSeed />
  }

  return (
    <Suspense fallback={<div className="workhub-shell" />}>
      <WorkhubDashboardDB
        initialTasks={dashboardData.tasks as unknown as DashboardProps['initialTasks']}
        initialDepartments={dashboardData.departments as unknown as DashboardProps['initialDepartments']}
        initialActivity={dashboardData.activity as unknown as DashboardProps['initialActivity']}
        upcoming={dashboardData.upcoming as unknown as DashboardProps['upcoming']}
        metrics={dashboardData.metrics}
        people={people as unknown as DashboardProps['people']}
        responsibilities={dashboardData.responsibilities as unknown as DashboardProps['responsibilities']}
        allActivity={dashboardData.allActivity as unknown as DashboardProps['allActivity']}
        myTasks={dashboardData.myTasks as unknown as DashboardProps['myTasks']}
        myMetrics={dashboardData.myMetrics}
        projects={dashboardData.projects}
        reportMetrics={dashboardData.reportMetrics}
        currentUserId={currentUserId}
        currentUserRoles={currentUserRoles}
        initialView={params.view as DashboardProps['initialView']}
        myTaskCount={dashboardData.myTaskCount}
        initialNotifications={dashboardData.notifications as DashboardProps['initialNotifications']}
        unreadNotificationCount={dashboardData.unreadNotificationCount}
        managementRequests={dashboardData.managementRequests as DashboardProps['managementRequests']}
        notificationPreferences={dashboardData.notificationPreferences as DashboardProps['notificationPreferences']}
        workspaceRoles={settings?.roles ?? []}
        workspaceTeams={settings?.teams ?? []}
        companyName={companyName ?? 'GCS Operations'}
      />
    </Suspense>
  )
}
