'use client';

import { useState, useEffect } from 'react';
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
  ChevronRight,
  Star,
  Shield,
  Lock,
  ArrowUpRight,
} from 'lucide-react';

const features = [
  {
    icon: Bot,
    title: 'AI-Powered Screening',
    description:
      'Automated candidate evaluation with multi-dimensional scoring, explainable reasoning, and bias detection built in.',
    color: 'from-blue-500 to-blue-600',
  },
  {
    icon: Code2,
    title: 'Pair Programming Interviews',
    description:
      'Live collaborative coding sessions with real-time AI evaluation, progressive hints, and automated scoring.',
    color: 'from-purple-500 to-purple-600',
  },
  {
    icon: Target,
    title: 'Smart Matching',
    description:
      'Semantic candidate-job matching using embeddings, skill graphs, and AI-ranked recommendations.',
    color: 'from-green-500 to-green-600',
  },
  {
    icon: Zap,
    title: 'Workflow Automation',
    description:
      'No-code workflow builder with event-driven triggers, approval chains, and conditional routing.',
    color: 'from-amber-500 to-orange-500',
  },
  {
    icon: BarChart3,
    title: 'Real-time Analytics',
    description:
      'Live dashboards with hiring metrics, AI performance tracking, and predictive workforce analytics.',
    color: 'from-rose-500 to-red-500',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description:
      'SOC 2 Type II compliant with end-to-end encryption, RBAC, audit logs, and data residency controls.',
    color: 'from-teal-500 to-cyan-500',
  },
];

const testimonials = [
  {
    name: 'Sarah Chen',
    role: 'VP of People, TechScale',
    content:
      'AI-ROS cut our time-to-hire from 42 days to 12. The pair programming interviews are a game changer for evaluating engineering talent.',
    rating: 5,
  },
  {
    name: 'Marcus Rivera',
    role: 'Head of Recruiting, DataFlow',
    content:
      'The AI matching is eerily accurate. We went from 200+ manual resume reviews per hire to letting the system surface the top 5 candidates automatically.',
    rating: 5,
  },
  {
    name: 'Emily Nakamura',
    role: 'CTO, CloudBridge',
    content:
      'The analytics alone justified the ROI. We can now see exactly where candidates drop off and optimize our process with data, not guesswork.',
    rating: 5,
  },
];

const pricingTiers = [
  {
    name: 'Starter',
    price: '$99',
    period: '/mo',
    description: 'For small teams getting started',
    features: [
      'Up to 50 candidates/month',
      'AI-powered screening',
      'Basic analytics',
      'Email support',
      '1 team member',
    ],
    cta: 'Start Free Trial',
    popular: false,
  },
  {
    name: 'Professional',
    price: '$299',
    period: '/mo',
    description: 'For growing recruitment teams',
    features: [
      'Unlimited candidates',
      'Pair programming interviews',
      'Advanced analytics & reports',
      'Priority support',
      'Up to 10 team members',
      'Custom workflows',
      'API access',
    ],
    cta: 'Start Free Trial',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For large organizations',
    features: [
      'Everything in Professional',
      'Unlimited team members',
      'Dedicated account manager',
      'Custom integrations',
      'SLA guarantee',
      'On-premise deployment',
      'Advanced security & compliance',
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

export default function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
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
              <span className="text-lg font-bold text-gray-900">AI-ROS</span>
            </div>

            <div className="hidden md:flex items-center gap-8">
              <a
                href="#features"
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                Features
              </a>
              <a
                href="#testimonials"
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                Testimonials
              </a>
              <a
                href="#pricing"
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                Pricing
              </a>
              <Link
                href="/login"
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg font-medium hover:bg-gray-800 transition-colors"
              >
                Get Started
              </Link>
            </div>

            <button
              className="md:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 shadow-lg">
            <div className="px-4 py-4 space-y-1">
              <a
                href="#features"
                className="block px-3 py-2.5 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                Features
              </a>
              <a
                href="#testimonials"
                className="block px-3 py-2.5 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                Testimonials
              </a>
              <a
                href="#pricing"
                className="block px-3 py-2.5 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                Pricing
              </a>
              <Link
                href="/login"
                className="block px-3 py-2.5 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="block px-3 py-2.5 text-sm text-white bg-gray-900 rounded-lg font-medium text-center"
                onClick={() => setMobileMenuOpen(false)}
              >
                Get Started
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 sm:pt-40 sm:pb-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] opacity-40" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 text-white px-4 py-1.5 rounded-full text-sm font-medium mb-8">
            <span className="h-1.5 w-1.5 bg-green-400 rounded-full animate-pulse" />
            Now powered by GPT-4o &amp; Claude
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold text-white mb-6 leading-tight tracking-tight">
            AI-Native Recruitment
            <br />
            Operating System
          </h1>

          <p className="text-lg sm:text-xl text-blue-100 mb-10 max-w-2xl mx-auto leading-relaxed">
            Autonomous AI agents that screen, interview, and match candidates — so your team can
            focus on building relationships, not reviewing resumes.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="px-8 py-3.5 bg-white text-gray-900 rounded-lg font-semibold hover:bg-gray-100 transition-all inline-flex items-center justify-center gap-2 shadow-xl"
            >
              Start Free Trial
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#features"
              className="px-8 py-3.5 border-2 border-white/30 text-white rounded-lg font-semibold hover:bg-white/10 transition-all inline-flex items-center justify-center"
            >
              Watch Demo
            </a>
          </div>

          <div className="mt-12 flex flex-wrap justify-center gap-6 text-sm text-blue-100">
            {['Free 14-day trial', 'No credit card required', 'Cancel anytime'].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-300" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-blue-600 tracking-wide uppercase mb-3">
              Features
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Everything you need to hire better
            </h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              Powered by AI, designed for humans. A complete platform from sourcing to offer.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <div
                key={i}
                className="group bg-white rounded-xl p-7 border border-gray-200 hover:border-gray-300 transition-all hover:shadow-lg"
              >
                <div
                  className={`h-11 w-11 rounded-lg bg-gradient-to-br ${feature.color} flex items-center justify-center mb-5 shadow-lg`}
                >
                  <feature.icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 px-4 bg-gray-50 border-y border-gray-100">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-8 text-center">
            {[
              { value: '500+', label: 'Companies' },
              { value: '50K+', label: 'Candidates Processed' },
              { value: '95%', label: 'Matching Accuracy' },
            ].map((stat, i) => (
              <div key={i}>
                <p className="text-4xl sm:text-5xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-gray-500 mt-2 text-sm font-medium">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-blue-600 tracking-wide uppercase mb-3">
              Testimonials
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Trusted by hiring teams worldwide
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <div
                key={i}
                className="bg-white rounded-xl p-7 border border-gray-200 hover:shadow-lg transition-all"
              >
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
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-blue-600 tracking-wide uppercase mb-3">
              Pricing
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Simple, transparent pricing
            </h2>
            <p className="text-lg text-gray-500">Start free, scale as you grow</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {pricingTiers.map((tier, i) => (
              <div
                key={i}
                className={`bg-white rounded-xl p-8 border-2 transition-all ${
                  tier.popular
                    ? 'border-blue-600 shadow-xl shadow-blue-500/10 relative'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-blue-600 text-white text-xs font-semibold px-4 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}
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
                  className={`block w-full py-2.5 rounded-lg font-semibold text-center text-sm transition-all ${
                    tier.popular
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  {tier.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-12 md:p-16 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Ready to transform your hiring?
            </h2>
            <p className="text-gray-300 text-lg mb-8">
              Join 500+ companies using AI-ROS to hire smarter, faster, and fairer.
            </p>
            <Link
              href="/register"
              className="px-8 py-3.5 bg-white text-gray-900 rounded-lg font-semibold hover:bg-gray-100 transition-all inline-flex items-center gap-2 shadow-xl"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </Link>
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
              <a href="#" className="text-gray-500 hover:text-gray-300 transition-colors">
                Twitter
              </a>
              <a href="#" className="text-gray-500 hover:text-gray-300 transition-colors">
                LinkedIn
              </a>
              <a href="#" className="text-gray-500 hover:text-gray-300 transition-colors">
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
