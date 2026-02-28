/**
 * ArtifactPane — right pane of the split chat view.
 * Renders the last assistant message with full markdown + syntax highlighting.
 * Shows code blocks, tables, and formatted prose.
 */
import { useState, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Copy, Check, Code2, FileText } from 'lucide-react'

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }
  return (
    <button
      onClick={handle}
      className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors"
      style={{ color: '#666', background: '#1A1A1A', border: '1px solid #2A2A2A' }}
      onMouseEnter={(e) => (e.currentTarget.style.color = '#E8E8E8')}
      onMouseLeave={(e) => (e.currentTarget.style.color = '#666')}
    >
      {copied ? <Check size={11} color="#E8472A" /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function CodeBlock({ children, className }) {
  const language = className ? className.replace('language-', '') : 'text'
  const code = String(children).replace(/\n$/, '')

  return (
    <div className="relative rounded-lg overflow-hidden my-3" style={{ border: '1px solid #2A2A2A' }}>
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{ background: '#1A1A1A', borderBottom: '1px solid #222' }}
      >
        <span className="text-xs font-mono" style={{ color: '#555' }}>
          {language}
        </span>
        <CopyButton text={code} />
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '12px 16px',
          background: '#0D0D0D',
          fontSize: '0.78rem',
          lineHeight: '1.6',
        }}
        showLineNumbers={code.split('\n').length > 10}
        wrapLongLines={false}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}

const markdownComponents = {
  code({ node, inline, className, children, ...props }) {
    if (inline) {
      return (
        <code
          className="px-1.5 py-0.5 rounded font-mono text-xs"
          style={{ background: '#1A1A1A', color: '#E8472A', border: '1px solid #2A2A2A' }}
          {...props}
        >
          {children}
        </code>
      )
    }
    return <CodeBlock className={className}>{children}</CodeBlock>
  },

  pre({ children }) {
    // code component handles its own wrapping
    return <>{children}</>
  },

  h1: ({ children }) => (
    <h1 className="text-xl font-bold mt-6 mb-3" style={{ color: '#FFFFFF' }}>{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-semibold mt-5 mb-2" style={{ color: '#FFFFFF' }}>{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-semibold mt-4 mb-2" style={{ color: '#E8E8E8' }}>{children}</h3>
  ),

  p: ({ children }) => (
    <p className="mb-3 leading-relaxed" style={{ color: '#CCCCCC' }}>{children}</p>
  ),

  ul: ({ children }) => (
    <ul className="mb-3 pl-5 space-y-1" style={{ color: '#CCCCCC', listStyleType: 'disc' }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 pl-5 space-y-1" style={{ color: '#CCCCCC', listStyleType: 'decimal' }}>{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,

  blockquote: ({ children }) => (
    <blockquote
      className="pl-4 my-3"
      style={{ borderLeft: '3px solid #E8472A', color: '#999' }}
    >
      {children}
    </blockquote>
  ),

  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: '#E8472A', textDecoration: 'underline' }}
    >
      {children}
    </a>
  ),

  table: ({ children }) => (
    <div className="overflow-x-auto my-4 rounded-lg" style={{ border: '1px solid #2A2A2A' }}>
      <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead style={{ background: '#1A1A1A', borderBottom: '1px solid #2A2A2A' }}>
      {children}
    </thead>
  ),
  th: ({ children }) => (
    <th
      className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider"
      style={{ color: '#888' }}
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td
      className="px-4 py-2"
      style={{ color: '#CCCCCC', borderTop: '1px solid #1E1E1E' }}
    >
      {children}
    </td>
  ),

  strong: ({ children }) => (
    <strong style={{ color: '#FFFFFF', fontWeight: 600 }}>{children}</strong>
  ),
  em: ({ children }) => (
    <em style={{ color: '#BBBBBB', fontStyle: 'italic' }}>{children}</em>
  ),

  hr: () => <hr style={{ borderColor: '#2A2A2A', margin: '1.5rem 0' }} />,
}

function detectArtifactType(content) {
  if (!content) return 'text'
  const codeBlockRe = /```[\w]*\n[\s\S]*?```/
  const tableRe = /\|.+\|.+\|/
  if (codeBlockRe.test(content)) return 'code'
  if (tableRe.test(content)) return 'table'
  return 'text'
}

export default function ArtifactPane({ message }) {
  const artifactType = useMemo(
    () => detectArtifactType(message?.content),
    [message?.content]
  )

  if (!message) {
    return (
      <div
        className="flex-1 flex items-center justify-center h-full"
        style={{ background: '#0A0A0A', borderLeft: '1px solid #1E1E1E' }}
      >
        <div className="text-center" style={{ color: '#666' }}>
          <Code2 size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Responses with code, tables, or</p>
          <p className="text-sm">structured content render here</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: '#0A0A0A', borderLeft: '1px solid #1E1E1E' }}
    >
      {/* Pane header */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0"
        style={{ borderBottom: '1px solid #1E1E1E', background: '#0D0D0D' }}
      >
        {artifactType === 'code' ? (
          <Code2 size={13} color="#E8472A" />
        ) : (
          <FileText size={13} color="#666" />
        )}
        <span className="text-xs font-medium" style={{ color: '#666' }}>
          {artifactType === 'code' ? 'Code' : artifactType === 'table' ? 'Table' : 'Output'}
        </span>
        <div className="ml-auto">
          <CopyButton text={message.content} />
        </div>
      </div>

      {/* Rendered content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <ReactMarkdown components={markdownComponents}>
          {message.content}
        </ReactMarkdown>
      </div>
    </div>
  )
}
