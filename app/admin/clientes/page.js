"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getClientesAdmin, toggleCliente } from "@/lib/supabase/clientes";
import Link from "next/link";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

export default function ClientesPage() {
  const queryClient = useQueryClient();
  const [busqueda, setBusqueda] = useState("");

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["clientes-admin"],
    queryFn: getClientesAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const handleToggle = async (id, activo) => {
    const accion = activo ? "desactivar" : "activar";
    if (!confirm(`¿Estás seguro de ${accion} este cliente?`)) return;
    try {
      await toggleCliente(id, activo);
      queryClient.invalidateQueries({ queryKey: ["clientes-admin"] });
    } catch (error) {
      console.error("Error al actualizar cliente:", error);
      alert("Error al actualizar el cliente");
    }
  };

  const clientesFiltrados = clientes.filter(
    (c) =>
      c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (c.telefono && c.telefono.includes(busqueda)) ||
      (c.cedula && c.cedula.includes(busqueda)),
  );

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="flex justify-between items-center mb-8">
        <h1 className="font-elegant text-4xl font-light text-gray-900">
          Clientes
        </h1>
        <Link
          href="/admin/clientes/nuevo"
          className="px-6 py-3 bg-gray-900 text-white text-sm uppercase tracking-wider hover:bg-gray-800 transition-colors"
        >
          Nuevo Cliente
        </Link>
      </div>

      {/* Buscador */}
      <div className="mb-6">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, teléfono o cédula..."
          className="w-full px-4 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
      </div>

      <div className="bg-white border border-gray-200 overflow-hidden">
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
          <p className="text-sm text-gray-600">
            <span className="font-medium text-gray-900">
              {clientesFiltrados.length}
            </span>{" "}
            {clientesFiltrados.length === 1 ? "cliente" : "clientes"}
          </p>
        </div>

        <div className="tabla-scroll">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Nombre
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Teléfono
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Cédula
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Atendido por
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
              {clientesFiltrados.map((cliente, index) => (
                <tr key={cliente.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {index + 1}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    <Link
                      href={`/admin/clientes/${cliente.id}`}
                      className="hover:text-blue-600 hover:underline"
                    >
                      {cliente.nombre}
                    </Link>
                    {cliente.notas && (
                      <p className="text-xs text-gray-500 mt-1 font-normal">
                        {cliente.notas}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {cliente.telefono || "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {cliente.cedula || "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {cliente.email || "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {cliente.distribuidora?.nombre || (
                      <span className="text-gray-400">Sin asignar</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 text-xs ${
                        cliente.activo
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {cliente.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm space-x-3">
                    <Link
                      href={`/admin/clientes/${cliente.id}`}
                      className="text-gray-700 hover:text-gray-900"
                    >
                      Ver
                    </Link>
                    <Link
                      href={`/admin/clientes/${cliente.id}/editar`}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Editar
                    </Link>
                    <button
                      onClick={() => handleToggle(cliente.id, cliente.activo)}
                      className={
                        cliente.activo
                          ? "text-red-600 hover:text-red-900"
                          : "text-green-600 hover:text-green-900"
                      }
                    >
                      {cliente.activo ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {clientesFiltrados.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">
              {busqueda
                ? "No se encontraron clientes con esa búsqueda"
                : "No hay clientes registrados"}
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
