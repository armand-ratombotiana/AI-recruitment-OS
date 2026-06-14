'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useLocaleStore, translate } from '@/stores/locale-store';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number | ((index: number) => number);
  overscan?: number;
  height: number;
  className?: string;
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T, index: number) => string;
  emptyMessage?: string;
  onItemsRendered?: (overscanStart: number, overscanEnd: number) => void;
}

export function VirtualList<T>({
  items,
  itemHeight,
  overscan = 5,
  height,
  className,
  renderItem,
  keyExtractor,
  emptyMessage,
  onItemsRendered,
}: VirtualListProps<T>) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const getItemSize = useCallback(
    (index: number): number => {
      if (typeof itemHeight === 'function') return itemHeight(index);
      return itemHeight;
    },
    [itemHeight]
  );

  const totalHeight = useMemo(() => {
    if (typeof itemHeight === 'number') return items.length * itemHeight;
    return items.reduce((sum, _, i) => sum + getItemSize(i), 0);
  }, [items, itemHeight, getItemSize]);

  const getItemOffset = useCallback(
    (index: number): number => {
      if (typeof itemHeight === 'number') return index * itemHeight;
      let offset = 0;
      for (let i = 0; i < index; i++) offset += getItemSize(i);
      return offset;
    },
    [itemHeight, getItemSize]
  );

  const { startIndex, endIndex, virtualItems } = useMemo(() => {
    const vItems: { index: number; offsetTop: number; size: number }[] = [];
    if (items.length === 0) return { startIndex: 0, endIndex: -1, virtualItems: vItems };

    let start: number;
    if (typeof itemHeight === 'number') {
      start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    } else {
      start = 0;
      let accumulated = 0;
      for (let i = 0; i < items.length; i++) {
        accumulated += getItemSize(i);
        if (accumulated >= scrollTop) {
          start = Math.max(0, i - overscan);
          break;
        }
      }
    }

    let end: number;
    if (typeof itemHeight === 'number') {
      end = Math.min(items.length - 1, Math.floor((scrollTop + height) / itemHeight) + overscan);
    } else {
      end = items.length - 1;
      let accumulated = 0;
      for (let i = 0; i < items.length; i++) {
        accumulated += getItemSize(i);
        if (accumulated >= scrollTop + height) {
          end = Math.min(items.length - 1, i + overscan);
          break;
        }
      }
    }

    for (let i = start; i <= end; i++) {
      vItems.push({ index: i, offsetTop: getItemOffset(i), size: getItemSize(i) });
    }

    return { startIndex: start, endIndex: end, virtualItems: vItems };
  }, [scrollTop, height, items.length, itemHeight, overscan, getItemSize, getItemOffset]);

  useEffect(() => {
    if (onItemsRendered && virtualItems.length > 0) {
      onItemsRendered(startIndex, endIndex);
    }
  }, [startIndex, endIndex, onItemsRendered, virtualItems.length]);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
  }, []);

  if (items.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center justify-center text-sm text-gray-500 dark:text-gray-400',
          className
        )}
        style={{ height }}
      role="region"
      aria-label={t('performance.emptyList', 'Empty list')}
      >
        {emptyMessage ?? t('performance.noItems', 'No items to display')}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={cn('overflow-auto', className)}
      style={{ height, position: 'relative' }}
      role="listbox"
      aria-multiselectable="false"
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {virtualItems.map(({ index, offsetTop, size }) => (
          <div
            key={keyExtractor(items[index], index)}
            role="option"
            aria-selected={false}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: size,
              transform: `translateY(${offsetTop}px)`,
            }}
          >
            {renderItem(items[index], index)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default VirtualList;
