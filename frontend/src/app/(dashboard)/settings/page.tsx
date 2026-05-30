'use client';

import { useState } from 'react';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'security', label: 'Security' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'ai', label: 'AI Settings' },
    { id: 'billing', label: 'Billing' },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-gray-500">Manage your workspace and preferences</p>
      </div>

      <div className="flex border-b">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium ${activeTab === tab.id ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h2 className="text-lg font-semibold">General Settings</h2>
          <div><label className="block text-sm font-medium mb-1">Organization Name</label><input defaultValue="Acme Corp" className="w-full rounded-lg border px-3 py-2" /></div>
          <div><label className="block text-sm font-medium mb-1">Work Email</label><input defaultValue="admin@acme.com" className="w-full rounded-lg border px-3 py-2" /></div>
          <div><label className="block text-sm font-medium mb-1">Timezone</label>
            <select className="w-full rounded-lg border px-3 py-2"><option>America/New_York</option><option>America/Los_Angeles</option><option>Europe/London</option></select>
          </div>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Save Changes</button>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h2 className="text-lg font-semibold">Security</h2>
          <div className="flex items-center justify-between py-3 border-b">
            <div><p className="font-medium">Two-Factor Authentication</p><p className="text-sm text-gray-500">Add extra security</p></div>
            <button className="px-3 py-1.5 border rounded-lg text-sm">Enable</button>
          </div>
          <div className="flex items-center justify-between py-3 border-b">
            <div><p className="font-medium">API Keys</p><p className="text-sm text-gray-500">Manage API keys</p></div>
            <button className="px-3 py-1.5 border rounded-lg text-sm">Manage</button>
          </div>
        </div>
      )}

      {activeTab === 'ai' && (
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h2 className="text-lg font-semibold">AI Settings</h2>
          <div><label className="block text-sm font-medium mb-1">Default AI Model</label>
            <select className="w-full rounded-lg border px-3 py-2"><option>GPT-4o</option><option>Claude 3.5 Sonnet</option><option>GPT-4o Mini</option></select>
          </div>
          <div><label className="block text-sm font-medium mb-1">Evaluation Threshold</label><input type="number" defaultValue="7.0" min="0" max="10" step="0.1" className="w-full rounded-lg border px-3 py-2" /></div>
          <div className="flex items-center justify-between py-2"><p className="text-sm">Auto-generate explanations</p><label className="relative inline-flex cursor-pointer"><input type="checkbox" defaultChecked className="peer sr-only" /><div className="h-5 w-9 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-blue-600 peer-checked:after:translate-x-full" /></label></div>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Save Changes</button>
        </div>
      )}

      {activeTab === 'billing' && (
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h2 className="text-lg font-semibold">Billing</h2>
          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="font-medium">Enterprise Plan</p>
            <p className="text-sm text-gray-500">$499/month • 50 seats • 23 used</p>
          </div>
          <div className="text-sm text-gray-500">Next billing date: February 1, 2025</div>
        </div>
      )}
    </div>
  );
}
