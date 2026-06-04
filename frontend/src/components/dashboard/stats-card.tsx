interface StatsCardProps {
  title: string;
  value: React.ReactNode;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: React.ReactNode;
}

export function StatsCard({ title, value, change, changeType = 'neutral', icon }: StatsCardProps) {
  return (
    <div className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{value}</p>
          {change && (
            <p className={`text-xs mt-1 ${
              changeType === 'positive'
                ? 'text-green-600 dark:text-green-400'
                : changeType === 'negative'
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-500 dark:text-gray-400'
            }`}>
              {change}
            </p>
          )}
        </div>
        <div className="rounded-xl bg-blue-50 dark:bg-brand-500/10 p-3 text-blue-600 dark:text-brand-400">
          {icon}
        </div>
      </div>
    </div>
  );
}
