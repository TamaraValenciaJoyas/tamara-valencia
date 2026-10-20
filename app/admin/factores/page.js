"use client";
import { useState, useEffect } from "react";
import { getFactores, deleteFactor } from "@/lib/supabase/client";
import Link from "next/link";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

export default function FactoresAdminPage() {
  const [factores, setFactores] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFactores();
  }, []);

  const fetchFactores = async () => {
    try {
      setLoading(true);
      const data = await getFactores();
      setFactores(data);
    } catch (error) {
      console.error("Error al cargar factores:", error);
      alert("Error al cargar los factores");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, nombre) => {
    // Confirmar eliminación
    const confirmar = window.confirm(
      `¿Estás seguro de eliminar el factor "${nombre}"?\n\n⚠️ ADVERTENCIA: Esta acción puede afectar los productos que usan este factor.`,
    );

    if (!confirmar) return;

    try {
      await deleteFactor(id);
      alert("Factor eliminado exitosamente");
      // Recargar la lista
      fetchFactores();
    } catch (error) {
      console.error("Error al eliminar factor:", error);
      alert(
        "Error al eliminar el factor. Puede que haya productos asociados a este factor.",
      );
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="flex justify-between items-center mb-8">
        <h1 className="font-elegant text-4xl font-light text-gray-900">
          Factores de Precio
        </h1>
        <Link
          href="/admin/factores/nuevo"
          className="px-6 py-3 bg-gray-900 text-white text-sm uppercase tracking-wider hover:bg-gray-800 transition-colors"
        >
          Nuevo Factor
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
                Valor del Factor
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {factores.map((factor, index) => (
              <tr key={factor.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {index + 1}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm font-medium text-gray-900">
                    {factor.nombre}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm text-gray-900 font-semibold">
                    {factor.valor}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <Link
                    href={`/admin/factores/editar/${factor.id}`}
                    className="text-blue-600 hover:text-blue-900 mr-4"
                  >
                    Editar
                  </Link>
                  <button
                    onClick={() => handleDelete(factor.id, factor.nombre)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {factores.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No hay factores registrados</p>
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
