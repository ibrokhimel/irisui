import { Sparkles } from 'lucide-react'
import type { OllamaModel } from '../types'
import type { Persona, PromptItem } from '../lib/studioStore'
import { PersonasSection } from './PersonasSection'
import { PromptLibrarySection } from './PromptLibrarySection'

export function StudioPage({
  models,
  personas,
  prompts,
  onChanged,
  onChatWithPersona,
  onUsePrompt,
}: {
  models: OllamaModel[]
  personas: Persona[]
  prompts: PromptItem[]
  onChanged: () => void | Promise<void>
  onChatWithPersona: (persona: Persona) => void
  onUsePrompt: (text: string) => void
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-5 py-6">
        <h1 className="mb-6 flex items-center gap-2 text-2xl font-semibold text-fg">
          <Sparkles className="h-6 w-6 text-iris" />
          Studio
        </h1>

        <PersonasSection
          models={models}
          personas={personas}
          onChanged={onChanged}
          onChatWithPersona={onChatWithPersona}
        />

        <PromptLibrarySection prompts={prompts} onChanged={onChanged} onUsePrompt={onUsePrompt} />
      </div>
    </div>
  )
}
