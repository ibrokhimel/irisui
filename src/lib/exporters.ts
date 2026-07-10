import type { Conversation } from './store'

/** Render a conversation as portable Markdown. */
export function toMarkdown(conv: Conversation): string {
  const out: string[] = [
    `# ${conv.title}`,
    '',
    `_Model: ${conv.model || 'unknown'} · Exported ${new Date(conv.updatedAt).toLocaleString()}_`,
    '',
  ]
  for (const m of conv.messages) {
    out.push(m.role === 'user' ? '## You' : '## IrisUI', '', m.content, '')
  }
  return out.join('\n')
}

/** Render a conversation as pretty-printed JSON (full fidelity, re-importable). */
export function toJSON(conv: Conversation): string {
  return JSON.stringify(conv, null, 2)
}

/** Trigger a browser download of text content. */
export function download(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Make a filesystem-friendly base name from a chat title. */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'chat'
}
