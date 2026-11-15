'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/apiConfig";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * AssignPondBatchToCycleForm — pond-scoped.
 * Assigns a pond-batch to a cycle using the new endpoint:
 *   POST /farms/{farm_pk}/ponds/{pond_pk}/cycles/{cycle_pk}/pond-batches/
 *
 * @param {string} farmId        - farm ID
 * @param {string} pondId        - pond ID (the batch's pond)
 * @param {number} pondBatchId   - the pond_batch record ID to assign
 */
export function AssignCycleForm({ farmId, pondId, pondBatchId, defaultQuantity }) {
  const [cycles, setCycles] = useState([]);
  const [destinationPonds, setDestinationPonds] = useState([]);
  const [speciesMap, setSpeciesMap] = useState({});
  const [loadingCycles, setLoadingCycles] = useState(true);
  const [cycle, setCycle] = useState("");
  const [quantity, setQuantity] = useState(String(defaultQuantity || ""));
  const [destinationPond, setDestinationPond] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!farmId || !pondId) return;
    const fetchData = async () => {
      const token = localStorage.getItem("access");
      try {
        // Fetch species for display labels
        const speciesRes = await fetch(`${API_BASE}/species/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (speciesRes.ok) {
          const sData = await speciesRes.json();
          const sArray = Array.isArray(sData) ? sData : [];
          setSpeciesMap(
            sArray.reduce((acc, curr) => ({ ...acc, [curr.id]: curr.name }), {})
          );
        }

        // Fetch pond-scoped cycles and empty destination ponds.
        const [res, pondsRes] = await Promise.all([
          fetch(`${API_BASE}/farms/${farmId}/ponds/${pondId}/cycles/`, {
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          }),
          fetch(`${API_BASE}/farms/${farmId}/ponds/`, {
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          }),
        ]);
        if (res.ok) {
          const data = await res.json();
          const activeCycles = Array.isArray(data)
            ? data.filter((c) => c.state === "in_progress")
            : [];
          setCycles(activeCycles);
        } else {
          console.error("Error fetching cycles:", res.statusText);
          toast.error("No se pudieron cargar los ciclos del estanque.");
        }
        if (pondsRes.ok) {
          const pondData = await pondsRes.json();
          setDestinationPonds(
            (Array.isArray(pondData) ? pondData : []).filter(
              (item) => String(item.id) !== String(pondId) && item.status === "active"
            )
          );
        }
      } catch (err) {
        console.error("Error fetching data:", err);
        toast.error("Error de conexión al cargar ciclos.");
      } finally {
        setLoadingCycles(false);
      }
    };
    fetchData();
  }, [farmId, pondId]);

  const extractErrors = (obj) => {
    if (typeof obj === "string") return obj;
    if (Array.isArray(obj)) return obj.join(", ");
    if (typeof obj === "object" && obj !== null) {
      return Object.entries(obj)
        .map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(", ") : val}`)
        .join(" | ");
    }
    return "";
  };

  const handleSubmit = async () => {
    if (!cycle) {
      toast.error("Debe seleccionar un ciclo en progreso.");
      return;
    }
    if (!pondBatchId) {
      toast.error("Error: ID de lote de estanque no válido.");
      return;
    }
    const parsedQuantity = Number(quantity);
    const availableQuantity = Number(defaultQuantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      toast.error("La cantidad usada en el ciclo debe ser un entero positivo.");
      return;
    }
    if (parsedQuantity > availableQuantity) {
      toast.error(`Solo hay ${availableQuantity} peces disponibles.`);
      return;
    }
    if (parsedQuantity < availableQuantity && !destinationPond) {
      toast.error("Selecciona el estanque para trasladar el remanente.");
      return;
    }

    setSubmitting(true);
    const token = localStorage.getItem("access");

    const payload = {
      pond_batch: parseInt(pondBatchId),
      cycle: parseInt(cycle),
      quantity: parsedQuantity,
      ...(parsedQuantity < availableQuantity && {
        destination_pond: Number(destinationPond),
      }),
    };

    try {
      const res = await fetch(
        `${API_BASE}/farms/${farmId}/ponds/${pondId}/cycles/${cycle}/cycle-batches/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const errorData = await res.clone().json().catch(() => ({}));
        const parsedError = extractErrors(errorData);
        toast.error(parsedError || `Error ${res.status}: Ocurrió un error inesperado`);
        return;
      }

      toast.success("Lote vinculado correctamente al ciclo.");
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      console.error("Error vinculando ciclo:", err);
      toast.error("Error de conexión. Verifica tu internet e intenta nuevamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FieldGroup>
      <Field>
        <FieldLabel>Ciclo en Progreso</FieldLabel>
        <Select onValueChange={setCycle} value={cycle} disabled={loadingCycles || submitting}>
          <SelectTrigger>
            <SelectValue
              placeholder={
                loadingCycles
                  ? "Cargando ciclos..."
                  : cycles.length === 0
                  ? "No hay ciclos en progreso"
                  : "Seleccione un ciclo"
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {cycles.map((item) => (
                <SelectItem key={item.id} value={item.id.toString()}>
                  {item.name}
                  {item.specie
                    ? ` (${speciesMap[item.specie] || "Especie #" + item.specie})`
                    : ""}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {!loadingCycles && cycles.length === 0 && (
          <p className="text-sm text-amber-600 mt-1">
            No hay ciclos en progreso en este estanque. Crea uno primero.
          </p>
        )}
      </Field>

      <Field>
        <FieldLabel>Cantidad que iniciará el ciclo</FieldLabel>
        <Input
          type="number"
          min="1"
          max={defaultQuantity}
          step="1"
          value={quantity}
          onChange={(event) => {
            setQuantity(event.target.value);
            if (Number(event.target.value) >= Number(defaultQuantity)) {
              setDestinationPond("");
            }
          }}
          disabled={submitting}
        />
        <p className="text-xs text-slate-500">
          Disponibles: {defaultQuantity}. Si usas menos, el remanente debe trasladarse.
        </p>
      </Field>

      {Number(quantity) > 0 && Number(quantity) < Number(defaultQuantity) && (
        <Field>
          <FieldLabel>Estanque destino del remanente</FieldLabel>
          <Select
            onValueChange={setDestinationPond}
            value={destinationPond}
            disabled={submitting}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona un estanque activo y vacío" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {destinationPonds.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.name} · capacidad {item.capacity}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <p className="text-xs text-amber-700">
            Se crearán un lote derivado y un movimiento trazable por {Number(defaultQuantity) - Number(quantity)} peces.
          </p>
        </Field>
      )}

      <Field orientation="horizontal" className="justify-end gap-3 mt-4">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={
            !cycle ||
            submitting ||
            loadingCycles ||
            (Number(quantity) < Number(defaultQuantity) && !destinationPond)
          }
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "Vinculando..." : "Vincular a Ciclo"}
        </Button>
      </Field>
    </FieldGroup>
  );
}
