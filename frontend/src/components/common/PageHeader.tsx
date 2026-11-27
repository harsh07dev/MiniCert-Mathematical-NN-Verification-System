import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  kicker: string;
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
}

export function PageHeader({
  kicker,
  title,
  description,
  breadcrumbs,
  actions,
}: PageHeaderProps) {
  return (
    <header className="mb-7 border-b border-[#E5DCD3] pb-5">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1.5 text-xs text-[#827875]">
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={`${crumb.label}-${index}`}>
              {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-[#827875]" aria-hidden="true" />}
              {crumb.to ? (
                <Link to={crumb.to} className="hover:text-[#702B3A] transition-colors">
                  {crumb.label}
                </Link>
              ) : (
                <span className="font-medium text-[#51494A]">{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#702B3A]">
            {kicker}
          </p>
          <h1 className="font-serif-display text-3xl leading-tight text-[#30282A] sm:text-4xl">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#51494A] sm:text-[15px]">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
