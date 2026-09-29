"use client";
import { use } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getClienteById } from "@/lib/supabase/clientes";
import { getVentas } from "@/lib/supabase/ventas";
import { formatPrice } from "@/utils/formatters";
import CuentaCliente from "@/components/admin/CuentaCliente";
import Link from "next/link";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

const VIAS_LABEL = {
  showroom: "Showroom",
  redes: "Redes Sociales",
  referido: "Referido",
  distribuidora: "Distribuidora",
  tvcj: "TVCJ",
  cuenta_gerencia: "Cuenta Gerencia",
  web: "Página Web",
};

export default function DetalleClientePage({ params }) {
  const resolvedParams = use(params);
  const router = useRouter();

  const { data: cliente, isLoading: clienteLoading } = useQuery({
    queryKey: ["cliente", resolvedParams.id],
    queryFn: () => getClienteById(resolvedParams.id),
  });

  const { data: ventas = [], isLoading: ventasLoading } = useQuery({
    queryKey: ["ventas-cliente", resolvedParams.id],
    queryFn: () => getVentas({ id_cliente: resolvedParams.id }),
    staleTime: 60 * 1000,
  });

  const formatFecha = (fecha) => {
    if (!fecha) return "-";
    return new Date(fecha).toLocaleDateString("es-EC", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const totalComprado = ventas.reduce((sum, v) => sum + parseFloat(v.total), 0);

  if (clienteLoading) return <LoadingSpinner />;
  if (!cliente)
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <p>Cliente no encontrado</p>
      </div>
    );

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <button
          onClick={() => router.push("/admin/clientes")}
          className="text-gray-600 hover:text-gray-900 text-sm"
        >
          ← Volver a clientes
        </button>
        <Link
          href={`/admin/clientes/${resolvedParams.id}/editar`}
          className="text-blue-600 hover:text-blue-900 text-sm"
        >
          Editar datos
        </Link>
      </div>

      <h1 className="font-elegant text-4xl font-light text-gray-900 mb-2">
        {cliente.nombre}
      </h1>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-500 mb-8 text-sm">
        {cliente.telefono && <span>{cliente.telefono}</span>}
        {cliente.cedula && <span>· Cédula: {cliente.cedula}</span>}
        {cliente.email && <span>· {cliente.email}</span>}
        {cliente.distribuidora?.nombre && (
          <span>· Atendido por: {cliente.distribuidora.nombre}</span>
        )}
      </div>

      {cliente.notas && (
        <div className="bg-gray-50 border border-gray-200 p-4 mb-8 text-sm text-gray-700">
          {cliente.notas}
        </div>
      )}

      {/* Cuenta de crédito */}
      <CuentaCliente cliente={cliente} />

      {/* Historial de compras */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
          Historial de Compras
        </h2>
        <span className="text-sm text-gray-600">
          {ventas.length} {ventas.length === 1 ? "compra" : "compras"} ·{" "}
          <span className="font-medium text-gray-900">
            {formatPrice(totalComprado)}
          </span>
        </span>
      </div>
      <div className="bg-white border border-gray-200 overflow-hidden">
        {ventasLoading ? (
          <div className="py-8">
            <LoadingSpinner />
          </div>
        ) : ventas.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm">
              Este cliente no tiene compras registradas
            </p>
          </div>
        ) : (
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
                  Vía
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Total
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Pago
                </th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {ventas.map((venta, index) => (
                <tr key={venta.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-gray-500">{index + 1}</td>
                  <td className="px-6 py-4 text-gray-900">
                    {formatFecha(venta.fecha)}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {VIAS_LABEL[venta.via] || venta.via}
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-900">
                    {formatPrice(venta.total)}
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
                    <Link
                      href={`/admin/ventas/${venta.id}`}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
