import { Sidebar } from './components/Sidebar'
import { ChatHeader } from './components/ChatHeader'
import { MessageList } from './components/MessageList'
import { ChatInput } from './components/ChatInput'
import { useChat } from './hooks/useChat'

export default function App() {
  const chat = useChat()

  return (
    <div className="flex h-screen w-screen overflow-hidden text-fg">
      <Sidebar onNewChat={chat.clearChat} />

      <main className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          models={chat.models}
          selectedModel={chat.selectedModel}
          onSelectModel={chat.setSelectedModel}
          status={chat.status}
          isStreaming={chat.isStreaming}
          hasMessages={chat.messages.length > 0}
          onClear={chat.clearChat}
          onRefresh={chat.refresh}
        />

        <MessageList
          messages={chat.messages}
          status={chat.status}
          isStreaming={chat.isStreaming}
          onPickPrompt={chat.setInput}
        />

        <ChatInput
          input={chat.input}
          setInput={chat.setInput}
          onSend={chat.send}
          onStop={chat.stop}
          isStreaming={chat.isStreaming}
          canSend={chat.status === 'online' && !!chat.selectedModel}
          status={chat.status}
          effort={chat.effort}
          setEffort={chat.setEffort}
          temperature={chat.temperature}
          setTemperature={chat.setTemperature}
        />
      </main>
    </div>
  )
}
