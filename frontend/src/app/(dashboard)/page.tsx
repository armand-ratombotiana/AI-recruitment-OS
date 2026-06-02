'use client';

import { useState, useEffect } from 'react';
import { api } from '@/services/api/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface DashboardMetrics {
  total_candidates: number;
  open_positions: number;
  active_interviews: number;
  hires_this_month: number;
  candidates_trend?: string;
  positions_trend?: string;
  interviews_trend?: string;
  hires_trend?: string;
}

interface PipelineStage {
  stage: string;
  count: number;
  color: string;
}

interface Activity {
  id: string;
  type: string;
  candidate_name: string;
  action: string;
  timestamp: string;
}

interface UpcomingInterview {
  id: string;
  candidate_name: string;
  job_title: string;
  scheduled_at: string;
  type: string;
  duration_minutes: number;
}

function StatCard({ label, value, trend, icon, color, delay }: {
  label: string;
  value: number | string;
  trend?: string;
  icon: string;
  color: string;
  delay: number;
}) {
  return (
    <Card className="p-6 hover:shadow-md transition-shadow" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
          {trend && (
            <p className={`text-xs mt-2 font-medium ${trend.startsWith('+') ? 'text-green-600' : trend.startsWith('-') ? 'text-red-600' : 'text-gray-500'}`}>
              {trend.startsWith('+') || trend.startsWith('-') ? (
                <span className="inline-flex items-center">
                  {trend.startsWith('+') ? (
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                  ) : (
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  )}
                  {trend}
                </span>
              ) : trend}
            </p>
          )}
        </div>
        <div className={`rounded-xl p-3 text-xl ${color}`}>{icon}</div>
      </div>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-64 bg-gray-200 rounded animate-pulse mt-2" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-6 animate-pulse">
            <div className="flex items-center justify-between">
              <div className="space-y-3">
                <div className="h-4 w-24 bg-gray-200 rounded" />
                <div className="h-8 w-16 bg-gray-200 rounded" />
                <div className="h-3 w-12 bg-gray-200 rounded" />
              </div>
              <div className="h-12 w-12 bg-gray-200 rounded-xl" />
            </div>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 animate-pulse">
          <div className="h-6 w-40 bg-gray-200 rounded mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-4 w-20 bg-gray-200 rounded" />
                <div className="flex-1 h-2 bg-gray-200 rounded-full" />
                <div className="h-4 w-8 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6 animate-pulse">
          <div className="h-6 w-32 bg-gray-200 rounded mb-4" />
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-8 w-8 bg-gray-200 rounded-full" />
                <div className="space-y-1 flex-1">
                  <div className="h-3 w-32 bg-gray-200 rounded" />
                  <div className="h-2 w-24 bg-gray-200 rounded" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [pipeline, setPipeline] = useState<PipelineStage[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [upcomingInterviews, setUpcomingInterviews] = useState<UpcomingInterview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError('');
      const [dashboardData, candidatesData, interviewsData] = await Promise.allSettled([
        api.getDashboard('7d'),
        api.listCandidates({ page: '1', page_size: '5' }),
        api.listInterviews({ status: 'scheduled' }),
      ]);

      if (dashboardData.status === 'fulfilled') {
        const d = dashboardData.value;
        setMetrics(d?.metrics || {
          total_candidates: 0,
          open_positions: 0,
          active_interviews: 0,
          hires_this_month: 0,
        });
        setPipeline(d?.pipeline || [
          { stage: 'Applied', count: 0, color: 'bg-blue-500' },
          { stage: 'Screening', count: 0, color: 'bg-cyan-500' },
          { stage: 'Interview', count: 0, color: 'bg-purple-500' },
          { stage: 'Evaluation', count: 0, color: 'bg-amber-500' },
          { stage: 'Offer', count: 0, color: 'bg-green-500' },
          { stage: 'Hired', count: 0, color: 'bg-emerald-600' },
        ]);
        setActivity(d?.recent_activity || []);
      }

      if (candidatesData.status === 'fulfilled') {
        const candidates = candidatesData.value?.data || [];
        const recentActivity: Activity[] = candidates.slice(0, 5).map((c: any, i: number) => ({
          id: c.id || String(i),
          type: 'candidate',
          candidate_name: c.full_name || 'Unknown',
          action: `Status: ${c.status || 'new'}`,
          timestamp: c.created_at || new Date().toISOString(),
        }));
        if (recentActivity.length > 0) setActivity(recentActivity);
      }

      if (interviewsData.status === 'fulfilled') {
        const interviews = interviewsData.value?.data || [];
        const upcoming: UpcomingInterview[] = interviews.slice(0, 5).map((i: any) => ({
          id: i.id,
          candidate_name: i.candidate?.name || i.candidate_name || 'Unknown',
          job_title: i.job?.title || i.job_title || 'Unknown Position',
          scheduled_at: i.scheduled_at || '',
          type: i.type || 'technical',
          duration_minutes: i.duration_minutes || 60,
        }));
        setUpcomingInterviews(upcoming);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const maxPipeline = Math.max(...pipeline.map(s => s.count), 1);

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-gray-500">Welcome back. Here is your recruitment overview.</p>
        </div>
        <button onClick={loadDashboard} className="text-sm text-blue-600 hover:text-blue-700 font-medium">Refresh</button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Candidates" value={metrics?.total_candidates || 0} trend={metrics?.candidates_trend || '+12%'} icon="👥" color="bg-blue-100 text-blue-600" delay={0} />
        <StatCard label="Active Jobs" value={metrics?.open_positions || 0} trend={metrics?.positions_trend || '+5%'} icon="💼" color="bg-green-100 text-green-600" delay={100} />
        <StatCard label="Interviews This Week" value={metrics?.active_interviews || 0} trend={metrics?.interviews_trend || '+8%'} icon="🎥" color="bg-purple-100 text-purple-600" delay={200} />
        <StatCard label="Pass Rate" value={`${metrics?.hires_this_month || 0}%`} trend={metrics?.hires_trend || '+3%'} icon="📈" color="bg-amber-100 text-amber-600" delay={300} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pipeline.map((stage) => (
                <div key={stage.stage} className="flex items-center gap-3">
                  <span className="w-24 text-sm text-gray-600 font-medium">{stage.stage}</span>
                  <div className="flex-1">
                    <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-3 rounded-full transition-all duration-500 ${stage.color}`}
                        style={{ width: `${(stage.count / maxPipeline) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-12 text-right text-sm font-semibold">{stage.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No recent activity</p>
            ) : (
              <div className="space-y-4">
                {activity.map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-blue-700">
                        {item.candidate_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || '??'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.candidate_name}</p>
                      <p className="text-xs text-gray-500">{item.action}</p>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {item.timestamp ? new Date(item.timestamp).toLocaleDateString() : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming Interviews</CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingInterviews.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No upcoming interviews</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="pb-3">Candidate</th>
                    <th className="pb-3">Position</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Date</th>
                    <th className="pb-3">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {upcomingInterviews.map((interview) => (
                    <tr key={interview.id} className="hover:bg-gray-50">
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center">
                            <span className="text-xs font-bold text-purple-700">
                              {interview.candidate_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                          <span className="text-sm font-medium">{interview.candidate_name}</span>
                        </div>
                      </td>
                      <td className="py-3 text-sm text-gray-600">{interview.job_title}</td>
                      <td className="py-3">
                        <Badge variant="info">{interview.type}</Badge>
                      </td>
                      <td className="py-3 text-sm text-gray-600">
                        {interview.scheduled_at ? new Date(interview.scheduled_at).toLocaleDateString() : 'TBD'}
                      </td>
                      <td className="py-3 text-sm text-gray-600">{interview.duration_minutes} min</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
