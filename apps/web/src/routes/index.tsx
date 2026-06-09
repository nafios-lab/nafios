import { createFileRoute } from '@tanstack/react-router'

const GIT_SHA = import.meta.env.VITE_GIT_SHA ?? 'dev'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold tracking-tight">NafiOS Staging</h1>
      <p className="text-muted-foreground text-lg">
        Build: <code className="rounded bg-muted px-2 py-1 font-mono text-sm">{GIT_SHA}</code>
      </p>
    </main>
  )
}
