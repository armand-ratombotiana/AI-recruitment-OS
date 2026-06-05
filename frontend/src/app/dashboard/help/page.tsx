'use client';

import { useState } from 'react';
import {
  HelpCircle,
  Search,
  BookOpen,
  MessageCircle,
  Mail,
  ExternalLink,
  FileText,
  Send,
  Clock,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Shield,
  Zap,
  Users,
  Briefcase,
  Calendar,
  Star,
  Inbox,
  Loader2,
  Video,
  ArrowRight,
} from 'lucide-react';
import { api } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  EmptyState,
  Breadcrumb,
  useToast,
} from '@/components';

const TOPICS = [
  { icon: Sparkles, title: 'Getting started with AI-ROS', desc: 'Set up your first AI agent in under 5 minutes.', color: 'from-blue-500 to-indigo-500' },
  { icon: Users, title: 'Managing candidates', desc: 'Import, tag, and move candidates through your pipeline.', color: 'from-purple-500 to-pink-500' },
  { icon: Briefcase, title: 'Posting jobs', desc: 'Create roles that attract the right talent automatically.', color: 'from-amber-500 to-orange-500' },
  { icon: Calendar, title: 'Scheduling interviews', desc: 'Sync with Google, Outlook, or your own calendar.', color: 'from-emerald-500 to-teal-500' },
  { icon: Shield, title: 'Security and compliance', desc: 'SSO, audit trails, GDPR, and data residency.', color: 'from-rose-500 to-red-500' },
  { icon: Zap, title: 'AI workflows and automation', desc: 'Build custom triggers, conditions, and actions.', color: 'from-cyan-500 to-sky-500' },
];

const FAQ = [
  { q: 'How do I invite my team?', a: 'Go to Settings then Team, click Invite member. You can assign roles and they will receive an email with a magic-link signup. SSO is also available on the Pro and Enterprise plans.' },
  { q: 'Can I import candidates from my existing ATS?', a: 'Yes. Use Settings then Integrations to connect Greenhouse, Lever, Workable, or upload a CSV directly. Our parser handles LinkedIn exports, resume PDFs, and bulk imports up to 10,000 rows at once.' },
  { q: 'How accurate is the AI matching?', a: 'Our matching engine achieves 95% accuracy on technical roles with at least 50 historical hires. Accuracy improves over time as the model learns from your hiring decisions.' },
  { q: 'Is my data GDPR compliant?', a: 'Yes. AI-ROS is GDPR, CCPA, and SOC 2 Type II compliant. You can export or permanently delete candidate data on request.' },
  { q: 'What languages does the AI support?', a: 'The AI agents work in 95+ languages for candidate evaluation. The dashboard UI is currently available in English, French, and Spanish.' },
  { q: 'How do I cancel my subscription?', a: 'You can cancel anytime from Settings then Billing. No questions asked, no cancellation fees. Your data is retained for 90 days after cancellation.' },
];

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'info' | 'success' | 'warning' | 'danger' }> = {
  open: { label: 'Open', variant: 'info' },
  pending: { label: 'Pending', variant: 'warning' },
  in_progress: { label: 'In progress', variant: 'info' },
  resolved: { label: 'Resolved', variant: 'success' },
  closed: { label: 'Closed', variant: 'default' },
};

function formatRelative(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  if (days < 7) return days + 'd ago';
  return d.toLocaleDateString();
}

export default function HelpPage() {
  const { push, ToastContainer } = useToast();
  const [search, setSearch] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [submitting, setSubmitting] = useState(false);
  const [tickets, setTickets] = useState<any[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [contactForm, setContactForm] = useState({ subject: '', message: '', priority: 'normal' });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const filteredFaq = search
    ? FAQ.filter((item) => item.q.toLowerCase().includes(search.toLowerCase()) || item.a.toLowerCase().includes(search.toLowerCase()))
    : FAQ;

  const loadTickets = async () => {
    setTicketsLoading(true);
    try {
      const d: any = await api.listSupportTickets();
      const items = Array.isArray(d) ? d : d?.data || d?.items || [];
      setTickets(items.slice(0, 5));
    } catch {
      setTickets([]);
    } finally {
      setTicketsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.subject.trim() || !contactForm.message.trim()) {
      setSubmitError('Please fill in all fields');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.createSupportTicket({
        subject: contactForm.subject,
        message: contactForm.message,
        priority: contactForm.priority,
      });
      push('success', 'Ticket submitted - we will reply within 24 hours');
      setContactForm({ subject: '', message: '', priority: 'normal' });
      await loadTickets();
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to submit ticket');
      push('error', 'Could not submit ticket');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <ToastContainer />
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <HelpCircle className="h-6 w-6 text-blue-600" />
          Help and Support
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Find answers, learn the platform, or reach our team.</p>
      </div>

      <Breadcrumb />

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search help articles, guides, and FAQs..."
          className="w-full pl-11 pr-4 py-3.5 text-sm bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
          aria-label="Search help"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Popular topics</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TOPICS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.title}
                onClick={() => push('info', 'Opening guide: ' + t.title)}
                className="text-left p-5 bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition group"
              >
                <div className={'h-10 w-10 rounded-lg bg-gradient-to-br ' + t.color + ' flex items-center justify-center text-white mb-3'}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="font-semibold text-gray-900 dark:text-white text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400">{t.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{t.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Frequently asked questions</CardTitle>
          <CardDescription>Quick answers to the things teams ask us most.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {filteredFaq.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">No matches for "{search}"</p>
          ) : (
            filteredFaq.map((item, i) => {
              const open = openFaq === i;
              return (
                <div
                  key={item.q}
                  className={'rounded-lg border transition-colors ' + (open ? 'border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-900/10' : 'border-gray-200 dark:border-gray-800')}
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? null : i)}
                    aria-expanded={open}
                    aria-controls={'faq-content-' + i}
                    className="w-full flex items-center justify-between gap-3 p-4 text-left"
                  >
                    <span className="font-medium text-sm text-gray-900 dark:text-white">{item.q}</span>
                    {open ? <ChevronUp className="h-4 w-4 text-gray-500 dark:text-gray-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400 shrink-0" />}
                  </button>
                  {open && (
                    <div id={'faq-content-' + i} className="px-4 pb-4 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle as="h2">Contact support</CardTitle>
            <CardDescription>We typically respond within 24 hours on business days.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3" noValidate>
              <div>
                <label htmlFor="ticket-subject" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Subject</label>
                <input
                  id="ticket-subject"
                  type="text"
                  required
                  value={contactForm.subject}
                  onChange={(e) => setContactForm((f) => ({ ...f, subject: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="What do you need help with?"
                />
              </div>
              <div>
                <label htmlFor="ticket-message" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Message</label>
                <textarea
                  id="ticket-message"
                  required
                  rows={5}
                  value={contactForm.message}
                  onChange={(e) => setContactForm((f) => ({ ...f, message: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                  placeholder="Describe your issue, including steps to reproduce if applicable."
                />
              </div>
              <div>
                <label htmlFor="ticket-priority" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Priority</label>
                <select
                  id="ticket-priority"
                  value={contactForm.priority}
                  onChange={(e) => setContactForm((f) => ({ ...f, priority: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="low">Low - General question</option>
                  <option value="normal">Normal - Issue affecting work</option>
                  <option value="high">High - Major impact</option>
                  <option value="urgent">Urgent - System down</option>
                </select>
              </div>
              {submitError && (
                <div role="alert" className="p-2.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  {submitError}
                </div>
              )}
              <Button
                type="submit"
                variant="primary"
                loading={submitting}
                fullWidth
                leftIcon={submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              >
                {submitting ? 'Submitting...' : 'Submit ticket'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                <Mail className="h-4 w-4 text-blue-600" />
                Email
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">support@airos.io</p>
              <p className="text-[10px] text-gray-400 mt-0.5">For non-urgent issues</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-purple-600" />
                Live chat
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Available 9am-6pm UTC, Mon-Fri</p>
              <Button size="sm" variant="secondary" className="mt-2" leftIcon={<MessageCircle className="h-3.5 w-3.5" />}>Start chat</Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-emerald-600" />
                Documentation
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Guides, API reference, tutorials</p>
              <Button size="sm" variant="ghost" className="mt-2" rightIcon={<ExternalLink className="h-3.5 w-3.5" />}>Open docs</Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                <Shield className="h-4 w-4 text-amber-600" />
                Status page
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-green-500" /> All systems operational
              </p>
              <Button size="sm" variant="ghost" className="mt-2" rightIcon={<ExternalLink className="h-3.5 w-3.5" />}>View status</Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Inbox className="h-4 w-4 text-gray-400" aria-hidden="true" />
              Recent support tickets
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Track the status of tickets you have opened.</p>
          </div>
          <Button size="sm" variant="ghost" rightIcon={<ArrowRight className="h-3.5 w-3.5" />} onClick={loadTickets}>
            Refresh
          </Button>
        </div>

        {ticketsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} height={80} />)}
          </div>
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-10 w-10" />}
            title="No tickets yet"
            description="When you submit a support ticket, it will show up here so you can track its status."
          />
        ) : (
          <div className="space-y-2">
            {tickets.map((t: any) => {
              const statusKey = (t.status || 'open').toLowerCase();
              const status = STATUS_CONFIG[statusKey] || STATUS_CONFIG.open;
              return (
                <Card key={t.id}>
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-gray-900 dark:text-white truncate">
                        #{(t.id?.slice(0, 8) || 'ticket')} - {t.subject || 'Untitled'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{t.message}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ' + (
                        status.variant === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        status.variant === 'warning' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                        status.variant === 'info' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                        'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                      )}>
                        {status.label}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatRelative(t.created_at || t.updated_at || new Date().toISOString())}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Quick links</CardTitle>
          <CardDescription>Jump straight to common resources.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[
              { icon: BookOpen, label: 'Documentation', href: '/docs' },
              { icon: Video, label: 'Video tutorials', href: '/docs/videos' },
              { icon: Users, label: 'Community', href: '/community' },
              { icon: Shield, label: 'Status page', href: '/status' },
              { icon: FileText, label: 'Changelog', href: '/changelog' },
              { icon: Mail, label: 'Contact sales', href: '/contact' },
              { icon: Star, label: 'Roadmap', href: '/roadmap' },
              { icon: Sparkles, label: 'API reference', href: '/docs/api' },
            ].map((l) => {
              const Icon = l.icon;
              return (
                <a
                  key={l.label}
                  href={l.href}
                  onClick={(e) => { e.preventDefault(); push('info', 'Opening ' + l.label); }}
                  className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition group"
                >
                  <Icon className="h-4 w-4 text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400" aria-hidden="true" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">{l.label}</span>
                  <ArrowRight className="h-3 w-3 text-gray-300 dark:text-gray-600 ml-auto opacity-0 group-hover:opacity-100 transition" />
                </a>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
