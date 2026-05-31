'use client';

import { useState, useEffect } from 'react';
import { api } from '@/services/api/client';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function JobDetailPage({ params }: { params: { id: string } }) {
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchJob = async () => {
      try {
        const data = await api.getJob(params.id);
        setJob(data);
      } catch (e) {
        console.error('Failed to load job');
      } finally {
        setLoading(false);
      }
    };
    fetchJob();
  }, [params.id]);

  if (loading) return <p className="text-gray-500">Loading job details...</p>;
  if (!job) return <p className="text-gray-500">Job not found</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <a href="/jobs" className="text-gray-400 hover:text-gray-600">← Back</a>
        <div>
          <h1 className="text-2xl font-bold">{job.title}</h1>
          <p className="text-gray-500">{job.department} • {job.location}</p>
        </div>
        <Badge variant={job.status === 'open' ? 'success' : 'warning'}>{job.status}</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Description</CardTitle></CardHeader>
            <CardContent><p className="text-gray-600">{job.description || 'No description provided'}</p></CardContent>
          </Card>
          {job.required_skills && job.required_skills.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Required Skills</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {job.required_skills.map((skill: string) => <Badge key={skill} variant="info">{skill}</Badge>)}
                </div>
              </CardContent>
            </Card>
          )}
          {job.preferred_skills && job.preferred_skills.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Preferred Skills</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {job.preferred_skills.map((skill: string) => <Badge key={skill}>{skill}</Badge>)}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {job.salary_range && (
                <div className="flex justify-between"><span className="text-gray-500">Salary Range</span><span className="font-medium">${job.salary_range.min/1000}k - ${job.salary_range.max/1000}k</span></div>
              )}
              <div className="flex justify-between"><span className="text-gray-500">Applicants</span><span className="font-medium">{job.applicants_count || 0}</span></div>
              {job.remote_policy && (
                <div className="flex justify-between"><span className="text-gray-500">Remote Policy</span><span className="font-medium capitalize">{job.remote_policy}</span></div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
