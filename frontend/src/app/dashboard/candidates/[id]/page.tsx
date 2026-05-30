'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const mockCandidate = {
  id: '1', full_name: 'John Smith', email: 'john@email.com', phone: '+1-555-0123', location: 'San Francisco, CA',
  status: 'screening', source: 'linkedin', created_at: '2025-01-15',
  profile: {
    seniority: 'Senior', experience: 8,
    summary: 'Senior backend engineer with 8 years of experience building scalable distributed systems.',
    skills: [
      { name: 'Python', level: 'expert', years: 7 }, { name: 'PostgreSQL', level: 'advanced', years: 6 },
      { name: 'Kubernetes', level: 'advanced', years: 4 }, { name: 'Redis', level: 'intermediate', years: 3 },
      { name: 'AWS', level: 'advanced', years: 5 }, { name: 'Docker', level: 'advanced', years: 4 },
    ],
    education: [
      { degree: 'M.S. Computer Science', school: 'Stanford University', year: 2017 },
      { degree: 'B.S. Computer Science', school: 'UC Berkeley', year: 2015 },
    ],
  },
  evaluations: [
    { type: 'Resume Screening', score: 8.5, date: '2025-01-15' },
    { type: 'Skill Assessment', score: 9.0, date: '2025-01-15' },
  ],
  timeline: [
    { title: 'Applied for Senior Backend Engineer', date: '2025-01-15' },
    { title: 'Resume screened by AI (Match: 85%)', date: '2025-01-15' },
    { title: 'PPE Evaluation completed (Score: 9.0/10)', date: '2025-01-15' },
    { title: 'Technical interview scheduled', date: '2025-01-16' },
  ],
};

export default function CandidateDetailPage() {
  const params = useParams();
  const [activeTab, setActiveTab] = useState('overview');
  const candidate = mockCandidate;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/candidates" className="rounded-lg p-2 hover:bg-gray-100">← Back</Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center text-lg font-bold text-blue-700">{candidate.full_name[0]}</div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{candidate.full_name}</h1>
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">{candidate.status}</span>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span>{candidate.email}</span>
                <span>{candidate.phone}</span>
                <span>{candidate.location}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-3xl font-bold text-blue-600">85%</p>
          <p className="text-sm text-gray-500">Match Score</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-3xl font-bold">{candidate.profile.experience}</p>
          <p className="text-sm text-gray-500">Years Experience</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-3xl font-bold">{candidate.evaluations.length}</p>
          <p className="text-sm text-gray-500">Evaluations</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-3xl font-bold">2</p>
          <p className="text-sm text-gray-500">Applications</p>
        </div>
      </div>

      <div className="flex gap-1 border-b">
        {['overview', 'skills', 'evaluations', 'timeline'].map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors ${activeTab === tab ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 bg-white rounded-xl border p-6">
            <h3 className="font-semibold mb-3">Professional Summary</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{candidate.profile.summary}</p>
          </div>
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold mb-3">Education</h3>
            <div className="space-y-3">
              {candidate.profile.education.map((edu, i) => (
                <div key={i}>
                  <p className="text-sm font-medium">{edu.degree}</p>
                  <p className="text-xs text-gray-500">{edu.school} • {edu.year}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'skills' && (
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-semibold mb-4">Technical Skills</h3>
          <div className="space-y-3">
            {candidate.profile.skills.map((skill) => (
              <div key={skill.name} className="flex items-center gap-4">
                <span className="w-32 text-sm font-medium">{skill.name}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full">
                  <div className={`h-2 rounded-full ${skill.level === 'expert' ? 'bg-green-500' : skill.level === 'advanced' ? 'bg-blue-500' : 'bg-yellow-500'}`}
                    style={{ width: skill.level === 'expert' ? '100%' : skill.level === 'advanced' ? '75%' : '50%' }} />
                </div>
                <span className="text-xs text-gray-500 w-20">{skill.level} • {skill.years}y</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'evaluations' && (
        <div className="space-y-4">
          {candidate.evaluations.map((ev, i) => (
            <div key={i} className="bg-white rounded-xl border p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">{ev.type}</h3>
                <span className="text-2xl font-bold text-blue-600">{ev.score}/10</span>
              </div>
              <p className="text-xs text-gray-500">{ev.date}</p>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-semibold mb-4">Activity Timeline</h3>
          <div className="relative ml-4">
            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gray-200" />
            <div className="space-y-6">
              {candidate.timeline.map((event, i) => (
                <div key={i} className="relative flex items-start gap-4">
                  <div className="absolute -left-4 w-3 h-3 rounded-full bg-blue-500 border-2 border-white" />
                  <div className="ml-4">
                    <p className="text-sm font-medium">{event.title}</p>
                    <p className="text-xs text-gray-500">{event.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
