import { useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useApp } from "@/contexts/AppContext";

const CULTIVARS = [
  "Pinguicula 'Pirouette'",
  "P. agnata 'El Lobo'",
  "Pinguicula 'Johanna'",
  "Pinguicula gigantea",
  "Pinguicula moranensis"
];

export default function QrGenerator() {
  const [activeTab, setActiveTab] = useState("Single QR");
  const [cultivar, setCultivar] = useState(CULTIVARS[0]);
  const [size, setSize] = useState("starter");
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const { addToast } = useApp();

  // Mock URL generation logic
  const slug = cultivar.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const url = `rosette.app/import?species=${slug}&genus=pinguicula&source=canyon-exotics&size=${size}&date=${date}`;

  return (
    <div className="flex flex-col h-full p-4 md:p-8 max-w-7xl mx-auto overflow-y-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link to="/inventory">
            <Button variant="outline" className="w-10 px-0">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold">QR Generator</h1>
            <p className="text-sm text-text-secondary">Generate Rosette import codes for outgoing shipments.</p>
          </div>
        </div>
        <Link to="/inventory/qr-codes/analytics">
          <Button variant="outline">Analytics</Button>
        </Link>
      </div>

      <div className="flex gap-6 border-b border-border-subtle mb-6">
        {["Single QR", "Bulk Generation"].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 text-sm font-medium transition-colors relative ${activeTab === tab ? "text-text-primary" : "text-text-secondary hover:text-text-primary"}`}
          >
            {tab}
            {activeTab === tab && (
              <div className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-text-primary"></div>
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left: Form */}
        <div className="space-y-6">
           <div>
             <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Cultivar</label>
             <select 
               className="w-full bg-bg-base border border-border-subtle rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-border-strong hover:border-border-strong transition-colors"
               value={cultivar}
               onChange={e => setCultivar(e.target.value)}
             >
                {CULTIVARS.map(c => <option key={c} value={c}>{c}</option>)}
             </select>
           </div>
           
           <div>
             <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Size</label>
             <select 
               className="w-full bg-bg-base border border-border-subtle rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-border-strong hover:border-border-strong transition-colors"
               value={size}
               onChange={e => setSize(e.target.value)}
             >
                <option value="starter">Starter</option>
                <option value="intermediate">Intermediate</option>
                <option value="mature">Mature</option>
             </select>
           </div>

           <div>
             <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Acquisition Date</label>
             <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full" />
           </div>

           <div>
             <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Source</label>
             <Input type="text" value="canyon-exotics" disabled className="w-full bg-bg-active text-text-tertiary border-transparent" />
           </div>

           <Button variant="brand" className="w-full" onClick={() => addToast("QR Code generated successfully.", "success")}>Generate</Button>
        </div>

        {/* Right: Preview pane */}
        <Card className="p-8 flex flex-col items-center justify-center min-h-[400px]">
           <div className="w-[240px] h-[240px] bg-bg-active border border-border-subtle rounded-xl flex items-center justify-center p-4 mb-8">
              {/* Pseudo QR code */}
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
              <Button variant="outline" className="flex-1" onClick={() => addToast("Sent to printer line-up.", "info")}>
                <Printer className="w-4 h-4 mr-2" />
                Print (Care Card)
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => addToast("Downloading vector file...", "info")}>
                <Download className="w-4 h-4 mr-2" />
                Download SVG
              </Button>
           </div>
        </Card>
      </div>
    </div>
  );
}
