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
      const state = searchParams.get('state');
      const errorParam = searchParams.get('error');
      const provider = window.location.pathname.split('/callback/')[1];

      if (errorParam) {
        setError(`Authentication failed: ${errorParam}`);
        setLoading(false);
        return;
      }

      if (!code || !provider) {
        setError('Missing authorization code or provider. Please use the SSO buttons on the login page.');
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-700 font-medium">Completing authentication...</p>
          <p className="text-gray-500 text-sm mt-2">Please wait while we verify your credentials</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md text-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <svg className="h-8 w-8 text-red-500 mx-auto mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-red-600 text-sm font-medium">{error}</p>
        </div>
        <a
          href="/login"
          className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
        >
          Return to login
        </a>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}
