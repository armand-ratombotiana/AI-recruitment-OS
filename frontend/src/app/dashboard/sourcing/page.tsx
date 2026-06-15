'use client';

import { useState, useEffect } from 'react';
import { Search, Users, Briefcase, TrendingUp, Plus } from 'lucide-react';
import { api } from '@/services/api/client';
import { useLocaleStore, translate, type Locale } from '@/stores/locale-store';
import { Button, EmptyState } from '@/components';

interface TalentPool {
  id: string;
  name: string;
  description: string;
  candidate_count: number;
  created_at: string;
}

interface MarketInsights {
  total_candidates?: number;
  active_sources?: number;
  avg_conversion?: number;
}

export default function SourcingPage() {
  const locale = useLocaleStore((s) => s.locale);
  const [pools, setPools] = useState<TalentPool[]>([]);
  const [insights, setInsights] = useState<MarketInsights>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pools' | 'source'>('pools');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [poolData, marketData] = await Promise.allSettled([
        api.talentIntelligence.getTalentPool(),
        api.talentIntelligence.getMarketInsights(),
      ]);
      if (poolData.status === 'fulfilled') {
        const val = poolData.value as any;
        setPools(Array.isArray(val) ? val : val?.pools ?? []);
      }
      if (marketData.status === 'fulfilled') {
        setInsights(marketData.value as MarketInsights);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {translate(locale, 'sourcing.title', 'Sourcing')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {translate(locale, 'sourcing.subtitle', 'Build talent pools and discover candidates from multiple sources')}
          </p>
        </div>
        <Button leftIcon={<Plus className="w-4 h-4" />}>
          {translate(locale, 'sourcing.talentPools.createPool', 'Create pool')}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label={translate(locale, 'sourcing.talentPools.members', 'Members')}
          value={insights.total_candidates ?? pools.reduce((s, p) => s + p.candidate_count, 0)}
          locale={locale}
        />
        <StatCard
          icon={<Briefcase className="w-5 h-5" />}
          label={translate(locale, 'sourcing.tabs.talentPools', 'Talent Pools')}
          value={pools.length}
          locale={locale}
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label={translate(locale, 'sourcing.sourceCandidates.title', 'Source Candidates')}
          value={insights.active_sources ?? 0}
          locale={locale}
        />
      </div>

      <div className="border-b">
        <div className="flex gap-4">
          <TabButton
            active={activeTab === 'pools'}
            onClick={() => setActiveTab('pools')}
            label={translate(locale, 'sourcing.tabs.talentPools', 'Talent Pools')}
          />
          <TabButton
            active={activeTab === 'source'}
            onClick={() => setActiveTab('source')}
            label={translate(locale, 'sourcing.tabs.sourceCandidates', 'Source Candidates')}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : activeTab === 'pools' ? (
        <PoolsList pools={pools} locale={locale} />
      ) : (
        <SourcePanel locale={locale} />
      )}
    </div>
  );
}

function StatCard({ icon, label, value, locale }: { icon: React.ReactNode; label: string; value: number | string; locale: Locale }) {
  return (
    <div className="bg-card border rounded-lg p-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg text-primary">{icon}</div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{typeof value === 'number' ? value.toLocaleString(locale) : value}</p>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`pb-2 px-1 border-b-2 transition-colors ${
        active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function PoolsList({ pools, locale }: { pools: TalentPool[]; locale: Locale }) {
  if (pools.length === 0) {
    return (
      <EmptyState
        icon={<Users className="w-12 h-12" />}
        title={translate(locale, 'sourcing.talentPools.noPools', 'No talent pools yet')}
        description={translate(locale, 'sourcing.talentPools.noPoolsDesc', 'Create your first talent pool to start organizing candidates')}
        action={
          <Button leftIcon={<Plus className="w-4 h-4" />}>
            {translate(locale, 'sourcing.talentPools.createPool', 'Create pool')}
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {pools.map((pool) => (
        <div key={pool.id} className="bg-card border rounded-lg p-4 hover:shadow-md transition-shadow">
          <h3 className="font-semibold mb-2">{pool.name}</h3>
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{pool.description}</p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{translate(locale, 'sourcing.talentPools.members', 'Members')}</span>
            <span className="font-medium">{pool.candidate_count}</span>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" size="sm" className="flex-1">
              {translate(locale, 'sourcing.talentPools.actions.view', 'View members')}
            </Button>
            <Button size="sm" className="flex-1">
              {translate(locale, 'sourcing.talentPools.actions.addCandidates', 'Add candidates')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function SourcePanel({ locale }: { locale: Locale }) {
  return (
    <EmptyState
      icon={<Search className="w-12 h-12" />}
      title={translate(locale, 'sourcing.sourceCandidates.title', 'Source Candidates')}
      description={translate(locale, 'sourcing.sourceCandidates.description', 'Search and import candidates from external sources')}
    />
  );
}
