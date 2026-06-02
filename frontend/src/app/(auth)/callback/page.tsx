'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/services/api/client';
import { useAuthStore } from '@/stores';

export const dynamic = 'force-dynamic';

function AuthCallbackContent() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const ssoLogin = useAuthStore((s) => s.ssoLogin);

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const provider = window.location.pathname.split('/callback/')[1];

      if (!code || !provider) {
        setError('Missing authorization code or provider');
        setLoading(false);
        return;
      }

      const redirectUri = `${window.location.origin}/auth/callback/${provider}`;

      try {
        await ssoLogin(provider, code, redirectUri);
        window.location.href = '/dashboard';
      } catch (err: any) {
        setError(err.message || 'Authentication failed');
        setLoading(false);
      }
    };

    handleCallback();
  }, [searchParams, ssoLogin]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Completing authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md text-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
        <a href="/login" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
          Return to login
        </a>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}
