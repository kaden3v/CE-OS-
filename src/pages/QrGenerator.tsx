import { useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Download, Printer, QrCode } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useApp } from "@/contexts/AppContext";
import { useEntity } from "@/hooks/useEntity";
import { friendlyDbError } from "@/lib/dbErrors";
import type { Tables } from "@/lib/database.types";

type QrCode = Tables<"qr_codes">;
type Cultivar = Tables<"cultivars">;

export default function QrGenerator() {
  const { data: cultivars } = useEntity<Cultivar>("cultivars", [], {
    toRow: (c) => ({ name: c.name }),
  });
  const { data: codes, add } = useEntity<QrCode>("qr_codes", [], {
    toRow: (q) => ({
      code: q.code,
      cultivar_id: q.cultivar_id,
      inventory_id: q.inventory_id,
      scan_count: q.scan_count,
      last_scanned_at: q.last_scanned_at,
    }),
  });
  const { addToast } = useApp();

  const [cultivarId, setCultivarId] = useState<string>("");
  const [size, setSize] = useState("starter");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  const cultivar = cultivars.find((c) => c.id === cultivarId) ?? cultivars[0];
  const slug = (cultivar?.name ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const code = `${slug}-${size}-${date}`;
  const url = `https://canyonexotics.com/scan/${code}`;

  const generate = async () => {
    if (!cultivar) return;
    const result = await add({
      id: crypto.randomUUID(),
      code,
      cultivar_id: cultivar.id,
      inventory_id: null,
      scan_count: 0,
      last_scanned_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as QrCode);
    if (result.ok === false) {
      addToast({ title: "Couldn't save QR", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }
    addToast({ title: "QR code saved", description: code, status: "ok" });
  };

  return (
    <div className="flex flex-col h-full p-4 md:p-8 max-w-7xl mx-auto overflow-y-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link to="/inventory">
            <Button variant="outline" className="w-10 px-0" aria-label="Back to inventory">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold">QR Generator</h1>
            <p className="text-sm text-text-secondary">Create scannable codes that link to plant info.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <QrCode className="w-4 h-4" />
          {codes.length} saved
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div>
            <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Cultivar</label>
            {cultivars.length === 0 ? (
              <p className="text-sm text-text-tertiary italic">Add cultivars first → <Link className="text-accent-brand hover:underline" to="/cultivars">Cultivars Registry</Link></p>
            ) : (
              <select
                className="w-full bg-bg-base border border-border-subtle rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-border-strong"
                value={cultivarId || cultivars[0].id}
                onChange={(e) => setCultivarId(e.target.value)}
              >
                {cultivars.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Size</label>
            <select className="w-full bg-bg-base border border-border-subtle rounded-lg px-2 py-2 text-sm" value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="starter">Starter</option>
              <option value="intermediate">Intermediate</option>
              <option value="mature">Mature</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Acquisition Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <Button variant="brand" className="w-full" onClick={generate} disabled={!cultivar}>
            Generate &amp; Save
          </Button>
        </div>

        <Card className="p-8 flex flex-col items-center justify-center min-h-[400px]">
          <div className="w-[240px] h-[240px] bg-bg-active border border-border-subtle rounded-xl flex items-center justify-center p-4 mb-8">
            <div className="w-full h-full border-4 border-text-primary rounded-sm p-2 flex flex-col justify-between opacity-80">
              <div className="flex justify-between">
                <div className="w-12 h-12 bg-text-primary"></div>
                <div className="w-12 h-12 bg-text-primary"></div>
              </div>
              <div className="flex justify-center flex-1 py-4">
                <div className="w-3/4 h-full border-8 border-dashed border-text-primary opacity-50"></div>
              </div>
              <div className="flex justify-start">
                <div className="w-12 h-12 bg-text-primary"></div>
              </div>
            </div>
          </div>

          <div className="text-center w-full max-w-sm mb-8">
            <div className="text-xs text-text-secondary uppercase tracking-wider mb-2">Encoded URL</div>
            <div className="p-2 bg-bg-base border border-border-subtle rounded-md text-[10px] text-text-primary font-mono break-all text-left">
              {url}
            </div>
          </div>

          <div className="flex items-center gap-2 w-full max-w-sm">
            <Button variant="outline" className="flex-1" onClick={() => addToast({ title: "Print queued", status: "info" })}>
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => addToast({ title: "Download started", status: "info" })}>
              <Download className="w-4 h-4 mr-2" />
              SVG
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
