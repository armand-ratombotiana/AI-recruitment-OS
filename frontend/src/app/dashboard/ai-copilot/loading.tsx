import { Skeleton } from '@/components/ui/loading';

export default function AICopilotLoading() {
  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      <div className="w-64 border-r border-gray-200 dark:border-surface-700 p-4 space-y-3">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
      <div className="flex-1 flex flex-col">
        <Skeleton className="h-16 w-full mb-4" />
        <div className="flex-1 space-y-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
              <Skeleton className={`h-20 ${i % 2 === 0 ? 'w-2/3' : 'w-1/2'}`} />
            </div>
          ))}
        </div>
        <Skeleton className="h-16 w-full mt-4" />
      </div>
    </div>
  );
}
