'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/stores';
import { Eye, EyeOff, ArrowRight, Check, Mail, Bot, Sparkles } from 'lucide-react';
import { Button } from '@/components';

interface Rule {
  id: string;
  label: string;
  test: (pw: string) => boolean;
}

const RULES: Rule[] = [
  { id: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'One lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'number', label: 'One number', test: (p) => /[0-9]/.test(p) },
  { id: 'special', label: 'One special character', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

const STRENGTH_LABELS = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
const STRENGTH_COLORS = ['bg-gray-200', 'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-blue-500', 'bg-green-500'];

export default function RegisterPage() {
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState({ fullName: false, email: false, password: false, confirm: false, terms: false });
  const [ssoProvider, setSsoProvider] = useState<string | null>(null);
  const register = useAuthStore((s) => s.register);

  const passed = RULES.filter((r) => r.test(password)).length;
  const strength = password ? Math.min(passed, 5) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ fullName: true, email: true, password: true, confirm: true, terms: true });

    if (!fullName.trim()) { setError('Please enter your full name'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Please enter a valid email'); return; }
    if (passed < 5) { setError('Please meet all password requirements'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (!agreeTerms) { setError('Please agree to the terms of service'); return; }

    setIsLoading(true);
    setError('');
    try {
      await register(email, fullName, password);
      setStep('verify');
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
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

  if (step === 'verify') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-gray-950 p-6">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
          <div className="mx-auto mb-6 h-16 w-16 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg">
            <Mail className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Check your inbox</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">We sent a verification link to</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-6">{email}</p>
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-left text-sm text-blue-900 dark:text-blue-200 mb-6">
            <p className="font-semibold mb-1">Next steps:</p>
            <ol className="space-y-1 text-xs text-blue-800 dark:text-blue-300 list-decimal pl-4">
              <li>Click the link in the email to verify your account</li>
              <li>Set up your company profile</li>
              <li>Invite your team members</li>
            </ol>
          </div>
          <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-semibold">
            <ArrowRight className="h-4 w-4" /> Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiLz48L3N2Zz4=')] opacity-60" />
        <div className="absolute top-20 left-20 h-32 w-32 rounded-full bg-pink-400/20 blur-3xl" />
        <div className="absolute bottom-20 right-20 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />

        <div className="relative max-w-md text-white">
          <div className="flex items-center gap-3 mb-10">
            <div className="h-12 w-12 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-lg">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <span className="text-2xl font-bold">AI-ROS</span>
          </div>

          <h1 className="text-4xl font-bold mb-4 leading-tight">
            Start your <span className="bg-gradient-to-r from-yellow-200 to-pink-200 bg-clip-text text-transparent">free trial</span>
          </h1>
          <p className="text-blue-100/80 text-lg leading-relaxed">
            Join 500+ companies using AI-native recruitment to hire top talent faster.
          </p>

          <div className="mt-12 space-y-3">
            {[
              { icon: <Check className="h-4 w-4" />, text: 'No credit card required' },
              { icon: <Check className="h-4 w-4" />, text: '14-day free trial included' },
              { icon: <Check className="h-4 w-4" />, text: 'Cancel anytime, no lock-in' },
              { icon: <Check className="h-4 w-4" />, text: 'Full access to all features' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-white/5 backdrop-blur-sm border border-white/10">
                <div className="h-7 w-7 rounded-full bg-green-500/30 flex items-center justify-center text-green-200">{item.icon}</div>
                <span className="text-sm text-white">{item.text}</span>
              </div>
            ))}
          </div>

          <div className="mt-10 p-4 rounded-xl bg-white/10 backdrop-blur-md border border-white/20">
            <p className="text-sm text-white/90 italic leading-relaxed">
              &ldquo;AI-ROS cut our time-to-hire from 42 days to 12. The autonomous screening is a game changer.&rdquo;
            </p>
            <div className="flex items-center gap-2 mt-3">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-yellow-400 to-pink-500" />
              <div>
                <p className="text-xs font-semibold text-white">Sarah Chen</p>
                <p className="text-[10px] text-blue-100/70">VP People, TechScale</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 bg-white dark:bg-gray-950">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold text-gray-900 dark:text-white">AI-ROS</span>
          </div>

          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">Create your account</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-8">Start your 14-day free trial — no credit card needed</p>

          {error && (
            <div role="alert" className="mb-6 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
              <svg className="h-4 w-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Full name</label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => { setFullName(e.target.value); if (touched.fullName && !e.target.value.trim()) setError(''); }}
                onBlur={() => setTouched((t) => ({ ...t, fullName: true }))}
                className={`w-full px-3.5 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition ${touched.fullName && !fullName.trim() ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30' : 'border-gray-300 dark:border-gray-700'}`}
                placeholder="John Doe"
                autoComplete="name"
                required
              />
              {touched.fullName && !fullName.trim() && (
                <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">Please enter your full name</p>
              )}
            </div>

            <div>
              <label htmlFor="reg-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Work email</label>
              <input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                className={`w-full px-3.5 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition ${touched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30' : 'border-gray-300 dark:border-gray-700'}`}
                placeholder="you@company.com"
                autoComplete="email"
                required
              />
              <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> We&apos;ll never share your email.
              </p>
            </div>

            <div>
              <label htmlFor="reg-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Password</label>
              <div className="relative">
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 pr-10 border border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {password && (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex gap-1">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={`h-1.5 flex-1 rounded-full transition-all ${i < strength ? STRENGTH_COLORS[strength] : 'bg-gray-200 dark:bg-gray-700'}`}
                        />
                      ))}
                    </div>
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 w-20 text-right">{STRENGTH_LABELS[strength]}</span>
                  </div>
                  <ul className="grid grid-cols-1 gap-1">
                    {RULES.map((r) => {
                      const ok = r.test(password);
                      return (
                        <li key={r.id} className={`flex items-center gap-1.5 text-xs ${ok ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                          <span className={`h-3.5 w-3.5 rounded-full flex items-center justify-center shrink-0 ${ok ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`}>
                            {ok && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                          </span>
                          {r.label}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Confirm password</label>
              <div className="relative">
                <input
                  id="confirm"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
                  className={`w-full px-3.5 py-2.5 pr-10 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition ${
                    touched.confirm && confirmPassword && password !== confirmPassword ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30' : 'border-gray-300 dark:border-gray-700'
                  }`}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300" aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}>
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {touched.confirm && confirmPassword && password !== confirmPassword && (
                <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">Passwords do not match</p>
              )}
            </div>

            <label className="flex items-start gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="h-4 w-4 mt-0.5 text-blue-600 border-gray-300 dark:border-gray-700 rounded focus:ring-blue-500 shrink-0"
              />
              <span className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                I agree to the <a href="#" onClick={(e) => e.preventDefault()} className="text-blue-600 hover:text-blue-700 link-underline">Terms of Service</a>, <a href="#" onClick={(e) => e.preventDefault()} className="text-blue-600 hover:text-blue-700 link-underline">Privacy Policy</a>, and <a href="#" onClick={(e) => e.preventDefault()} className="text-blue-600 hover:text-blue-700 link-underline">Data Processing Agreement</a>.
              </span>
            </label>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={isLoading}
              fullWidth
              rightIcon={!isLoading ? <ArrowRight className="h-4 w-4" /> : undefined}
            >
              {isLoading ? 'Creating account...' : 'Create account'}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200 dark:border-gray-700" /></div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white dark:bg-gray-950 px-3 text-gray-400 dark:text-gray-500 uppercase tracking-wider">Or sign up with</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {[
              { id: 'google', label: 'Google', path: <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg> },
              { id: 'microsoft', label: 'Microsoft', path: <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M11.4 24H0V12.6L11.4 0H24v11.4L12.6 24H11.4z" fill="#F25022"/><path d="M11.4 0H0v11.4h11.4V0z" fill="#7FBA00"/><path d="M24 0H12.6v11.4H24V0z" fill="#00A4EF"/><path d="M11.4 24H0V12.6h11.4V24z" fill="#FFB900"/></svg> },
              { id: 'linkedin', label: 'LinkedIn', path: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.677H9.351V9h3.414v1.561h.046c.475-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.056 0-1.13.92-2.056 2.063-2.056 1.14 0 2.063.926 2.063 2.056 0 1.13-.922 2.056-2.063 2.056z"/></svg> },
              { id: 'apple', label: 'Apple', path: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-2.66 3.63-.52.65-.89.7-1.25.7-.35 0-1.07-.24-2.1-.71-.94-.48-1.77-.83-2.42-.83-.68 0-1.41.35-2.32.83-.92.48-1.65.74-2.2.74-.55 0-1.12-.26-1.85-.76C6.25 19.62 5.29 17.85 4.74 15.83c-.57-2.07-.86-4.14-.86-6.22 0-2.32.51-4.11 1.52-5.37 1.02-1.26 2.27-1.91 3.75-1.91 1.22 0 2.47.72 3.58.72 1.06 0 2.16-.77 3.55-.77 1.13 0 2.57.58 3.42 1.53-3.02 1.81-2.53 6.52.39 8.63.72 1.02 1.6 2.17 2.7 2.11.27-.01.73-.28 1.43-.54.68-.25 1.29-.36 1.82-.36.54 0 1.18.18 1.97.54.78.36 1.41.84 1.89 1.44-.75 2.3-1.97 4.16-3.65 5.57-1.46 1.24-2.66 1.97-3.6 2.11z"/></svg> },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSSO(p.id)}
                disabled={!!ssoProvider}
                className="flex items-center justify-center gap-2 px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-50"
                aria-label={`Sign up with ${p.label}`}
              >
                {ssoProvider === p.id ? <span className="h-3.5 w-3.5 border-2 border-gray-300 dark:border-gray-600 border-t-blue-600 rounded-full animate-spin" /> : p.path}
                {p.label}
              </button>
            ))}
          </div>

          <p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-600 hover:text-blue-700 font-semibold link-underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
