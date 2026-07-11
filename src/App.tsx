import { useMemo, useState } from 'react'
import { AnimatePresence, LazyMotion, MotionConfig, m } from 'motion/react'
import { SPRING } from './lib/motion'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { HomeScreen } from './components/HomeScreen'
import { MessageList } from './components/MessageList'
import { ChatInput } from './components/ChatInput'
import { ModelsPage } from './components/ModelsPage'
import { KnowledgePage } from './components/KnowledgePage'
import { StudioPage } from './components/StudioPage'
import { ArenaPage } from './components/ArenaPage'
import { StatsPage } from './components/StatsPage'
import { SettingsModal } from './components/SettingsModal'
import { useChat } from './hooks/useChat'
import { useTheme } from './hooks/useTheme'
import { useModelPrefs } from './hooks/useModelPrefs'
import { useModelPull } from './hooks/useModelPull'
import { useKbs } from './hooks/useKbs'
import { useStudio } from './hooks/useStudio'
import type { Persona } from './lib/studioStore'

export default function App() {
  const chat = useChat()
  const { theme, setPreset, setAccent, reset } = useTheme()
  const { prefs, setDefaultModel, toggleFavorite } = useModelPrefs()
  const pull = useModelPull(chat.refresh)
  const { kbs, reload: reloadKbs } = useKbs()
  const { personas, prompts, reload: reloadStudio } = useStudio()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [view, setView] = useState<'chat' | 'models' | 'knowledge' | 'studio' | 'arena' | 'stats'>(
    'chat',
  )

  const empty = chat.messages.length === 0

  const pullPercent =
    pull.progress?.total && pull.progress.total > 0
      ? Math.min(100, Math.round(((pull.progress.completed ?? 0) / pull.progress.total) * 100))
      : null

  // Favorited models float to the top of the chat model picker.
  const orderedModels = useMemo(() => {
    const fav = (n: string) => (prefs.favorites.includes(n) ? 1 : 0)
    return [...chat.models].sort((a, b) => fav(b.name) - fav(a.name))
  }, [chat.models, prefs.favorites])

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
              <ModelsPage
                models={chat.models}
                status={chat.status}
                onRefresh={chat.refresh}
                prefs={prefs}
                onSetDefault={setDefaultModel}
                onToggleFavorite={toggleFavorite}
                pull={pull}
              />
            ) : view === 'knowledge' ? (
              <KnowledgePage
                models={chat.models}
                status={chat.status}
                kbs={kbs}
                onChanged={reloadKbs}
                pull={pull}
              />
            ) : view === 'studio' ? (
              <StudioPage
                models={chat.models}
                personas={personas}
                prompts={prompts}
                onChanged={reloadStudio}
                onChatWithPersona={handleChatWithPersona}
                onUsePrompt={handleUsePrompt}
              />
            ) : view === 'arena' ? (
              <ArenaPage models={chat.models} status={chat.status} />
            ) : view === 'stats' ? (
              <StatsPage />
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
                <ChatInput variant="docked" {...composerProps} />
              </>
            )}
          </m.div>
        </AnimatePresence>
      </main>

      <SettingsModal
        open={settingsOpen}
        theme={theme}
        onClose={() => setSettingsOpen(false)}
        onSelectPreset={setPreset}
        onSelectAccent={setAccent}
        onReset={reset}
      />
    </div>
    </LazyMotion>
    </MotionConfig>
  )
}
