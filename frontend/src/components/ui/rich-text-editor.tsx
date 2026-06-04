'use client';

import { useCallback, useRef } from 'react';
import { Bold, Italic, List, ListOrdered, Link2, Code, Quote } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  minHeight?: number;
  maxLength?: number;
  className?: string;
  ariaLabel?: string;
  id?: string;
}

const TOOLBAR = [
  { cmd: 'bold', icon: Bold, title: 'Bold (Ctrl+B)' },
  { cmd: 'italic', icon: Italic, title: 'Italic (Ctrl+I)' },
  { cmd: 'insertUnorderedList', icon: List, title: 'Bulleted list' },
  { cmd: 'insertOrderedList', icon: ListOrdered, title: 'Numbered list' },
  { cmd: 'formatBlock', val: 'blockquote', icon: Quote, title: 'Quote' },
  { cmd: 'formatBlock', val: 'pre', icon: Code, title: 'Code block' },
] as const;

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write something…',
  label,
  disabled = false,
  minHeight = 140,
  maxLength,
  className,
  ariaLabel,
  id,
}: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);

  const exec = useCallback(
    (cmd: string, val?: string) => {
      ref.current?.focus();
      document.execCommand(cmd, false, val);
      if (ref.current) onChange(ref.current.innerHTML);
    },
    [onChange]
  );

  const insertLink = useCallback(() => {
    const url = window.prompt('Enter URL:');
    if (url) exec('createLink', url);
  }, [exec]);

  const onInput = () => {
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  };

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label htmlFor={id} className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
          {label}
        </label>
      )}
      <div
        className={cn(
          'rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900',
          'focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500',
          disabled && 'opacity-50 pointer-events-none'
        )}
      >
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 dark:border-surface-700" role="toolbar" aria-label="Formatting">
          {TOOLBAR.map((t, i) => (
            <button
              key={i}
              type="button"
              onClick={() => exec(t.cmd, (t as any).val)}
              title={t.title}
              aria-label={t.title}
              disabled={disabled}
              className="h-7 w-7 inline-flex items-center justify-center rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-surface-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <t.icon className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ))}
          <div className="w-px h-4 bg-gray-200 dark:bg-surface-700 mx-1" aria-hidden="true" />
          <button
            type="button"
            onClick={insertLink}
            title="Insert link"
            aria-label="Insert link"
            disabled={disabled}
            className="h-7 w-7 inline-flex items-center justify-center rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-surface-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <div
          ref={ref}
          id={id}
          role="textbox"
          aria-label={ariaLabel || label}
          aria-multiline="true"
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={onInput}
          onPaste={onPaste}
          data-placeholder={placeholder}
          className={cn(
            'px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none overflow-y-auto',
            '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5',
            '[&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-gray-600 dark:[&_blockquote]:text-gray-300',
            '[&_pre]:bg-gray-900 [&_pre]:text-green-400 [&_pre]:p-2 [&_pre]:rounded [&_pre]:font-mono [&_pre]:text-xs',
            '[&_a]:text-blue-600 [&_a]:underline dark:[&_a]:text-brand-400',
            'before:content-[attr(data-placeholder)] before:text-gray-400 dark:before:text-gray-500 before:pointer-events-none',
            'empty:before:block not-empty:before:hidden'
          )}
          style={{ minHeight }}
          dangerouslySetInnerHTML={{ __html: value }}
        />
        {maxLength && (
          <div className="px-2 py-1 text-[10px] text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-surface-700 text-right">
            <span dangerouslySetInnerHTML={{ __html: value }} />.length / {maxLength} (HTML)
          </div>
        )}
      </div>
    </div>
  );
}
