import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StatusDot } from "@/components/ui/StatusDot";
import { useApp } from "@/contexts/AppContext";
import { useNavigate } from "react-router";
import { Keyboard, TerminalSquare } from "lucide-react";

export default function Settings() {
  const navigate = useNavigate();
  const { settings, updateSettings, setCommandPaletteOpen, addToast } = useApp();

  const toggleSetting = (key: keyof typeof settings) => {
    if (typeof settings[key] === 'boolean') {
      updateSettings({ [key]: !settings[key] });
    }
  };

  const isDev = settings.developerMode || new URLSearchParams(window.location.search).get('dev') === '1';

  return (
    <div className="p-8 max-w-4xl mx-auto h-full flex flex-col">
      <div className="mb-8 border-b border-border-subtle pb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Settings</h1>
          <p className="text-sm text-text-secondary">System configuration and integrations.</p>
        </div>
        {!isDev && (
          <button 
            className="w-12 h-12 opacity-0 cursor-default" 
            onClick={() => updateSettings({ developerMode: true })}
            title="Enable Developer Mode"
          />
        )}
      </div>

      <div className="space-y-8 pb-12">
        <section>
          <h2 className="text-lg font-medium mb-4">Profile</h2>
          <Card className="p-6 flex items-start gap-6">
            <div className="w-20 h-20 rounded-full bg-bg-active border border-border-subtle flex items-center justify-center text-2xl font-medium shrink-0">
              KC
            </div>
            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs uppercase tracking-wide text-text-secondary">Display Name</label>
                  <Input defaultValue="Kaden" className="w-full" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs uppercase tracking-wide text-text-secondary">Email</label>
                  <Input defaultValue="kaden3v@gmail.com" disabled className="w-full opacity-50" />
                </div>
              </div>
              <Button onClick={() => addToast("Profile updated successfully", "success")}>Save Profile</Button>
            </div>
          </Card>
        </section>

        <section>
          <h2 className="text-lg font-medium mb-4">Display</h2>
          <Card className="divide-y divide-border-subtle p-0">
            <div className="p-4 flex items-center justify-between hover:bg-bg-hover transition-colors cursor-pointer" onClick={() => toggleSetting('tissueCultureStagesEnabled')}>
              <div>
                <div className="font-medium text-sm">Tissue culture stages</div>
                <div className="text-xs text-text-secondary mt-2">Show the Establishment column on the Propagation board for lab / TC workflow. When off, those batches appear under Division.</div>
              </div>
              <div className={`w-10 h-6 rounded-full p-2 transition-colors ${settings.tissueCultureStagesEnabled ? 'bg-accent-brand' : 'bg-bg-active border border-border-strong'}`}>
                <div className={`w-4 h-4 rounded-full bg-text-primary transition-transform ${settings.tissueCultureStagesEnabled ? 'translate-x-4' : ''}`}></div>
              </div>
            </div>
            <div className="p-4 flex items-center justify-between hover:bg-bg-hover transition-colors cursor-pointer" onClick={() => updateSettings({ density: settings.density === 'comfortable' ? 'compact' : 'comfortable' })}>
              <div>
                <div className="font-medium text-sm">Compact Density</div>
                <div className="text-xs text-text-secondary mt-2">Reduce padding and text size in data tables for higher data density.</div>
              </div>
              <div className={`w-10 h-6 rounded-full p-2 transition-colors ${settings.density === 'compact' ? 'bg-accent-brand' : 'bg-bg-active border border-border-strong'}`}>
                <div className={`w-4 h-4 rounded-full bg-text-primary transition-transform ${settings.density === 'compact' ? 'translate-x-4' : ''}`}></div>
              </div>
            </div>
            <div className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="font-medium text-sm">Operator timezone</div>
                <div className="text-xs text-text-secondary mt-2">
                  Dates and times display in this zone (shop: America/Phoenix — MST, no DST).
                </div>
              </div>
              <select
                aria-label="Operator timezone"
                className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm min-w-[240px] max-w-full"
                value={settings.operatorTimezone}
                onChange={(e) => updateSettings({ operatorTimezone: e.target.value })}
              >
                <option value="America/Phoenix">America/Phoenix (default)</option>
                <option value="America/Los_Angeles">America/Los_Angeles</option>
                <option value="America/Denver">America/Denver</option>
                <option value="America/Chicago">America/Chicago</option>
                <option value="America/New_York">America/New_York</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </Card>
        </section>

        <section>
          <h2 className="text-lg font-medium mb-4">Notifications</h2>
          <Card className="divide-y divide-border-subtle p-0">
            {[
              { id: "lic", label: "License Expiring", desc: "Alert me when a permit is within 30 days of expiration.", active: true },
              { id: "stock", label: "Low Stock Alert", desc: "Notify when supplies drop below threshold.", active: true },
              { id: "wx", label: "Weather Alerts", desc: "Warn about extreme temps in pending shipment zips.", active: true },
              { id: "ord", label: "New Order", desc: "Push notification for new Shopify or Etsy orders.", active: false },
            ].map(setting => (
              <div key={setting.id} className="p-4 flex items-center justify-between hover:bg-bg-hover transition-colors cursor-pointer">
                <div>
                  <div className="font-medium text-sm">{setting.label}</div>
                  <div className="text-xs text-text-secondary mt-2">{setting.desc}</div>
                </div>
                <div className={`w-10 h-6 rounded-full p-2 transition-colors ${setting.active ? 'bg-accent-brand' : 'bg-bg-active border border-border-strong'}`}>
                  <div className={`w-4 h-4 rounded-full bg-text-primary transition-transform ${setting.active ? 'translate-x-4' : ''}`}></div>
                </div>
              </div>
            ))}
          </Card>
        </section>

        <section>
          <h2 className="text-lg font-medium mb-4">Integrations</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { name: "Shopify", status: "Connected", mock: false },
              { name: "Etsy", status: "Connected", mock: false },
              { name: "USPS API", status: "Mock", mock: true },
              { name: "Stripe", status: "Connected", mock: false },
              { name: "Weather API", status: "Mock", mock: true },
            ].map(int => (
              <Card key={int.name} className="p-4 flex items-center justify-between">
                <div className="font-medium">{int.name}</div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary">{int.status}</span>
                  <StatusDot status={int.mock ? "warn" : "ok"} />
                </div>
              </Card>
            ))}
          </div>
        </section>

        {isDev && (
          <section className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h2 className="text-lg font-medium mb-4 text-status-info flex items-center gap-2">
              <TerminalSquare className="w-5 h-5" />
              Developer Tools
            </h2>
            <Card className="border-status-info/20 divide-y divide-border-subtle p-0">
              <div className="p-4 flex items-center justify-between hover:bg-bg-hover transition-colors cursor-pointer" onClick={() => toggleSetting('demoMode')}>
                <div>
                  <div className="font-medium text-sm text-status-info">Demo Mode</div>
                  <div className="text-xs text-text-secondary mt-2">Enables scripted scenarios and workflow simulations.</div>
                </div>
                <div className={`w-10 h-6 rounded-full p-2 transition-colors ${settings.demoMode ? 'bg-status-info' : 'bg-bg-active border border-border-strong'}`}>
                  <div className={`w-4 h-4 rounded-full bg-text-primary transition-transform ${settings.demoMode ? 'translate-x-4' : ''}`}></div>
                </div>
              </div>
              <div className="p-4 flex items-center justify-between hover:bg-bg-hover transition-colors cursor-pointer" onClick={() => toggleSetting('loadingMode')}>
                <div>
                  <div className="font-medium text-sm">Force Loading State</div>
                  <div className="text-xs text-text-secondary mt-2">Forces skeleton UI to persist across all data views.</div>
                </div>
                <div className={`w-10 h-6 rounded-full p-2 transition-colors ${settings.loadingMode ? 'bg-status-warn text-text-primary' : 'bg-bg-active border border-border-strong'}`}>
                  <div className={`w-4 h-4 rounded-full bg-text-primary transition-transform ${settings.loadingMode ? 'translate-x-4' : ''}`}></div>
                </div>
              </div>
              <div className="p-4 flex items-center justify-between hover:bg-bg-hover transition-colors cursor-pointer" onClick={() => toggleSetting('errorMode')}>
                <div>
                  <div className="font-medium text-sm">Force Error State</div>
                  <div className="text-xs text-text-secondary mt-2">Simulates fetch failures across all data views.</div>
                </div>
                <div className={`w-10 h-6 rounded-full p-2 transition-colors ${settings.errorMode ? 'bg-status-alert' : 'bg-bg-active border border-border-strong'}`}>
                  <div className={`w-4 h-4 rounded-full bg-text-primary transition-transform ${settings.errorMode ? 'translate-x-4' : ''}`}></div>
                </div>
              </div>
              <div className="p-4 flex items-center justify-between hover:bg-bg-hover transition-colors cursor-pointer" onClick={() => toggleSetting('emptyMode')}>
                <div>
                  <div className="font-medium text-sm">Force Empty State</div>
                  <div className="text-xs text-text-secondary mt-2">Simulates zero-result responses for all lists.</div>
                </div>
                <div className={`w-10 h-6 rounded-full p-2 transition-colors ${settings.emptyMode ? 'bg-text-tertiary' : 'bg-bg-active border border-border-strong'}`}>
                  <div className={`w-4 h-4 rounded-full bg-text-primary transition-transform ${settings.emptyMode ? 'translate-x-4' : ''}`}></div>
                </div>
              </div>
              <div className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">Reset Mocked Data</div>
                  <div className="text-xs text-text-secondary mt-2">Restores data to pristine v1 state.</div>
                </div>
                <Button variant="outline" className="h-8" onClick={() => window.location.reload()}>Reset Data</Button>
              </div>
              <div className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm flex items-center gap-2">
                    <Keyboard className="w-4 h-4" /> Command Palette
                  </div>
                  <div className="text-xs text-text-secondary mt-2">Global search and command execution.</div>
                </div>
                <Button variant="outline" className="h-8 px-2 flex items-center gap-2" onClick={() => setCommandPaletteOpen(true)}>
                  <kbd className="font-sans text-[10px] bg-bg-active px-2 rounded">⌘</kbd>
                  <kbd className="font-sans text-[10px] bg-bg-active px-2 rounded">K</kbd>
                </Button>
              </div>
              <div className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">Write history</div>
                  <div className="text-xs text-text-secondary mt-2">
                    Lightweight local write log for debugging (FIFO 1000 entries).
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="h-8"
                  type="button"
                  onClick={() => navigate("/dev/history")}
                >
                  Open
                </Button>
              </div>
            </Card>
          </section>
        )}

      </div>
    </div>
  );
}
