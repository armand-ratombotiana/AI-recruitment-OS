'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import { useAuthStore } from '@/stores';
import { Bot, ShieldCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

function ProviderCallbackContent() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(5);
  const searchParams = useSearchParams();
  const params = useParams<{ provider: string }>();
  const ssoLogin = useAuthStore((s) => s.ssoLogin);

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const errorParam = searchParams.get('error');
      const provider = params.provider;

      if (errorParam) {
        setError(`Authentication failed: ${errorParam}`);
        setLoading(false);
        return;
      }

      if (!code || !provider) {
        setError('Missing authorization code or provider');
        setLoading(false);
        return;
      }

      const redirectUri = `${window.location.origin}/auth/callback/${provider}`;

      try {
        await ssoLogin(provider, code, redirectUri);
        const t = setInterval(() => {
          setCountdown((c) => {
            if (c <= 1) {
              clearInterval(t);
              window.location.href = '/dashboard';
              return 0;
            }
            return c - 1;
          });
        }, 1000);
        setLoading(false);
      } catch (err: any) {
        setError(err.message || 'Authentication failed');
        setLoading(false);
      }
    };

    handleCallback();
  }, [searchParams, params, ssoLogin]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="text-center max-w-sm">
          <div className="mx-auto mb-6 h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-xl shadow-blue-500/20">
            <Bot className="h-8 w-8 text-white" />
          </div>
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-200 border-t-blue-600 mx-auto mb-4" />
          <p className="text-gray-800 font-semibold text-lg">Completing sign-in...</p>
          <p className="text-gray-500 text-sm mt-2">Verifying your credentials with the identity provider.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-red-50 p-4">
        <div className="max-w-md text-center bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Sign-in failed</h2>
          <p className="text-sm text-red-600 mb-6">{error}</p>
          <a
            href="/login"
            className="inline-block px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
          >
            Return to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-green-50 p-4">
      <div className="max-w-md text-center bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
        <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
          <ShieldCheck className="h-7 w-7 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Welcome back!</h2>
        <p className="text-sm text-gray-600 mb-6">
          Redirecting to your dashboard in <span className="font-bold text-blue-600">{countdown}</span> seconds...
        </p>
        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-gradient-to-r from-blue-600 to-green-500 h-full transition-all"
            style={{ width: `${((5 - countdown) / 5) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default function ProviderCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600" />
      </div>
    }>
      <ProviderCallbackContent />
    </Suspense>
  );
}
