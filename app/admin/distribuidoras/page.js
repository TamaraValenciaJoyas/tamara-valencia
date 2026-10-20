"use client";
import { useState, useEffect } from "react";
import {
  getDistribuidorasAdmin,
  toggleDistribuidora,
} from "@/lib/supabase/distribuidoras";
import Link from "next/link";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

export default function DistribuidorasPage() {
  const [distribuidoras, setDistribuidoras] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDistribuidoras();
  }, []);

  const fetchDistribuidoras = async () => {
    try {
      setLoading(true);
      const data = await getDistribuidorasAdmin();
      setDistribuidoras(data);
    } catch (error) {
      console.error("Error al cargar distribuidoras:", error);
      alert("Error al cargar las distribuidoras");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id, activo) => {
    const accion = activo ? "desactivar" : "activar";
    if (!confirm(`¿Estás seguro de ${accion} esta distribuidora?`)) return;

    try {
      await toggleDistribuidora(id, activo);
      fetchDistribuidoras();
    } catch (error) {
      console.error("Error al actualizar distribuidora:", error);
      alert("Error al actualizar la distribuidora");
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="flex justify-between items-center mb-8">
        <h1 className="font-elegant text-4xl font-light text-gray-900">
          Distribuidoras
        </h1>
        <Link
          href="/admin/distribuidoras/nuevo"
          className="px-6 py-3 bg-gray-900 text-white text-sm uppercase tracking-wider hover:bg-gray-800 transition-colors"
        >
          Nueva Distribuidora
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow-sm tabla-scroll">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                #
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Nombre
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Teléfono
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Comisión
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Estado
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {distribuidoras.map((dist, index) => (
              <tr key={dist.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {index + 1}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Link
                    href={`/admin/distribuidoras/${dist.id}`}
                    className="text-sm font-medium text-gray-900 hover:text-blue-600 hover:underline"
                  >
                    {dist.nombre}
                  </Link>
                  {dist.notas && (
                    <p className="text-xs text-gray-500 mt-1">{dist.notas}</p>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {dist.telefono || "-"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm font-medium text-gray-900">
                    {dist.porcentaje_comision}%
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      dist.activo
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {dist.activo ? "Activa" : "Inactiva"}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <Link
                    href={`/admin/distribuidoras/${dist.id}`}
                    className="text-gray-700 hover:text-gray-900 mr-4"
                  >
                    Ver comisiones
                  </Link>
                  <Link
                    href={`/admin/distribuidoras/${dist.id}/editar`}
                    className="text-blue-600 hover:text-blue-900 mr-4"
                  >
                    Editar
                  </Link>
                  <button
                    onClick={() => handleToggle(dist.id, dist.activo)}
                    className={`${dist.activo ? "text-red-600 hover:text-red-900" : "text-green-600 hover:text-green-900"}`}
                  >
                    {dist.activo ? "Desactivar" : "Activar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {distribuidoras.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No hay distribuidoras registradas</p>
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
