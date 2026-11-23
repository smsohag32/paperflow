import * as React from 'react'
import {
  Copy,
  Check,
  ExternalLink,
  Info,
  Lightbulb,
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
  Link2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  parseInline,
  type AlertKind,
  type MdBlock,
  type MdInline,
  type MdListItem,
} from '@/lib/markdown/parser'
import { cn } from '@/lib/utils/cn'

export type ReaderFontSize = 'sm' | 'md' | 'lg'

interface MarkdownPreviewProps {
  blocks: MdBlock[]
  fontSize?: ReaderFontSize
  onToggleTask?: (taskIndex: number) => void
  className?: string
}

const ALERT_STYLES: Record<
  AlertKind,
  { label: string; icon: React.ComponentType<{ className?: string }>; container: string; title: string }
> = {
  NOTE: {
    label: 'Note',
    icon: Info,
    container: 'border-l-[#007acc] bg-[#007acc]/8 dark:border-l-[#3794ff] dark:bg-[#3794ff]/10',
    title: 'text-[#007acc] dark:text-[#3794ff]',
  },
  TIP: {
    label: 'Tip',
    icon: Lightbulb,
    container: 'border-l-[#1a7f37] bg-[#1a7f37]/8 dark:border-l-[#3fb950] dark:bg-[#3fb950]/10',
    title: 'text-[#1a7f37] dark:text-[#3fb950]',
  },
  IMPORTANT: {
    label: 'Important',
    icon: AlertCircle,
    container: 'border-l-[#8250df] bg-[#8250df]/8 dark:border-l-[#a371f7] dark:bg-[#a371f7]/10',
    title: 'text-[#8250df] dark:text-[#a371f7]',
  },
  WARNING: {
    label: 'Warning',
    icon: AlertTriangle,
    container: 'border-l-[#9a6700] bg-[#9a6700]/10 dark:border-l-[#d29922] dark:bg-[#d29922]/10',
    title: 'text-[#9a6700] dark:text-[#d29922]',
  },
  CAUTION: {
    label: 'Caution',
    icon: ShieldAlert,
    container: 'border-l-[#cf222e] bg-[#cf222e]/8 dark:border-l-[#f85149] dark:bg-[#f85149]/10',
    title: 'text-[#cf222e] dark:text-[#f85149]',
  },
}

const KEYWORDS = new Set([
  'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'delete',
  'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'if',
  'implements', 'import', 'in', 'instanceof', 'interface', 'let', 'new', 'null', 'of', 'package',
  'private', 'protected', 'public', 'readonly', 'return', 'static', 'super', 'switch', 'this',
  'throw', 'true', 'try', 'type', 'typeof', 'undefined', 'var', 'void', 'while', 'yield',
  'def', 'elif', 'except', 'lambda', 'None', 'True', 'False', 'pass', 'raise', 'with', 'as',
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'TABLE', 'JOIN', 'ORDER', 'BY',
])

/** Lightweight VS Code Dark+/Light+ token highlighter (zero dependencies) */
function highlightCode(code: string, lang: string): React.ReactNode {
  const lower = lang.toLowerCase()
  const supported = ['ts', 'tsx', 'typescript', 'js', 'jsx', 'javascript', 'json', 'py', 'python', 'bash', 'sh', 'shell', 'css', 'sql', 'html', 'xml']
  if (lower && !supported.includes(lower)) return code

  const tokenRe =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b)/g

  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let m: RegExpExecArray | null
  let key = 0

  while ((m = tokenRe.exec(code)) !== null) {
    if (m.index > lastIndex) {
      parts.push(code.slice(lastIndex, m.index))
    }
    const tok = m[0]
    if (tok.startsWith('//') || tok.startsWith('/*') || (tok.startsWith('#') && ['py', 'python', 'bash', 'sh', 'shell', ''].includes(lower))) {
      parts.push(
        <span key={key++} className="text-[#008000] dark:text-[#6a9955] italic">
          {tok}
        </span>,
      )
    } else if (tok.startsWith('"') || tok.startsWith("'") || tok.startsWith('`')) {
      parts.push(
        <span key={key++} className="text-[#a31515] dark:text-[#ce9178]">
          {tok}
        </span>,
      )
    } else if (/^\d/.test(tok)) {
      parts.push(
        <span key={key++} className="text-[#098658] dark:text-[#b5cea8]">
          {tok}
        </span>,
      )
    } else if (KEYWORDS.has(tok)) {
      parts.push(
        <span key={key++} className="text-[#0000ff] dark:text-[#569cd6] font-medium">
          {tok}
        </span>,
      )
    } else if (/^[A-Z][A-Za-z0-9_]*$/.test(tok)) {
      parts.push(
        <span key={key++} className="text-[#267f99] dark:text-[#4ec9b0]">
          {tok}
        </span>,
      )
    } else {
      parts.push(tok)
    }
    lastIndex = tokenRe.lastIndex
  }

  if (lastIndex < code.length) {
    parts.push(code.slice(lastIndex))
  }
  return parts
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast.success(lang ? `Copied ${lang} code` : 'Copied code block')
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }

  return (
    <div className="group/code my-4 overflow-hidden rounded-md border border-border bg-[#f6f8fa] dark:bg-[#18181b]">
      <div className="flex items-center justify-between border-b border-border/80 bg-secondary/60 px-3 py-1">
        <span className="font-mono text-[11px] font-medium tracking-wide text-muted-foreground lowercase">
          {lang || 'text'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-background/90 hover:text-foreground"
        >
          {copied ? (
            <>
              <Check className="size-3 text-success" />
              <span className="text-success">Copied</span>
            </>
          ) : (
            <>
              <Copy className="size-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 font-mono text-[13px] leading-[1.55] text-foreground select-text scrollbar-thin">
        <code>{highlightCode(code, lang)}</code>
      </pre>
    </div>
  )
}

function renderInlineNodes(nodes: MdInline[], keyPrefix = 'in'): React.ReactNode[] {
  return nodes.map((node, idx) => {
    const key = `${keyPrefix}-${idx}`
    switch (node.type) {
      case 'text':
        return <React.Fragment key={key}>{node.value}</React.Fragment>
      case 'br':
        return <br key={key} />
      case 'code':
        return (
          <code
            key={key}
            className="rounded-[4px] bg-secondary/80 px-1.5 py-[0.12em] font-mono text-[0.875em] text-[#a31515] dark:bg-[#2d2d30] dark:text-[#d7ba7d]"
          >
            {node.value}
          </code>
        )
      case 'kbd':
        return (
          <kbd
            key={key}
            className="inline-flex items-center rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[0.78em] font-medium text-foreground shadow-[inset_0_-1px_0_var(--border)]"
          >
            {node.value}
          </kbd>
        )
      case 'strong':
        return (
          <strong key={key} className="font-semibold text-foreground">
            {renderInlineNodes(node.children, key)}
          </strong>
        )
      case 'em':
        return (
          <em key={key} className="italic">
            {renderInlineNodes(node.children, key)}
          </em>
        )
      case 'del':
        return (
          <del key={key} className="text-muted-foreground line-through">
            {renderInlineNodes(node.children, key)}
          </del>
        )
      case 'image':
        return (
          <img
            key={key}
            src={node.src}
            alt={node.alt}
            title={node.title}
            loading="lazy"
            className="my-3 max-w-full rounded-md border border-border/70"
          />
        )
      case 'link': {
        const isExternal = /^https?:\/\//i.test(node.href)
        return (
          <a
            key={key}
            href={node.href}
            title={node.title}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noopener noreferrer' : undefined}
            className="inline-flex items-baseline gap-0.5 text-[#006ab1] hover:underline dark:text-[#3794ff]"
          >
            <span>{renderInlineNodes(node.children, key)}</span>
            {isExternal && <ExternalLink className="inline size-3 shrink-0 opacity-70" />}
          </a>
        )
      }
    }
  })
}

export function MarkdownPreview({ blocks, fontSize = 'md', onToggleTask, className }: MarkdownPreviewProps) {
  const taskCounterRef = { current: 0 }

  const copyAnchor = (id: string) => {
    navigator.clipboard
      .writeText(`#${id}`)
      .then(() => toast.success(`Copied #${id}`))
      .catch(() => {})
  }

  const renderListItems = (items: MdListItem[], keyPrefix: string) =>
    items.map((item, idx) => {
      const key = `${keyPrefix}-${idx}`
      const isTask = item.checked !== null
      const taskIdx = isTask ? taskCounterRef.current++ : -1
      return (
        <li key={key} className={cn('my-1 leading-[1.65]', isTask && 'flex list-none items-start gap-2 -ml-5')}>
          {isTask && (
            <input
              type="checkbox"
              checked={Boolean(item.checked)}
              onChange={() => onToggleTask?.(taskIdx)}
              aria-label={item.text}
              className="mt-1 size-3.5 shrink-0 cursor-pointer rounded border-border accent-[#007acc] dark:accent-[#3794ff]"
            />
          )}
          <div className="min-w-0 flex-1">
            <span className={cn(isTask && item.checked && 'text-muted-foreground line-through')}>
              {renderInlineNodes(parseInline(item.text), key)}
            </span>
            {item.children.length > 0 && <div className="mt-1">{renderBlocks(item.children, `${key}-c`)}</div>}
          </div>
        </li>
      )
    })

  const renderBlocks = (list: MdBlock[], keyPrefix = 'b'): React.ReactNode[] =>
    list.map((block, idx) => {
      const key = `${keyPrefix}-${idx}`
      switch (block.type) {
        case 'heading': {
          const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
          const headingClass: Record<number, string> = {
            1: 'mt-1 mb-4 border-b border-border pb-2 text-[2em] font-semibold leading-[1.25] tracking-tight text-foreground',
            2: 'mt-7 mb-3 border-b border-border/80 pb-1.5 text-[1.5em] font-semibold leading-[1.3] tracking-tight text-foreground',
            3: 'mt-6 mb-2.5 text-[1.25em] font-semibold leading-[1.35] text-foreground',
            4: 'mt-5 mb-2 text-[1.05em] font-semibold text-foreground',
            5: 'mt-4 mb-1.5 text-[0.92em] font-semibold text-foreground',
            6: 'mt-4 mb-1.5 text-[0.85em] font-semibold text-muted-foreground',
          }
          return (
            <Tag key={key} id={block.id} className={cn('group/h scroll-mt-4 flex items-center gap-2', headingClass[block.level])}>
              <span>{renderInlineNodes(parseInline(block.text), key)}</span>
              <button
                type="button"
                onClick={() => copyAnchor(block.id)}
                aria-label={`Copy anchor link for ${block.text}`}
                className="opacity-0 transition-opacity group-hover/h:opacity-60 hover:!opacity-100 text-muted-foreground"
              >
                <Link2 className="size-3.5" />
              </button>
            </Tag>
          )
        }
        case 'paragraph':
          return (
            <p key={key} className="my-3.5 leading-[1.68] text-foreground/95">
              {renderInlineNodes(parseInline(block.text), key)}
            </p>
          )
        case 'code':
          return <CodeBlock key={key} lang={block.lang} code={block.code} />
        case 'blockquote':
          return (
            <blockquote
              key={key}
              className="my-4 border-l-[3px] border-[#007acc]/70 bg-secondary/45 py-1.5 pr-4 pl-3.5 text-muted-foreground dark:border-[#3794ff]/70 [&>p]:my-1.5"
            >
              {renderBlocks(block.blocks, key)}
            </blockquote>
          )
        case 'alert': {
          const style = ALERT_STYLES[block.kind]
          const Icon = style.icon
          return (
            <div key={key} className={cn('my-4 rounded-r-md border border-border/60 border-l-[4px] px-4 py-2.5', style.container)}>
              <div className={cn('mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase', style.title)}>
                <Icon className="size-3.5 shrink-0" />
                <span>{style.label}</span>
              </div>
              <div className="text-[0.94em] text-foreground/90 [&>p]:my-1 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
                {renderBlocks(block.blocks, key)}
              </div>
            </div>
          )
        }
        case 'hr':
          return <hr key={key} className="my-6 border-t-2 border-border/70" />
        case 'list': {
          const ListTag = block.ordered ? 'ol' : 'ul'
          return (
            <ListTag
              key={key}
              start={block.ordered && block.start !== 1 ? block.start : undefined}
              className={cn(
                'my-3 pl-6 text-foreground/95',
                block.ordered ? 'list-decimal' : 'list-disc',
              )}
            >
              {renderListItems(block.items, key)}
            </ListTag>
          )
        }
        case 'table':
          return (
            <div key={key} className="my-4 overflow-x-auto scrollbar-thin">
              <table className="w-full border-collapse text-[0.93em]">
                <thead>
                  <tr className="border-b-2 border-border">
                    {block.headers.map((header, hIdx) => {
                      const align = block.alignments[hIdx]
                      return (
                        <th
                          key={hIdx}
                          style={align ? { textAlign: align } : undefined}
                          className="border border-border/80 bg-secondary/50 px-3 py-2 text-left font-semibold text-foreground"
                        >
                          {renderInlineNodes(parseInline(header), `${key}-th-${hIdx}`)}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="even:bg-secondary/20">
                      {block.headers.map((_, cIdx) => {
                        const align = block.alignments[cIdx]
                        return (
                          <td
                            key={cIdx}
                            style={align ? { textAlign: align } : undefined}
                            className="border border-border/70 px-3 py-1.5 text-foreground/90"
                          >
                            {renderInlineNodes(parseInline(row[cIdx] ?? ''), `${key}-td-${rIdx}-${cIdx}`)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      }
    })

  const sizeClass: Record<ReaderFontSize, string> = {
    sm: 'text-[13.5px]',
    md: 'text-[14.5px]',
    lg: 'text-[16px]',
  }

  return (
    <article className={cn('select-text break-words', sizeClass[fontSize], className)}>
      {renderBlocks(blocks)}
    </article>
  )
}
