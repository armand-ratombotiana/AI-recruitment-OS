'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

export interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  activeTab?: string;
  onChange?: (tabId: string) => void;
  children?: (activeTab: string) => React.ReactNode;
  variant?: 'underline' | 'pills' | 'enclosed';
  size?: 'sm' | 'md' | 'lg';
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export function Tabs({
  tabs,
  defaultTab,
  activeTab: controlled,
  onChange,
  children,
  variant = 'underline',
  size = 'md',
  orientation = 'horizontal',
  className,
}: TabsProps) {
  const [internal, setInternal] = useState(defaultTab || tabs[0]?.id);
  const isControlled = controlled !== undefined;
  const activeTab = isControlled ? controlled : internal;
  const tablistRef = useRef<HTMLDivElement>(null);

  const handleSelect = (tabId: string) => {
    if (isControlled) {
      onChange?.(tabId);
    } else {
      setInternal(tabId);
    }
    onChange?.(tabId);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const enabledTabs = tabs
      .map((t, i) => ({ tab: t, i }))
      .filter((x) => !x.tab.disabled);
    const currentPos = enabledTabs.findIndex((x) => x.i === idx);
    if (currentPos === -1) return;

    let nextPos = currentPos;
    if (e.key === 'ArrowRight' || (orientation === 'vertical' && e.key === 'ArrowDown')) {
      nextPos = (currentPos + 1) % enabledTabs.length;
    } else if (e.key === 'ArrowLeft' || (orientation === 'vertical' && e.key === 'ArrowUp')) {
      nextPos = (currentPos - 1 + enabledTabs.length) % enabledTabs.length;
    } else if (e.key === 'Home') {
      nextPos = 0;
    } else if (e.key === 'End') {
      nextPos = enabledTabs.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    const next = enabledTabs[nextPos];
    if (next) {
      handleSelect(next.tab.id);
      const btn = tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[
        next.i
      ];
      btn?.focus();
    }
  };

  const sizes = {
    sm: 'text-xs px-3 py-1.5',
    md: 'text-sm px-4 py-2.5',
    lg: 'text-base px-5 py-3',
  };

  const getTabClass = (active: boolean, disabled?: boolean) => {
    const base = cn(
      'inline-flex items-center gap-2 font-medium transition-colors',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
      'disabled:opacity-50 disabled:pointer-events-none',
      sizes[size]
    );

    if (variant === 'pills') {
      return cn(
        base,
        'rounded-md',
        active ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100',
        disabled && 'cursor-not-allowed'
      );
    }
    if (variant === 'enclosed') {
      return cn(
        base,
        'border border-b-0 rounded-t-md -mb-px',
        active
          ? 'bg-white text-blue-600 border-gray-200 border-b-white'
          : 'bg-gray-50 text-gray-600 border-transparent hover:text-gray-800'
      );
    }
    return cn(
      base,
      'border-b-2',
      active
        ? 'border-blue-600 text-blue-600'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
    );
  };

  useEffect(() => {
    if (activeTab && !tabs.find((t) => t.id === activeTab)) {
      handleSelect(tabs[0]?.id);
    }
  }, [tabs, activeTab]);

  return (
    <div
      className={cn(
        orientation === 'vertical' && 'flex gap-4',
        className
      )}
    >
      <div
        ref={tablistRef}
        role="tablist"
        aria-orientation={orientation}
        className={cn(
          orientation === 'horizontal' ? 'flex border-b border-gray-200' : 'flex flex-col border-r border-gray-200'
        )}
      >
        {tabs.map((tab, idx) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            aria-disabled={tab.disabled || undefined}
            tabIndex={activeTab === tab.id ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && handleSelect(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={getTabClass(activeTab === tab.id, tab.disabled)}
          >
            {tab.icon && <span aria-hidden="true">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge && <span>{tab.badge}</span>}
          </button>
        ))}
      </div>
      <div className="flex-1 pt-4" role="presentation">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            id={`panel-${tab.id}`}
            aria-labelledby={`tab-${tab.id}`}
            hidden={activeTab !== tab.id}
            tabIndex={0}
          >
            {activeTab === tab.id && children?.(tab.id)}
          </div>
        ))}
      </div>
    </div>
  );
}
