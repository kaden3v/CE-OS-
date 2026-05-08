import React, { useMemo, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useDataState } from "@/hooks/useDataState";
import { LoadingTable, ErrorState, EmptyState } from "@/components/ui/StateRenderer";
import { Store, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useApp } from "@/contexts/AppContext";
import { Input } from "@/components/ui/Input";

const INITIAL_VENDORS = [
  { id: 1, name: "Mountain Crest Gardens", category: "Plants", ytd: 450.00, lastOrder: "2 months ago", contact: "wholesale@example.com" },
  { id: 2, name: "Carnivero", category: "Plants", ytd: 820.00, lastOrder: "4 months ago", contact: "sales@example.com" },
  { id: 3, name: "USPS", category: "Shipping", ytd: 1450.50, lastOrder: "1 week ago", contact: "N/A" },
  { id: 4, name: "Amazon Business", category: "Supplies", ytd: 340.25, lastOrder: "3 weeks ago", contact: "N/A" },
  { id: 5, name: "Sphagnum Moss Co.", category: "Media", ytd: 290.00, lastOrder: "2 months ago", contact: "orders@moss.com" },
];

export default function Vendors() {
  const [vendors, setVendors] = useState(INITIAL_VENDORS);
  const { data, isLoading, isError, isEmpty } = useDataState(vendors);
  const { addToast } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("Supplies");
  const [newContact, setNewContact] = useState("");

  const handleAddVendor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return;

    setVendors([{
      id: Date.now(),
      name: newName,
      category: newCategory,
      ytd: 0,
      lastOrder: "Never",
      contact: newContact || "N/A"
    }, ...vendors]);
    
    setIsModalOpen(false);
    setNewName("");
    setNewCategory("Supplies");
    setNewContact("");
    addToast({ title: "Vendor Added", description: `${newName} has been added to your directory.`, status: "success" });
  };

  const columns = useMemo(() => [
    {
      accessorKey: "name",
      header: "Name",
      cell: (info: any) => <span className="font-medium">{info.getValue()}</span>,
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: (info: any) => <Badge>{info.getValue()}</Badge>,
    },
    {
      accessorKey: "ytd",
      header: "Total Spent YTD",
      cell: (info: any) => <span className="tabular-nums">${info.getValue().toFixed(2)}</span>,
    },
    {
      accessorKey: "lastOrder",
      header: "Last Order",
      cell: (info: any) => <span className="text-text-secondary">{info.getValue()}</span>,
    },
    {
      accessorKey: "contact",
      header: "Contact",
      cell: (info: any) => <span className="text-text-secondary">{info.getValue()}</span>,
    },
  ], []);

  return (
    <div className="p-8 max-w-7xl mx-auto h-full flex flex-col relative">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Vendors</h1>
          <p className="text-sm text-text-secondary">Directory of suppliers, nurseries, and service providers.</p>
        </div>
        <Button variant="brand" onClick={() => setIsModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Vendor
        </Button>
      </div>

      <Card className="flex-1 overflow-auto flex flex-col">
        {isLoading && <LoadingTable cols={5} rows={8} />}
        {isError && <ErrorState />}
        {!isLoading && !isError && isEmpty && (
          <EmptyState 
            icon={Store} 
            title="No vendors yet" 
            description="Directory of suppliers, nurseries, and service providers." 
            action={<Button variant="outline" onClick={() => setIsModalOpen(true)}>Add Vendor</Button>}
          />
        )}
        {!isLoading && !isError && !isEmpty && <DataTable columns={columns} data={data} />}
      </Card>

      {/* Add Vendor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-bg-elevated border-border-strong shadow-2xl flex flex-col">
             <div className="flex items-center justify-between p-4 border-b border-border-subtle shrink-0">
              <h2 className="text-lg font-semibold">New Vendor</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-text-secondary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddVendor} className="flex-1 overflow-y-auto p-4 space-y-4">
               <div>
                  <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Company Name</label>
                  <Input 
                    type="text" 
                    required
                    placeholder="E.g. XYZ Nursery" 
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                  />
               </div>
               <div>
                  <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Category</label>
                  <select 
                    className="w-full bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong transition-colors"
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                  >
                    <option>Plants</option>
                    <option>Seeds</option>
                    <option>Media</option>
                    <option>Supplies</option>
                    <option>Shipping</option>
                    <option>Other</option>
                  </select>
               </div>
               <div>
                  <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Contact Info</label>
                  <Input 
                    type="text" 
                    placeholder="Email or phone" 
                    value={newContact}
                    onChange={e => setNewContact(e.target.value)}
                  />
               </div>
               <div className="mt-8 pt-4 flex justify-end gap-3 border-t border-border-subtle">
                <Button variant="ghost" type="button" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button type="submit">Save Vendor</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
