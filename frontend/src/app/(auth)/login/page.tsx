'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/stores';
import { Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const login = useAuthStore((s) => s.login);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  const validateEmail = (value: string) => {
    if (!value) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Invalid email format';
    return '';
  };

  const validatePassword = (value: string) => {
    if (!value) return 'Password is required';
    if (value.length < 6) return 'Password must be at least 6 characters';
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    setEmailError(eErr);
    setPasswordError(pErr);
    if (eErr || pErr) return;

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
      {/* Left Branding Panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiLz48L3N2Zz4=')] opacity-60" />
        <div className="relative max-w-md text-white">
          <div className="flex items-center gap-3 mb-10">
            <div className="h-12 w-12 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/10">
              <svg
                className="h-6 w-6 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="text-2xl font-bold">AI-ROS</span>
          </div>
          <h1 className="text-4xl font-bold mb-4 leading-tight">
            AI-Native Recruitment Operating System
          </h1>
          <p className="text-gray-400 text-lg leading-relaxed">
            Autonomous AI agents that screen, interview, and match candidates — so your team can
            focus on what matters.
          </p>
          <div className="mt-12 space-y-4">
            {[
              'AI-powered candidate screening',
              'Live pair programming interviews',
              'Intelligent hiring recommendations',
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-7 w-7 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <svg
                    className="h-3.5 w-3.5 text-blue-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <span className="text-gray-300 text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
              <svg
                className="h-5 w-5 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="text-lg font-bold text-gray-900">AI-ROS</span>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h2>
          <p className="text-gray-500 text-sm mb-8">Sign in to your recruitment workspace</p>

          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                Email
              </label>
              <input
                id="email"
                ref={emailRef}
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError('');
                }}
                onBlur={() => setEmailError(validateEmail(email))}
                className={`w-full px-3.5 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition ${
                  emailError ? 'border-red-300 bg-red-50' : 'border-gray-300'
                }`}
                placeholder="you@company.com"
                aria-invalid={!!emailError}
                aria-describedby={emailError ? 'email-error' : undefined}
                autoComplete="email"
              />
              {emailError && (
                <p id="email-error" className="mt-1 text-xs text-red-600">
                  {emailError}
                </p>
              )}
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700"
                >
                  Password
                </label>
                <a
                  href="#"
                  className="text-xs text-blue-600 hover:text-blue-700"
                  onClick={(e) => e.preventDefault()}
                >
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError) setPasswordError('');
                  }}
                  onBlur={() => setPasswordError(validatePassword(password))}
                  className={`w-full px-3.5 py-2.5 pr-10 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition ${
                    passwordError ? 'border-red-300 bg-red-50' : 'border-gray-300'
                  }`}
                  placeholder="••••••••"
                  aria-invalid={!!passwordError}
                  aria-describedby={passwordError ? 'password-error' : undefined}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {passwordError && (
                <p id="password-error" className="mt-1 text-xs text-red-600">
                  {passwordError}
                </p>
              )}
            </div>

            <div className="flex items-center">
              <input
                id="remember"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="remember" className="ml-2 text-sm text-gray-600">
                Remember me
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-gray-900 text-white rounded-lg font-medium text-sm hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              aria-busy={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
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

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleSSO('google')}
              type="button"
              className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm font-medium"
              aria-label="Sign in with Google"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Google
            </button>
            <button
              onClick={() => handleSSO('microsoft')}
              type="button"
              className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm font-medium"
              aria-label="Sign in with Microsoft"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path d="M11.4 24H0V12.6L11.4 0H24v11.4L12.6 24H11.4z" fill="#F25022" />
                <path d="M11.4 0H0v11.4h11.4V0z" fill="#7FBA00" />
                <path d="M24 0H12.6v11.4H24V0z" fill="#00A4EF" />
                <path d="M11.4 24H0V12.6h11.4V24z" fill="#FFB900" />
              </svg>
              Microsoft
            </button>
            <button
              onClick={() => handleSSO('linkedin')}
              type="button"
              className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm font-medium"
              aria-label="Sign in with LinkedIn"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="#0A66C2">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.677H9.351V9h3.414v1.561h.046c.475-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.056 0-1.13.92-2.056 2.063-2.056 1.14 0 2.063.926 2.063 2.056 0 1.13-.922 2.056-2.063 2.056zm.846 3.534H4.517V9h1.669v1.934zM22.225 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.677H13.16V9h3.414v1.561h.046c.475-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM6.688 7.433c-1.144 0-2.063-.926-2.063-2.056 0-1.13.92-2.056 2.063-2.056 1.14 0 2.063.926 2.063 2.056 0 1.13-.922 2.056-2.063 2.056zm.846 3.534H5.869V9h1.669v1.934z" />
              </svg>
              LinkedIn
            </button>
            <button
              onClick={() => handleSSO('apple')}
              type="button"
              className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm font-medium"
              aria-label="Sign in with Apple"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-2.66 3.63-.52.65-.89.7-1.25.7-.35 0-1.07-.24-2.1-.71-.94-.48-1.77-.83-2.42-.83-.68 0-1.41.35-2.32.83-.92.48-1.65.74-2.2.74-.55 0-1.12-.26-1.85-.76C6.25 19.62 5.29 17.85 4.74 15.83c-.57-2.07-.86-4.14-.86-6.22 0-2.32.51-4.11 1.52-5.37 1.02-1.26 2.27-1.91 3.75-1.91 1.22 0 2.47.72 3.58.72 1.06 0 2.16-.77 3.55-.77 1.13 0 2.57.58 3.42 1.53-3.02 1.81-2.53 6.52.39 8.63.72 1.02 1.6 2.17 2.7 2.11.27-.01.73-.28 1.43-.54.68-.25 1.29-.36 1.82-.36.54 0 1.18.18 1.97.54.78.36 1.41.84 1.89 1.44-.75 2.3-1.97 4.16-3.65 5.57-1.46 1.24-2.66 1.97-3.6 2.11-.33.01-.94-.27-1.84-.54z" />
              </svg>
              Apple
            </button>
          </div>

          <p className="mt-8 text-center text-sm text-gray-500">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-blue-600 hover:text-blue-700 font-medium">
              Start free trial
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
