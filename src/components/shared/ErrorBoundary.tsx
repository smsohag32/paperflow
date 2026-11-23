import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface State {
  error: Error | null
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[PaperFlow] UI error:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-6" />
          </div>
          <div className="max-w-md space-y-1">
            <h2 className="text-base font-semibold">Something went wrong in this view</h2>
            <p className="text-sm text-muted-foreground">
              Your local files are safe in browser storage. Try reloading this view.
            </p>
          </div>
          <Button variant="outline" onClick={() => this.setState({ error: null })}>
            <RefreshCw className="size-4" />
            Try again
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
