'use client';

import { useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy } from 'lucide-react';
import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import 'highlight.js/styles/github-dark.css';

export interface MarkdownProps {
  /** Raw markdown source. */
  children: string;
  /** Optional className applied to the wrapper. */
  className?: string;
  /** When true, disable raw HTML escaping (used in trusted contexts only). */
  unwrapDisallowed?: boolean;
}

function flattenText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (typeof node === 'object' && 'props' in node) {
    return flattenText((node as { props: { children?: React.ReactNode } }).props.children);
  }
  return '';
}

function CodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const code = useMemo(() => flattenText(children).replace(/\n$/, ''), [children]);
  const languageMatch = /language-([\w+-]+)/.exec(className || '');
  const language = languageMatch?.[1] ?? 'text';

  const handleCopy = useCallback(async () => {
    if (typeof window === 'undefined' || !code) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const ta = document.createElement('textarea');
        ta.value = code;
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  }, [code]);

  return (
    <div className="group relative my-3 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-surface-700 dark:bg-surface-950">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:border-surface-700 dark:bg-surface-900/60 dark:text-gray-400">
        <span>{language}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-500 transition hover:bg-gray-200 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-400 dark:hover:bg-surface-700 dark:hover:text-white"
          aria-label={copied ? 'Code copied' : 'Copy code'}
        >
          {copied ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="m-0 overflow-x-auto p-3 text-xs leading-relaxed">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

const baseComponents: Components = {
  h1: ({ children, ...props }) => (
    <h1
      className="mb-2 mt-4 text-xl font-bold text-gray-900 dark:text-gray-100"
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2
      className="mb-2 mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100"
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3
      className="mb-1.5 mt-3 text-base font-semibold text-gray-900 dark:text-gray-100"
      {...props}
    >
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4
      className="mb-1.5 mt-3 text-sm font-semibold text-gray-900 dark:text-gray-100"
      {...props}
    >
      {children}
    </h4>
  ),
  h5: ({ children, ...props }) => (
    <h5
      className="mb-1 mt-2 text-sm font-semibold text-gray-900 dark:text-gray-100"
      {...props}
    >
      {children}
    </h5>
  ),
  h6: ({ children, ...props }) => (
    <h6
      className="mb-1 mt-2 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300"
      {...props}
    >
      {children}
    </h6>
  ),
  p: ({ children, ...props }) => (
    <p
      className="my-2 text-sm leading-relaxed text-gray-800 dark:text-gray-200"
      {...props}
    >
      {children}
    </p>
  ),
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
      className="font-medium text-blue-600 underline decoration-blue-600/30 underline-offset-2 transition hover:decoration-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-brand-400 dark:decoration-brand-400/30 dark:hover:decoration-brand-400"
      {...props}
    >
      {children}
    </a>
  ),
  ul: ({ children, ...props }) => (
    <ul
      className="my-2 ml-5 list-disc space-y-1 text-sm text-gray-800 marker:text-gray-400 dark:text-gray-200 dark:marker:text-gray-500"
      {...props}
    >
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol
      className="my-2 ml-5 list-decimal space-y-1 text-sm text-gray-800 marker:text-gray-400 dark:text-gray-200 dark:marker:text-gray-500"
      {...props}
    >
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="leading-relaxed" {...props}>
      {children}
    </li>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="my-3 border-l-4 border-blue-400 bg-blue-50/50 px-3 py-2 text-sm italic text-gray-700 dark:border-brand-500/50 dark:bg-brand-500/10 dark:text-gray-200"
      {...props}
    >
      {children}
    </blockquote>
  ),
  hr: (props) => (
    <hr
      className="my-4 border-gray-200 dark:border-surface-700"
      {...props}
    />
  ),
  table: ({ children, ...props }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-gray-200 dark:border-surface-700">
      <table
        className="w-full border-collapse text-left text-sm text-gray-800 dark:text-gray-200"
        {...props}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead
      className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:bg-surface-800 dark:text-gray-400"
      {...props}
    >
      {children}
    </thead>
  ),
  tbody: ({ children, ...props }) => (
    <tbody className="divide-y divide-gray-100 dark:divide-surface-700" {...props}>
      {children}
    </tbody>
  ),
  tr: ({ children, ...props }) => (
    <tr
      className="border-b border-gray-100 last:border-b-0 dark:border-surface-700"
      {...props}
    >
      {children}
    </tr>
  ),
  th: ({ children, ...props }) => (
    <th
      className="px-3 py-2 font-semibold"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="px-3 py-2" {...props}>
      {children}
    </td>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-semibold text-gray-900 dark:text-gray-100" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }) => (
    <em className="italic" {...props}>
      {children}
    </em>
  ),
  del: ({ children, ...props }) => (
    <del
      className="text-gray-500 line-through dark:text-gray-400"
      {...props}
    >
      {children}
    </del>
  ),
  input: ({ type, checked, disabled, ...props }) => {
    if (type === 'checkbox') {
      return (
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          readOnly
          className="mr-1.5 h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-800"
          {...props}
        />
      );
    }
    return <input type={type} {...props} />;
  },
  code: ({ inline, className, children, ...props }: any) => {
    if (inline) {
      return (
        <code
          className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.8em] text-pink-600 dark:bg-surface-800 dark:text-pink-300"
          {...props}
        >
          {children}
        </code>
      );
    }
    return <code className={className} {...props}>{children}</code>;
  },
  pre: ({ children, ...props }) => {
    const childArray = Array.isArray(children) ? children : [children];
    const codeEl = childArray.find(
      (c: any) => c && typeof c === 'object' && 'props' in c && (c as any).type === 'code'
    ) as React.ReactElement<{ className?: string; children?: React.ReactNode }> | undefined;
    const className = codeEl?.props?.className;
    return (
      <CodeBlock className={className} {...props}>
        {codeEl?.props?.children ?? children}
      </CodeBlock>
    );
  },
};

export function Markdown({ children, className, unwrapDisallowed = false }: MarkdownProps) {
  return (
    <div
      className={cn(
        'markdown-body text-sm leading-relaxed text-gray-800 dark:text-gray-200',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={baseComponents}
        skipHtml={!unwrapDisallowed}
        unwrapDisallowed={unwrapDisallowed}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export default Markdown;
