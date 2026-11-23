import * as React from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from '@/app/layout/AppShell'
import { Skeleton } from '@/components/ui/misc'

// Route-based code splitting: Dashboard stays tiny; heavy PDF/OCR/AI routes load on demand.
const DashboardRoute = React.lazy(() => import('@/routes/DashboardRoute'))
const ToolsRoute = React.lazy(() => import('@/routes/ToolsRoute'))
const WorkspaceRoute = React.lazy(() => import('@/routes/WorkspaceRoute'))
const MergeRoute = React.lazy(() => import('@/routes/MergeRoute'))
const SplitRoute = React.lazy(() => import('@/routes/SplitRoute'))
const CompressRoute = React.lazy(() => import('@/routes/CompressRoute'))
const SignRoute = React.lazy(() => import('@/routes/SignRoute'))
const OcrRoute = React.lazy(() => import('@/routes/OcrRoute'))
const ConvertRoute = React.lazy(() => import('@/routes/ConvertRoute'))
const EnhanceRoute = React.lazy(() => import('@/routes/EnhanceRoute'))
const AiRoute = React.lazy(() => import('@/routes/AiRoute'))
const ProtectRoute = React.lazy(() => import('@/routes/ProtectRoute'))
const ExtractRoute = React.lazy(() => import('@/routes/ExtractRoute'))
const SettingsRoute = React.lazy(() => import('@/routes/SettingsRoute'))
const PrivacyRoute = React.lazy(() => import('@/routes/PrivacyRoute'))

function RouteFallback() {
  return (
    <div className="w-full space-y-4 p-6 lg:p-8">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-40 w-full" />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    </div>
  )
}

function wrap(Component: React.LazyExoticComponent<() => React.JSX.Element>) {
  return (
    <React.Suspense fallback={<RouteFallback />}>
      <Component />
    </React.Suspense>
  )
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: wrap(DashboardRoute) },
      { path: 'tools', element: wrap(ToolsRoute) },
      { path: 'workspace', element: wrap(WorkspaceRoute) },
      { path: 'merge', element: wrap(MergeRoute) },
      { path: 'split', element: wrap(SplitRoute) },
      { path: 'compress', element: wrap(CompressRoute) },
      { path: 'sign', element: wrap(SignRoute) },
      { path: 'ocr', element: wrap(OcrRoute) },
      { path: 'convert', element: wrap(ConvertRoute) },
      { path: 'enhance', element: wrap(EnhanceRoute) },
      { path: 'ai', element: wrap(AiRoute) },
      { path: 'protect', element: wrap(ProtectRoute) },
      { path: 'extract', element: wrap(ExtractRoute) },
      { path: 'settings', element: wrap(SettingsRoute) },
      { path: 'privacy', element: wrap(PrivacyRoute) },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
