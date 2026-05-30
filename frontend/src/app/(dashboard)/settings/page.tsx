'use client';

import { useState, useEffect } from 'react';
import { api } from '@/services/api/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const [compliance, setCompliance] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);

  useEffect(() => {
    fetchSettingsData();
  }, []);

  const fetchSettingsData = async () => {
    try {
      const [compData, subData] = await Promise.all([
        api.getComplianceStatus(),
        api.getSubscription()
      ]);
      setCompliance(compData);
      setSubscription(subData);
    } catch (e) {
      console.error('Failed to load settings data');
    }
  };

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
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">General Settings</h2>
          <div><label className="block text-sm font-medium mb-1">Organization Name</label><input defaultValue="Acme Corp" className="w-full rounded-lg border px-3 py-2" /></div>
          <div><label className="block text-sm font-medium mb-1">Work Email</label><input defaultValue="admin@acme.com" className="w-full rounded-lg border px-3 py-2" /></div>
          <div><label className="block text-sm font-medium mb-1">Timezone</label>
            <select className="w-full rounded-lg border px-3 py-2"><option>America/New_York</option><option>America/Los_Angeles</option><option>Europe/London</option></select>
          </div>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Save Changes</button>
        </Card>
      )}

      {activeTab === 'security' && (
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">Security</h2>
          <div className="flex items-center justify-between py-3 border-b">
            <div><p className="font-medium">Two-Factor Authentication</p><p className="text-sm text-gray-500">Add extra security</p></div>
            <button className="px-3 py-1.5 border rounded-lg text-sm">Enable</button>
          </div>
          <div className="flex items-center justify-between py-3 border-b">
            <div><p className="font-medium">API Keys</p><p className="text-sm text-gray-500">Manage API keys</p></div>
            <button className="px-3 py-1.5 border rounded-lg text-sm">Manage</button>
          </div>
          {compliance && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="font-medium">Compliance Status</p>
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">GDPR</span><Badge variant={compliance.gdpr_enabled ? 'success' : 'warning'}>{compliance.gdpr_enabled ? 'Enabled' : 'Disabled'}</Badge></div>
                <div className="flex justify-between"><span className="text-gray-500">EEOC</span><Badge variant={compliance.eeoc_enabled ? 'success' : 'warning'}>{compliance.eeoc_enabled ? 'Enabled' : 'Disabled'}</Badge></div>
              </div>
            </div>
          )}
        </Card>
      )}

      {activeTab === 'ai' && (
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">AI Settings</h2>
          <div><label className="block text-sm font-medium mb-1">Default AI Model</label>
            <select className="w-full rounded-lg border px-3 py-2"><option>GPT-4o</option><option>Claude 3.5 Sonnet</option><option>GPT-4o Mini</option></select>
          </div>
          <div><label className="block text-sm font-medium mb-1">Evaluation Threshold</label><input type="number" defaultValue="7.0" min="0" max="10" step="0.1" className="w-full rounded-lg border px-3 py-2" /></div>
          <div className="flex items-center justify-between py-2"><p className="text-sm">Auto-generate explanations</p><label className="relative inline-flex cursor-pointer"><input type="checkbox" defaultChecked className="peer sr-only" /><div className="h-5 w-9 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-blue-600 peer-checked:after:translate-x-full" /></label></div>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Save Changes</button>
        </Card>
      )}

      {activeTab === 'billing' && (
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">Billing</h2>
          {subscription ? (
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="font-medium capitalize">{subscription.plan || 'Free'} Plan</p>
              <p className="text-sm text-gray-500">{subscription.seats_used || 0} of {subscription.seats_limit || 0} seats used</p>
            </div>
          ) : (
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="font-medium">Free Plan</p>
              <p className="text-sm text-gray-500">Upgrade to access premium features</p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
