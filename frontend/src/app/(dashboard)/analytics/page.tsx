'use client';

import { useState, useEffect } from 'react';
import { api } from '@/services/api/client';
import { Card } from '@/components/ui/card';

export default function AnalyticsPage() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const data = await api.getDashboard();
      setDashboard(data);
    } catch (e) {
      console.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <p className="text-gray-500">Loading analytics...</p>;

  const metrics = dashboard?.metrics || {};

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6"><p className="text-sm text-gray-500">Total Candidates</p><p className="text-2xl font-bold">{metrics.total_candidates || 0}</p></Card>
        <Card className="p-6"><p className="text-sm text-gray-500">Open Positions</p><p className="text-2xl font-bold">{metrics.open_positions || 0}</p></Card>
        <Card className="p-6"><p className="text-sm text-gray-500">Active Interviews</p><p className="text-2xl font-bold">{metrics.active_interviews || 0}</p></Card>
        <Card className="p-6"><p className="text-sm text-gray-500">Hires This Month</p><p className="text-2xl font-bold">{metrics.hires_this_month || 0}</p></Card>
      </div>
    </div>
  );
}
