'use client';

export default function FeaturesPage() {
  const features = [
    { name: 'Dashboard', route: '/dashboard', description: 'Main recruitment dashboard' },
    { name: 'Candidates', route: '/dashboard/candidates', description: 'Candidate management' },
    { name: 'Jobs', route: '/dashboard/jobs', description: 'Job posting management' },
    { name: 'Interviews', route: '/dashboard/interviews', description: 'Interview scheduling' },
    { name: 'PPE Coding', route: '/dashboard/ppe', description: 'Pair programming evaluation' },
    { name: 'Analytics', route: '/dashboard/analytics', description: 'Recruitment analytics' },
    { name: 'Workflows', route: '/dashboard/workflows', description: 'Workflow automation' },
    { name: 'Settings', route: '/dashboard/settings', description: 'System settings' },
    { name: 'Pipeline', route: '/dashboard/pipeline', description: 'Candidate pipeline board' },
    { name: 'Matching', route: '/dashboard/matching', description: 'AI candidate-job matching' },
    { name: 'Schedule', route: '/dashboard/schedule', description: 'Interview scheduling' },
    { name: 'AI Copilot', route: '/dashboard/ai-copilot', description: 'AI recruiting assistant' },
    { name: 'Reports', route: '/dashboard/reports', description: 'Recruitment reports' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Platform Features</h1>
      <p className="text-gray-600">All available features in the AI-ROS platform.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((feature) => (
          <a
            key={feature.name}
            href={feature.route}
            className="block p-6 bg-white rounded-lg border hover:shadow-lg transition-shadow"
          >
            <h2 className="text-lg font-semibold mb-2">{feature.name}</h2>
            <p className="text-gray-600 text-sm">{feature.description}</p>
            <p className="text-blue-600 text-sm mt-4">{feature.route}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
