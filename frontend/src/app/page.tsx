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
  ChevronDown,
  ChevronUp,
  Mail,
  Twitter,
  Linkedin,
  Github,
  Sparkles,
  Globe,
  Activity,
} from 'lucide-react';

const TRUSTED_BY = [
  'TechScale', 'DataFlow', 'CloudBridge', 'NexusAI', 'QuantumHR', 'Velocity',
];

const features = [
  {
    icon: Bot,
    title: 'AI Screening',
    description: 'Autonomous agents screen and evaluate candidates 24/7 with multi-dimensional scoring and bias detection.',
    color: 'from-blue-500 to-blue-600',
  },
  {
    icon: Code2,
    title: 'Live Coding',
    description: 'Real-time pair programming interviews with AI evaluation, progressive hints, and automated scoring.',
    color: 'from-purple-500 to-purple-600',
  },
  {
    icon: Target,
    title: 'Smart Matching',
    description: 'ML-powered candidate-job matching with explainable scores using embeddings and skill graphs.',
    color: 'from-green-500 to-emerald-600',
  },
  {
    icon: Workflow,
    title: 'Workflow Engine',
    description: 'Automate your entire hiring pipeline with visual workflows, event-driven triggers, and approval chains.',
    color: 'from-amber-500 to-orange-500',
  },
  {
    icon: BarChart3,
    title: 'Analytics',
    description: 'Real-time insights into recruitment metrics, AI performance tracking, and predictive workforce analytics.',
    color: 'from-rose-500 to-red-500',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description: 'SOC2 compliant with SSO, role-based access, end-to-end encryption, and audit logs.',
    color: 'from-teal-500 to-cyan-500',
  },
];

const testimonials = [
  {
    name: 'Sarah Chen',
    role: 'VP of People',
    company: 'TechScale',
    initials: 'SC',
    color: 'from-blue-500 to-cyan-500',
    content: 'AI-ROS cut our time-to-hire from 42 days to 12. The autonomous screening is a game changer — we finally eliminated resume bottlenecks and our hiring managers focus on culture fit, not paperwork.',
    rating: 5,
    metrics: { value: '71%', label: 'faster hiring' },
  },
  {
    name: 'Marcus Rivera',
    role: 'Head of Recruiting',
    company: 'DataFlow',
    initials: 'MR',
    color: 'from-purple-500 to-pink-500',
    content: 'The AI matching is eerily accurate. We went from 200+ manual reviews per hire to letting the system surface the top 5 candidates automatically. Quality of hire is up 40%.',
    rating: 5,
    metrics: { value: '40%', label: 'better quality' },
  },
  {
    name: 'Emily Nakamura',
    role: 'CTO',
    company: 'CloudBridge',
    initials: 'EN',
    color: 'from-amber-500 to-orange-500',
    content: 'The analytics alone justified the ROI. We can see exactly where candidates drop off and optimize with data, not guesswork. Our funnel is now a science, not an art.',
    rating: 5,
    metrics: { value: '4.9x', label: 'ROI in Q1' },
  },
];

const pricingTiers = [
  {
    name: 'Starter',
    price: { monthly: 99, yearly: 79 },
    period: 'mo',
    description: '100 candidates, 3 users, basic AI',
    features: [
      '100 candidates / month',
      '3 team members',
      'AI-powered screening',
      'Basic analytics',
      'Email support',
      '5 active jobs',
    ],
    cta: 'Start Free Trial',
    popular: false,
  },
  {
    name: 'Professional',
    price: { monthly: 299, yearly: 239 },
    period: 'mo',
    description: '500 candidates, 10 users, advanced AI',
    features: [
      '500 candidates / month',
      '10 team members',
      'Advanced AI matching',
      'Live coding interviews',
      'Priority support',
      'Advanced analytics',
      'Custom workflows',
      'Unlimited active jobs',
    ],
    cta: 'Start Free Trial',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: { monthly: 'Custom', yearly: 'Custom' },
    period: '',
    description: 'Unlimited everything',
    features: [
      'Unlimited candidates',
      'Unlimited team members',
      'Custom AI models',
      'Dedicated success manager',
      'SSO & RBAC',
      'API access & webhooks',
      'SLA guarantee',
      'On-premise option',
    ],
    cta: 'Contact Sales',
    popular: false,
  },
];

const COMPARISON = [
  { feature: 'Candidate screening', starter: true, pro: true, ent: true },
  { feature: 'AI matching', starter: 'Basic', pro: 'Advanced', ent: 'Custom models' },
  { feature: 'Live coding interviews', starter: false, pro: true, ent: true },
  { feature: 'Custom workflows', starter: false, pro: true, ent: true },
  { feature: 'API access', starter: false, pro: 'Read-only', ent: 'Full' },
  { feature: 'SSO / SAML', starter: false, pro: false, ent: true },
  { feature: 'Dedicated support', starter: false, pro: false, ent: true },
  { feature: 'SLA guarantee', starter: false, pro: false, ent: '99.9%' },
];

const FAQ = [
  {
    q: 'How does AI-ROS actually screen candidates?',
    a: 'Our multi-agent system reads resumes, evaluates code samples, conducts asynchronous interviews, and cross-references job requirements using embeddings and skill graphs. Every candidate gets an explainable score with the top 3 reasons why.',
  },
  {
    q: 'Is my data secure?',
    a: 'Absolutely. AI-ROS is SOC2 Type II certified, GDPR compliant, and uses end-to-end encryption. Your data is processed in isolated environments and never used to train shared models.',
  },
  {
    q: 'Can I integrate with my existing ATS?',
    a: 'Yes. We have native integrations with Greenhouse, Lever, Workday, and BambooHR. We also offer a full REST API and webhooks for custom integrations.',
  },
  {
    q: 'How long does setup take?',
    a: 'Most teams are up and running in under 30 minutes. Our AI agents learn your hiring patterns from day one and improve over time. We also offer white-glove onboarding for Enterprise plans.',
  },
  {
    q: 'What if I want to cancel?',
    a: 'Cancel anytime, no questions asked. Your data is exportable in CSV or JSON at any point. We believe in earning your business every month.',
  },
  {
    q: 'Do you offer a free trial?',
    a: 'Yes — 14 days, full access to all Professional features, no credit card required. You can downgrade or cancel at any time during the trial.',
  },
];

const footerLinks = {
  Product: ['Features', 'Pricing', 'Integrations', 'API Docs', 'Changelog', 'Status'],
  Company: ['About', 'Blog', 'Careers', 'Press Kit', 'Partners', 'Contact'],
  Resources: ['Documentation', 'Help Center', 'Community', 'Webinars', 'Case Studies', 'Templates'],
  Legal: ['Privacy Policy', 'Terms of Service', 'Cookie Policy', 'GDPR', 'Security', 'DPA'],
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
            else setCount(end);
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

function FadeInSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.unobserve(entry.target); } },
      { threshold: 0.1 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`${className} transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
      {children}
    </div>
  );
}

export default function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

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

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setSubscribed(true);
      setEmail('');
      setTimeout(() => setSubscribed(false), 4000);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <nav
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'bg-white/95 backdrop-blur-xl border-b border-gray-100 shadow-sm'
            : 'bg-transparent'
        }`}
        role="navigation"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-105 transition">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <span className={`text-lg font-bold transition-colors duration-300 ${scrolled ? 'text-gray-900' : 'text-white'}`}>
                AI-ROS
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-8">
              {[
                { label: 'Features', href: '#features' },
                { label: 'How it works', href: '#how' },
                { label: 'Pricing', href: '#pricing' },
                { label: 'FAQ', href: '#faq' },
              ].map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className={`text-sm transition-colors duration-300 link-underline ${
                    scrolled ? 'text-gray-600 hover:text-gray-900' : 'text-white/80 hover:text-white'
                  }`}
                >
                  {item.label}
                </a>
              ))}
              <Link
                href="/login"
                className={`text-sm transition-colors duration-300 ${scrolled ? 'text-gray-600 hover:text-gray-900' : 'text-white/80 hover:text-white'}`}
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
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 shadow-lg animate-slide-down">
            <div className="px-4 py-4 space-y-1">
              {[
                { label: 'Features', href: '#features' },
                { label: 'How it works', href: '#how' },
                { label: 'Pricing', href: '#pricing' },
                { label: 'FAQ', href: '#faq' },
              ].map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="block px-3 py-2.5 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                </a>
              ))}
              <Link href="/login" className="block px-3 py-2.5 text-sm text-gray-600 hover:bg-gray-50 rounded-lg" onClick={() => setMobileMenuOpen(false)}>
                Sign In
              </Link>
              <Link href="/register" className="block px-3 py-2.5 text-sm text-white bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg font-medium text-center" onClick={() => setMobileMenuOpen(false)}>
                Get Started
              </Link>
            </div>
          </div>
        )}
      </nav>

      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 hero-gradient-bg">
          <div className="mesh-blob mesh-1" />
          <div className="mesh-blob mesh-2" />
          <div className="mesh-blob mesh-3" />
          <div className="mesh-blob mesh-4" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center pt-20">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 text-white px-4 py-1.5 rounded-full text-sm font-medium mb-8 animate-fade-in-up">
            <Sparkles className="h-3.5 w-3.5 text-yellow-300" />
            NEW: AI-Powered Recruitment v3.0
            <span className="h-1.5 w-1.5 bg-green-400 rounded-full animate-pulse" />
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-[1.1] tracking-tight animate-fade-in-up animation-delay-100">
            The Future of Hiring
            <br />
            <span className="bg-gradient-to-r from-blue-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">
              is Autonomous
            </span>
          </h1>

          <p className="text-base sm:text-lg lg:text-xl text-white/70 mb-10 max-w-2xl mx-auto leading-relaxed animate-fade-in-up animation-delay-200">
            AI-ROS deploys intelligent agents that screen candidates, conduct interviews, and make
            hiring decisions — so your team can focus on building.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12 animate-fade-in-up animation-delay-300">
            <Link
              href="/register"
              className="group px-8 py-3.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all inline-flex items-center justify-center gap-2 shadow-xl shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-105"
            >
              Start Free Trial
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition" />
            </Link>
            <a href="#how" className="px-8 py-3.5 border-2 border-white/30 text-white rounded-xl font-semibold hover:bg-white/10 transition-all inline-flex items-center justify-center gap-2">
              <Play className="h-4 w-4 fill-current" />
              See how it works
            </a>
          </div>

          <div className="text-xs text-white/50 animate-fade-in-up animation-delay-300 mb-12">
            <p>✓ No credit card required &nbsp; ✓ 14-day free trial &nbsp; ✓ Cancel anytime</p>
          </div>

          <div className="relative h-48 sm:h-64 animate-fade-in-up animation-delay-500">
            <div className="floating-card floating-card-1 absolute left-1/2 -translate-x-[120%] top-0 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4 text-left text-white shadow-2xl w-56">
              <div className="text-xs text-white/60 mb-1">Candidate Score</div>
              <div className="text-2xl font-bold mb-2">9.2<span className="text-sm font-normal text-white/60">/10</span></div>
              <div className="w-full bg-white/10 rounded-full h-2">
                <div className="bg-gradient-to-r from-green-400 to-emerald-400 h-2 rounded-full" style={{ width: '92%' }} />
              </div>
              <div className="text-xs text-white/50 mt-1.5">Top 3% of applicants</div>
            </div>

            <div className="floating-card floating-card-2 absolute left-1/2 -translate-x-1/2 -top-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4 text-left text-white shadow-2xl w-52">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-6 w-6 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Check className="h-3.5 w-3.5 text-green-400" />
                </div>
                <span className="text-sm font-medium">Interview Scheduled</span>
              </div>
              <div className="text-xs text-white/60 mt-1">Tomorrow at 2:00 PM</div>
              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-green-300">
                <span className="pulse-dot" /> Auto-scheduled by AI
              </div>
            </div>

            <div className="floating-card floating-card-3 absolute left-1/2 translate-x-[20%] top-0 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4 text-left text-white shadow-2xl w-52">
              <div className="text-xs text-white/60 mb-1">Match Found</div>
              <div className="text-2xl font-bold text-green-300 mb-2">98%</div>
              <div className="w-full bg-white/10 rounded-full h-2">
                <div className="bg-gradient-to-r from-blue-400 to-purple-400 h-2 rounded-full" style={{ width: '98%' }} />
              </div>
              <div className="text-xs text-white/50 mt-1">Confidence Score</div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce" aria-hidden="true">
          <div className="w-6 h-10 rounded-full border-2 border-white/30 flex justify-center pt-2">
            <div className="w-1 h-2.5 bg-white/50 rounded-full animate-scroll-dot" />
          </div>
        </div>
      </section>

      <section aria-label="Trusted by" className="py-12 px-4 bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-gray-400 mb-6">Trusted by innovative teams worldwide</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-6 items-center">
            {TRUSTED_BY.map((c) => (
              <div key={c} className="text-center text-gray-400 hover:text-gray-600 transition">
                <div className="text-lg sm:text-xl font-bold tracking-tight">{c}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

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
                <p className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white count-up">
                  {item.stat.count.toLocaleString()}{item.suffix}
                </p>
                <p className="text-slate-400 mt-2 text-sm font-medium">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <FadeInSection>
            <div className="text-center mb-16">
              <p className="text-sm font-semibold text-blue-600 tracking-wide uppercase mb-3">Features</p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">Why AI-ROS?</h2>
              <p className="text-lg text-gray-500 max-w-2xl mx-auto">Powered by AI, designed for humans. A complete platform from sourcing to offer.</p>
            </div>
          </FadeInSection>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => {
              const FeatureIcon = feature.icon;
              return (
                <FadeInSection key={i}>
                  <div className="group bg-white rounded-2xl p-7 border border-gray-100 hover:border-gray-200 transition-all duration-300 hover:shadow-xl hover:shadow-gray-200/50 hover:-translate-y-1 cursor-default h-full">
                    <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-5 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                      <FeatureIcon className="h-6 w-6 text-white" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                    <p className="text-gray-500 text-sm leading-relaxed">{feature.description}</p>
                  </div>
                </FadeInSection>
              );
            })}
          </div>
        </div>
      </section>

      <section id="how" className="py-24 px-4 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <FadeInSection>
            <div className="text-center mb-16">
              <p className="text-sm font-semibold text-blue-600 tracking-wide uppercase mb-3">How it works</p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">Three steps to autonomous hiring</h2>
              <p className="text-lg text-gray-500 max-w-2xl mx-auto">Go from job description to top candidate in minutes, not weeks.</p>
            </div>
          </FadeInSection>

          <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="hidden md:block absolute top-16 left-[20%] right-[20%] h-0.5 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 opacity-20" />

            {[
              { num: '01', title: 'Upload & configure', desc: 'Add your job descriptions, requirements, and evaluation criteria in minutes.', icon: ArrowUpRight },
              { num: '02', title: 'AI takes over', desc: 'Our agents screen, interview, and evaluate candidates autonomously.', icon: Bot },
              { num: '03', title: 'Review & hire', desc: 'Review AI recommendations, compare candidates, and make informed decisions.', icon: Check },
            ].map((step, i) => {
              const StepIcon = step.icon;
              return (
                <FadeInSection key={i}>
                  <div className="relative text-center h-full">
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
                </FadeInSection>
              );
            })}
          </div>

          <FadeInSection>
            <div className="mt-16 max-w-4xl mx-auto rounded-2xl overflow-hidden shadow-2xl border border-gray-200 bg-gradient-to-br from-slate-900 to-slate-800 aspect-video relative group cursor-pointer">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-20 w-20 rounded-full bg-white/10 backdrop-blur-md border-2 border-white/30 flex items-center justify-center group-hover:scale-110 transition">
                  <Play className="h-8 w-8 text-white fill-white ml-1" />
                </div>
              </div>
              <div className="absolute top-4 left-4 right-4 flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-red-500" />
                <div className="h-2 w-2 rounded-full bg-yellow-500" />
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <div className="ml-2 px-2 py-0.5 rounded bg-white/10 text-white/60 text-[10px] font-mono">airos.io/demo</div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
                <p className="text-white text-sm font-medium">Watch a 2-minute product tour</p>
                <p className="text-white/60 text-xs">See how Sarah hired 12 engineers in 2 weeks</p>
              </div>
            </div>
          </FadeInSection>
        </div>
      </section>

      <section id="testimonials" className="py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <FadeInSection>
            <div className="text-center mb-16">
              <p className="text-sm font-semibold text-blue-600 tracking-wide uppercase mb-3">Testimonials</p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">Trusted by leading teams</h2>
              <p className="text-lg text-gray-500">Real stories from real customers.</p>
            </div>
          </FadeInSection>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <FadeInSection key={i}>
                <div className="relative rounded-2xl p-[1px] h-full">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-blue-500/20" />
                  <div className="relative bg-white rounded-2xl p-7 h-full flex flex-col">
                    <div className="flex gap-1 mb-4" aria-label={`${t.rating} star rating`}>
                      {Array.from({ length: t.rating }).map((_, j) => (
                        <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <p className="text-gray-600 text-sm leading-relaxed mb-6 flex-1">&ldquo;{t.content}&rdquo;</p>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-full bg-gradient-to-br ${t.color} flex items-center justify-center text-white text-sm font-bold`}>
                          {t.initials}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                          <p className="text-xs text-gray-500">{t.role}, {t.company}</p>
                        </div>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-gray-100 flex items-center gap-2">
                      <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">{t.metrics.value}</span>
                      <span className="text-xs text-gray-500">{t.metrics.label}</span>
                    </div>
                  </div>
                </div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-24 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <FadeInSection>
            <div className="text-center mb-12">
              <p className="text-sm font-semibold text-blue-600 tracking-wide uppercase mb-3">Pricing</p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">Simple, transparent pricing</h2>
              <p className="text-lg text-gray-500 mb-8">Start free, scale as you grow</p>

              <div className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-full p-1 shadow-sm">
                <button
                  onClick={() => setBilling('monthly')}
                  className={`px-4 py-1.5 text-sm font-semibold rounded-full transition ${billing === 'monthly' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
                  aria-pressed={billing === 'monthly'}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBilling('yearly')}
                  className={`px-4 py-1.5 text-sm font-semibold rounded-full transition inline-flex items-center gap-1.5 ${billing === 'yearly' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
                  aria-pressed={billing === 'yearly'}
                >
                  Yearly
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${billing === 'yearly' ? 'bg-white/20 text-white' : 'bg-green-100 text-green-700'}`}>
                    -20%
                  </span>
                </button>
              </div>
            </div>
          </FadeInSection>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-12">
            {pricingTiers.map((tier, i) => {
              const price = billing === 'monthly' ? tier.price.monthly : tier.price.yearly;
              return (
                <FadeInSection key={i}>
                  <div className={`relative rounded-2xl transition-all duration-300 h-full ${tier.popular ? 'shadow-2xl shadow-blue-500/20 scale-[1.02]' : 'hover:shadow-lg'}`}>
                    {tier.popular && (
                      <>
                        <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-br from-blue-500 via-purple-500 to-blue-500" />
                        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
                          <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-white text-xs font-semibold px-4 py-1 rounded-full shadow-lg">Most Popular</span>
                        </div>
                      </>
                    )}
                    <div className={`relative bg-white rounded-2xl p-8 h-full flex flex-col ${tier.popular ? '' : 'border border-gray-200'}`}>
                      <h3 className="text-xl font-bold text-gray-900">{tier.name}</h3>
                      <p className="text-gray-400 text-sm mt-1">{tier.description}</p>
                      <div className="mt-5 mb-7">
                        <span className="text-4xl font-bold text-gray-900">
                          {typeof price === 'number' ? `$${price}` : price}
                        </span>
                        {typeof price === 'number' && (
                          <span className="text-gray-400 text-sm">/mo</span>
                        )}
                        {billing === 'yearly' && typeof price === 'number' && (
                          <p className="text-xs text-green-600 font-medium mt-1">Save 20% with annual billing</p>
                        )}
                      </div>
                      <ul className="space-y-3 mb-8 flex-1">
                        {tier.features.map((feature, j) => (
                          <li key={j} className="flex items-start gap-2.5 text-sm text-gray-600">
                            <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                      <Link
                        href={tier.cta === 'Contact Sales' ? '/register?plan=enterprise' : '/register'}
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
                </FadeInSection>
              );
            })}
          </div>

          <FadeInSection>
            <div className="max-w-5xl mx-auto bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                <h3 className="font-semibold text-gray-900">Compare plans</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-6 py-3 text-left font-semibold text-gray-600">Feature</th>
                      <th className="px-6 py-3 text-center font-semibold text-gray-600">Starter</th>
                      <th className="px-6 py-3 text-center font-semibold text-blue-600 bg-blue-50/50">Professional</th>
                      <th className="px-6 py-3 text-center font-semibold text-gray-600">Enterprise</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARISON.map((row, i) => (
                      <tr key={i} className="border-b border-gray-100 last:border-0">
                        <td className="px-6 py-3 text-gray-700">{row.feature}</td>
                        <td className="px-6 py-3 text-center text-gray-600">
                          {row.starter === true ? <Check className="h-4 w-4 text-green-500 mx-auto" /> : row.starter === false ? <span className="text-gray-300">—</span> : row.starter}
                        </td>
                        <td className="px-6 py-3 text-center text-gray-900 font-medium bg-blue-50/30">
                          {row.pro === true ? <Check className="h-4 w-4 text-green-500 mx-auto" /> : row.pro === false ? <span className="text-gray-300">—</span> : row.pro}
                        </td>
                        <td className="px-6 py-3 text-center text-gray-600">
                          {row.ent === true ? <Check className="h-4 w-4 text-green-500 mx-auto" /> : row.ent === false ? <span className="text-gray-300">—</span> : row.ent}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </FadeInSection>
        </div>
      </section>

      <section id="faq" className="py-24 px-4">
        <div className="max-w-3xl mx-auto">
          <FadeInSection>
            <div className="text-center mb-12">
              <p className="text-sm font-semibold text-blue-600 tracking-wide uppercase mb-3">FAQ</p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">Questions? We have answers</h2>
              <p className="text-lg text-gray-500">Everything you need to know to get started.</p>
            </div>
          </FadeInSection>

          <FadeInSection>
            <div className="space-y-3">
              {FAQ.map((item, i) => {
                const open = openFaq === i;
                return (
                  <div
                    key={i}
                    className={`rounded-xl border transition-all ${open ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200 bg-white'}`}
                  >
                    <button
                      onClick={() => setOpenFaq(open ? null : i)}
                      className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xl"
                      aria-expanded={open}
                      aria-controls={`faq-${i}`}
                    >
                      <span className="font-semibold text-gray-900">{item.q}</span>
                      {open ? <ChevronUp className="h-4 w-4 text-gray-500 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />}
                    </button>
                    {open && (
                      <div id={`faq-${i}`} className="px-5 pb-4 text-sm text-gray-600 leading-relaxed">
                        {item.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </FadeInSection>
        </div>
      </section>

      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto">
          <FadeInSection>
            <div className="relative rounded-2xl overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-purple-600 to-blue-800" />
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] opacity-40" />
              <div className="relative p-12 md:p-16 text-center">
                <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Ready to transform your hiring?</h2>
                <p className="text-white/70 text-lg mb-8 max-w-xl mx-auto">Join 500+ companies already using AI-ROS to hire smarter, faster, and fairer.</p>
                <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/50 focus:outline-none focus:border-white/40 focus:bg-white/15 transition-all"
                    />
                  </div>
                  <button type="submit" className="px-6 py-3 bg-white text-gray-900 rounded-xl font-semibold hover:bg-gray-100 transition-all shadow-xl inline-flex items-center justify-center gap-2">
                    {subscribed ? 'Sent!' : 'Get Started'}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </form>
                {subscribed && (
                  <p className="text-green-300 text-xs mt-3">✓ Check your inbox for the welcome email</p>
                )}
                <p className="text-white/40 text-xs mt-4">No credit card required. Free 14-day trial.</p>
              </div>
            </div>
          </FadeInSection>
        </div>
      </section>

      <footer className="bg-gray-900 text-gray-400">
        <div className="max-w-7xl mx-auto px-4 py-16">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-8 mb-12">
            <div className="col-span-2">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <span className="text-lg font-bold text-white">AI-ROS</span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed mb-4">AI-native recruitment platform for modern teams. Hire faster, fairer, smarter.</p>
              <div className="flex items-center gap-1 text-xs text-gray-500 mb-4">
                <span className="pulse-dot" /> All systems operational
              </div>
              <div className="flex items-center gap-4">
                <a href="#" aria-label="Twitter" className="text-gray-500 hover:text-gray-300 transition-colors">
                  <Twitter className="h-4 w-4" />
                </a>
                <a href="#" aria-label="LinkedIn" className="text-gray-500 hover:text-gray-300 transition-colors">
                  <Linkedin className="h-4 w-4" />
                </a>
                <a href="#" aria-label="GitHub" className="text-gray-500 hover:text-gray-300 transition-colors">
                  <Github className="h-4 w-4" />
                </a>
              </div>
            </div>
            {Object.entries(footerLinks).map(([category, links]) => (
              <div key={category}>
                <h4 className="text-sm font-semibold text-white mb-4">{category}</h4>
                <ul className="space-y-2.5">
                  {links.map((link) => (
                    <li key={link}>
                      <a href="#" className="text-sm text-gray-500 hover:text-gray-300 transition-colors link-underline">{link}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <p>&copy; 2026 AI-ROS. All rights reserved.</p>
              <button className="inline-flex items-center gap-1.5 hover:text-gray-300 transition">
                <Globe className="h-3.5 w-3.5" />
                English (US)
              </button>
            </div>
            <div className="flex items-center gap-6">
              <a href="#" className="text-sm text-gray-500 hover:text-gray-300 transition-colors link-underline">Privacy</a>
              <a href="#" className="text-sm text-gray-500 hover:text-gray-300 transition-colors link-underline">Terms</a>
              <a href="#" className="text-sm text-gray-500 hover:text-gray-300 transition-colors link-underline">Cookies</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
