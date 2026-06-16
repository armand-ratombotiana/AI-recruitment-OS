'use client';

import { useState, useCallback } from 'react';
import {
  Copy,
  Download,
  Pencil,
  Bookmark,
  Check,
  FileText,
} from 'lucide-react';
import { Button } from '@/components';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { useToast } from '@/components/ui/toast';

interface ContentPreviewProps {
  content: string;
  contentType: string;
  onEdit?: (newContent: string) => void;
  onSaveAsTemplate?: (content: string) => void;
}

export function ContentPreview({
  content,
  contentType,
  onEdit,
  onSaveAsTemplate,
}: ContentPreviewProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);
  const { push } = useToast();

  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);

  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
      } else {
        const ta = document.createElement('textarea');
        ta.value = content;
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      push('success', t('contentGenerator.copied', 'Copied to clipboard'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      push('error', t('contentGenerator.copyFailed', 'Failed to copy'));
    }
  }, [content, push, t]);

  const handleDownload = useCallback(() => {
    const ext = contentType === 'linkedin_post' ? 'txt' : 'md';
    const filename = `${contentType.replace(/_/g, '-')}-${Date.now()}.${ext}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    push('success', t('contentGenerator.downloaded', 'File downloaded'));
  }, [content, contentType, push, t]);

  const handleSaveEdit = useCallback(() => {
    onEdit?.(editContent);
    setEditing(false);
    push('success', t('contentGenerator.contentUpdated', 'Content updated'));
  }, [editContent, onEdit, push, t]);

  const handleSaveTemplate = useCallback(() => {
    onSaveAsTemplate?.(content);
    push('success', t('contentGenerator.savedAsTemplate', 'Saved as template'));
  }, [content, onSaveAsTemplate, push, t]);

  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-12 text-center dark:border-surface-700 dark:bg-surface-800/30">
        <FileText className="mb-3 h-12 w-12 text-gray-300 dark:text-gray-600" />
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {t('contentGenerator.noContent', 'No content generated yet')}
        </p>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          {t(
            'contentGenerator.noContentDesc',
            'Fill in the form and click Generate to create content'
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {t('contentGenerator.generatedContent', 'Generated content')}
        </h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            onClick={handleCopy}
          >
            {copied
              ? t('contentGenerator.copied', 'Copied')
              : t('contentGenerator.copy', 'Copy')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={handleDownload}
          >
            {t('contentGenerator.download', 'Download')}
          </Button>
          {onEdit && (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Pencil className="h-4 w-4" />}
              onClick={() => {
                setEditContent(content);
                setEditing(!editing);
              }}
            >
              {editing
                ? t('common.cancel', 'Cancel')
                : t('common.edit', 'Edit')}
            </Button>
          )}
          {onSaveAsTemplate && (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Bookmark className="h-4 w-4" />}
              onClick={handleSaveTemplate}
            >
              {t('contentGenerator.saveAsTemplate', 'Save as template')}
            </Button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-3">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={16}
            className="w-full resize-none rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-surface-700 dark:bg-surface-900 dark:text-gray-100"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveEdit}>
              {t('common.save', 'Save')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-surface-700 dark:bg-surface-900">
          <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-gray-200">
            {content}
          </div>
        </div>
      )}
    </div>
  );
}
