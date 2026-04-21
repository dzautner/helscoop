"use client";

export interface MobileEditorTab<T extends string> {
  id: T;
  label: string;
  badge?: string | number;
}

interface MobileEditorTabsProps<T extends string> {
  active: T;
  tabs: MobileEditorTab<T>[];
  onChange: (tab: T) => void;
  ariaLabel: string;
}

export default function MobileEditorTabs<T extends string>({
  active,
  tabs,
  onChange,
  ariaLabel,
}: MobileEditorTabsProps<T>) {
  return (
    <div className="mobile-editor-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className="mobile-editor-tab"
          data-active={active === tab.id}
          onClick={() => onChange(tab.id)}
        >
          <span>{tab.label}</span>
          {tab.badge !== undefined && tab.badge !== 0 && (
            <span className="mobile-editor-tab-badge">{tab.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}
