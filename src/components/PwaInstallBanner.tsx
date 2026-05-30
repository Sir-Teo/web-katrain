import React, { useEffect, useRef, useState } from 'react';
import { FaDownload, FaRedo, FaWifi } from 'react-icons/fa';
import { PWA_OFFLINE_READY_EVENT, PWA_UPDATE_READY_EVENT } from '../utils/pwa';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type BannerState =
  | { type: 'install'; prompt: BeforeInstallPromptEvent }
  | { type: 'offline-ready' }
  | { type: 'update-ready' }
  | null;

export const PwaInstallBanner: React.FC = () => {
  const [banner, setBanner] = useState<BannerState>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setBanner({ type: 'install', prompt: event as BeforeInstallPromptEvent });
    };
    const onOfflineReady = () => setBanner((current) => current ?? { type: 'offline-ready' });
    const onUpdateReady = () => setBanner({ type: 'update-ready' });

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener(PWA_OFFLINE_READY_EVENT, onOfflineReady);
    window.addEventListener(PWA_UPDATE_READY_EVENT, onUpdateReady);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
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
    if (typeof ResizeObserver === 'undefined' || !bannerRef.current) {
      window.addEventListener('resize', updateHeight);
      return () => {
        window.removeEventListener('resize', updateHeight);
        root.removeAttribute('data-pwa-banner');
        root.style.removeProperty('--pwa-banner-height');
      };
    }
    const observer = new ResizeObserver(updateHeight);
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
  const isUpdate = banner.type === 'update-ready';
  const icon = isInstall ? <FaDownload size={13} /> : isUpdate ? <FaRedo size={13} /> : <FaWifi size={13} />;
  const title = isInstall ? 'Install Web KaTrain' : isUpdate ? 'Update ready' : 'Offline ready';
  const detail = isInstall
    ? 'Keep the board, library, model, and study tools available from your dock.'
    : isUpdate
      ? 'Reload to use the newest study tools.'
      : 'App shell, board assets, TFJS WASM, and the bundled small model are cached.';

  const primaryAction = async () => {
    if (banner.type === 'install') {
      await banner.prompt.prompt();
      const choice = await banner.prompt.userChoice;
      if (choice.outcome !== 'accepted') setBanner(null);
      return;
    }
    if (banner.type === 'update-ready') {
      window.location.reload();
      return;
    }
    setBanner(null);
  };

  return (
    <div ref={bannerRef} className="pwa-install-banner" role="status" aria-live="polite">
      <div className="pwa-install-icon">{icon}</div>
      <div className="min-w-0">
        <div className="pwa-install-title">{title}</div>
        <div className="pwa-install-detail">{detail}</div>
      </div>
      <div className="pwa-install-actions">
        <button type="button" className="pwa-install-secondary" onClick={() => setBanner(null)}>
          Dismiss
        </button>
        <button type="button" className="pwa-install-primary" onClick={() => void primaryAction()}>
          {isInstall ? 'Install' : isUpdate ? 'Reload' : 'OK'}
        </button>
      </div>
    </div>
  );
};
