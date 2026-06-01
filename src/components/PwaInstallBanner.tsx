import React, { useEffect, useRef, useState } from 'react';
import { FaDownload, FaRedo, FaShareSquare, FaWifi } from 'react-icons/fa';
import {
  getPwaInstallDismissed,
  isIosPwaInstallCandidate,
  isStandalonePwa,
  PWA_OFFLINE_READY_EVENT,
  PWA_UPDATE_READY_EVENT,
  runPwaInstallPrompt,
  setPwaInstallDismissed,
  shouldUseBrowserPwaInstallPrompt,
} from '../utils/pwa';
import { getResizeObserverConstructor } from '../utils/resizeObserver';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type BannerState =
  | { type: 'install'; prompt: BeforeInstallPromptEvent }
  | { type: 'ios-install' }
  | { type: 'offline-ready' }
  | { type: 'update-ready' }
  | null;

export const PwaInstallBanner: React.FC = () => {
  const [banner, setBanner] = useState<BannerState>(() =>
    isIosPwaInstallCandidate() && !isStandalonePwa() && !getPwaInstallDismissed()
      ? { type: 'ios-install' }
      : null
  );
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (!shouldUseBrowserPwaInstallPrompt() || isStandalonePwa() || getPwaInstallDismissed()) return;
      setActionMessage(null);
      setBanner({ type: 'install', prompt: event as BeforeInstallPromptEvent });
    };
    const onAppInstalled = () => {
      setPwaInstallDismissed(false);
      setActionMessage(null);
      setBanner(null);
    };
    const onOfflineReady = () => {
      setActionMessage(null);
      setBanner((current) => current ?? { type: 'offline-ready' });
    };
    const onUpdateReady = () => {
      setActionMessage(null);
      setBanner({ type: 'update-ready' });
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    window.addEventListener(PWA_OFFLINE_READY_EVENT, onOfflineReady);
    window.addEventListener(PWA_UPDATE_READY_EVENT, onUpdateReady);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      window.removeEventListener(PWA_OFFLINE_READY_EVENT, onOfflineReady);
      window.removeEventListener(PWA_UPDATE_READY_EVENT, onUpdateReady);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (!banner) {
      root.removeAttribute('data-pwa-banner');
      root.style.removeProperty('--pwa-banner-height');
      return;
    }

    root.dataset.pwaBanner = banner.type;
    const updateHeight = () => {
      const height = bannerRef.current?.getBoundingClientRect().height ?? 0;
      root.style.setProperty('--pwa-banner-height', `${Math.ceil(height + 12)}px`);
    };
    updateHeight();
    const ResizeObserverConstructor = getResizeObserverConstructor();
    if (!ResizeObserverConstructor || !bannerRef.current) {
      window.addEventListener('resize', updateHeight);
      return () => {
        window.removeEventListener('resize', updateHeight);
        root.removeAttribute('data-pwa-banner');
        root.style.removeProperty('--pwa-banner-height');
      };
    }
    const observer = new ResizeObserverConstructor(updateHeight);
    observer.observe(bannerRef.current);
    window.addEventListener('resize', updateHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHeight);
      root.removeAttribute('data-pwa-banner');
      root.style.removeProperty('--pwa-banner-height');
    };
  }, [banner]);

  if (!banner) return null;

  const isInstall = banner.type === 'install';
  const isIosInstall = banner.type === 'ios-install';
  const isUpdate = banner.type === 'update-ready';
  const icon = isInstall
    ? <FaDownload size={13} />
    : isIosInstall
      ? <FaShareSquare size={13} />
      : isUpdate
        ? <FaRedo size={13} />
        : <FaWifi size={13} />;
  const title = isInstall
    ? 'Install Web KaTrain'
    : isIosInstall
      ? 'Install on iPhone or iPad'
      : isUpdate
        ? 'Update ready'
        : 'Offline ready';
  const detail = isInstall || isIosInstall
    ? isIosInstall
      ? 'Tap Share, then Add to Home Screen for a dock icon and offline study.'
      : 'Keep the board, library, model, and study tools available from your dock.'
    : isUpdate
      ? 'Reload to use the newest study tools.'
      : 'App shell, board assets, TFJS WASM, and the bundled small model are cached.';
  const displayedDetail = actionMessage ?? detail;

  const primaryAction = async () => {
    if (banner.type === 'ios-install') {
      setPwaInstallDismissed(true);
      setActionMessage(null);
      setBanner(null);
      return;
    }
    if (banner.type === 'install') {
      setActionMessage(null);
      setIsWorking(true);
      const outcome = await runPwaInstallPrompt(banner.prompt);
      setIsWorking(false);
      if (outcome === 'failed') {
        setActionMessage('Install prompt was blocked. Use your browser install menu when available.');
        return;
      }
      setPwaInstallDismissed(outcome !== 'accepted');
      setBanner(null);
      return;
    }
    if (banner.type === 'update-ready') {
      window.location.reload();
      return;
    }
    setBanner(null);
  };
  const dismissBanner = () => {
    if (banner.type === 'install' || banner.type === 'ios-install') setPwaInstallDismissed(true);
    setActionMessage(null);
    setBanner(null);
  };

  return (
    <div ref={bannerRef} className="pwa-install-banner" role="status" aria-live="polite">
      <div className="pwa-install-icon">{icon}</div>
      <div className="min-w-0">
        <div className="pwa-install-title">{title}</div>
        <div className="pwa-install-detail">{displayedDetail}</div>
      </div>
      <div className="pwa-install-actions">
        <button type="button" className="pwa-install-secondary" onClick={dismissBanner} disabled={isWorking}>
          Dismiss
        </button>
        <button type="button" className="pwa-install-primary" onClick={() => void primaryAction()} disabled={isWorking}>
          {isWorking ? 'Working...' : isInstall ? 'Install' : isIosInstall ? 'Got it' : isUpdate ? 'Reload' : 'OK'}
        </button>
      </div>
    </div>
  );
};
