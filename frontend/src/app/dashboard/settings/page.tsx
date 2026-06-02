'use client';
import { useState } from 'react';

export default function SettingsPage() {
  const [tab, setTab] = useState('profile');
  const tabs = ['profile','notifications','security','api'];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div className="flex gap-2 border-b">{tabs.map(t => <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium capitalize ${tab===t ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>{t}</button>)}</div>
      {tab === 'profile' && <div className="bg-white rounded-xl border p-6 space-y-4 max-w-lg"><h2 className="text-lg font-semibold">Profile</h2><div><label className="block text-sm font-medium mb-1">Full Name</label><input type="text" defaultValue="John Doe" className="w-full border rounded-lg px-3 py-2" /></div><div><label className="block text-sm font-medium mb-1">Email</label><input type="email" defaultValue="john@example.com" className="w-full border rounded-lg px-3 py-2" /></div><button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Save Changes</button></div>}
      {tab === 'notifications' && <div className="bg-white rounded-xl border p-6 space-y-4 max-w-lg"><h2 className="text-lg font-semibold">Notifications</h2>{['Email notifications','Push notifications','In-app notifications'].map(n => <div key={n} className="flex items-center justify-between"><span className="text-sm">{n}</span><label className="relative inline-flex cursor-pointer"><input type="checkbox" defaultChecked className="sr-only peer"/><div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"/></label></div>)}</div>}
      {tab === 'security' && <div className="bg-white rounded-xl border p-6 space-y-4 max-w-lg"><h2 className="text-lg font-semibold">Security</h2><div><label className="block text-sm font-medium mb-1">Current Password</label><input type="password" className="w-full border rounded-lg px-3 py-2" /></div><div><label className="block text-sm font-medium mb-1">New Password</label><input type="password" className="w-full border rounded-lg px-3 py-2" /></div><button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Update Password</button></div>}
      {tab === 'api' && <div className="bg-white rounded-xl border p-6 space-y-4 max-w-lg"><h2 className="text-lg font-semibold">API Keys</h2><div className="bg-gray-50 rounded-lg p-3 font-mono text-sm">sk-xxxxxxxxxxxxxxxxxxxx</div><button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Generate New Key</button></div>}
    </div>
  );
}
