import { ReactNode } from "react";

export type SectionHeaderProps = {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function SectionHeader({ icon, title, subtitle, actions }: SectionHeaderProps) {
  return (
    <header className="mb-3 flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
          {icon && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[11px] text-slate-600">
              {icon}
            </span>
          )}
          {title}
        </div>
        {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          {actions}
        </div>
      )}
    </header>
  );
}
