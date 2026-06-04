'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;
    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                if (window.confirm('A new version of AI-ROS is available. Reload to update?')) {
                  window.location.reload();
                }
              }
            });
          });
        })
        .catch(() => {
          /* silent */
        });
    };
    window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);
  return null;
}
