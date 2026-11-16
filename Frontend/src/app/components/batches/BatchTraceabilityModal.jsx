"use client";

import { useEffect, useState } from "react";
import { GitBranch, Loader2, MapPin, Scale, ShoppingCart } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getBatchTraceability } from "@/lib/batchService";

function Empty({ children }) {
  return <p className="text-xs text-slate-400 italic">{children}</p>;
}

export function BatchTraceabilityModal({ open, onClose, farmId, batchId, batchLabel }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !farmId || !batchId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getBatchTraceability(farmId, batchId)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, farmId, batchId]);

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="w-[96vw] max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-purple-600" />
            Trazabilidad — {batchLabel}
          </DialogTitle>
          <DialogDescription>
            Origen, divisiones, estanques, ciclos y crecimiento registrado para la familia del lote.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Cargando trazabilidad…
          </div>
        )}
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {!loading && data && (
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-xl border p-4 space-y-2">
              <h3 className="font-semibold flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> Origen</h3>
              {data.origins?.length ? data.origins.map((origin, index) => (
                <div key={`${origin.batch_id}-${index}`} className="text-sm rounded-lg bg-slate-50 p-3">
                  <p className="font-medium">{origin.batch_code}</p>
                  <p>{origin.type === "purchase" ? `Compra #${origin.purchase_id}` : "Registro inicial"} · {origin.date}</p>
                  {origin.supplier && <p>Proveedor: {origin.supplier} ({origin.supplier_document})</p>}
                  {origin.invoice_number && <p>Factura: {origin.invoice_number}</p>}
                </div>
              )) : <Empty>Sin origen externo registrado.</Empty>}
            </section>

            <section className="rounded-xl border p-4 space-y-2">
              <h3 className="font-semibold flex items-center gap-2"><GitBranch className="h-4 w-4" /> Genealogía</h3>
              <p className="text-xs text-slate-500">
                Lote consultado: {data.batch?.code || batchLabel}. Las flechas muestran el lote origen y cada remanente derivado.
              </p>
              {data.genealogy?.length ? data.genealogy.map((link) => (
                <div key={`${link.parent_id}-${link.child_id}`} className="text-sm rounded-lg border border-purple-100 bg-purple-50/60 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-blue-100 px-2 py-0.5 font-medium text-blue-800">Origen: {link.parent_code}</span>
                    <span aria-hidden="true">→</span>
                    <span className="rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-800">Remanente: {link.child_code}</span>
                  </div>
                  <p className="mt-2 text-slate-600">Cantidad separada: {link.quantity} peces</p>
                </div>
              )) : <Empty>Este lote no ha sido dividido ni derivado.</Empty>}
            </section>

            <section className="rounded-xl border p-4 space-y-2 md:col-span-2">
              <h3 className="font-semibold flex items-center gap-2"><MapPin className="h-4 w-4" /> Recorrido productivo</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {data.pond_assignments?.map((assignment) => (
                  <div key={assignment.id} className="text-sm rounded-lg border-l-4 border-blue-400 bg-blue-50/50 p-3">
                    <p className="font-medium">{assignment.batch_code} · {assignment.pond}</p>
                    <p>{assignment.start_date} → {assignment.end_date || "actual"}</p>
                    <p>{assignment.initial_quantity} iniciales · {assignment.current_quantity} actuales</p>
                  </div>
                ))}
                {data.transfers?.map((transfer) => (
                  <div key={transfer.id} className="text-sm rounded-lg border-l-4 border-amber-400 bg-amber-50/50 p-3">
                    <p className="font-medium">Traslado · {transfer.date}</p>
                    <p>{transfer.from_pond} → {transfer.to_pond} · {transfer.quantity} peces</p>
                    <p className="text-slate-500">{transfer.reason}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border p-4 space-y-2 md:col-span-2">
              <h3 className="font-semibold flex items-center gap-2"><Scale className="h-4 w-4" /> Crecimiento</h3>
              {data.growth?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left border-b"><th>Fecha</th><th>Ciclo</th><th>Mín.</th><th>Prom.</th><th>Máx.</th><th>Mortalidad</th></tr></thead>
                    <tbody>{data.growth.map((point, index) => (
                      <tr key={`${point.cycle_id}-${point.date}-${index}`} className="border-b last:border-0">
                        <td className="py-2">{point.date}</td><td>{point.cycle}</td><td>{point.min_weight_g} g</td><td>{point.avg_weight_g} g</td><td>{point.max_weight_g} g</td><td>{point.mortality_quantity}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <Empty>El lote todavía no tiene evaluaciones biométricas.</Empty>}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
