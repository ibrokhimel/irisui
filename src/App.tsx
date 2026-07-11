import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, LazyMotion, MotionConfig, m } from 'motion/react'
import {
  Activity,
  BookOpen,
  Boxes,
  Gauge,
  Loader2,
  MessageSquare,
  PanelLeft,
  Plus,
  Settings,
  Sparkles,
  Square,
  Swords,
} from 'lucide-react'
import { SPRING } from './lib/motion'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { HomeScreen } from './components/HomeScreen'
import { MessageList } from './components/MessageList'
import { ChatInput } from './components/ChatInput'
import { ContextMeter } from './components/ContextMeter'
import { SettingsModal, type Tab as SettingsTab } from './components/SettingsModal'
import { MigrationNotice } from './components/MigrationNotice'
import { CommandPalette, type PaletteCommand } from './components/CommandPalette'
import { SystemMonitor } from './components/SystemMonitor'
import { useChat } from './hooks/useChat'
import { useTheme } from './hooks/useTheme'
import { useAppSettings } from './hooks/useAppSettings'
import { useModelPrefs } from './hooks/useModelPrefs'
import { useModelPull } from './hooks/useModelPull'
import { useKbs } from './hooks/useKbs'
import { useStudio } from './hooks/useStudio'
import { useShortcuts } from './hooks/useShortcuts'
import type { Persona } from './lib/studioStore'
import { DEFAULT_NUM_CTX } from './constants'
import { loadMonitorOpen, saveMonitorOpen } from './lib/system'
import { dismissMigrationNotice, shouldShowMigrationNotice } from './lib/firstRun'
import { isTauri } from './lib/http'

// Heavy/secondary views, split into their own chunks. StatsPage in particular
// pulls in recharts, which is by far the largest dependency in the app.
const ModelsPage = lazy(() =>
  import('./components/ModelsPage').then((mod) => ({ default: mod.ModelsPage })),
)
const KnowledgePage = lazy(() =>
  import('./components/KnowledgePage').then((mod) => ({ default: mod.KnowledgePage })),
)
const StudioPage = lazy(() =>
  import('./components/StudioPage').then((mod) => ({ default: mod.StudioPage })),
)
const ArenaPage = lazy(() =>
  import('./components/ArenaPage').then((mod) => ({ default: mod.ArenaPage })),
)
const StatsPage = lazy(() =>
  import('./components/StatsPage').then((mod) => ({ default: mod.StatsPage })),
)

// Minimal fallback for lazy views — matches the spinner styling already used
// for the model-pull indicator in the sidebar (Loader2 + text-iris).
function PageFallback() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-iris" />
    </div>
  )
}

export default function App() {
  const chat = useChat()
  const { theme, setPreset, setAccent, reset } = useTheme()
  const { settings: appSettings, update: updateAppSettings } = useAppSettings()
  const { prefs, setDefaultModel, toggleFavorite } = useModelPrefs()
  const pull = useModelPull(chat.refresh)
  const { kbs, reload: reloadKbs } = useKbs()
  const { personas, prompts, reload: reloadStudio } = useStudio()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab | undefined>(undefined)
  const [migrationNoticeOpen, setMigrationNoticeOpen] = useState<boolean>(() =>
    shouldShowMigrationNotice(isTauri(), localStorage),
  )
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [monitorOpen, setMonitorOpen] = useState<boolean>(() => loadMonitorOpen())
  useEffect(() => {
    saveMonitorOpen(monitorOpen)
  }, [monitorOpen])
  const [view, setView] = useState<'chat' | 'models' | 'knowledge' | 'studio' | 'arena' | 'stats'>(
    'chat',
  )

  const empty = chat.messages.length === 0
  // The context meter is measured, never estimated — an assistant message's
  // stat is the only source of "what the next turn actually carries".
  //
  // Must skip assistant messages that have no stat yet, not just take the last
  // one: the in-flight reply is appended with `stat: undefined` and only gets
  // one when the stream finishes, so keying off the last assistant message
  // would blank the meter to its placeholder for the whole generation. Walk
  // backwards instead of copy-and-reversing — this runs on every streamed token.
  const lastAssistantStat = useMemo(() => {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      const m = chat.messages[i]
      if (m.role === 'assistant' && m.stat) return m.stat
    }
    return undefined
  }, [chat.messages])

  const pullPercent =
    pull.progress?.total && pull.progress.total > 0
      ? Math.min(100, Math.round(((pull.progress.completed ?? 0) / pull.progress.total) * 100))
      : null

  // Favorited models float to the top of the chat model picker.
  const orderedModels = useMemo(() => {
    const fav = (n: string) => (prefs.favorites.includes(n) ? 1 : 0)
    return [...chat.models].sort((a, b) => fav(b.name) - fav(a.name))
  }, [chat.models, prefs.favorites])

  // Dismissal is persisted, so the notice is genuinely once-per-install —
  // whether it was acted on or waved away.
  const closeMigrationNotice = () => {
    dismissMigrationNotice(localStorage)
    setMigrationNoticeOpen(false)
  }

  const openChat = () => setView('chat')
  const handleNewChat = () => {
    chat.newChat()
    openChat()
  }
  const handleSelectChat = (id: string) => {
    void chat.selectChat(id)
    openChat()
  }
  const handleChatWithPersona = (persona: Persona) => {
    chat.newChatWithPersona(persona)
    openChat()
  }
  const handleUsePrompt = (text: string) => {
    chat.setInput(text)
    openChat()
  }

  const activePersona = personas.find((p) => p.id === chat.personaId)

  const paletteCommands: PaletteCommand[] = [
    { id: 'new-chat', label: 'New chat', icon: Plus, run: handleNewChat },
    { id: 'go-chat', label: 'Go to Chat', icon: MessageSquare, run: openChat },
    { id: 'go-models', label: 'Go to Models', icon: Boxes, run: () => setView('models') },
    { id: 'go-knowledge', label: 'Go to Knowledge', icon: BookOpen, run: () => setView('knowledge') },
    { id: 'go-studio', label: 'Go to Studio', icon: Sparkles, run: () => setView('studio') },
    { id: 'go-arena', label: 'Go to Arena', icon: Swords, run: () => setView('arena') },
    { id: 'go-stats', label: 'Go to Stats', icon: Activity, run: () => setView('stats') },
    { id: 'open-settings', label: 'Open Settings', icon: Settings, run: () => setSettingsOpen(true) },
    {
      id: 'toggle-sidebar',
      label: 'Toggle sidebar',
      icon: PanelLeft,
      run: () => setSidebarOpen((o) => !o),
    },
    {
      id: 'toggle-monitor',
      label: 'Toggle system monitor',
      icon: Gauge,
      run: () => setMonitorOpen((o) => !o),
    },
    ...(chat.isStreaming
      ? [{ id: 'stop-generating', label: 'Stop generating', icon: Square, run: chat.stop }]
      : []),
  ]

  useShortcuts({
    isDialogOpen: settingsOpen || paletteOpen,
    isStreaming: chat.isStreaming,
    onTogglePalette: () => setPaletteOpen((o) => !o),
    onNewChat: handleNewChat,
    onStopGenerating: chat.stop,
  })

  const composerProps = {
    input: chat.input,
    setInput: chat.setInput,
    onSend: chat.send,
    onStop: chat.stop,
    isStreaming: chat.isStreaming,
    canSend: chat.status === 'online' && !!chat.selectedModel,
    status: chat.status,
    effort: chat.effort,
    setEffort: chat.setEffort,
    temperature: chat.temperature,
    setTemperature: chat.setTemperature,
    models: orderedModels,
    selectedModel: chat.selectedModel,
    onSelectModel: chat.setSelectedModel,
    kbs,
    selectedKbId: chat.kbId,
    onSelectKb: chat.setKb,
    ragNotice: chat.ragNotice,
    onDismissRagNotice: chat.dismissRagNotice,
    persona: activePersona ? { icon: activePersona.icon, name: activePersona.name } : undefined,
    onClearPersona: chat.clearPersona,
  }

  // Keyed view swap: chat home / conversation / models / stats cross-fade.
  const viewKey = view === 'chat' ? (empty ? 'chat-home' : 'chat-thread') : view

  return (
    <MotionConfig reducedMotion="user" transition={SPRING}>
    <LazyMotion strict features={() => import('./lib/motionFeatures').then((mod) => mod.default)}>
    <div className="flex h-screen w-screen overflow-hidden text-fg">
      <Sidebar
        open={sidebarOpen}
        view={view}
        metas={chat.metas}
        currentId={chat.id}
        search={chat.search}
        onSearch={chat.setSearch}
        onNewChat={handleNewChat}
        onOpenModels={() => setView('models')}
        onOpenKnowledge={() => setView('knowledge')}
        onOpenStudio={() => setView('studio')}
        onOpenArena={() => setView('arena')}
        onOpenStats={() => setView('stats')}
        pullActive={pull.pulling}
        pullPercent={pullPercent}
        onSelectChat={handleSelectChat}
        onRenameChat={chat.renameChat}
        onDeleteChat={chat.deleteChat}
        onExport={chat.exportChat}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          onToggleMonitor={() => setMonitorOpen((o) => !o)}
          onOpenSettings={() => setSettingsOpen(true)}
          title={
            view === 'models'
              ? 'Models'
              : view === 'knowledge'
                ? 'Knowledge'
                : view === 'studio'
                  ? 'Studio'
                  : view === 'arena'
                    ? 'Arena'
                    : view === 'stats'
                      ? 'Stats'
                      : chat.title
          }
          showTitle={
            view === 'models' ||
            view === 'knowledge' ||
            view === 'studio' ||
            view === 'arena' ||
            view === 'stats' ||
            !empty
          }
        />

        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={viewKey}
            className="flex min-h-0 flex-1 flex-col"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
            {view === 'models' ? (
              <Suspense fallback={<PageFallback />}>
                <ModelsPage
                  models={chat.models}
                  status={chat.status}
                  onRefresh={chat.refresh}
                  prefs={prefs}
                  onSetDefault={setDefaultModel}
                  onToggleFavorite={toggleFavorite}
                  pull={pull}
                />
              </Suspense>
            ) : view === 'knowledge' ? (
              <Suspense fallback={<PageFallback />}>
                <KnowledgePage
                  models={chat.models}
                  status={chat.status}
                  kbs={kbs}
                  onChanged={reloadKbs}
                  pull={pull}
                />
              </Suspense>
            ) : view === 'studio' ? (
              <Suspense fallback={<PageFallback />}>
                <StudioPage
                  models={chat.models}
                  personas={personas}
                  prompts={prompts}
                  onChanged={reloadStudio}
                  onChatWithPersona={handleChatWithPersona}
                  onUsePrompt={handleUsePrompt}
                />
              </Suspense>
            ) : view === 'arena' ? (
              <Suspense fallback={<PageFallback />}>
                <ArenaPage models={chat.models} status={chat.status} />
              </Suspense>
            ) : view === 'stats' ? (
              <Suspense fallback={<PageFallback />}>
                <StatsPage />
              </Suspense>
            ) : empty ? (
              <HomeScreen
                status={chat.status}
                onPickPrompt={chat.setInput}
                composer={<ChatInput variant="hero" {...composerProps} />}
              />
            ) : (
              <>
                <MessageList
                  messages={chat.messages}
                  isStreaming={chat.isStreaming}
                  onRegenerate={chat.regenerate}
                  onContinue={chat.continueResponse}
                />
                {chat.selectedModel && (
                  <div className="mx-auto w-full max-w-3xl px-4">
                    <ContextMeter
                      model={chat.selectedModel}
                      numCtx={chat.numCtx ?? DEFAULT_NUM_CTX}
                      stat={lastAssistantStat}
                    />
                  </div>
                )}
                <ChatInput variant="docked" {...composerProps} />
              </>
            )}
          </m.div>
        </AnimatePresence>
      </main>

      {monitorOpen && (
        <SystemMonitor
          selectedModel={chat.selectedModel}
          isStreaming={chat.isStreaming}
          onCollapse={() => setMonitorOpen(false)}
        />
      )}

      <SettingsModal
        open={settingsOpen}
        theme={theme}
        onClose={() => {
          setSettingsOpen(false)
          setSettingsTab(undefined)
        }}
        onSelectPreset={setPreset}
        onSelectAccent={setAccent}
        onReset={reset}
        appSettings={appSettings}
        onUpdateAppSettings={updateAppSettings}
        defaultModel={prefs.defaultModel}
        onGoToModels={() => {
          setView('models')
          setSettingsOpen(false)
        }}
        onBeforeWipe={chat.stop}
        initialTab={settingsTab}
      />

      <MigrationNotice
        open={migrationNoticeOpen}
        onImport={() => {
          setSettingsTab('data')
          setSettingsOpen(true)
          closeMigrationNotice()
        }}
        onDismiss={closeMigrationNotice}
      />

      <CommandPalette open={paletteOpen} commands={paletteCommands} onClose={() => setPaletteOpen(false)} />
    </div>
    </LazyMotion>
    </MotionConfig>
  )
}
