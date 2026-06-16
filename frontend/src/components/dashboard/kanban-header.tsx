import { CheckSquare, Square } from 'lucide-react';
import { interpolate } from '@/stores/locale-store';

interface KanbanHeaderProps {
  stageId: string;
  titleKey: string;
  defaultTitle: string;
  color: string;
  textClass: string;
  count: number;
  allSelected: boolean;
  onSelectColumn: () => void;
  t: (key: string, fb?: string) => string;
}

export function KanbanHeader({
  stageId,
  titleKey,
  defaultTitle,
  color,
  textClass,
  count,
  allSelected,
  onSelectColumn,
  t,
}: KanbanHeaderProps) {
  return (
    <header className="flex items-center gap-2 p-2.5 border-b border-gray-100 dark:border-surface-700">
      <span
        className={`h-2.5 w-2.5 rounded-full shrink-0 ${color}`}
        aria-hidden="true"
      />
      <h3
        className={`text-xs font-semibold uppercase tracking-wider truncate ${textClass}`}
      >
        {t(titleKey, defaultTitle)}
      </h3>
      <span className="ml-auto inline-flex items-center gap-1.5">
        {count > 0 && (
          <button
            type="button"
            onClick={onSelectColumn}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            aria-label={
              allSelected
                ? interpolate(
                    t('jobKanban.deselectAllInColumn', 'Deselect all in {stage}'),
                    { stage: t(titleKey, defaultTitle) }
                  )
                : interpolate(
                    t('jobKanban.selectAllInColumn', 'Select all in {stage}'),
                    { stage: t(titleKey, defaultTitle) }
                  )
            }
            title={
              allSelected
                ? t('jobKanban.deselectAllInColumn', 'Deselect all')
                : t('jobKanban.selectAllInColumn', 'Select all')
            }
          >
            {allSelected ? (
              <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Square className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        )}
        <span className="text-[10px] font-bold bg-gray-100 dark:bg-surface-800 text-gray-700 dark:text-gray-300 rounded-full px-1.5 py-0.5">
          {count}
        </span>
      </span>
    </header>
  );
}
