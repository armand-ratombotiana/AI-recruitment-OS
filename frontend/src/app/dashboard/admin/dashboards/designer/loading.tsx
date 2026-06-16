import { Skeleton } from '@/components/ui/loading';

export default function DesignerLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
      <Skeleton className="h-12 w-full" />
      <div className="grid grid-cols-12 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 col-span-4" />
        ))}
      </div>
    </div>
  );
}
