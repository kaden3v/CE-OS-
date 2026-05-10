import { useLocation, useNavigate, Link } from 'react-router';
import { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { routeByHref } from '@/lib/nav/registry';

/**
 * Topbar: 48px tall. Breadcrumb left, contextual actions right.
 * No global actions live here — those are in the palette.
 */
export function Topbar({ actions }: { actions?: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const crumbs = buildCrumbs(location.pathname);

  return (
    <header
      className="h-12 flex-shrink-0 bg-bg-base border-b border-border-subtle flex items-center px-4 md:px-6 justify-between z-10 no-print"
      role="banner"
    >
      <nav className="flex items-center text-sm min-w-0" aria-label="Breadcrumb">
        <ol className="flex items-center min-w-0">
          {crumbs.map((c, i) => (
            <li key={c.href} className="flex items-center min-w-0">
              {i > 0 && <ChevronRight className="w-3 h-3 mx-1 text-text-tertiary flex-shrink-0" aria-hidden />}
              {i === crumbs.length - 1 ? (
                <span className="text-text-primary font-medium truncate" aria-current="page">{c.label}</span>
              ) : (
                <Link
                  to={c.href}
                  className={cn(
                    'text-text-secondary hover:text-text-primary truncate rounded px-1 -mx-1',
                    'transition-colors duration-[120ms]',
                  )}
                >
                  {c.label}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <div className="flex items-center gap-1 flex-shrink-0">{actions}</div>
    </header>
  );
}

function buildCrumbs(pathname: string): Array<{ label: string; href: string }> {
  if (pathname === '/') return [{ label: 'Dashboard', href: '/' }];
  const parts = pathname.split('/').filter(Boolean);
  const out: Array<{ label: string; href: string }> = [{ label: 'Dashboard', href: '/' }];
  let acc = '';
  for (const p of parts) {
    acc += `/${p}`;
    const route = routeByHref(acc);
    out.push({
      label: route?.label ?? prettify(p),
      href: acc,
    });
  }
  return out;
}

function prettify(s: string) {
  return s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
