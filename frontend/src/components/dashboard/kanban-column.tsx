import { KanbanHeader } from './kanban-header';
import { KanbanCard, type Applicant, type JobApplicantStage } from './kanban-card';
import { interpolate } from '@/stores/locale-store';
import type { Locale } from '@/stores/locale-store';

interface StageDef {
  id: JobApplicantStage;
  titleKey: string;
  defaultTitle: string;
  color: string;
  borderClass: string;
  bgClass: string;
  textClass: string;
}

export interface KanbanColumnProps {
  stage: StageDef;
  applicants: Applicant[];
  selectedIds: Set<string>;
  draggingId: string | null;
  movingId: string | null;
  dragOverStage: JobApplicantStage | null;
  onDragOver: (e: React.DragEvent, stage: JobApplicantStage) => void;
  onDragLeave: (stage: JobApplicantStage) => void;
  onDrop: (e: React.DragEvent, stage: JobApplicantStage) => void;
  onSelectColumn: (stageId: JobApplicantStage, ids: string[]) => void;
  onToggleSelect: (id: string) => void;
  onOpenCard: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  locale: Locale;
  t: (key: string, fb?: string) => string;
}

export function KanbanColumn({
  stage,
  applicants,
  selectedIds,
  draggingId,
  movingId,
  dragOverStage,
  onDragOver,
  onDragLeave,
  onDrop,
  onSelectColumn,
  onToggleSelect,
  onOpenCard,
  onDragStart,
  onDragEnd,
  locale,
  t,
}: KanbanColumnProps) {
  const selectedInColumn = applicants.filter((c) => selectedIds.has(c.id)).length;
  const allSelected = applicants.length > 0 && selectedInColumn === applicants.length;
  const isDropTarget = dragOverStage === stage.id;

  return (
    <div
      role="region"
      aria-label={interpolate(
        t('jobKanban.columnAria', 'Drop candidate to move to {stage}'),
        { stage: t(stage.titleKey, stage.defaultTitle) }
      )}
      onDragOver={(e) => onDragOver(e, stage.id)}
      onDragLeave={() => onDragLeave(stage.id)}
      onDrop={(e) => onDrop(e, stage.id)}
      className={[
        'flex flex-col rounded-lg border bg-white dark:bg-surface-900 transition-colors min-h-[260px]',
        isDropTarget
          ? `${stage.borderClass} ${stage.bgClass} ring-2 ring-offset-1 ring-blue-400 dark:ring-offset-surface-900`
          : 'border-gray-200 dark:border-surface-700',
      ].join(' ')}
    >
      <KanbanHeader
        stageId={stage.id}
        titleKey={stage.titleKey}
        defaultTitle={stage.defaultTitle}
        color={stage.color}
        textClass={stage.textClass}
        count={applicants.length}
        allSelected={allSelected}
        onSelectColumn={() => onSelectColumn(stage.id, applicants.map((c) => c.id))}
        t={t}
      />

      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[60vh]">
        {applicants.length === 0 ? (
          <p className="text-[11px] text-center text-gray-400 dark:text-gray-500 py-6">
            {t('jobKanban.emptyColumn', 'No candidates in this stage')}
          </p>
        ) : (
          applicants.map((c) => (
            <KanbanCard
              key={c.id}
              candidate={c}
              isSelected={selectedIds.has(c.id)}
              isDragging={draggingId === c.id}
              isMoving={movingId === c.id}
              onToggleSelect={onToggleSelect}
              onOpen={onOpenCard}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              locale={locale}
              t={t}
            />
          ))
        )}
      </div>
    </div>
  );
}
