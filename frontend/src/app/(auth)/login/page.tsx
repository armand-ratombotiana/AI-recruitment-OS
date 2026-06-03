'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores';
import { Eye, EyeOff, ArrowRight, Info, Bot, Sparkles } from 'lucide-react';
import { Button } from '@/components';

const ENABLE_DEMO = process.env.NEXT_PUBLIC_ENABLE_DEMO === 'true' || process.env.NODE_ENV !== 'production';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') || '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [touched, setTouched] = useState({ email: false, password: false });
  const [ssoProvider, setSsoProvider] = useState<string | null>(null);
  const [showSsoTooltip, setShowSsoTooltip] = useState(false);
  const login = useAuthStore((s) => s.login);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  const validateEmail = (value: string) => {
    if (!value) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Please enter a valid email address';
    return '';
  };
  const validatePassword = (value: string) => {
    if (!value) return 'Password is required';
    if (value.length < 6) return 'Password must be at least 6 characters';
    return '';
  };

  const emailValid = email && !validateEmail(email);
  const passwordValid = password && !validatePassword(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    setEmailError(eErr);
    setPasswordError(pErr);
    if (eErr || pErr) return;

    setIsLoading(true);
    setError('');
    try {
      await login(email, password);
      const safeNext = nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/dashboard';
      router.push(safeNext);
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSSO = async (provider: string) => {
    setSsoProvider(provider);
    setError('');
    const redirectUri = `${window.location.origin}/auth/callback/${provider}`;
    try {
      const { api } = await import('@/services/api/client');
      const data = await api.getSSOAuthorizeUrl(provider, redirectUri);
      window.location.href = data.authorization_url;
    } catch {
      setError(`SSO with ${provider} is not configured yet. Please use email & password.`);
    } finally {
      setSsoProvider(null);
    }
  };

  const fillDemo = () => {
    setEmail('demo@airos.io');
    setPassword('demo1234');
    setTouched({ email: false, password: false });
    setEmailError('');
    setPasswordError('');
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiLz48L3N2Zz4=')] opacity-60" />
        <div className="absolute top-10 right-10 h-40 w-40 rounded-full bg-pink-400/30 blur-3xl" />
        <div className="absolute bottom-10 left-10 h-40 w-40 rounded-full bg-cyan-300/30 blur-3xl" />

        <div className="relative max-w-md text-white">
          <div className="flex items-center gap-3 mb-10">
            <div className="h-12 w-12 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-lg">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <span className="text-2xl font-bold">AI-ROS</span>
          </div>

          <h1 className="text-4xl font-bold mb-4 leading-tight">
            AI-Native Recruitment <br />
            <span className="bg-gradient-to-r from-blue-200 to-pink-200 bg-clip-text text-transparent">Operating System</span>
          </h1>
          <p className="text-blue-100/80 text-lg leading-relaxed">
            Autonomous AI agents that screen, interview, and match candidates — so your team
            can focus on what matters.
          </p>

          <div className="mt-12 space-y-4">
            {[
              { icon: '🤖', title: 'AI-powered candidate screening', desc: '24/7 autonomous evaluation' },
              { icon: '💻', title: 'Live pair programming interviews', desc: 'Real-time AI feedback' },
              { icon: '🎯', title: 'Intelligent hiring recommendations', desc: '95% accuracy rate' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-white/5 backdrop-blur-sm border border-white/10">
                <span className="text-2xl">{item.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="text-xs text-blue-100/70 mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex items-center gap-6 text-xs text-blue-100/70">
            <div className="flex items-center gap-1.5">
              <span className="pulse-dot" /> SOC2 compliant
            </div>
            <div>500+ companies</div>
            <div>4.9★ rating</div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 bg-white">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold text-gray-900">AI-ROS</span>
          </div>

          <h2 className="text-3xl font-bold text-gray-900 mb-1">Welcome back</h2>
          <p className="text-gray-500 text-sm mb-1">Sign in to your recruitment workspace</p>
          {ENABLE_DEMO && (
            <button type="button" onClick={fillDemo} className="text-xs text-blue-600 hover:text-blue-700 font-medium mb-8 inline-flex items-center gap-1 link-underline">
              <Sparkles className="h-3 w-3" /> Use demo credentials
            </button>
          )}

          {error && (
            <div role="alert" className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
              <svg className="h-4 w-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                Work email
              </label>
              <div className="relative">
                <input
                  id="email"
                  ref={emailRef}
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (touched.email) setEmailError(validateEmail(e.target.value)); }}
                  onBlur={() => { setTouched((t) => ({ ...t, email: true })); setEmailError(validateEmail(email)); }}
                  className={`w-full px-3.5 py-2.5 pr-10 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition ${
                    emailError ? 'border-red-300 bg-red-50' : emailValid ? 'border-green-300 bg-green-50/30' : 'border-gray-300'
                  }`}
                  placeholder="you@company.com"
                  aria-invalid={!!emailError}
                  aria-describedby={emailError ? 'email-error' : 'email-help'}
                  autoComplete="email"
                />
                {emailValid && (
                  <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" strokeWidth="2.5"/></svg>
                )}
              </div>
              {emailError ? (
                <p id="email-error" className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/></svg>
                  {emailError}
                </p>
              ) : (
                <p id="email-help" className="mt-1.5 text-xs text-gray-400">We&apos;ll never share your email.</p>
              )}
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
                <a href="#" onClick={(e) => e.preventDefault()} className="text-xs text-blue-600 hover:text-blue-700 link-underline">Forgot password?</a>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (touched.password) setPasswordError(validatePassword(e.target.value)); }}
                  onBlur={() => { setTouched((t) => ({ ...t, password: true })); setPasswordError(validatePassword(password)); }}
                  className={`w-full px-3.5 py-2.5 pr-10 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition ${
                    passwordError ? 'border-red-300 bg-red-50' : passwordValid ? 'border-green-300 bg-green-50/30' : 'border-gray-300'
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
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {passwordError && (
                <p id="password-error" className="mt-1.5 text-xs text-red-600">{passwordError}</p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center cursor-pointer group">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-600 group-hover:text-gray-900">Remember me for 30 days</span>
              </label>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={isLoading}
              fullWidth
              rightIcon={!isLoading ? <ArrowRight className="h-4 w-4" /> : undefined}
            >
              {isLoading ? 'Signing you in...' : 'Sign in'}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 text-gray-400 uppercase tracking-wider">Or continue with</span>
            </div>
          </div>

          <div className="relative">
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { id: 'google', label: 'Google', color: 'hover:border-red-300' },
                { id: 'microsoft', label: 'Microsoft', color: 'hover:border-blue-300' },
                { id: 'linkedin', label: 'LinkedIn', color: 'hover:border-blue-400' },
                { id: 'apple', label: 'Apple', color: 'hover:border-gray-400' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSSO(p.id)}
                  disabled={!!ssoProvider}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg bg-white text-sm font-medium text-gray-700 transition disabled:opacity-50 ${p.color} hover:bg-gray-50`}
                  aria-label={`Sign in with ${p.label}`}
                >
                  {ssoProvider === p.id ? (
                    <span className="h-3.5 w-3.5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                  ) : (
                    <>
                      {p.id === 'google' && (
                        <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                      )}
                      {p.id === 'microsoft' && (
                        <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M11.4 24H0V12.6L11.4 0H24v11.4L12.6 24H11.4z" fill="#F25022"/><path d="M11.4 0H0v11.4h11.4V0z" fill="#7FBA00"/><path d="M24 0H12.6v11.4H24V0z" fill="#00A4EF"/><path d="M11.4 24H0V12.6h11.4V24z" fill="#FFB900"/></svg>
                      )}
                      {p.id === 'linkedin' && (
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.677H9.351V9h3.414v1.561h.046c.475-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.056 0-1.13.92-2.056 2.063-2.056 1.14 0 2.063.926 2.063 2.056 0 1.13-.922 2.056-2.063 2.056z"/></svg>
                      )}
                      {p.id === 'apple' && (
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-2.66 3.63-.52.65-.89.7-1.25.7-.35 0-1.07-.24-2.1-.71-.94-.48-1.77-.83-2.42-.83-.68 0-1.41.35-2.32.83-.92.48-1.65.74-2.2.74-.55 0-1.12-.26-1.85-.76C6.25 19.62 5.29 17.85 4.74 15.83c-.57-2.07-.86-4.14-.86-6.22 0-2.32.51-4.11 1.52-5.37 1.02-1.26 2.27-1.91 3.75-1.91 1.22 0 2.47.72 3.58.72 1.06 0 2.16-.77 3.55-.77 1.13 0 2.57.58 3.42 1.53-3.02 1.81-2.53 6.52.39 8.63.72 1.02 1.6 2.17 2.7 2.11.27-.01.73-.28 1.43-.54.68-.25 1.29-.36 1.82-.36.54 0 1.18.18 1.97.54.78.36 1.41.84 1.89 1.44-.75 2.3-1.97 4.16-3.65 5.57-1.46 1.24-2.66 1.97-3.6 2.11z"/></svg>
                      )}
                      {p.label}
                    </>
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowSsoTooltip((s) => !s)}
              onMouseEnter={() => setShowSsoTooltip(true)}
              onMouseLeave={() => setShowSsoTooltip(false)}
              className="absolute -top-2 -right-2 h-5 w-5 bg-gray-900 text-white rounded-full flex items-center justify-center text-[10px] shadow-lg"
              aria-label="What is single sign-on?"
              aria-expanded={showSsoTooltip}
            >
              <Info className="h-2.5 w-2.5" />
            </button>
            {showSsoTooltip && (
              <div role="tooltip" className="absolute right-0 top-6 z-10 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-2xl">
                <p className="font-semibold mb-1">Single Sign-On (SSO)</p>
                <p className="text-white/80 leading-relaxed">Use your existing corporate identity (Google Workspace, Microsoft Entra, etc.) — no separate password needed.</p>
              </div>
            )}
          </div>

          <p className="mt-8 text-center text-sm text-gray-500">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-blue-600 hover:text-blue-700 font-semibold link-underline">
              Start free trial
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
