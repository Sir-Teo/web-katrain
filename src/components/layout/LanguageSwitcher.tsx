import React from 'react';
import { FaCheck, FaChevronDown, FaGlobe } from 'react-icons/fa';
import type { AppLocaleId } from '../../types';
import { APP_LOCALE_OPTIONS, getAppLocaleOption, getAppLocaleShortLabel } from '../../utils/locales';

interface LanguageSwitcherProps {
  appLocale: AppLocaleId;
  onLocaleChange: (locale: AppLocaleId) => void;
  className?: string;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ appLocale, onLocaleChange, className }) => {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const activeLocale = getAppLocaleOption(appLocale);
  const menuId = React.useId();

  React.useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const selectLocale = (locale: AppLocaleId) => {
    onLocaleChange(locale);
    setOpen(false);
  };

  return (
    <div className={['app-language-switcher relative', className ?? ''].join(' ')} ref={containerRef} data-language-switcher="desktop">
      <button
        type="button"
        className="h-8 min-w-[74px] px-2 rounded-lg bg-[var(--ui-surface)] border border-[var(--ui-border)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)] flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors whitespace-nowrap"
        onClick={() => setOpen((value) => !value)}
        title={`${activeLocale.languageLabel}: ${activeLocale.label} (${activeLocale.nativeLabel})`}
        aria-label={`${activeLocale.changeLanguageLabel}: ${activeLocale.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        data-language-switcher-button="true"
        data-current-locale={activeLocale.value}
      >
        <FaGlobe aria-hidden="true" size={13} />
        <span>{getAppLocaleShortLabel(activeLocale.value)}</span>
        <FaChevronDown aria-hidden="true" size={9} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>

      {open && (
        <div
          id={menuId}
          role="listbox"
          aria-label={activeLocale.selectLanguageLabel}
          className="absolute right-0 top-full mt-2 w-[224px] ui-panel border rounded-lg shadow-xl overflow-hidden z-50"
          data-language-switcher-menu="true"
        >
          <div className="px-3 py-2 text-xs font-semibold text-[var(--ui-text-muted)] uppercase tracking-wider bg-[var(--ui-surface-2)] border-b border-[var(--ui-border)]">
            {activeLocale.selectLanguageLabel}
          </div>
          {APP_LOCALE_OPTIONS.map((locale) => {
            const active = locale.value === activeLocale.value;
            return (
              <button
                key={locale.value}
                type="button"
                role="option"
                aria-selected={active}
                className={[
                  'w-full min-h-10 px-3 py-2 text-left flex items-center gap-2 hover:bg-[var(--ui-surface-2)]',
                  active ? 'text-[var(--ui-text)] bg-[var(--ui-accent-soft)]' : 'text-[var(--ui-text-muted)]',
                ].join(' ')}
                onClick={() => selectLocale(locale.value)}
                data-language-option={locale.value}
              >
                <span className="w-8 shrink-0 text-xs font-semibold text-[var(--ui-text-faint)]">{getAppLocaleShortLabel(locale.value)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{locale.nativeLabel}</span>
                  <span className="block truncate text-[11px] text-[var(--ui-text-faint)]">{locale.label}</span>
                </span>
                {active && <FaCheck aria-hidden="true" className="shrink-0 text-[var(--ui-accent)]" size={12} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
