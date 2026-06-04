import React from 'react';
import { FaBug, FaExternalLinkAlt, FaGithub, FaTimes } from 'react-icons/fa';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { APP_COMMIT_URL, APP_INFO, APP_ISSUE_REPORT_URL, APP_REPOSITORY_URL } from '../utils/appInfo';

interface AboutDialogProps {
  onClose: () => void;
}

const AboutRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3 border-b border-[var(--ui-border)] py-2 last:border-b-0">
    <span className="text-xs font-semibold uppercase tracking-wide ui-text-faint">{label}</span>
    <div className="min-w-0 text-right text-sm font-medium text-[var(--ui-text)]">{children}</div>
  </div>
);

const AboutLink: React.FC<{ href: string; children: React.ReactNode; className?: string }> = ({
  href,
  children,
  className,
}) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className={[
      'inline-flex min-w-0 items-center gap-1.5 text-[var(--ui-accent)] hover:text-[var(--ui-text)]',
      className ?? '',
    ].join(' ')}
  >
    <span className="truncate">{children}</span>
    <FaExternalLinkAlt className="shrink-0 text-[10px]" aria-hidden="true" />
  </a>
);

export const AboutDialog: React.FC<AboutDialogProps> = ({ onClose }) => {
  const buildDate = APP_INFO.commitDate || 'unknown';
  useEscapeToClose(onClose);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-3 mobile-safe-inset mobile-safe-area-bottom"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
      onClick={onClose}
    >
      <div
        className="ui-panel relative flex w-full max-w-md flex-col overflow-hidden rounded-xl border shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ui-bar flex items-start justify-between gap-3 border-b border-[var(--ui-border)] px-4 py-4">
          <div className="min-w-0">
            <h2 id="about-title" className="text-lg font-semibold text-[var(--ui-text)]">
              web-KaTrain
            </h2>
            <p className="mt-1 text-sm ui-text-muted">Browser Go review, training, and KataGo analysis.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ui-control grid shrink-0 place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            aria-label="Close about dialog"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3">
            <AboutRow label="Version">v{APP_INFO.version}</AboutRow>
            <AboutRow label="Commit">
              {APP_COMMIT_URL ? (
                <AboutLink href={APP_COMMIT_URL}>{APP_INFO.commit}</AboutLink>
              ) : (
                <span className="font-mono">{APP_INFO.commit}</span>
              )}
            </AboutRow>
            <AboutRow label="Build Date">{buildDate}</AboutRow>
            <AboutRow label="Repository">
              <AboutLink href={APP_REPOSITORY_URL}>Sir-Teo/web-katrain</AboutLink>
            </AboutRow>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <AboutLink
              href={APP_REPOSITORY_URL}
              className="justify-center rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm font-semibold hover:bg-[var(--ui-surface-2)]"
            >
              <FaGithub aria-hidden="true" /> GitHub
            </AboutLink>
            <AboutLink
              href={APP_ISSUE_REPORT_URL}
              className="justify-center rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm font-semibold hover:bg-[var(--ui-surface-2)]"
            >
              <FaBug aria-hidden="true" /> Report Issue
            </AboutLink>
          </div>
        </div>
      </div>
    </div>
  );
};

AboutDialog.displayName = 'AboutDialog';
