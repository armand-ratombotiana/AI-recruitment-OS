'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components';
import { translate } from '@/stores/locale-store';
import type { Locale } from '@/stores/locale-store';

export interface SignaturePadProps {
  onSave: (data: string) => void;
  onCancel?: () => void;
  locale: Locale;
  className?: string;
}

export function SignaturePad({ onSave, onCancel, locale, className }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  const getCtx = useCallback(() => {
    return canvasRef.current?.getContext('2d') ?? null;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx) return;
    setDrawing(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing) return;
    const ctx = getCtx();
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasContent(true);
  };

  const endDraw = () => {
    setDrawing(false);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasContent(false);
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL('image/png'));
  };

  return (
    <div className={className}>
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('offers.signature.title', 'Sign below')}
        </p>
        <canvas
          ref={canvasRef}
          className="w-full h-40 border-2 border-dashed border-gray-300 dark:border-surface-600 rounded-lg cursor-crosshair bg-white dark:bg-surface-800 touch-none"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
          aria-label={t('offers.signature.title', 'Sign below')}
        />
        <div className="flex gap-2">
          <Button variant="secondary" onClick={clear} type="button">
            {t('offers.signature.clear', 'Clear')}
          </Button>
          {onCancel && (
            <Button variant="secondary" onClick={onCancel} type="button">
              {t('common.cancel', 'Cancel')}
            </Button>
          )}
          <Button variant="primary" onClick={save} disabled={!hasContent} type="button">
            {t('offers.signature.save', 'Save signature')}
          </Button>
        </div>
      </div>
    </div>
  );
}
