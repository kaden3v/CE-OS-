import { useState, useEffect } from 'react';
import { Link2, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/contexts/AppContext';
import { fetchHealth } from '@/lib/api';

/**
 * Plaid Link button.
 *
 * Loads Plaid's hosted Link script on demand (no new npm dep), fetches a
 * link_token from /api/finance/plaid/link-token, opens the Link UI, and
 * exchanges the public_token via /api/finance/plaid/exchange.
 *
 * The exchange endpoint returns the access_token; we surface it via toast
 * so the operator can paste into .env. A production setup would persist it
 * server-side per user/org.
 */

declare global {
  interface Window {
    Plaid?: {
      create: (config: PlaidConfig) => { open: () => void; exit: () => void; destroy: () => void };
    };
  }
}

type PlaidConfig = {
  token: string;
  onSuccess: (publicToken: string, metadata: unknown) => void;
  onExit: (err: unknown, metadata: unknown) => void;
  onEvent?: (event: string, metadata: unknown) => void;
};

const PLAID_LINK_SRC = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';

function loadPlaidScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.Plaid) return Promise.resolve();
  if (document.querySelector(`script[src="${PLAID_LINK_SRC}"]`)) {
    // Already loading — wait for it.
    return new Promise((resolve, reject) => {
      const i = setInterval(() => {
        if (window.Plaid) { clearInterval(i); resolve(); }
      }, 50);
      setTimeout(() => { clearInterval(i); reject(new Error('Plaid script load timeout')); }, 10_000);
    });
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PLAID_LINK_SRC; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Plaid script'));
    document.head.appendChild(s);
  });
}

export function ConnectBankButton({ size = 'default' }: { size?: 'default' | 'sm' }) {
  const { addToast } = useApp();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'unknown' | 'enabled' | 'disabled' | 'connected'>('unknown');

  useEffect(() => {
    fetchHealth()
      .then(h => {
        if (!h.tokenConfigured) return setStatus('disabled'); // proxy: server up but Plaid env not set
        setStatus(h.plaidConfigured ? 'connected' : 'enabled');
      })
      .catch(() => setStatus('unknown'));
  }, []);

  const launch = async () => {
    setBusy(true);
    try {
      await loadPlaidScript();
      const linkRes = await fetch('/api/finance/plaid/link-token', { method: 'POST' });
      const linkBody = await linkRes.json();
      if (!linkRes.ok) throw new Error(linkBody.error ?? 'Failed to create link token');
      const token = linkBody.link_token as string;

      const handler = window.Plaid!.create({
        token,
        onSuccess: async (publicToken) => {
          try {
            const exRes = await fetch('/api/finance/plaid/exchange', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ public_token: publicToken }),
            });
            const exBody = await exRes.json();
            if (!exRes.ok) throw new Error(exBody.error ?? 'Exchange failed');
            addToast({
              title: 'Bank connected',
              description: 'Paste the access token into PLAID_ACCESS_TOKEN in .env, then restart the server. (Pass 7 persists this automatically.)',
              status: 'ok',
              duration: 0,
              action: {
                label: 'Copy access_token',
                run: () => { navigator.clipboard?.writeText(exBody.access_token).catch(() => undefined); addToast({ title: 'Copied', status: 'info' }); },
              },
            });
            setStatus('connected');
          } catch (e: any) {
            addToast({ title: 'Exchange failed', description: e.message, status: 'alert' });
          }
        },
        onExit: (err) => {
          if (err) addToast({ title: 'Plaid Link exited', description: String((err as any)?.error_message ?? 'cancelled'), status: 'info' });
        },
      });
      handler.open();
    } catch (e: any) {
      addToast({ title: 'Plaid Link failed', description: e.message, status: 'alert' });
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || status === 'disabled';
  const label =
    busy             ? 'Opening Plaid…' :
    status === 'connected' ? 'Bank connected' :
    status === 'disabled'  ? 'Plaid not configured' :
                              'Connect bank';
  const Icon = busy ? Loader2 : status === 'connected' ? CheckCircle2 : status === 'disabled' ? AlertTriangle : Link2;

  return (
    <button
      onClick={launch}
      disabled={disabled}
      title={status === 'disabled' ? 'Set PLAID_CLIENT_ID + PLAID_SECRET in .env' : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border transition-colors duration-[120ms]',
        size === 'sm' ? 'h-7 px-2 text-[12px]' : 'h-8 px-3 text-[13px]',
        status === 'connected'
          ? 'border-status-ok/30 bg-status-ok/[0.06] text-status-ok'
          : status === 'disabled'
            ? 'border-border-subtle bg-bg-elevated/40 text-text-tertiary cursor-not-allowed'
            : 'border-border-subtle text-text-secondary hover:text-text-primary hover:bg-bg-hover',
      )}
    >
      <Icon className={cn('w-3.5 h-3.5', busy && 'animate-spin')} strokeWidth={1.5} />
      {label}
    </button>
  );
}
