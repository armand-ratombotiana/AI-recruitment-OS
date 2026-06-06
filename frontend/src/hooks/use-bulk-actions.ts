'use client';
import { useCallback, useState } from 'react';

export function useBulkActions<T extends { id: string }>() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const add = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((items: T[]) => {
    setSelected(new Set(items.map((i) => i.id)));
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  return { selected, add, remove, toggle, selectAll, clear, isSelected, count: selected.size };
}
