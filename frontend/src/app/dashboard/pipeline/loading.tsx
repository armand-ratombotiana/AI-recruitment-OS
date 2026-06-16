import { Skeleton } from '@/components/ui/loading';

export default function PipelineLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="min-w-[280px] space-y-3">
            <Skeleton className="h-8 w-full" />
            {Array.from({ length: 3 }).map((_, j) => (
              <Skeleton key={j} className="h-32 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
