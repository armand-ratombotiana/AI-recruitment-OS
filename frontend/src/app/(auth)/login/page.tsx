'use client';

import { useState } from 'react';
import { useAuthStore } from '@/stores';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const login = useAuthStore((s) => s.login);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      await login(email, password);
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSSO = async (provider: string) => {
    const redirectUri = `${window.location.origin}/auth/callback/${provider}`;
    try {
      const { api } = await import('@/services/api/client');
      const data = await api.getSSOAuthorizeUrl(provider, redirectUri);
      window.location.href = data.authorization_url;
    } catch {
      setError(`SSO with ${provider} is not configured yet`);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 to-purple-600 items-center justify-center p-12">
        <div className="max-w-md text-white">
          <div className="flex items-center gap-3 mb-8">
            <img src="/logo.svg" alt="AI-ROS" className="h-12 w-12" />
            <span className="text-2xl font-bold">AI-ROS</span>
          </div>
          <h1 className="text-4xl font-bold mb-4">AI-Native Recruitment</h1>
          <p className="text-blue-100 text-lg">
            Transform your hiring with autonomous AI agents, live coding interviews,
            and intelligent workflows.
          </p>
          <div className="mt-12 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-sm">1</div>
              <span className="text-blue-100">AI-powered candidate screening</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-sm">2</div>
              <span className="text-blue-100">Live pair programming interviews</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-sm">3</div>
              <span className="text-blue-100">Intelligent hiring recommendations</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <img src="/logo.svg" alt="AI-ROS" className="h-10 w-10" />
            <span className="text-xl font-bold">AI-ROS</span>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome back</h2>
          <p className="text-gray-500 mb-8">Sign in to your recruitment workspace</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                placeholder="you@company.com"
                required
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <a href="#" className="text-sm text-blue-600 hover:text-blue-700">Forgot password?</a>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                placeholder="••••••••"
                required
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-3 text-gray-400">or continue with</span>
            </div>
          </div>

          {/* SSO Buttons - All 4 providers */}
          <div className="grid grid-cols-2 gap-3">
            {/* Google */}
            <button
              onClick={() => handleSSO('google')}
              type="button"
              className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium text-sm"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google
            </button>

            {/* Microsoft */}
            <button
              onClick={() => handleSSO('microsoft')}
              type="button"
              className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium text-sm"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M11.4 24H0V12.6L11.4 0H24v11.4L12.6 24H11.4z" fill="#F25022"/>
                <path d="M11.4 0H0v11.4h11.4V0z" fill="#7FBA00"/>
                <path d="M24 0H12.6v11.4H24V0z" fill="#00A4EF"/>
                <path d="M11.4 24H0V12.6h11.4V24z" fill="#FFB900"/>
              </svg>
              Microsoft
            </button>

            {/* LinkedIn */}
            <button
              onClick={() => handleSSO('linkedin')}
              type="button"
              className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium text-sm"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="#0A66C2">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.677H9.351V9h3.414v1.561h.046c.475-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.056 0-1.13.92-2.056 2.063-2.056 1.14 0 2.063.926 2.063 2.056 0 1.13-.922 2.056-2.063 2.056zm.846 3.534H4.517V9h1.669v1.934zM22.225 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.677H13.16V9h3.414v1.561h.046c.475-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM6.688 7.433c-1.144 0-2.063-.926-2.063-2.056 0-1.13.92-2.056 2.063-2.056 1.14 0 2.063.926 2.063 2.056 0 1.13-.922 2.056-2.063 2.056zm.846 3.534H5.869V9h1.669v1.934z"/>
              </svg>
              LinkedIn
            </button>

            {/* Apple */}
            <button
              onClick={() => handleSSO('apple')}
              type="button"
              className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium text-sm"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-2.66 3.63-.52.65-.89.7-1.25.7-.35 0-1.07-.24-2.1-.71-.94-.48-1.77-.83-2.42-.83-.68 0-1.41.35-2.32.83-.92.48-1.65.74-2.2.74-.55 0-1.12-.26-1.85-.76C6.25 19.62 5.29 17.85 4.74 15.83c-.57-2.07-.86-4.14-.86-6.22 0-2.32.51-4.11 1.52-5.37 1.02-1.26 2.27-1.91 3.75-1.91 1.22 0 2.47.72 3.58.72 1.06 0 2.16-.77 3.55-.77 1.13 0 2.57.58 3.42 1.53-3.02 1.81-2.53 6.52.39 8.63.72 1.02 1.6 2.17 2.7 2.11.27-.01.73-.28 1.43-.54.68-.25 1.29-.36 1.82-.36.54 0 1.18.18 1.97.54.78.36 1.41.84 1.89 1.44-.75 2.3-1.97 4.16-3.65 5.57-1.46 1.24-2.66 1.97-3.6 2.11-.33.01-.94-.27-1.84-.54z"/>
              </svg>
              Apple
            </button>
          </div>

          <p className="mt-8 text-center text-sm text-gray-500">
            Don&apos;t have an account?{' '}
            <a href="/register" className="text-blue-600 hover:text-blue-700 font-medium">Start free trial</a>
          </p>
        </div>
      </div>
    </div>
  );
}
