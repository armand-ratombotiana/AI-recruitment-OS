'use client';

import { useState, KeyboardEvent, useRef, useEffect } from 'react';
import { Plus, MoreHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface KanbanCard {
  id: string;
  title: string;
  description?: string;
  [key: string]: any;
}

export interface KanbanColumn {
  id: string;
  title: string;
  color?: string;
  cards: KanbanCard[];
  maxItems?: number;
}

interface KanbanProps {
  columns: KanbanColumn[];
  onChange?: (columns: KanbanColumn[]) => void;
  onCardClick?: (card: KanbanCard, column: KanbanColumn) => void;
  onAddCard?: (columnId: string, title: string) => void;
  onCardDelete?: (columnId: string, cardId: string) => void;
  renderCard?: (card: KanbanCard) => React.ReactNode;
  className?: string;
  allowAddCard?: boolean;
  allowDeleteCard?: boolean;
  emptyMessage?: string;
}

export function Kanban({
  columns,
  onChange,
  onCardClick,
  onAddCard,
  onCardDelete,
  renderCard,
  className,
  allowAddCard = true,
  allowDeleteCard = true,
  emptyMessage = 'No cards',
}: KanbanProps) {
  const [draggedCard, setDraggedCard] = useState<{
    card: KanbanCard;
    fromColumnId: string;
  } | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [addingToColumn, setAddingToColumn] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [menuCardId, setMenuCardId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuCardId(null);
      }
    };
    if (menuCardId) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuCardId]);

  const moveCard = (toColumnId: string) => {
    if (!draggedCard || draggedCard.fromColumnId === toColumnId) return;
    const next = columns.map((col) => {
      if (col.id === draggedCard.fromColumnId) {
        return { ...col, cards: col.cards.filter((c) => c.id !== draggedCard.card.id) };
      }
      if (col.id === toColumnId) {
        if (col.maxItems && col.cards.length >= col.maxItems) return col;
        return { ...col, cards: [...col.cards, draggedCard.card] };
      }
      return col;
    });
    onChange?.(next);
  };

  const handleAddCard = (columnId: string) => {
    const title = newTitle.trim();
    if (!title) {
      setAddingToColumn(null);
      return;
    }
    if (onAddCard) {
      onAddCard(columnId, title);
    } else {
      const next = columns.map((col) =>
        col.id === columnId
          ? {
              ...col,
              cards: [
                ...col.cards,
                { id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title },
              ],
            }
          : col
      );
      onChange?.(next);
    }
    setNewTitle('');
    setAddingToColumn(null);
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    if (onCardDelete) {
      onCardDelete(columnId, cardId);
    } else {
      onChange?.(
        columns.map((col) =>
          col.id === columnId ? { ...col, cards: col.cards.filter((c) => c.id !== cardId) } : col
        )
      );
    }
    setMenuCardId(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>, idx: number, colCards: KanbanCard[]) => {
    if (!draggedCard) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = colCards[idx + 1];
      if (next) {
        const el = document.querySelector<HTMLElement>(`[data-card-id="${next.id}"]`);
        el?.focus();
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = colCards[idx - 1];
      if (prev) {
        const el = document.querySelector<HTMLElement>(`[data-card-id="${prev.id}"]`);
        el?.focus();
      }
    } else if (e.key === 'Escape') {
      setDraggedCard(null);
      setDragOverColumn(null);
    }
  };

  return (
    <div
      className={cn('flex gap-4 overflow-x-auto pb-2', className)}
      role="region"
      aria-label="Kanban board"
    >
      {columns.map((col) => {
        const isOver = dragOverColumn === col.id;
        return (
          <section
            key={col.id}
            aria-labelledby={`col-${col.id}-title`}
            className={cn(
              'flex w-72 shrink-0 flex-col rounded-lg border bg-gray-50 transition-colors',
              isOver ? 'border-blue-400 bg-blue-50/50' : 'border-gray-200'
            )}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragOverColumn !== col.id) setDragOverColumn(col.id);
            }}
            onDragLeave={() => {
              if (dragOverColumn === col.id) setDragOverColumn(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              moveCard(col.id);
              setDraggedCard(null);
              setDragOverColumn(null);
            }}
          >
            <header className="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                {col.color && (
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: col.color }}
                    aria-hidden="true"
                  />
                )}
                <h3
                  id={`col-${col.id}-title`}
                  className="truncate text-sm font-semibold text-gray-900"
                >
                  {col.title}
                </h3>
                <span
                  className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-700"
                  aria-label={`${col.cards.length} cards`}
                >
                  {col.cards.length}
                </span>
              </div>
            </header>
            <ul className="flex-1 space-y-2 p-2 min-h-[100px]" role="list">
              {col.cards.length === 0 && (
                <li className="rounded border border-dashed border-gray-300 p-4 text-center text-xs text-gray-400">
                  {emptyMessage}
                </li>
              )}
              {col.cards.map((card, idx) => (
                <li key={card.id}>
                  <div
                    data-card-id={card.id}
                    draggable
                    tabIndex={0}
                    role="button"
                    aria-label={`${card.title} in ${col.title}`}
                    onDragStart={() => setDraggedCard({ card, fromColumnId: col.id })}
                    onDragEnd={() => {
                      setDraggedCard(null);
                      setDragOverColumn(null);
                    }}
                    onClick={() => onCardClick?.(card, col)}
                    onKeyDown={(e) => handleKeyDown(e, idx, col.cards)}
                    className={cn(
                      'group cursor-pointer rounded-md border border-gray-200 bg-white p-3 shadow-sm transition-all',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                      draggedCard?.card.id === card.id && 'opacity-50'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {renderCard ? (
                          renderCard(card)
                        ) : (
                          <>
                            <p className="text-sm font-medium text-gray-900">
                              {card.title}
                            </p>
                            {card.description && (
                              <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                                {card.description}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                      {allowDeleteCard && (
                        <div className="relative" ref={menuCardId === card.id ? menuRef : null}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuCardId(menuCardId === card.id ? null : card.id);
                            }}
                            aria-label="Card options"
                            aria-haspopup="menu"
                            aria-expanded={menuCardId === card.id}
                            className="rounded p-1 text-gray-400 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-600 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 group-hover:opacity-100"
                          >
                            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                          </button>
                          {menuCardId === card.id && (
                            <div
                              role="menu"
                              className="absolute right-0 z-10 mt-1 w-32 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteCard(col.id, card.id);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                              >
                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {allowAddCard && (
              <div className="border-t border-gray-200 p-2">
                {addingToColumn === col.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAddCard(col.id);
                    }}
                    className="space-y-2"
                  >
                    <input
                      type="text"
                      autoFocus
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onBlur={() => {
                        if (!newTitle.trim()) setAddingToColumn(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setNewTitle('');
                          setAddingToColumn(null);
                        }
                      }}
                      placeholder="Card title..."
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      aria-label="New card title"
                    />
                    <div className="flex gap-1">
                      <button
                        type="submit"
                        className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewTitle('');
                          setAddingToColumn(null);
                        }}
                        className="rounded-md px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setAddingToColumn(col.id);
                      setNewTitle('');
                    }}
                    disabled={col.maxItems !== undefined && col.cards.length >= col.maxItems}
                    className="inline-flex w-full items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Add card
                  </button>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
