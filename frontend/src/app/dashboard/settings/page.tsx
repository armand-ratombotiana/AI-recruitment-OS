'use client';

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-gray-500">Manage your workspace and preferences</p>
      </div>

      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold mb-4">General</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Organization Name</label>
            <input type="text" defaultValue="Acme Corp" className="w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Work Email</label>
            <input type="email" defaultValue="admin@acme.com" className="w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Save Changes</button>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold mb-4">Security</h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between py-2">
            <div><p className="font-medium">Two-Factor Authentication</p><p className="text-gray-500">Add an extra layer of security</p></div>
            <button className="px-3 py-1.5 rounded-lg border text-sm hover:bg-gray-50">Enable</button>
          </div>
          <div className="flex items-center justify-between py-2">
            <div><p className="font-medium">API Keys</p><p className="text-gray-500">Manage API keys for integrations</p></div>
            <button className="px-3 py-1.5 rounded-lg border text-sm hover:bg-gray-50">Manage</button>
          </div>
          <div className="flex items-center justify-between py-2">
            <div><p className="font-medium">Session Management</p><p className="text-gray-500">View and revoke active sessions</p></div>
            <button className="px-3 py-1.5 rounded-lg border text-sm hover:bg-gray-50">View</button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold mb-4">Notifications</h3>
        <div className="space-y-3 text-sm">
          {['New candidate applications', 'Interview completions', 'AI evaluation results', 'Hiring decisions'].map((item) => (
            <div key={item} className="flex items-center justify-between py-2">
              <p>{item}</p>
              <label className="relative inline-flex cursor-pointer items-center">
                <input type="checkbox" defaultChecked className="peer sr-only" />
                <div className="h-5 w-9 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-blue-600 peer-checked:after:translate-x-full" />
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
