'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Send,
  Check,
  X,
  PenTool,
  Calendar,
  DollarSign,
  Briefcase,
  User,
  Clock,
  Trash2,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  Badge,
  Skeleton,
  ErrorState,
  Breadcrumb,
  useToast,
  ConfirmDialog,
  Timeline,
} from '@/components';
import type { TimelineItem } from '@/components';
import { useLocaleStore, translate, formatDate } from '@/stores/locale-store';
import type { OfferTypes } from '@/services/api/types';

const STATUS_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'default' | 'danger' | 'purple'> = {
  draft: 'default',
  sent: 'info',
  accepted: 'success',
  declined: 'danger',
  expired: 'warning',
};

function SignaturePad({
  onSave,
  onCancel,
  locale,
}: {
  onSave: (data: string) => void;
  onCancel: () => void;
  locale: any;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  const getCtx = useCallback(() => {
    return canvasRef.current?.getContext('2d') ?? null;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx) return;
    setDrawing(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing) return;
    const ctx = getCtx();
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasContent(true);
  };

  const endDraw = () => {
    setDrawing(false);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasContent(false);
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL('image/png'));
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {t('offers.signature.title', 'Sign below')}
      </p>
      <canvas
        ref={canvasRef}
        className="w-full h-40 border-2 border-dashed border-gray-300 dark:border-surface-600 rounded-lg cursor-crosshair bg-white dark:bg-surface-800 touch-none"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      <div className="flex gap-2">
        <Button variant="secondary" onClick={clear} type="button">
          {t('offers.signature.clear', 'Clear')}
        </Button>
        <Button variant="secondary" onClick={onCancel} type="button">
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button variant="primary" onClick={save} disabled={!hasContent} type="button">
          {t('offers.signature.save', 'Save signature')}
        </Button>
      </div>
    </div>
  );
}

export default function OfferDetailPage() {
  const params = useParams();
  const router = useRouter();
  const offerId = params.id as string;
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const { push: showToast } = useToast();

  const [offer, setOffer] = useState<OfferTypes.Offer | null>(null);
  const [timeline, setTimeline] = useState<OfferTypes.OfferTimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    desc: string;
    action: () => void;
  } | null>(null);

  const loadOffer = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([api.offers.get(offerId), api.offers.getTimeline(offerId).catch(() => ({ data: [] }))])
      .then(([offerData, timelineData]) => {
        setOffer(offerData);
        setTimeline(timelineData.data || []);
      })
      .catch((err) => {
        setError(err instanceof APIError ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, [offerId]);

  useEffect(() => {
    loadOffer();
  }, [loadOffer]);

  const handleSend = async () => {
    setActionLoading(true);
    try {
      await api.offers.send(offerId);
      showToast('success', t('offers.sent', 'Offer sent successfully'));
      loadOffer();
    } catch (err) {
      showToast('error', err instanceof APIError ? err.message : t('offers.sendFailed', 'Failed to send offer'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccept = async () => {
    setActionLoading(true);
    try {
      await api.offers.accept(offerId);
      showToast('success', t('offers.accepted', 'Offer accepted'));
      loadOffer();
    } catch (err) {
      showToast('error', err instanceof APIError ? err.message : t('offers.acceptFailed', 'Failed to accept offer'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDecline = async () => {
    setActionLoading(true);
    try {
      await api.offers.decline(offerId);
      showToast('info', t('offers.declined', 'Offer declined'));
      loadOffer();
    } catch (err) {
      showToast('error', err instanceof APIError ? err.message : t('offers.declineFailed', 'Failed to decline offer'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleSign = async (signatureData: string) => {
    setActionLoading(true);
    try {
      await api.offers.sign(offerId, { signature_data: signatureData });
      showToast('success', t('offers.signed', 'Offer signed successfully'));
      setShowSignature(false);
      loadOffer();
    } catch (err) {
      showToast('error', err instanceof APIError ? err.message : t('offers.signFailed', 'Failed to sign offer'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    setActionLoading(true);
    try {
      await api.offers.delete(offerId);
      showToast('success', t('offers.deleted', 'Offer deleted'));
      router.push('/dashboard/offers');
    } catch (err) {
      showToast('error', err instanceof APIError ? err.message : t('offers.deleteFailed', 'Failed to delete offer'));
      setActionLoading(false);
    }
  };

  const formatSalary = (min: number | null, max: number | null, currency: string) => {
    if (min == null && max == null) return '—';
    const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';
    if (min != null && max != null) return `${symbol}${min.toLocaleString()} - ${symbol}${max.toLocaleString()}`;
    if (min != null) return `${symbol}${min.toLocaleString()}+`;
    return `Up to ${symbol}${max?.toLocaleString()}`;
  };

  const timelineItems: TimelineItem[] = timeline.map((entry) => ({
    id: entry.id,
    title: entry.action,
    description: entry.description,
    timestamp: entry.created_at,
    icon: entry.action === 'created' ? <Clock className="h-4 w-4" /> : undefined,
  }));

  if (loading) {
    return (
      <div className="space-y-6">
      <Breadcrumb />
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (error || !offer) {
    return (
      <div className="space-y-6">
      <Breadcrumb />
        <ErrorState
          title={t('offers.couldntLoad', "Couldn't load offer")}
          error={error || t('offers.notFound', 'Offer not found')}
          onRetry={loadOffer}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {offer.candidate_name || 'Offer'}
            </h1>
            <Badge variant={STATUS_VARIANT[offer.status] || 'default'}>
              {t(`offers.statuses.${offer.status}`, offer.status)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {offer.job_title || '—'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {offer.status === 'draft' && (
            <Button
              variant="primary"
              onClick={handleSend}
              loading={actionLoading}
              disabled={actionLoading}
            >
              <Send className="h-4 w-4 mr-2" />
              {t('offers.actions.send', 'Send offer')}
            </Button>
          )}
          {offer.status === 'sent' && (
            <>
              <Button
                variant="primary"
                onClick={handleAccept}
                loading={actionLoading}
                disabled={actionLoading}
              >
                <Check className="h-4 w-4 mr-2" />
                {t('offers.actions.accept', 'Accept')}
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  setConfirmAction({
                    title: t('offers.confirmDeclineTitle', 'Decline offer?'),
                    desc: t('offers.confirmDeclineDesc', 'This will mark the offer as declined.'),
                    action: handleDecline,
                  })
                }
                disabled={actionLoading}
              >
                <X className="h-4 w-4 mr-2" />
                {t('offers.actions.decline', 'Decline')}
              </Button>
            </>
          )}
          {(offer.status === 'accepted' || offer.status === 'sent') && !offer.signed_at && (
            <Button
              variant="secondary"
              onClick={() => setShowSignature(true)}
              disabled={actionLoading}
            >
              <PenTool className="h-4 w-4 mr-2" />
              {t('offers.actions.sign', 'Sign')}
            </Button>
          )}
          {offer.status === 'draft' && (
            <Button
              variant="secondary"
              onClick={() =>
                setConfirmAction({
                  title: t('offers.confirmDeleteTitle', 'Delete offer?'),
                  desc: t('offers.confirmDeleteDesc', 'This action cannot be undone.'),
                  action: handleDelete,
                })
              }
              disabled={actionLoading}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t('common.delete', 'Delete')}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t('offers.details', 'Offer details')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('offers.fields.candidate', 'Candidate')}
                    </p>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {offer.candidate_name || '—'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Briefcase className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('offers.fields.job', 'Job')}
                    </p>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {offer.job_title || '—'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <DollarSign className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('offers.fields.salary', 'Salary')}
                    </p>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {formatSalary(offer.salary_min, offer.salary_max, offer.currency)}
                    </p>
                  </div>
                </div>
                {offer.equity_percent != null && (
                  <div className="flex items-center gap-3">
                    <DollarSign className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t('offers.fields.equity', 'Equity')}
                      </p>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {offer.equity_percent}%
                      </p>
                    </div>
                  </div>
                )}
                {offer.start_date && (
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t('offers.fields.startDate', 'Start date')}
                      </p>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {formatDate(offer.start_date, locale)}
                      </p>
                    </div>
                  </div>
                )}
                {offer.expiration_date && (
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t('offers.fields.expirationDate', 'Expiration')}
                      </p>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {formatDate(offer.expiration_date, locale)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              {offer.notes && (
                <div className="pt-4 border-t border-gray-100 dark:border-surface-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    {t('offers.fields.notes', 'Notes')}
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {offer.notes}
                  </p>
                </div>
              )}
              {offer.signature_data && (
                <div className="pt-4 border-t border-gray-100 dark:border-surface-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    {t('offers.signature.title', 'Signature')}
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={offer.signature_data}
                    alt="Signature"
                    className="max-h-24 border border-gray-200 dark:border-surface-700 rounded"
                  />
                  {offer.signed_at && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {t('offers.signedOn', 'Signed on')} {formatDate(offer.signed_at, locale)}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {showSignature && (
            <Card>
              <CardContent className="p-6">
                <SignaturePad
                  onSave={handleSign}
                  onCancel={() => setShowSignature(false)}
                  locale={locale}
                />
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
                {t('offers.timeline.title', 'Timeline')}
              </h3>
              {timelineItems.length > 0 ? (
                <Timeline items={timelineItems} />
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('offers.timeline.empty', 'No events yet.')}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 space-y-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {t('offers.dates', 'Dates')}
              </h3>
              <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                <p>
                  {t('offers.created', 'Created')}: {formatDate(offer.created_at, locale)}
                </p>
                {offer.sent_at && (
                  <p>
                    {t('offers.sentOn', 'Sent')}: {formatDate(offer.sent_at, locale)}
                  </p>
                )}
                {offer.accepted_at && (
                  <p>
                    {t('offers.acceptedOn', 'Accepted')}: {formatDate(offer.accepted_at, locale)}
                  </p>
                )}
                {offer.declined_at && (
                  <p>
                    {t('offers.declinedOn', 'Declined')}: {formatDate(offer.declined_at, locale)}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {confirmAction && (
        <ConfirmDialog
          isOpen={!!confirmAction}
          title={confirmAction.title}
          description={confirmAction.desc}
          confirmLabel={t('common.confirm', 'Confirm')}
          cancelLabel={t('common.cancel', 'Cancel')}
          onConfirm={() => {
            confirmAction.action();
            setConfirmAction(null);
          }}
          onClose={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
