import * as React from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import {
  LayoutDashboard,
  Grid2x2,
  FileEdit,
  FileCode2,
  Combine,
  Scissors,
  Minimize2,
  PenTool,
  ArrowLeftRight,
  ScanText,
  Wand2,
  Table2,
  Sparkles,
  GitCompareArrows,
  Clock,
  Star,
  Layers,
  Settings,
  ShieldCheck,
  HelpCircle,
  ChevronLeft,
  ExternalLink,
  Search,
  Upload,
  Sun,
  Moon,
  Monitor,
  Menu,
  Download,
  X,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tip } from '@/components/ui/tooltip'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { Badge, Kbd } from '@/components/ui/misc'
import { CommandPalette } from '@/components/shared/CommandPalette'
import { ShortcutsDialog } from '@/components/shared/Dialogs'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { usePreferences } from '@/stores/preferences'
import { useQueueStore } from '@/stores/queue'
import { useWorkspace } from '@/stores/workspace'
import { getLibraryFile } from '@/lib/storage/repo'
import { downloadBlob, downloadOutputs } from '@/lib/utils/download'
import { ACCEPTED_UNIVERSAL_FILES, ensurePdfFile } from '@/lib/pdf/convert'
import { cn } from '@/lib/utils/cn'

const NAV_PRIMARY = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/tools', label: 'All Tools', icon: Grid2x2 },
]

const NAV_FEATURES = [
  { to: '/workspace', label: 'PDF Workspace', icon: FileEdit },
  { to: '/markdown', label: 'Markdown Viewer', icon: FileCode2 },
  { to: '/merge', label: 'Merge PDF', icon: Combine },
  { to: '/split', label: 'Split PDF', icon: Scissors },
  { to: '/compress', label: 'Compress PDF', icon: Minimize2 },
  { to: '/compare', label: 'Compare PDF', icon: GitCompareArrows },
  { to: '/sign', label: 'Sign PDF', icon: PenTool },
  { to: '/convert', label: 'Convert Studio', icon: ArrowLeftRight },
  { to: '/ocr', label: 'OCR Studio', icon: ScanText },
  { to: '/enhance', label: 'Scan Enhance', icon: Wand2 },
  { to: '/ai', label: 'AI Workspace', icon: Sparkles },
  { to: '/extract', label: 'Extract Data', icon: Table2 },
  { to: '/protect', label: 'Protect & Redact', icon: ShieldCheck },
]

const NAV_MOBILE = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/workspace', label: 'Workspace', icon: FileEdit },
  { to: '/markdown', label: 'Markdown', icon: FileCode2 },
  { to: '/ai', label: 'AI', icon: Sparkles },
  { to: '/tools', label: 'Tools', icon: Grid2x2 },
]

const NAV_SECONDARY = [
  { to: '/tools?tab=recent', label: 'Recent Files', icon: Clock },
  { to: '/tools?tab=favorites', label: 'Favorites', icon: Star },
  { to: '/tools?tab=batch', label: 'Processing Queue', icon: Layers },
]

const NAV_BOTTOM = [
  { to: '/privacy', label: 'Privacy', icon: ShieldCheck },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const collapsed = usePreferences((s) => s.sidebarCollapsed)
  const theme = usePreferences((s) => s.theme)
  const reduceMotion = usePreferences((s) => s.reduceMotion)
  const setPref = usePreferences((s) => s.set)
  const openFile = useWorkspace((s) => s.openFile)
  const appendFile = useWorkspace((s) => s.appendFile)

  const jobs = useQueueStore((s) => s.jobs)
  const paused = useQueueStore((s) => s.paused)
  const togglePause = useQueueStore((s) => s.togglePause)
  const cancelJob = useQueueStore((s) => s.cancel)
  const retryJob = useQueueStore((s) => s.retry)
  const clearFinished = useQueueStore((s) => s.clearFinished)

  const [cmdOpen, setCmdOpen] = React.useState(false)
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false)
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)
  const uploadInputRef = React.useRef<HTMLInputElement>(null)

  const activeJobs = jobs.filter((j) => j.status === 'running' || j.status === 'queued')
  const completedOutputs = jobs.filter((j) => j.status === 'done' && j.output).map((j) => j.output!)

  // Sync theme & reduced motion class on <html>
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  React.useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduceMotion)
  }, [reduceMotion])

  // Global keyboard shortcuts (Ctrl/Cmd+K, Ctrl/Cmd+O)
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen((v) => !v)
      } else if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        uploadInputRef.current?.click()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleGlobalUpload = async (files: File[]) => {
    if (files.length === 0) return
    try {
      const prepared = await Promise.all(files.map((f) => ensurePdfFile(f)))
      await openFile(prepared[0].file)
      for (let i = 1; i < prepared.length; i++) {
        await appendFile(prepared[i].file)
      }
      navigate('/workspace')
      if (prepared.length > 1) {
        toast.success(`Merged & opened ${prepared.length} files in Workspace`)
      } else {
        toast.success(
          prepared[0].converted ? `Converted ${files[0].name} to PDF & opened` : `Opened ${files[0].name}`,
        )
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open file')
    }
  }

  const handleOpenRecent = async (id: string) => {
    const found = await getLibraryFile(id)
    if (!found) {
      toast.error('File no longer available in local storage.')
      return
    }
    await handleGlobalUpload([found.file])
  }

  const SidebarNav = ({ isMobile = false }: { isMobile?: boolean }) => {
    const compact = collapsed && !isMobile
    const isRouteActive = (item: { to: string; end?: boolean }) => {
      if (item.to.includes('?')) return location.pathname + location.search === item.to
      if (item.end) return location.pathname === item.to
      return location.pathname === item.to && !location.search
    }
    const renderItem = (item: { to: string; label: string; icon: React.ComponentType<{ className?: string }>; end?: boolean }) => {
      const Icon = item.icon
      const active = isRouteActive(item)
      const link = (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={() => isMobile && setMobileNavOpen(false)}
          className={cn(
            'group relative flex items-center rounded-[4px] text-[13px] font-medium transition-colors duration-150',
            compact ? 'mx-auto size-8 justify-center p-0' : 'h-8 w-full gap-2.5 px-2.5',
            active
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
          )}
        >
          {active && !compact && (
            <span className="absolute top-1.5 bottom-1.5 left-0 w-[2.5px] rounded-r-full bg-primary" />
          )}
          <Icon className={cn('size-4 shrink-0 transition-colors', active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
          {!compact && <span className="truncate">{item.label}</span>}
          {!compact && item.label === 'Processing Queue' && activeJobs.length > 0 && (
            <Badge variant="primary" className="ml-auto">
              {activeJobs.length}
            </Badge>
          )}
        </NavLink>
      )
      return compact ? (
        <Tip key={item.to} label={item.label} side="right">
          {link}
        </Tip>
      ) : (
        link
      )
    }

    return (
      <div className="flex h-full flex-col">
        {/* Brand */}
        <div
          className={cn(
            'flex h-[52px] shrink-0 items-center border-b border-border/80 transition-all duration-300',
            compact ? 'justify-center px-0' : 'justify-start px-3.5',
          )}
        >
          <NavLink
            to="/"
            onClick={() => isMobile && setMobileNavOpen(false)}
            className={cn(
              'flex items-center font-semibold tracking-tight',
              compact ? 'size-9 justify-center rounded-lg' : 'gap-2.5',
            )}
          >
            <img src="/favicon.svg" alt="" className="size-7 shrink-0 rounded-md shadow-xs" />
            {!compact && (
              <span className="truncate text-[15px]">
                PaperFlow <span className="text-primary">AI</span>
              </span>
            )}
          </NavLink>
        </div>

        <nav
          className={cn('flex-1 space-y-4 overflow-y-auto scrollbar-thin', compact ? 'px-0 py-3' : 'p-2.5')}
          aria-label="Main navigation"
        >
          <div className="flex flex-col gap-1">{NAV_PRIMARY.map(renderItem)}</div>
          <div className="flex flex-col gap-0.5">
            {!compact ? (
              <p className="px-2.5 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground/80 uppercase">
                Features
              </p>
            ) : (
              <div className="mx-auto my-1 h-px w-6 bg-border" />
            )}
            {NAV_FEATURES.map(renderItem)}
          </div>
          <div className="flex flex-col gap-0.5">
            {!compact ? (
              <p className="px-2.5 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground/80 uppercase">
                Library
              </p>
            ) : (
              <div className="mx-auto my-1 h-px w-6 bg-border" />
            )}
            {NAV_SECONDARY.map(renderItem)}
          </div>
        </nav>

        <div
          className={cn(
            'flex flex-col gap-0.5 border-t border-border/80',
            compact ? 'px-0 py-2' : 'p-2.5',
          )}
        >
          {NAV_BOTTOM.map(renderItem)}
          {compact ? (
            <Tip label="Help & Shortcuts" side="right">
              <button
                type="button"
                aria-label="Help & Shortcuts"
                onClick={() => setShortcutsOpen(true)}
                className="mx-auto flex size-8 items-center justify-center rounded-[4px] text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
              >
                <HelpCircle className="size-4 shrink-0" />
              </button>
            </Tip>
          ) : (
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              className="flex h-8 w-full items-center gap-2.5 rounded-[4px] px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
            >
              <HelpCircle className="size-4 shrink-0 text-muted-foreground" />
              <span>Help & Shortcuts</span>
            </button>
          )}

          {/* Developer credit */}
          <div className={cn('mt-1.5 border-t border-border/70 pt-2', compact && 'flex justify-center')}>
            {compact ? (
              <Tip label="Developed by Sohag Sheik" side="right">
                <a
                  href="https://www.sohagsheik.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Developed by Sohag Sheik"
                  className="flex size-8 items-center justify-center rounded-lg bg-secondary/70 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary"
                >
                  SS
                </a>
              </Tip>
            ) : (
              <a
                href="https://www.sohagsheik.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[11.5px] text-muted-foreground/80 transition-colors hover:bg-secondary/60 hover:text-foreground"
              >
                <span className="truncate">
                  Developed by <span className="font-medium text-foreground/90 group-hover:text-primary">Sohag Sheik</span>
                </span>
                <ExternalLink className="size-3 shrink-0 opacity-50 transition-all group-hover:translate-x-0.5 group-hover:text-primary group-hover:opacity-100" />
              </a>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      <input
        ref={uploadInputRef}
        type="file"
        multiple
        accept={ACCEPTED_UNIVERSAL_FILES}
        className="sr-only"
        onChange={(e) => {
          const list = e.target.files ? Array.from(e.target.files) : []
          if (list.length) handleGlobalUpload(list)
          e.target.value = ''
        }}
      />

      {/* Desktop Edge-to-Edge Docked Sidebar */}
      <aside
        className={cn(
          'relative hidden shrink-0 border-r border-border/80 bg-card transition-[width] duration-200 ease-out md:block',
          collapsed ? 'w-[58px]' : 'w-[228px]',
        )}
      >
        <SidebarNav />
        {/* Subtle edge collapse/expand handle */}
        <Tip label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="right">
          <button
            type="button"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setPref({ sidebarCollapsed: !collapsed })}
            className="group absolute top-[14px] -right-3 z-20 flex size-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-xs transition-all duration-150 hover:border-primary/60 hover:bg-primary hover:text-primary-foreground active:scale-95"
          >
            <ChevronLeft
              className={cn(
                'size-3.5 transition-transform duration-200',
                collapsed && 'rotate-180',
              )}
            />
          </button>
        </Tip>
      </aside>

      {/* Mobile Drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-[252px] bg-card p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <SidebarNav isMobile />
        </SheetContent>
      </Sheet>

      {/* Full-Bleed Main Workspace */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {/* Global Header */}
        <header className="flex h-[52px] shrink-0 items-center justify-between gap-2 border-b border-border/80 bg-background/95 px-3 backdrop-blur md:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              aria-label="Open menu"
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu className="size-4" />
            </Button>
            <button
              type="button"
              onClick={() => setCmdOpen(true)}
              className="flex h-9 w-44 items-center gap-2 rounded-lg border bg-card px-2.5 text-sm text-muted-foreground shadow-xs transition-colors hover:bg-secondary/60 sm:w-64 lg:w-80"
            >
              <Search className="size-3.5 shrink-0" />
              <span className="truncate text-left">Search tools or files…</span>
              <Kbd className="ml-auto hidden sm:inline-flex">⌘K</Kbd>
            </button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button size="sm" onClick={() => uploadInputRef.current?.click()}>
              <Upload className="size-3.5" />
              <span className="hidden sm:inline">Open PDF</span>
            </Button>

            {/* Processing Queue Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon-sm" className="relative" aria-label="Processing queue">
                  <Layers className="size-4" />
                  {activeJobs.length > 0 && (
                    <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                      {activeJobs.length}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">Processing Queue</span>
                  <div className="flex items-center gap-1">
                    {activeJobs.length > 0 && (
                      <Button variant="ghost" size="icon-xs" onClick={togglePause} title={paused ? 'Resume' : 'Pause'}>
                        {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                      </Button>
                    )}
                    {completedOutputs.length > 1 && (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => downloadOutputs(completedOutputs, 'paperflow-batch.zip')}
                      >
                        <Download className="size-3" /> ZIP
                      </Button>
                    )}
                    {jobs.length > 0 && (
                      <Button variant="ghost" size="xs" onClick={clearFinished}>
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
                {jobs.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">No active or recent tasks.</p>
                ) : (
                  <div className="max-h-64 space-y-2 overflow-y-auto scrollbar-thin">
                    {jobs.slice(0, 12).map((job) => (
                      <div key={job.id} className="space-y-1 rounded-lg border bg-card p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{job.title}</span>
                          <div className="flex items-center gap-1">
                            {job.status === 'done' && job.output && (
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => downloadBlob(job.output!.blob, job.output!.name)}
                                aria-label="Download"
                              >
                                <Download className="size-3" />
                              </Button>
                            )}
                            {(job.status === 'error' || job.status === 'cancelled') && (
                              <Button variant="ghost" size="icon-xs" onClick={() => retryJob(job.id)} aria-label="Retry">
                                <RotateCcw className="size-3" />
                              </Button>
                            )}
                            {(job.status === 'running' || job.status === 'queued') && (
                              <Button variant="ghost" size="icon-xs" onClick={() => cancelJob(job.id)} aria-label="Cancel">
                                <X className="size-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                        <p className="truncate text-[11px] text-muted-foreground">{job.detail || job.fileName}</p>
                        {job.status === 'running' && <Progress value={job.progress * 100} />}
                        {job.status === 'error' && <p className="text-[11px] text-destructive">{job.error}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {/* Theme Switcher */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon-sm" aria-label="Switch theme">
                  {theme === 'dark' ? (
                    <Moon className="size-4" />
                  ) : theme === 'light' ? (
                    <Sun className="size-4" />
                  ) : (
                    <Monitor className="size-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setPref({ theme: 'light' })}>
                  <Sun className="size-4" /> Light
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPref({ theme: 'dark' })}>
                  <Moon className="size-4" /> Dark
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPref({ theme: 'system' })}>
                  <Monitor className="size-4" /> System
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>

        {/* Mobile Bottom Navigation */}
        <nav
          className="flex h-14 shrink-0 items-center justify-around border-t bg-background px-1 safe-bottom md:hidden"
          aria-label="Mobile navigation"
        >
          {NAV_MOBILE.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-0.5 rounded-md px-2.5 py-1 text-[11px] font-medium',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )
                }
              >
                <Icon className="size-4" />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
      </div>

      <CommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenRecentFile={handleOpenRecent}
      />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  )
}
