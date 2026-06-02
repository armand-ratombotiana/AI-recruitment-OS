'use client';
import { useState, useEffect } from 'react';
import { api } from '@/services/api/client';

export default function PPEPage() {
  const [problems, setProblems] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [code, setCode] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listPPEProblems().then(d => setProblems(d?.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4" style={{height:'calc(100vh - 140px)'}}>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pair Programming Evaluation</h1>
        <select value={selected?.id || ''} onChange={e => { const p = problems.find(x => x.id === e.target.value); setSelected(p); setCode(''); setResult(null); }} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">Select problem</option>
          {problems.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{height:'calc(100% - 60px)'}}>
        <div className="bg-white rounded-xl border p-4 overflow-y-auto">
          {selected ? <><h3 className="text-lg font-semibold mb-2">{selected.title}</h3><p className="text-sm text-gray-600">{selected.description}</p></> : <p className="text-gray-500 text-center py-8">Select a problem to begin</p>}
        </div>
        <div className="bg-white rounded-xl border flex flex-col">
          <div className="border-b px-4 py-2 text-sm font-medium">solution.py</div>
          <textarea value={code} onChange={e => setCode(e.target.value)} className="flex-1 resize-none bg-gray-900 p-4 font-mono text-sm text-green-400 focus:outline-none" placeholder="# Write your solution here" />
        </div>
      </div>
    </div>
  );
}
