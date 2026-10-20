"use client";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getDistribuidoraById } from "@/lib/supabase/distribuidoras";
import {
  getResumenComisiones,
  marcarComision,
  liquidarComisiones,
} from "@/lib/supabase/comisiones";
import { formatPrice } from "@/utils/formatters";
import Link from "next/link";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

export default function DetalleDistribuidoraPage({ params }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [procesando, setProcesando] = useState(false);

  const { data: distribuidora, isLoading: distLoading } = useQuery({
    queryKey: ["distribuidora", resolvedParams.id],
    queryFn: () => getDistribuidoraById(resolvedParams.id),
  });

  const { data: resumen, isLoading: resumenLoading } = useQuery({
    queryKey: ["comisiones-distribuidora", resolvedParams.id],
    queryFn: () => getResumenComisiones(resolvedParams.id),
    staleTime: 60 * 1000,
  });

  const comisiones = resumen?.comisiones || [];
  const hayPorCobrar = comisiones.some((c) => c.estado === "por_cobrar");

  const formatFecha = (fecha) => {
    if (!fecha) return "-";
    const [a, m, d] = fecha.split("-");
    return `${d}/${m}/${a}`;
  };

  const refrescar = () => {
    queryClient.invalidateQueries({
      queryKey: ["comisiones-distribuidora", resolvedParams.id],
    });
  };

  const handleToggle = async (idComision, estadoActual) => {
    setProcesando(true);
    try {
      await marcarComision(idComision, estadoActual !== "pagada");
      refrescar();
    } catch (error) {
      console.error(error);
      alert("Error al actualizar la comisión: " + error.message);
    } finally {
      setProcesando(false);
    }
  };

  const handleLiquidarTodo = async () => {
    if (
      !confirm(
        `¿Marcar como pagadas todas las comisiones por cobrar? Total: ${formatPrice(resumen?.porCobrar || 0)}`,
      )
    )
      return;
    setProcesando(true);
    try {
      await liquidarComisiones(resolvedParams.id);
      refrescar();
    } catch (error) {
      console.error(error);
      alert("Error al liquidar las comisiones: " + error.message);
    } finally {
      setProcesando(false);
    }
  };

  if (distLoading) return <LoadingSpinner />;
  if (!distribuidora)
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <p>Distribuidora no encontrada</p>
      </div>
    );

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <button
          onClick={() => router.push("/admin/distribuidoras")}
          className="text-gray-600 hover:text-gray-900 text-sm"
        >
          ← Volver a distribuidoras
        </button>
        <Link
          href={`/admin/distribuidoras/${resolvedParams.id}/editar`}
          className="text-blue-600 hover:text-blue-900 text-sm"
        >
          Editar datos
        </Link>
      </div>

      <h1 className="font-elegant text-4xl font-light text-gray-900 mb-2">
        {distribuidora.nombre}
      </h1>
      <p className="text-gray-500 mb-8">
        {distribuidora.telefono && <span>{distribuidora.telefono} · </span>}
        Comisión: {distribuidora.porcentaje_comision}%
      </p>

      {/* Las tres cifras de comisión */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white border border-gray-200 p-6">
          <p className="text-gray-500 text-sm uppercase tracking-wider mb-2">
            Comisión Pendiente
          </p>
          <p className="text-3xl font-light text-gray-900">
            {formatPrice(resumen?.pendiente || 0)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Se generará cuando sus clientes terminen de pagar
          </p>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 p-6">
          <p className="text-orange-800 text-sm uppercase tracking-wider mb-2 font-medium">
            Comisión por Cobrar
          </p>
          <p className="text-3xl font-light text-orange-900">
            {formatPrice(resumen?.porCobrar || 0)}
          </p>
          <p className="text-xs text-orange-700 mt-1">
            Ya generada, falta pagársela a la distribuidora
          </p>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 p-6">
          <p className="text-green-800 text-sm uppercase tracking-wider mb-2 font-medium">
            Comisión Pagada
          </p>
          <p className="text-3xl font-light text-green-900">
            {formatPrice(resumen?.pagada || 0)}
          </p>
          <p className="text-xs text-green-700 mt-1">Ya liquidada</p>
        </div>
      </div>

      {hayPorCobrar && (
        <div className="mb-6">
          <button
            onClick={handleLiquidarTodo}
            disabled={procesando}
            className="px-6 py-3 bg-gray-900 text-white text-sm uppercase tracking-wider hover:bg-gray-800 transition-colors disabled:bg-gray-400"
          >
            {procesando ? "Procesando..." : "Marcar todas como pagadas"}
          </button>
        </div>
      )}

      {/* Detalle de comisiones generadas */}
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
        Comisiones Generadas
      </h2>
      <div className="bg-white border border-gray-200 overflow-hidden">
        {resumenLoading ? (
          <div className="py-12">
            <LoadingSpinner />
          </div>
        ) : comisiones.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">
              Aún no se han generado comisiones. Se generan cuando los clientes
              de esta distribuidora pagan.
            </p>
          </div>
        ) : (
          <div className="tabla-scroll">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Concepto
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Base
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Comisión
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {comisiones.map((c, index) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-gray-500">{index + 1}</td>
                    <td className="px-6 py-4 text-gray-600">
                      {formatFecha(c.fecha)}
                    </td>
                    <td className="px-6 py-4 text-gray-900">
                      {c.cliente?.nombre || "-"}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {c.notas || "-"}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-600">
                      {formatPrice(c.base)}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-gray-900">
                      {formatPrice(c.monto)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 text-xs uppercase tracking-wider ${
                          c.estado === "pagada"
                            ? "bg-green-100 text-green-800"
                            : "bg-orange-100 text-orange-800"
                        }`}
                      >
                        {c.estado === "pagada" ? "Pagada" : "Por cobrar"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggle(c.id, c.estado)}
                        disabled={procesando}
                        className={`text-sm ${
                          c.estado === "pagada"
                            ? "text-gray-500 hover:text-gray-700"
                            : "text-blue-600 hover:text-blue-900"
                        } disabled:opacity-40`}
                      >
                        {c.estado === "pagada"
                          ? "Marcar por cobrar"
                          : "Marcar pagada"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
