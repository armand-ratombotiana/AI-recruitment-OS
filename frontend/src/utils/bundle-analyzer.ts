'use client';

export interface BundleChunk {
  name: string;
  size: number;
  renderedSize?: number;
}

export interface BundleReport {
  totalSize: number;
  chunks: BundleChunk[];
  timestamp: number;
}

export function getChunkReport(): BundleReport {
  if (typeof document === 'undefined' || typeof performance === 'undefined') {
    return { totalSize: 0, chunks: [], timestamp: Date.now() };
  }

  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  const jsEntries = entries.filter(
    (e) => e.initiatorType === 'script' || e.name.endsWith('.js')
  );

  const chunks: BundleChunk[] = jsEntries.map((entry) => {
    const name = entry.name.split('/').pop() || entry.name;
    return {
      name,
      size: entry.transferSize || 0,
      renderedSize: entry.decodedBodySize || 0,
    };
  });

  const totalSize = chunks.reduce((sum, c) => sum + c.size, 0);

  return {
    totalSize,
    chunks: chunks.sort((a, b) => b.size - a.size),
    timestamp: Date.now(),
  };
}

export function logBundleReport(): void {
  if (process.env.NODE_ENV !== 'development') return;
  if (typeof window === 'undefined') return;

  const schedule = () => {
    const report = getChunkReport();
    if (report.chunks.length === 0) return;

    const totalKB = (report.totalSize / 1024).toFixed(1);
    console.group(`[bundle] Total: ${totalKB} KB (${report.chunks.length} chunks)`);
    report.chunks.slice(0, 20).forEach((chunk) => {
      const kb = (chunk.size / 1024).toFixed(1);
      const renderedKb = chunk.renderedSize
        ? ` (rendered: ${(chunk.renderedSize / 1024).toFixed(1)} KB)`
        : '';
      console.debug(`  ${chunk.name}: ${kb} KB${renderedKb}`);
    });
    console.groupEnd();
  };

  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(schedule, { timeout: 5000 });
  } else {
    setTimeout(schedule, 3000);
  }
}

export function checkTreeShaking(moduleExports: Record<string, unknown>, expectedUsed: string[]): string[] {
  const allExports = Object.keys(moduleExports);
  const unused = allExports.filter((key) => !expectedUsed.includes(key));
  if (process.env.NODE_ENV === 'development' && unused.length > 0) {
    console.debug(`[tree-shake] Potentially unused exports: ${unused.join(', ')}`);
  }
  return unused;
}

export function trackImportTime<T>(
  label: string,
  importFn: () => Promise<T>
): Promise<T> {
  if (typeof performance === 'undefined') return importFn();
  const start = performance.now();
  return importFn().then((mod) => {
    const duration = performance.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[perf] Dynamic import "${label}": ${duration.toFixed(2)}ms`);
    }
    return mod;
  });
}

export function getLargestChunks(limit = 5): BundleChunk[] {
  const report = getChunkReport();
  return report.chunks.slice(0, limit);
}

export function isOverBudget(maxKB: number): boolean {
  const report = getChunkReport();
  return report.totalSize / 1024 > maxKB;
}
