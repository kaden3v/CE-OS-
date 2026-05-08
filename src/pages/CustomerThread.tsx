import { ArrowLeft, Send, Package, ShoppingBag, Eye } from "lucide-react";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useState } from "react";

const MOCK_JOURNEY = [
  { id: 1, type: "system", text: "Customer account created via Shopify integration.", time: "Sep 15, 8:20 AM", channel: "System Log" },
  { id: 2, type: "order", text: "Order ORD-1192 placed for $45.00", time: "Sep 15, 8:45 AM", channel: "Shopify" },
  { id: 3, type: "shipment", text: "Order ORD-1192 shipped via USPS Ground Advantage.", time: "Sep 17, 2:10 PM", channel: "PirateShip Integration" },
  { id: 4, type: "customer", text: "Hi, I have a question about my recent order of P. 'Pirouette'. Do they need to be kept in high humidity right away?", time: "Oct 12, 10:42 AM", channel: "Etsy Message" },
  { id: 5, type: "system_msg", text: "Auto-reply sent: Thank you for your message. We typically respond within 24 hours.", time: "Oct 12, 10:42 AM", channel: "Auto-Reply" },
  { id: 6, type: "you", text: "Hello! Yes, it's best to keep them in high humidity (like a bag or dome) for the first week to help them acclimate after shipping stress.", time: "Oct 12, 2:15 PM", channel: "Etsy Message" },
  { id: 7, type: "customer", text: "Perfect, thank you! They arrived looking great.", time: "Oct 12, 3:00 PM", channel: "Etsy Message" },
  { id: 8, type: "order", text: "Order ORD-1240 placed for $62.00", time: "Nov 02, 11:30 AM", channel: "Etsy" },
];

export default function CustomerThread() {
  const { id } = useParams();
  const [showTracker, setShowTracker] = useState(false);

  return (
    <div className="flex h-full flex-col p-4 md:p-8 max-w-4xl mx-auto relative">
      <div className="mb-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
           <Link to="/customers">
             <Button variant="outline" className="w-10 px-0">
               <ArrowLeft className="w-4 h-4" />
             </Button>
           </Link>
           <div>
             <h1 className="text-2xl font-semibold">Customer Journey Timeline</h1>
             <p className="text-sm text-text-secondary">Customer ID: {id} • Merged interactions across all channels</p>
           </div>
        </div>
        <Button variant="outline" onClick={() => setShowTracker(true)}>
           <Eye className="w-4 h-4 mr-2" />
           Preview Public Tracker
        </Button>
      </div>

      <Card className="flex-1 flex flex-col min-h-[500px] overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 flex flex-col relative before:absolute before:inset-y-0 before:left-[27px] md:before:left-[39px] before:w-px before:bg-border-subtle">
          {MOCK_JOURNEY.map((evt) => (
            <div key={evt.id} className="relative flex items-start gap-4 z-10 w-full pl-2">
               
               {evt.type === "system" || evt.type === "system_msg" ? (
                  <div className="flex flex-col items-start w-full ml-8 md:ml-14 mb-2">
                     <div className="text-xs text-text-tertiary bg-bg-active px-2 py-2 rounded border border-border-subtle">
                        {evt.text}
                     </div>
                  </div>
               ) : evt.type === "order" ? (
                  <div className="flex items-start w-full">
                     <div className="w-8 h-8 rounded-full bg-accent-brand/20 border-2 border-bg-elevated flex items-center justify-center shrink-0 mt-2 shadow-sm mr-4 z-10">
                        <ShoppingBag className="w-3.5 h-3.5 text-accent-brand" />
                     </div>
                     <div className="flex-1">
                        <div className="bg-bg-active px-4 py-2 rounded-lg border border-border-subtle shadow-sm max-w-lg">
                           <div className="text-sm font-medium">{evt.text}</div>
                           <div className="text-[10px] text-text-tertiary mt-2 flex items-center gap-2 uppercase tracking-wider">
                              <span>{evt.time}</span>
                              <span>•</span>
                              <span>{evt.channel}</span>
                           </div>
                        </div>
                     </div>
                  </div>
               ) : evt.type === "shipment" ? (
                  <div className="flex items-start w-full">
                     <div className="w-8 h-8 rounded-full bg-status-info/20 border-2 border-bg-elevated flex items-center justify-center shrink-0 mt-2 shadow-sm mr-4 z-10">
                        <Package className="w-3.5 h-3.5 text-status-info" />
                     </div>
                     <div className="flex-1">
                        <div className="bg-bg-active px-4 py-2 rounded-lg border border-border-subtle shadow-sm max-w-lg border-l-2 border-l-status-info">
                           <div className="text-sm">{evt.text}</div>
                           <div className="text-[10px] text-text-tertiary mt-2 flex items-center gap-2 uppercase tracking-wider">
                              <span>{evt.time}</span>
                              <span>•</span>
                              <span>{evt.channel}</span>
                           </div>
                        </div>
                     </div>
                  </div>
               ) : (
                  <div className={cn("flex w-full items-start", evt.type === "you" ? "flex-row-reverse pr-2" : "")}>
                     {evt.type !== "you" && (
                        <div className="w-8 h-8 rounded-full bg-bg-active border-2 border-bg-elevated flex items-center justify-center shrink-0 mt-2 shadow-sm mr-4 z-10 text-xs font-mono text-text-secondary">
                           CU
                        </div>
                     )}
                     <div className={cn("max-w-[70%] flex flex-col", evt.type === "you" ? "items-end" : "items-start")}>
                        <div className={cn("px-4 py-2 shadow-sm", evt.type === "you" ? "bg-accent-brand text-bg-base rounded-2xl rounded-tr-sm" : "bg-bg-base text-text-primary rounded-2xl rounded-tl-sm border border-border-subtle")}>
                           <div className="text-sm leading-relaxed">{evt.text}</div>
                        </div>
                        <div className="text-[10px] text-text-tertiary mt-2 flex items-center gap-2 uppercase tracking-wider px-2">
                           <span>{evt.time}</span>
                           <span>•</span>
                           <span>{evt.channel}</span>
                        </div>
                     </div>
                  </div>
               )}
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-border-subtle bg-bg-base/50 flex items-center gap-2 shrink-0">
          <Input placeholder="Type a message... (Will route to most recent channel)" className="flex-1 bg-bg-elevated" />
          <Button variant="brand" className="shrink-0">
            <Send className="w-4 h-4 md:mr-2" />
            <span className="hidden md:inline">Send</span>
          </Button>
        </div>
      </Card>

      {/* Public Tracker Modal Mockup */}
      {showTracker && (
         <div className="fixed inset-0 bg-bg-base/95 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl relative flex flex-col border border-border-strong h-[650px] max-h-[90vh]">
               <button onClick={() => setShowTracker(false)} className="absolute top-4 right-4 p-2 bg-text-primary/10 rounded-full hover:bg-text-primary/20 text-bg-base z-20">
                  <ArrowLeft className="w-4 h-4" />
               </button>
               {/* "Mobile App" Frame */}
               <div className="bg-text-primary text-bg-base p-6 pb-8 shrink-0 relative overflow-hidden">
                  <div className="absolute inset-0 opacity-10">
                     <div className="absolute right-0 top-0 w-64 h-64 bg-accent-brand rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                  </div>
                  <div className="relative z-10">
                     <h3 className="font-semibold tracking-wider uppercase text-xs opacity-70 mb-2">Canyon Exotics</h3>
                     <h2 className="text-2xl font-serif mb-2">Order ORD-1240</h2>
                     <p className="opacity-80 text-sm">Arriving Friday, Nov 10</p>
                  </div>
               </div>
               
               <div className="flex-1 bg-[#f8f9fa] overflow-y-auto p-6 text-[#1a1a1a]">
                  <div className="bg-white rounded-xl shadow-sm border border-[#e5e7eb] p-4 mb-6">
                     <div className="flex items-center gap-2 mb-4">
                        <div className="w-10 h-10 rounded-full bg-accent-brand/10 text-accent-brand flex items-center justify-center">
                           <Package className="w-5 h-5" />
                        </div>
                        <div>
                           <div className="font-medium text-sm">Status</div>
                           <div className="font-semibold text-lg text-accent-brand">In Transit</div>
                        </div>
                     </div>
                     <div className="h-2 bg-[#e5e7eb] rounded-full overflow-hidden">
                        <div className="h-full bg-accent-brand w-[60%] rounded-full"></div>
                     </div>
                     <div className="flex justify-between text-xs text-[#6b7280] font-medium mt-2">
                        <span>Prepared</span>
                        <span>Shipped</span>
                        <span>Delivered</span>
                     </div>
                  </div>

                  <h3 className="font-medium text-[#1a1a1a] mb-4">Tracking History</h3>
                  <div className="space-y-6 relative before:absolute before:inset-y-0 before:left-[11px] before:w-0.5 before:bg-[#e5e7eb]">
                     {[
                        { status: "Departed processing center", time: "Nov 08, 4:12 PM", loc: "Denver, CO", active: true },
                        { status: "Arrived at origin facility", time: "Nov 07, 8:45 PM", loc: "Phoenix, AZ", active: false },
                        { status: "Picked up by carrier", time: "Nov 07, 3:30 PM", loc: "Chandler, AZ", active: false },
                        { status: "Label created", time: "Nov 06, 11:15 AM", loc: "Chandler, AZ", active: false },
                     ].map((evt, idx) => (
                        <div key={idx} className="relative z-10 flex gap-4 pl-2">
                           <div className={cn("w-4 h-4 rounded-full border-2 border-white flex-shrink-0 mt-2", evt.active ? "bg-accent-brand shadow-[0_0_0_2px_rgba(194,113,79,0.2)]" : "bg-[#9ca3af]")}></div>
                           <div>
                              <div className={cn("font-medium text-sm", evt.active ? "text-[#1a1a1a]" : "text-[#4b5563]")}>{evt.status}</div>
                              <div className="text-xs text-[#6b7280] mt-2 space-x-2">
                                 <span>{evt.time}</span>
                                 <span>•</span>
                                 <span>{evt.loc}</span>
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
         </div>
      )}
    </div>
  );
}
