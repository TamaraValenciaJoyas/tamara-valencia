"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPrestamos, eliminarPrestamo } from "@/lib/supabase/prestamos";
import Link from "next/link";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

export default function PrestamosPage() {
  const queryClient = useQueryClient();
  const [filtroEstado, setFiltroEstado] = useState("activo");
  const [eliminandoId, setEliminandoId] = useState(null);

  const { data: prestamos = [], isLoading } = useQuery({
    queryKey: ["prestamos", filtroEstado],
    queryFn: () => getPrestamos(filtroEstado),
    staleTime: 2 * 60 * 1000,
  });

  const handleEliminar = async (prestamo) => {
    if (
      !confirm(
        `¿Eliminar el préstamo de ${prestamo.distribuidora?.nombre}? No se puede deshacer.`,
      )
    )
      return;

    setEliminandoId(prestamo.id);
    try {
      await eliminarPrestamo(prestamo.id);
      queryClient.invalidateQueries({ queryKey: ["prestamos"] });
    } catch (error) {
      console.error("Error al eliminar el préstamo:", error);
      alert("Error al eliminar el préstamo: " + error.message);
    } finally {
      setEliminandoId(null);
    }
  };

  const formatFecha = (fecha) => {
    if (!fecha) return "-";
    return new Date(fecha).toLocaleDateString("es-EC", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  // Cuenta cuántas joyas siguen prestadas en un préstamo
  const contarPrestadas = (detalle) =>
    detalle
      ?.filter((d) => d.estado_item === "prestado")
      .reduce((sum, d) => sum + d.cantidad, 0) || 0;

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="flex justify-between items-center mb-8">
        <h1 className="font-elegant text-4xl font-light text-gray-900">
          Préstamos a Distribuidoras
        </h1>
        <Link
          href="/admin/prestamos/nuevo"
          className="px-6 py-3 bg-gray-900 text-white text-sm uppercase tracking-wider hover:bg-gray-800 transition-colors"
        >
          Nuevo Préstamo
        </Link>
      </div>

      {/* Filtro de estado */}
      <div className="flex gap-2 mb-6">
        {[
          { value: "activo", label: "Activos" },
          { value: "finalizado", label: "Finalizados" },
          { value: "", label: "Todos" },
        ].map((op) => (
          <button
            key={op.value}
            onClick={() => setFiltroEstado(op.value)}
            className={`px-4 py-2 text-sm uppercase tracking-wider transition-colors ${
              filtroEstado === op.value
                ? "bg-gray-900 text-white"
                : "border border-gray-300 text-gray-700 hover:border-gray-900"
            }`}
          >
            {op.label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="bg-white border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                #
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Distribuidora
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Fecha
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Joyas prestadas
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Estado
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {prestamos.map((prestamo, index) => (
              <tr key={prestamo.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm text-gray-500">{index + 1}</td>
                <td className="px-6 py-4">
                  <p className="text-sm font-medium text-gray-900">
                    {prestamo.distribuidora?.nombre}
                  </p>
                  {prestamo.distribuidora?.telefono && (
                    <p className="text-xs text-gray-500">
                      {prestamo.distribuidora.telefono}
                    </p>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {formatFecha(prestamo.fecha_prestamo)}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {contarPrestadas(prestamo.detalle)}{" "}
                  <span className="text-gray-400">
                    /{" "}
                    {prestamo.detalle?.reduce((s, d) => s + d.cantidad, 0) || 0}{" "}
                    total
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`px-2 py-1 text-xs uppercase tracking-wider ${
                      prestamo.estado === "activo"
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {prestamo.estado}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/admin/prestamos/${prestamo.id}`}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Ver detalle
                    </Link>
                    {prestamo.estado === "finalizado" && (
                      <button
                        onClick={() => handleEliminar(prestamo)}
                        disabled={eliminandoId === prestamo.id}
                        className="text-red-600 hover:text-red-900 disabled:opacity-50"
                      >
                        {eliminandoId === prestamo.id
                          ? "Eliminando..."
                          : "Eliminar"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {prestamos.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">
              No hay préstamos{" "}
              {filtroEstado ? `en estado "${filtroEstado}"` : ""}
            </p>
          </div>
        )}
      </div>

      <div className="mt-6">
        <Link
          href="/admin"
          className="text-gray-600 hover:text-gray-900 text-sm"
        >
          ← Volver al Dashboard
        </Link>
      </div>
    </div>
  );
}
