"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getVentas } from "@/lib/supabase/ventas";
import Link from "next/link";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { formatPrice } from "@/utils/formatters";

const VIAS_LABEL = {
  showroom: "Showroom",
  redes: "Redes Sociales",
  referido: "Referido",
  distribuidora: "Distribuidora",
  tvcj: "TVCJ",
  cuenta_gerencia: "Cuenta Gerencia",
  web: "Página Web",
};

export default function VentasPage() {
  const [filtros, setFiltros] = useState({
    fechaDesde: "",
    fechaHasta: "",
    via: "",
  });

  const { data: ventas = [], isLoading } = useQuery({
    queryKey: ["ventas", filtros],
    queryFn: () => getVentas(filtros),
    staleTime: 2 * 60 * 1000,
  });

  const [ordenVentas, setOrdenVentas] = useState("alfabetico");

  const ventasOrdenadas = [...ventas].sort((a, b) => {
    if (ordenVentas === "alfabetico") {
      return (a.cliente?.nombre || "").localeCompare(b.cliente?.nombre || "");
    }
    return new Date(b.fecha) - new Date(a.fecha);
  });

  const totalVentas = ventas.reduce((sum, v) => sum + parseFloat(v.total), 0);

  const formatFecha = (fecha) => {
    return new Date(fecha).toLocaleDateString("es-EC", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="flex justify-between items-center mb-8">
        <h1 className="font-elegant text-4xl font-light text-gray-900">
          Ventas
        </h1>
        <div className="flex gap-3">
          <Link
            href="/admin/ventas/historica"
            className="px-6 py-3 border border-gray-900 text-gray-900 text-sm uppercase tracking-wider hover:bg-gray-50 transition-colors"
          >
            Registro Histórico
          </Link>
          <Link
            href="/admin/ventas/nueva"
            className="px-6 py-3 bg-gray-900 text-white text-sm uppercase tracking-wider hover:bg-gray-800 transition-colors"
          >
            Nueva Venta
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-gray-200 p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Desde
            </label>
            <input
              type="date"
              value={filtros.fechaDesde}
              onChange={(e) =>
                setFiltros((prev) => ({ ...prev, fechaDesde: e.target.value }))
              }
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Hasta
            </label>
            <input
              type="date"
              value={filtros.fechaHasta}
              onChange={(e) =>
                setFiltros((prev) => ({ ...prev, fechaHasta: e.target.value }))
              }
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vía de venta
            </label>
            <select
              value={filtros.via}
              onChange={(e) =>
                setFiltros((prev) => ({ ...prev, via: e.target.value }))
              }
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
            >
              <option value="">Todas</option>
              {Object.entries(VIAS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {(filtros.fechaDesde || filtros.fechaHasta || filtros.via) && (
          <button
            onClick={() =>
              setFiltros({ fechaDesde: "", fechaHasta: "", via: "" })
            }
            className="mt-4 text-sm text-gray-600 hover:text-gray-900 underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-gray-200 p-4">
          <p className="text-sm text-gray-600 uppercase tracking-wider mb-1">
            Total ventas
          </p>
          <p className="text-3xl font-light text-gray-900">{ventas.length}</p>
        </div>
        <div className="bg-white border border-gray-200 p-4">
          <p className="text-sm text-gray-600 uppercase tracking-wider mb-1">
            Monto total
          </p>
          <p className="text-3xl font-light text-gray-900">
            {formatPrice(totalVentas)}
          </p>
        </div>
      </div>

      {/* Tabla de ventas */}
      <div className="bg-white border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-end px-4 py-3 border-b border-gray-200 bg-gray-50">
          <select
            value={ordenVentas}
            onChange={(e) => setOrdenVentas(e.target.value)}
            className="text-sm border border-gray-300 px-3 py-1.5 bg-white focus:outline-none focus:border-gray-500"
          >
            <option value="alfabetico">Orden alfabético</option>
            <option value="fecha">Por fecha</option>
          </select>
        </div>
        <table className="w-full">
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
                Vía
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Total
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Pago
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
            {ventasOrdenadas.map((venta, index) => (
              <tr key={venta.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm text-gray-500">{index + 1}</td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {formatFecha(venta.fecha)}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {venta.cliente?.nombre || (
                    <span className="text-gray-400">Sin cliente</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {VIAS_LABEL[venta.via]}
                  {venta.distribuidora && (
                    <span className="block text-xs text-gray-400">
                      {venta.distribuidora.nombre}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm font-medium text-gray-900">
                  {formatPrice(venta.total)}
                  {venta.descuento > 0 && (
                    <span className="block text-xs text-gray-400">
                      Desc: {formatPrice(venta.descuento)}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`px-2 py-1 text-xs uppercase tracking-wider ${
                      venta.es_credito
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-green-100 text-green-800"
                    }`}
                  >
                    {venta.es_credito ? "Crédito" : "Contado"}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`px-2 py-1 text-xs uppercase tracking-wider ${
                      venta.estado === "cancelado"
                        ? "bg-green-100 text-green-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {venta.estado === "cancelado" ? "Cancelado" : "En proceso"}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">
                  <Link
                    href={`/admin/ventas/${venta.id}`}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    Ver detalle
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {ventas.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No hay ventas registradas</p>
          </div>
        )}
      </div>
    </div>
  );
}
