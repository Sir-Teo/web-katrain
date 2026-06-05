import React from 'react';
import { FaCheck, FaChevronDown, FaGlobe } from 'react-icons/fa';
import type { AppLocaleId } from '../../types';
import { APP_LOCALE_OPTIONS, getAppLocaleOption, getAppLocaleShortLabel } from '../../utils/locales';
import { getNextLanguageOptionIndex, isLanguageSwitcherNavigationKey } from '../../utils/languageSwitcherNavigation';

interface LanguageSwitcherProps {
  appLocale: AppLocaleId;
  onLocaleChange: (locale: AppLocaleId) => void;
  className?: string;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ appLocale, onLocaleChange, className }) => {
  const [open, setOpen] = React.useState(false);
  const [activeOptionIndex, setActiveOptionIndex] = React.useState(() =>
    Math.max(0, APP_LOCALE_OPTIONS.findIndex((locale) => locale.value === appLocale))
  );
  const containerRef = React.useRef<HTMLDivElement>(null);
  const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const activeLocale = getAppLocaleOption(appLocale);
  const menuId = React.useId();
  const activeOptionId = `${menuId}-option-${APP_LOCALE_OPTIONS[activeOptionIndex]?.value ?? activeLocale.value}`;

  React.useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  React.useEffect(() => {
    const index = APP_LOCALE_OPTIONS.findIndex((locale) => locale.value === appLocale);
    if (index >= 0) setActiveOptionIndex(index);
  }, [appLocale]);

  React.useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      optionRefs.current[activeOptionIndex]?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(id);
  }, [activeOptionIndex, open]);

  const openAtIndex = (index: number) => {
    setActiveOptionIndex(index);
    setOpen(true);
  };

  const selectLocale = (locale: AppLocaleId) => {
    onLocaleChange(locale);
    setOpen(false);
  };

  const handleButtonKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!isLanguageSwitcherNavigationKey(event.key)) return;
    event.preventDefault();
    const currentIndex = APP_LOCALE_OPTIONS.findIndex((locale) => locale.value === activeLocale.value);
    openAtIndex(getNextLanguageOptionIndex(event.key, currentIndex, APP_LOCALE_OPTIONS.length));
  };

  const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectLocale(APP_LOCALE_OPTIONS[activeOptionIndex]?.value ?? activeLocale.value);
      return;
    }

    if (!isLanguageSwitcherNavigationKey(event.key)) return;
    event.preventDefault();
    const navigationKey = event.key;
    setActiveOptionIndex((index) =>
      getNextLanguageOptionIndex(navigationKey, index, APP_LOCALE_OPTIONS.length)
    );
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
        onKeyDown={handleButtonKeyDown}
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
          aria-activedescendant={activeOptionId}
          className="absolute right-0 top-full mt-2 w-[224px] ui-panel border rounded-lg shadow-xl overflow-hidden z-50"
          data-language-switcher-menu="true"
        >
          <div className="px-3 py-2 text-xs font-semibold text-[var(--ui-text-muted)] uppercase tracking-wider bg-[var(--ui-surface-2)] border-b border-[var(--ui-border)]">
            {activeLocale.selectLanguageLabel}
          </div>
          {APP_LOCALE_OPTIONS.map((locale, index) => {
            const active = locale.value === activeLocale.value;
            return (
              <button
                type="button"
                key={locale.value}
                id={`${menuId}-option-${locale.value}`}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                role="option"
                aria-selected={active}
                tabIndex={index === activeOptionIndex ? 0 : -1}
                className={[
                  'w-full min-h-10 px-3 py-2 text-left flex items-center gap-2 hover:bg-[var(--ui-surface-2)]',
                  active ? 'text-[var(--ui-text)] bg-[var(--ui-accent-soft)]' : 'text-[var(--ui-text-muted)]',
                ].join(' ')}
                onFocus={() => setActiveOptionIndex(index)}
                onKeyDown={handleOptionKeyDown}
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
