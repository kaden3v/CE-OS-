import React, { useState, useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { FileBadge, Plus, AlertTriangle, Calendar, Building2, Search, ShieldCheck, FileText, Trash2, Edit } from "lucide-react";
import { EmptyState } from "@/components/ui/StateRenderer";
import { cn } from "@/lib/utils";
import { useApp } from "@/contexts/AppContext";
import { calendarDaysUntilExpiry } from "@/lib/dates";

type LicenseType = "Federal" | "State" | "Local" | "Business";

interface License {
  id: string;
  name: string;
  number: string;
  body: string;
  type: LicenseType;
  expires: string; // YYYY-MM-DD
  note?: string;
}

const INITIAL_LICENSES: License[] = [
  { id: "1", name: "Nursery License", number: "AZ-NUR-82910", body: "Arizona Department of Agriculture", type: "State", expires: "2027-03-15" },
  { id: "2", name: "Home Occupation Permit", number: "CH-HOP-2022-44", body: "City of Chandler", type: "Local", expires: "2026-09-01" },
  { id: "3", name: "PPQ526 Permit", number: "P526P-23-10029", body: "USDA APHIS", type: "Federal", expires: "2026-06-15", note: "In renewal" },
  { id: "4", name: "LLC Annual Report", number: "L-29183492", body: "AZ Corporation Commission", type: "Business", expires: "2027-02-12" },
];

function getDaysRemaining(
  expiresStr: string,
  operatorTimezone: string
): number {
  return calendarDaysUntilExpiry(expiresStr, operatorTimezone);
}

function getStatusInfo(daysRemaining: number) {
  if (daysRemaining < 0) return { status: "error", label: "Expired", class: "text-status-alert" };
  if (daysRemaining <= 60) return { status: "warn", label: "Expiring Soon", class: "text-status-warn" };
  return { status: "ok", label: "Active", class: "text-status-ok" };
}

export default function Licenses() {
  const { settings } = useApp();
  const [licenses, setLicenses] = useState<License[]>(INITIAL_LICENSES);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<LicenseType | "All">("All");
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLicense, setEditingLicense] = useState<License | null>(null);

  // Form states
  const [formData, setFormData] = useState<Omit<License, "id">>({
    name: "",
    number: "",
    body: "",
    type: "Business",
    expires: "",
    note: "",
  });

  const handleOpenAdd = () => {
    setEditingLicense(null);
    setFormData({ name: "", number: "", body: "", type: "Business", expires: "", note: "" });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (license: License) => {
    setEditingLicense(license);
    setFormData({
      name: license.name,
      number: license.number,
      body: license.body,
      type: license.type,
      expires: license.expires,
      note: license.note || "",
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to remove this license?")) {
      setLicenses((prev) => prev.filter((l) => l.id !== id));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingLicense) {
      setLicenses((prev) => prev.map((l) => l.id === editingLicense.id ? { ...formData, id: l.id } : l));
    } else {
      setLicenses((prev) => [...prev, { ...formData, id: Math.random().toString(36).substring(2, 9) }]);
    }
    setIsModalOpen(false);
  };

  const filteredLicenses = useMemo(() => {
    return licenses.filter((l) => {
      const matchesSearch = l.name.toLowerCase().includes(search.toLowerCase()) || 
                            l.number.toLowerCase().includes(search.toLowerCase()) ||
                            l.body.toLowerCase().includes(search.toLowerCase());
      const matchesType = filterType === "All" || l.type === filterType;
      return matchesSearch && matchesType;
    }).sort(
      (a, b) =>
        getDaysRemaining(a.expires, settings.operatorTimezone) -
        getDaysRemaining(b.expires, settings.operatorTimezone)
    );
  }, [licenses, search, filterType, settings.operatorTimezone]);

  const metrics = useMemo(() => {
    let active = 0;
    let expiring = 0;
    let expired = 0;
    
    licenses.forEach(l => {
      const days = getDaysRemaining(l.expires, settings.operatorTimezone);
      if (days < 0) expired++;
      else if (days <= 60) expiring++;
      else active++;
    });
    
    return { active, expiring, expired, total: licenses.length };
  }, [licenses, settings.operatorTimezone]);

  return (
    <div className="p-8 max-w-7xl mx-auto h-full flex flex-col space-y-8">
      {/* Header and Actions */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Licenses & Permits</h1>
          <p className="text-sm text-text-secondary">Track regulatory expirations and compliance documents.</p>
        </div>
        <Button onClick={handleOpenAdd}>
          <Plus className="w-4 h-4 mr-2" />
          Add License
        </Button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center gap-4">
          <div className="p-3 bg-bg-hover rounded-lg text-text-primary">
            <FileBadge className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-semibold">{metrics.total}</div>
            <div className="text-xs text-text-secondary uppercase tracking-wider">Total</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="p-3 bg-status-ok/10 text-status-ok rounded-lg">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-semibold">{metrics.active}</div>
            <div className="text-xs text-text-secondary uppercase tracking-wider">Active</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="p-3 bg-status-warn/10 text-status-warn rounded-lg">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-semibold">{metrics.expiring}</div>
            <div className="text-xs text-text-secondary uppercase tracking-wider">Expiring &lt;60d</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="p-3 bg-status-alert/10 text-status-alert rounded-lg">
             <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-semibold">{metrics.expired}</div>
            <div className="text-xs text-text-secondary uppercase tracking-wider">Expired</div>
          </div>
        </Card>
      </div>

      {/* Filters and List */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border-subtle flex flex-col sm:flex-row gap-4 items-center justify-between bg-bg-elevated/50">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <Input 
              placeholder="Search licenses..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-full"
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            {(["All", "Federal", "State", "Local", "Business"] as const).map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-full whitespace-nowrap transition-colors border",
                  filterType === type 
                    ? "bg-text-primary text-bg-base border-text-primary font-medium" 
                    : "bg-transparent border-border-strong text-text-secondary hover:text-text-primary hover:border-text-primary"
                )}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-bg-base/30">
          {filteredLicenses.length === 0 ? (
            <div className="py-12">
              <EmptyState 
                icon={FileText} 
                title="No licenses found" 
                description={search ? "Try adjusting your search or filters." : "You haven't added any licenses yet."} 
                action={!search ? <Button variant="outline" className="mt-4" onClick={handleOpenAdd}>Add License</Button> : undefined} 
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredLicenses.map((lic) => {
                const daysRemaining = getDaysRemaining(
                  lic.expires,
                  settings.operatorTimezone
                );
                const info = getStatusInfo(daysRemaining);
                
                return (
                  <Card key={lic.id} className="relative group overflow-hidden border-border-subtle hover:border-border-strong transition-all duration-200">
                    {info.status === "error" && <div className="absolute top-0 left-0 w-1 h-full bg-status-alert"></div>}
                    {info.status === "warn" && <div className="absolute top-0 left-0 w-1 h-full bg-status-warn"></div>}
                    
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={cn("text-xs font-semibold px-2 py-0.5 rounded uppercase tracking-wider",
                              lic.type === "Federal" ? "bg-blue-500/10 text-blue-400" :
                              lic.type === "State" ? "bg-emerald-500/10 text-emerald-400" :
                              lic.type === "Local" ? "bg-amber-500/10 text-amber-400" :
                              "bg-purple-500/10 text-purple-400"
                            )}>
                              {lic.type}
                            </span>
                            {lic.note && <span className="text-xs italic text-status-warn bg-status-warn/10 px-2 py-0.5 rounded">{lic.note}</span>}
                          </div>
                          <h3 className="font-semibold text-lg text-text-primary leading-tight">{lic.name}</h3>
                          <div className="text-sm text-text-secondary flex items-center gap-1.5 mt-1">
                            <Building2 className="w-3.5 h-3.5" />
                            {lic.body}
                          </div>
                        </div>
                        <div className="text-right pl-4">
                          <span className={cn("block text-2xl font-bold tabular-nums leading-none mb-1", info.class)}>
                            {daysRemaining < 0 ? "0" : daysRemaining}
                          </span>
                          <span className="text-[10px] uppercase tracking-wider text-text-tertiary">Days Left</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border-subtle mt-4">
                        <div>
                          <div className="text-xs text-text-tertiary mb-1">License/Permit No.</div>
                          <div className="text-sm font-medium font-mono text-text-primary">{lic.number}</div>
                        </div>
                        <div>
                          <div className="text-xs text-text-tertiary mb-1">Expiration Date</div>
                          <div className={cn("text-sm font-medium", info.class)}>{lic.expires}</div>
                        </div>
                      </div>

                      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                        <button onClick={() => handleOpenEdit(lic)} className="p-1.5 bg-bg-elevated border border-border-subtle rounded-md text-text-secondary hover:text-text-primary shadow-sm">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(lic.id)} className="p-1.5 bg-bg-elevated border border-border-subtle rounded-md text-text-secondary hover:text-status-alert hover:border-status-alert/50 shadow-sm">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Add/Edit Modal */}
      <Dialog 
        open={isModalOpen} 
        onOpenChange={setIsModalOpen}
        title={editingLicense ? "Edit License" : "Add License"}
        description={editingLicense ? "Update the details of your tracking entry." : "Add a new regulatory permit or license to track."}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">License Name</label>
            <Input required placeholder="e.g. Nursery License" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Agency / Issuing Body</label>
            <Input required placeholder="e.g. USDA APHIS" value={formData.body} onChange={e => setFormData({...formData, body: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">License Number</label>
              <Input placeholder="Registration # or ID" value={formData.number} onChange={e => setFormData({...formData, number: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Type</label>
              <select 
                value={formData.type} 
                onChange={e => setFormData({...formData, type: e.target.value as LicenseType})}
                className="w-full bg-[rgba(0,0,0,0.2)] border border-border-strong rounded-md py-2 px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-text-primary shadow-inner appearance-none"
              >
                <option value="Federal">Federal</option>
                <option value="State">State</option>
                <option value="Local">Local</option>
                <option value="Business">Business</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Expiration Date</label>
              <Input required type="date" value={formData.expires} onChange={e => setFormData({...formData, expires: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Status Note (Optional)</label>
              <Input placeholder="e.g. In Renewal" value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} />
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-3 border-t border-border-subtle mt-6">
            <Button variant="ghost" type="button" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit">{editingLicense ? "Save Changes" : "Add License"}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
