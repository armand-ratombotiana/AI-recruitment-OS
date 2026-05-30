'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function JobDetailPage({ params }: { params: { id: string } }) {
  const job = {
    id: params.id,
    title: 'Senior Backend Engineer',
    department: 'Engineering',
    location: 'San Francisco, CA',
    remote_policy: 'hybrid',
    status: 'open',
    description: 'We are looking for a senior backend engineer to join our platform team and build scalable distributed systems.',
    required_skills: ['Python', 'PostgreSQL', 'Kubernetes'],
    preferred_skills: ['Redis', 'Kafka', 'Terraform'],
    salary_range: { min: 150000, max: 200000, currency: 'USD' },
    applicants_count: 24,
    matched_candidates: [
      { name: 'Sarah Chen', score: 0.92, status: 'interviewing' },
      { name: 'John Smith', score: 0.87, status: 'screening' },
      { name: 'Mike Johnson', score: 0.75, status: 'new' },
    ]
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <a href="/dashboard/jobs" className="text-gray-400 hover:text-gray-600">← Back</a>
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
            <CardContent><p className="text-gray-600">{job.description}</p></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Required Skills</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {job.required_skills.map(skill => <Badge key={skill} variant="info">{skill}</Badge>)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Preferred Skills</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {job.preferred_skills.map(skill => <Badge key={skill}>{skill}</Badge>)}
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Salary Range</span><span className="font-medium">${job.salary_range.min/1000}k - ${job.salary_range.max/1000}k</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Applicants</span><span className="font-medium">{job.applicants_count}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Remote Policy</span><span className="font-medium capitalize">{job.remote_policy}</span></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Matched Candidates</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {job.matched_candidates.map(c => (
                <div key={c.name} className="flex items-center justify-between text-sm">
                  <span>{c.name}</span>
                  <span className="font-medium">{Math.round(c.score * 100)}%</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
