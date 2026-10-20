"use client";
import BotonLimpiarBorrador from "@/components/admin/BotonLimpiarBorrador";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  getClienteById,
  createCliente,
  updateCliente,
} from "@/lib/supabase/clientes";
import { getDistribuidoras } from "@/lib/supabase/distribuidoras";

export default function ClienteForm({ clienteId = null }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [distribuidoras, setDistribuidoras] = useState([]);
  const [clienteCargado, setClienteCargado] = useState(!clienteId);
  const [borradorCargado, setBorradorCargado] = useState(false);
  const storageKey = clienteId
    ? `cliente_editar_borrador_${clienteId}`
    : "cliente_nuevo_borrador";
  const [formData, setFormData] = useState({
    nombre: "",
    telefono: "",
    email: "",
    cedula: "",
    notas: "",
    id_distribuidora: "",
  });

  // Cargar distribuidoras para el selector
  useEffect(() => {
    const cargarDistribuidoras = async () => {
      try {
        const data = await getDistribuidoras();
        setDistribuidoras(data);
      } catch (error) {
        console.error("Error al cargar distribuidoras:", error);
      }
    };
    cargarDistribuidoras();
  }, []);

  const fetchCliente = useCallback(async () => {
    if (!clienteId) return;
    try {
      const data = await getClienteById(clienteId);
      setFormData({
        nombre: data.nombre,
        telefono: data.telefono || "",
        email: data.email || "",
        cedula: data.cedula || "",
        notas: data.notas || "",
        id_distribuidora: data.id_distribuidora || "",
      });
    } catch (error) {
      console.error("Error al cargar cliente:", error);
      alert("Error al cargar el cliente");
    } finally {
      setClienteCargado(true);
    }
  }, [clienteId]);

  useEffect(() => {
    fetchCliente();
  }, [fetchCliente]);

  useEffect(() => {
    if (!clienteCargado || typeof window === "undefined") return;
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        setFormData(JSON.parse(raw));
      } catch (e) {
        console.error("Error al restaurar borrador:", e);
      }
    }
    setBorradorCargado(true);
  }, [clienteCargado, storageKey]);

  useEffect(() => {
    if (!borradorCargado || typeof window === "undefined") return;
    localStorage.setItem(storageKey, JSON.stringify(formData));
  }, [formData, borradorCargado, storageKey]);

  // En edición vuelve a los datos guardados; en nuevo, deja todo vacío.
  const limpiarFormulario = () => {
    localStorage.removeItem(storageKey);
    if (clienteId) {
      fetchCliente();
    } else {
      setFormData({
        nombre: "",
        telefono: "",
        email: "",
        cedula: "",
        notas: "",
        id_distribuidora: "",
      });
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.nombre.trim()) {
      alert("El nombre es obligatorio");
      return;
    }

    setLoading(true);
    try {
      if (clienteId) {
        await updateCliente(clienteId, formData);
        alert("Cliente actualizado exitosamente");
      } else {
        await createCliente(formData);
        alert("Cliente creado exitosamente");
      }
      localStorage.removeItem(storageKey);
      queryClient.invalidateQueries({ queryKey: ["clientes-admin"] });
      router.push("/admin/clientes");
    } catch (error) {
      console.error("Error al guardar cliente:", error);
      alert("Error al guardar el cliente: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Nombre completo *
        </label>
        <input
          type="text"
          name="nombre"
          value={formData.nombre}
          onChange={handleChange}
          required
          placeholder="Nombre del cliente"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Teléfono
        </label>
        <input
          type="text"
          name="telefono"
          value={formData.telefono}
          onChange={handleChange}
          placeholder="Ej: 0991234567"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Email
        </label>
        <input
          type="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          placeholder="correo@ejemplo.com"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Cédula
        </label>
        <input
          type="text"
          name="cedula"
          value={formData.cedula}
          onChange={handleChange}
          placeholder="Ej: 1234567890"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Atendido por
        </label>
        <select
          name="id_distribuidora"
          value={formData.id_distribuidora}
          onChange={handleChange}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        >
          <option value="">Sin asignar</option>
          {distribuidoras.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">
          Distribuidora, TVCJ o Gerencia que atiende a este cliente (opcional)
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Notas
        </label>
        <textarea
          name="notas"
          value={formData.notas}
          onChange={handleChange}
          rows={3}
          placeholder="Información adicional del cliente..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
      </div>

      <div className="flex justify-end">
        <BotonLimpiarBorrador onLimpiar={limpiarFormulario} />
      </div>

      <div className="flex gap-4">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-gray-900 text-white py-3 rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-400"
        >
          {loading
            ? "Guardando..."
            : clienteId
              ? "Actualizar"
              : "Crear Cliente"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/clientes")}
          className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
