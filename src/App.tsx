import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { HomeScreen } from './components/HomeScreen'
import { MessageList } from './components/MessageList'
import { ChatInput } from './components/ChatInput'
import { SettingsModal } from './components/SettingsModal'
import { useChat } from './hooks/useChat'
import { useTheme } from './hooks/useTheme'

export default function App() {
  const chat = useChat()
  const { theme, setPreset, setAccent, reset } = useTheme()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const empty = chat.messages.length === 0

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
    models: chat.models,
    selectedModel: chat.selectedModel,
    onSelectModel: chat.setSelectedModel,
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden text-fg">
      <Sidebar
        open={sidebarOpen}
        metas={chat.metas}
        currentId={chat.id}
        search={chat.search}
        onSearch={chat.setSearch}
        onNewChat={chat.newChat}
        onSelectChat={chat.selectChat}
        onRenameChat={chat.renameChat}
        onDeleteChat={chat.deleteChat}
        onExport={chat.exportChat}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          onOpenSettings={() => setSettingsOpen(true)}
          title={chat.title}
          showTitle={!empty}
        />

        {empty ? (
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
