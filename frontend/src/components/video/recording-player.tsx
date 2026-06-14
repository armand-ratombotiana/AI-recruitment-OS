'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Play,
  Pause,
  Download,
  Volume2,
  VolumeX,
  Maximize,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { Button } from '@/components';
import { translate } from '@/stores/locale-store';

interface RecordingPlayerProps {
  src: string;
  title?: string;
  locale: string;
  onDownload?: () => void;
}

export function RecordingPlayer({ src, title, locale, onDownload }: RecordingPlayerProps) {
  const t = (key: string, fb?: string) => translate(locale as any, key, fb);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => setError(true));
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const time = Number(e.target.value);
    v.currentTime = time;
    setCurrentTime(time);
  }, []);

  const skip = useCallback((seconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + seconds));
  }, []);

  const handleFullscreen = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.requestFullscreen) v.requestFullscreen();
  }, []);

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrentTime(v.currentTime);
    const onDur = () => { setDuration(v.duration); setLoading(false); };
    const onLoaded = () => setLoading(false);
    const onErr = () => { setError(true); setLoading(false); };
    const onEnd = () => setPlaying(false);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('loadedmetadata', onDur);
    v.addEventListener('loadeddata', onLoaded);
    v.addEventListener('error', onErr);
    v.addEventListener('ended', onEnd);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('loadedmetadata', onDur);
      v.removeEventListener('loadeddata', onLoaded);
      v.removeEventListener('error', onErr);
      v.removeEventListener('ended', onEnd);
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          skip(10);
          break;
        case 'ArrowLeft':
          skip(-10);
          break;
        case 'f':
          handleFullscreen();
          break;
        case 'm':
          toggleMute();
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePlay, skip, handleFullscreen, toggleMute]);

  if (error) {
    return (
      <div className="bg-gray-900 rounded-xl aspect-video flex items-center justify-center">
        <p className="text-red-400 text-sm">{t('interviews.video.player.error', 'Failed to load video')}</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden">
      {title && (
        <div className="px-4 py-2 border-b border-gray-800">
          <p className="text-sm font-medium text-gray-200 truncate">{title}</p>
        </div>
      )}
      <div className="relative aspect-video bg-black">
        <video
          ref={videoRef}
          src={src}
          className="w-full h-full object-contain"
          preload="metadata"
          playsInline
        />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <p className="text-gray-400 text-sm">{t('interviews.video.player.loading', 'Loading video...')}</p>
          </div>
        )}
      </div>
      <div className="px-3 py-2 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 w-10 text-right tabular-nums">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer accent-purple-500"
            aria-label={t('interviews.video.recordings.timeline', 'Timeline')}
          />
          <span className="text-xs text-gray-400 w-10 tabular-nums">{formatTime(duration)}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => skip(-10)} aria-label="Back 10s">
              <SkipBack className="h-4 w-4 text-gray-300" />
            </Button>
            <Button variant="ghost" size="sm" onClick={togglePlay} aria-label={playing ? t('interviews.video.recordings.pause', 'Pause') : t('interviews.video.recordings.play', 'Play')}>
              {playing ? <Pause className="h-5 w-5 text-gray-200" /> : <Play className="h-5 w-5 text-gray-200" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => skip(10)} aria-label="Forward 10s">
              <SkipForward className="h-4 w-4 text-gray-300" />
            </Button>
            <Button variant="ghost" size="sm" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
              {muted ? <VolumeX className="h-4 w-4 text-gray-300" /> : <Volume2 className="h-4 w-4 text-gray-300" />}
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handleFullscreen} aria-label={t('interviews.video.recordings.fullscreen', 'Fullscreen')}>
              <Maximize className="h-4 w-4 text-gray-300" />
            </Button>
            {onDownload && (
              <Button variant="ghost" size="sm" onClick={onDownload} aria-label={t('interviews.video.recordings.download', 'Download')}>
                <Download className="h-4 w-4 text-gray-300" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
