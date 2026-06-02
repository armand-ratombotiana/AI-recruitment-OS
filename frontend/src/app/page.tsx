'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Bot,
  Code2,
  Target,
  Users,
  Zap,
  BarChart3,
  Check,
  ArrowRight,
  Menu,
  X,
  Star,
  Shield,
  Play,
  ArrowUpRight,
  Workflow,
  Lock,
  ChevronRight,
} from 'lucide-react';

const features = [
  {
    icon: Bot,
    title: 'AI Screening',
    description:
      'Autonomous agents screen and evaluate candidates 24/7 with multi-dimensional scoring and bias detection.',
    color: 'from-blue-500 to-blue-600',
    bg: 'bg-blue-50',
  },
  {
    icon: Code2,
    title: 'Live Coding',
    description:
      'Real-time pair programming interviews with AI evaluation, progressive hints, and automated scoring.',
    color: 'from-purple-500 to-purple-600',
    bg: 'bg-purple-50',
  },
  {
    icon: Target,
    title: 'Smart Matching',
    description:
      'ML-powered candidate-job matching with explainable scores using embeddings and skill graphs.',
    color: 'from-green-500 to-emerald-600',
    bg: 'bg-green-50',
  },
  {
    icon: Workflow,
    title: 'Workflow Engine',
    description:
      'Automate your entire hiring pipeline with visual workflows, event-driven triggers, and approval chains.',
    color: 'from-amber-500 to-orange-500',
    bg: 'bg-amber-50',
  },
  {
    icon: BarChart3,
    title: 'Analytics',
    description:
      'Real-time insights into recruitment metrics, AI performance tracking, and predictive workforce analytics.',
    color: 'from-rose-500 to-red-500',
    bg: 'bg-rose-50',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description:
      'SOC2 compliant with SSO, role-based access, end-to-end encryption, and audit logs.',
    color: 'from-teal-500 to-cyan-500',
    bg: 'bg-teal-50',
  },
];

const testimonials = [
  {
    name: 'Sarah Chen',
    role: 'VP of People, TechScale',
    content:
      'AI-ROS cut our time-to-hire from 42 days to 12. The autonomous screening is a game changer — we finally eliminated resume bottlenecks.',
    rating: 5,
  },
  {
    name: 'Marcus Rivera',
    role: 'Head of Recruiting, DataFlow',
    content:
      'The AI matching is eerily accurate. We went from 200+ manual reviews per hire to letting the system surface the top 5 candidates automatically.',
    rating: 5,
  },
  {
    name: 'Emily Nakamura',
    role: 'CTO, CloudBridge',
    content:
      'The analytics alone justified the ROI. We can see exactly where candidates drop off and optimize with data, not guesswork.',
    rating: 5,
  },
];

const pricingTiers = [
  {
    name: 'Starter',
    price: '$99',
    period: '/mo',
    description: '100 candidates, 3 users, basic AI',
    features: [
      '100 candidates/month',
      '3 team members',
      'AI-powered screening',
      'Basic analytics',
      'Email support',
    ],
    cta: 'Start Free Trial',
    popular: false,
  },
  {
    name: 'Professional',
    price: '$299',
    period: '/mo',
    description: '500 candidates, 10 users, advanced AI',
    features: [
      '500 candidates/month',
      '10 team members',
      'Advanced AI matching',
      'Live coding interviews',
      'Priority support',
      'Advanced analytics',
      'Custom workflows',
    ],
    cta: 'Start Free Trial',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'Unlimited everything',
    features: [
      'Unlimited candidates',
      'Unlimited team members',
      'Custom AI models',
      'Dedicated support',
      'SSO & RBAC',
      'API access',
      'SLA guarantee',
    ],
    cta: 'Contact Sales',
    popular: false,
  },
];

const footerLinks = {
  Product: ['Features', 'Pricing', 'Integrations', 'API Docs', 'Changelog'],
  Company: ['About', 'Blog', 'Careers', 'Press Kit', 'Partners'],
  Resources: ['Documentation', 'Help Center', 'Community', 'Webinars', 'Case Studies'],
  Legal: ['Privacy Policy', 'Terms of Service', 'Cookie Policy', 'GDPR', 'Security'],
};

function useCountUp(end: number, duration = 2000) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const startTime = Date.now();
          const tick = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * end));
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, duration]);

  return { count, ref };
}

function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('visible');
          observer.unobserve(el);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}

export default function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const stats = [
    useCountUp(500),
    useCountUp(50000),
    useCountUp(95),
    useCountUp(3),
  ];

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'bg-white/95 backdrop-blur-xl border-b border-gray-100 shadow-sm'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <span className={`text-lg font-bold transition-colors duration-300 ${scrolled ? 'text-gray-900' : 'text-white'}`}>
                AI-ROS
              </span>
            </div>

            <div className="hidden md:flex items-center gap-8">
              {['Features', 'Pricing', 'About', 'Docs'].map((item) => (
                <a
                  key={item}
                  href={`#${item.toLowerCase()}`}
                  className={`text-sm transition-colors duration-300 ${
                    scrolled ? 'text-gray-600 hover:text-gray-900' : 'text-white/80 hover:text-white'
                  }`}
                >
                  {item}
                </a>
              ))}
              <Link
                href="/login"
                className={`text-sm transition-colors duration-300 ${
                  scrolled ? 'text-gray-600 hover:text-gray-900' : 'text-white/80 hover:text-white'
                }`}
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="px-5 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
              >
                Get Started
              </Link>
            </div>

            <button
              className={`md:hidden p-2 rounded-lg transition-colors ${
                scrolled ? 'text-gray-600 hover:bg-gray-100' : 'text-white hover:bg-white/10'
              }`}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 shadow-lg animate-slide-down">
            <div className="px-4 py-4 space-y-1">
              {['Features', 'Pricing', 'About', 'Docs'].map((item) => (
                <a
                  key={item}
                  href={`#${item.toLowerCase()}`}
                  className="block px-3 py-2.5 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item}
                </a>
              ))}
              <Link
                href="/login"
                className="block px-3 py-2.5 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="block px-3 py-2.5 text-sm text-white bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg font-medium text-center"
                onClick={() => setMobileMenuOpen(false)}
              >
                Get Started
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Animated Gradient Mesh Background */}
        <div className="absolute inset-0 hero-gradient-bg">
          <div className="mesh-blob mesh-1" />
          <div className="mesh-blob mesh-2" />
          <div className="mesh-blob mesh-3" />
          <div className="mesh-blob mesh-4" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center pt-20">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 text-white px-4 py-1.5 rounded-full text-sm font-medium mb-8 animate-fade-in-up">
            <span className="h-1.5 w-1.5 bg-green-400 rounded-full animate-pulse" />
            NEW: AI-Powered Recruitment v3.0
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold text-white mb-6 leading-tight tracking-tight animate-fade-in-up animation-delay-100">
            The Future of Hiring
            <br />
            <span className="bg-gradient-to-r from-blue-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">
              is Autonomous
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-white/70 mb-10 max-w-2xl mx-auto leading-relaxed animate-fade-in-up animation-delay-200">
            AI-ROS deploys intelligent agents that screen candidates, conduct interviews, and make
            hiring decisions — so your team can focus on building.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16 animate-fade-in-up animation-delay-300">
            <Link
              href="/register"
              className="px-8 py-3.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all inline-flex items-center justify-center gap-2 shadow-xl shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-105"
            >
              Start Free Trial
              <ArrowRight className="h-4 w-4" />
            </Link>
            <button className="px-8 py-3.5 border-2 border-white/30 text-white rounded-xl font-semibold hover:bg-white/10 transition-all inline-flex items-center justify-center gap-2">
              <Play className="h-4 w-4 fill-current" />
              Watch Demo
            </button>
          </div>

          {/* Floating Demo Cards */}
          <div className="relative h-48 sm:h-64 animate-fade-in-up animation-delay-500">
            <div className="floating-card floating-card-1 absolute left-1/2 -translate-x-[120%] top-0 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4 text-left text-white shadow-2xl w-56">
              <div className="text-xs text-white/60 mb-1">Candidate Score</div>
              <div className="text-2xl font-bold mb-2">9.2<span className="text-sm font-normal text-white/60">/10</span></div>
              <div className="w-full bg-white/10 rounded-full h-2">
                <div className="bg-gradient-to-r from-green-400 to-emerald-400 h-2 rounded-full" style={{width: '92%'}} />
              </div>
            </div>

            <div className="floating-card floating-card-2 absolute left-1/2 -translate-x-1/2 -top-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4 text-left text-white shadow-2xl w-52">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-6 w-6 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Check className="h-3.5 w-3.5 text-green-400" />
                </div>
                <span className="text-sm font-medium">Interview Scheduled</span>
              </div>
              <div className="text-xs text-white/60 mt-1">Tomorrow at 2:00 PM</div>
            </div>

            <div className="floating-card floating-card-3 absolute left-1/2 translate-x-[20%] top-0 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4 text-left text-white shadow-2xl w-52">
              <div className="text-xs text-white/60 mb-1">Match Found</div>
              <div className="text-2xl font-bold text-green-300 mb-2">98%</div>
              <div className="w-full bg-white/10 rounded-full h-2">
                <div className="bg-gradient-to-r from-blue-400 to-purple-400 h-2 rounded-full" style={{width: '98%'}} />
              </div>
              <div className="text-xs text-white/50 mt-1">Confidence Score</div>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 rounded-full border-2 border-white/30 flex justify-center pt-2">
            <div className="w-1 h-2.5 bg-white/50 rounded-full animate-scroll-dot" />
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="py-16 px-4 bg-slate-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-900/20 via-purple-900/20 to-blue-900/20" />
        <div className="relative max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { stat: stats[0], suffix: '+', label: 'Companies' },
              { stat: stats[1], suffix: '+', label: 'Candidates Processed' },
              { stat: stats[2], suffix: '%', label: 'Accuracy Rate' },
              { stat: stats[3], suffix: 'x', label: 'Faster Hiring' },
            ].map((item, i) => (
              <div key={i} ref={item.stat.ref} className="text-center">
                <p className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white">
                  {item.stat.count.toLocaleString()}{item.suffix}
                </p>
                <p className="text-slate-400 mt-2 text-sm font-medium">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 fade-in-section" ref={useFadeIn()}>
            <p className="text-sm font-semibold text-blue-600 tracking-wide uppercase mb-3">
              Features
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Why AI-ROS?
            </h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              Powered by AI, designed for humans. A complete platform from sourcing to offer.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => {
              const FeatureIcon = feature.icon;
              return (
                <div
                  key={i}
                  className="group bg-white rounded-2xl p-7 border border-gray-100 hover:border-gray-200 transition-all duration-300 hover:shadow-xl hover:shadow-gray-200/50 hover:-translate-y-1 cursor-default fade-in-section"
                  ref={useFadeIn()}
                >
                  <div
                    className={`h-12 w-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-5 shadow-lg group-hover:scale-110 transition-transform duration-300`}
                  >
                    <FeatureIcon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="about" className="py-24 px-4 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 fade-in-section" ref={useFadeIn()}>
            <p className="text-sm font-semibold text-blue-600 tracking-wide uppercase mb-3">
              How It Works
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Three steps to autonomous hiring
            </h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              Go from job description to top candidate in minutes, not weeks.
            </p>
          </div>

          <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Connecting line */}
            <div className="hidden md:block absolute top-16 left-[20%] right-[20%] h-0.5 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 opacity-20" />

            {[
              {
                num: '01',
                title: 'Upload & Configure',
                desc: 'Add your job descriptions, requirements, and evaluation criteria in minutes.',
                icon: ArrowUpRight,
              },
              {
                num: '02',
                title: 'AI Takes Over',
                desc: 'Our agents screen, interview, and evaluate candidates autonomously.',
                icon: Bot,
              },
              {
                num: '03',
                title: 'Review & Hire',
                desc: 'Review AI recommendations, compare candidates, and make informed decisions.',
                icon: Check,
              },
            ].map((step, i) => {
              const StepIcon = step.icon;
              return (
                <div key={i} className="relative text-center fade-in-section" ref={useFadeIn()}>
                  <div className="relative z-10 mx-auto mb-6">
                    <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center mx-auto shadow-lg shadow-blue-500/20">
                      <StepIcon className="h-7 w-7 text-white" />
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 text-xs font-bold px-2.5 py-1 rounded-full mb-3">
                    Step {step.num}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{step.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed max-w-xs mx-auto">{step.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 fade-in-section" ref={useFadeIn()}>
            <p className="text-sm font-semibold text-blue-600 tracking-wide uppercase mb-3">
              Testimonials
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Trusted by Leading Teams
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <div
                key={i}
                className="relative rounded-2xl p-[1px] fade-in-section"
                ref={useFadeIn()}
              >
                {/* Gradient border */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-blue-500/20" />
                <div className="relative bg-white rounded-2xl p-7 h-full">
                  <div className="flex gap-1 mb-4">
                    {Array.from({ length: t.rating }).map((_, j) => (
                      <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-gray-600 text-sm leading-relaxed mb-6">
                    &ldquo;{t.content}&rdquo;
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-bold">
                      {t.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                      <p className="text-xs text-gray-500">{t.role}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 fade-in-section" ref={useFadeIn()}>
            <p className="text-sm font-semibold text-blue-600 tracking-wide uppercase mb-3">
              Pricing
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-lg text-gray-500">Start free, scale as you grow</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {pricingTiers.map((tier, i) => (
              <div
                key={i}
                className={`relative rounded-2xl transition-all duration-300 ${
                  tier.popular
                    ? 'shadow-xl shadow-blue-500/10 scale-[1.02]'
                    : 'hover:shadow-lg'
                } fade-in-section`}
                ref={useFadeIn()}
              >
                {tier.popular && (
                  <>
                    <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-br from-blue-500 via-purple-500 to-blue-500" />
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
                      <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-white text-xs font-semibold px-4 py-1 rounded-full shadow-lg">
                        Most Popular
                      </span>
                    </div>
                  </>
                )}
                <div className={`relative bg-white rounded-2xl p-8 h-full ${
                  tier.popular ? '' : 'border border-gray-200'
                }`}>
                  <h3 className="text-xl font-bold text-gray-900">{tier.name}</h3>
                  <p className="text-gray-400 text-sm mt-1">{tier.description}</p>
                  <div className="mt-5 mb-7">
                    <span className="text-4xl font-bold text-gray-900">{tier.price}</span>
                    {tier.period && (
                      <span className="text-gray-400 text-sm">{tier.period}</span>
                    )}
                  </div>
                  <ul className="space-y-3 mb-8">
                    {tier.features.map((feature, j) => (
                      <li key={j} className="flex items-start gap-2.5 text-sm text-gray-600">
                        <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/register"
                    className={`block w-full py-3 rounded-xl font-semibold text-center text-sm transition-all ${
                      tier.popular
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 shadow-lg shadow-blue-500/25'
                        : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                    }`}
                  >
                    {tier.cta}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="relative rounded-2xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-purple-600 to-blue-800" />
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] opacity-40" />
            <div className="relative p-12 md:p-16 text-center">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Ready to Transform Your Hiring?
              </h2>
              <p className="text-white/70 text-lg mb-8 max-w-xl mx-auto">
                Join 500+ companies already using AI-ROS to hire smarter, faster, and fairer.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                <input
                  type="email"
                  placeholder="Enter your email"
                  className="flex-1 px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/50 focus:outline-none focus:border-white/40 focus:bg-white/15 transition-all"
                />
                <button className="px-6 py-3 bg-white text-gray-900 rounded-xl font-semibold hover:bg-gray-100 transition-all shadow-xl inline-flex items-center justify-center gap-2">
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              <p className="text-white/40 text-xs mt-4">No credit card required. Free 14-day trial.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <span className="text-lg font-bold text-white">AI-ROS</span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">
                AI-native recruitment platform for modern teams.
              </p>
              <div className="flex items-center gap-4 mt-4">
                {['Twitter', 'LinkedIn', 'GitHub'].map((social) => (
                  <a
                    key={social}
                    href="#"
                    className="text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {social === 'Twitter' && (
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                    )}
                    {social === 'LinkedIn' && (
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                    )}
                    {social === 'GitHub' && (
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
                    )}
                  </a>
                ))}
              </div>
            </div>
            {Object.entries(footerLinks).map(([category, links]) => (
              <div key={category}>
                <h4 className="text-sm font-semibold text-white mb-4">{category}</h4>
                <ul className="space-y-2.5">
                  {links.map((link) => (
                    <li key={link}>
                      <a
                        href="#"
                        className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-sm text-gray-500">&copy; 2026 AI-ROS. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <a href="#" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Privacy</a>
              <a href="#" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Terms</a>
              <a href="#" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Cookies</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
