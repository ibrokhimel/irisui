import { useMemo, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { HomeScreen } from './components/HomeScreen'
import { MessageList } from './components/MessageList'
import { ChatInput } from './components/ChatInput'
import { ModelsPage } from './components/ModelsPage'
import { SettingsModal } from './components/SettingsModal'
import { useChat } from './hooks/useChat'
import { useTheme } from './hooks/useTheme'
import { useModelPrefs } from './hooks/useModelPrefs'

export default function App() {
  const chat = useChat()
  const { theme, setPreset, setAccent, reset } = useTheme()
  const { prefs, setDefaultModel, toggleFavorite } = useModelPrefs()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [view, setView] = useState<'chat' | 'models'>('chat')

  const empty = chat.messages.length === 0

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
  }

  return (
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
          title={view === 'models' ? 'Models' : chat.title}
          showTitle={view === 'models' || !empty}
        />

        {view === 'models' ? (
          <ModelsPage
            models={chat.models}
            status={chat.status}
            onRefresh={chat.refresh}
            prefs={prefs}
            onSetDefault={setDefaultModel}
            onToggleFavorite={toggleFavorite}
          />
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
            />
            <ChatInput variant="docked" {...composerProps} />
          </>
        )}
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
  )
}
