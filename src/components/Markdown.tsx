import { isValidElement, useState, type ComponentProps, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Check, Copy } from 'lucide-react'

/** Recursively walk React children to extract raw text; never throws on odd nesting. */
function extractText(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return extractText(node.props.children)
  return ''
}

/** Pull `language-xxx` off a code child's className, if derivable. */
function extractLanguage(node: ReactNode): string | null {
  const kids = Array.isArray(node) ? node : [node]
  for (const kid of kids) {
    if (isValidElement<{ className?: string }>(kid)) {
      const match = /language-(\S+)/.exec(kid.props.className ?? '')
      if (match) return match[1]
    }
  }
  return null
}

/** Custom `pre` renderer: adds a hover copy button + language label to fenced code blocks. */
function CodeBlock({ children, ...rest }: ComponentProps<'pre'>) {
  const [copied, setCopied] = useState(false)
  const text = extractText(children)
  const language = extractLanguage(children)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="group/code relative">
      {language && (
        <span className="pointer-events-none absolute left-2 top-2 select-none text-[11px] uppercase tracking-wide text-muted/70">
          {language}
        </span>
      )}
      <button
        onClick={() => void copy()}
        aria-label="Copy code"
        className="absolute right-2 top-2 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted opacity-0 transition hover:bg-panel2 hover:text-fg group-hover/code:opacity-100"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre {...rest}>{children}</pre>
    </div>
  )
}

/**
 * Renders assistant content as GitHub-flavored markdown with syntax-highlighted
 * code. All visual styling lives in the `.markdown` block in index.css.
 */
export function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{ pre: CodeBlock }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
