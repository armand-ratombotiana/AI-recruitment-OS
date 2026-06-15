'use client';

import { useCallback } from 'react';
import ReactGridLayout from 'react-grid-layout';
import { DashboardDesigner, type DesignerWidget } from '@/components/dashboards/designer';
import { useToast } from '@/hooks';
import { useLocaleStore, translate } from '@/stores/locale-store';

type RGLLayouts = ReactGridLayout.Layouts;

export default function DashboardDesignerPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const { push, ToastContainer } = useToast();

  const handleSave = useCallback(
    (_widgets: DesignerWidget[], _layouts: RGLLayouts) => {
      push('success', t('dashboardDesigner.saved', 'Dashboard saved'));
    },
    [push, t],
  );

  return (
    <>
      <DashboardDesigner onSave={handleSave} />
      <ToastContainer />
    </>
  );
}
