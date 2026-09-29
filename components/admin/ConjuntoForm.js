"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import ImageUploader from "./ImageUploader";

export default function ConjuntoForm({ conjunto = null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [borradorCargado, setBorradorCargado] = useState(false);
  const storageKey = conjunto
    ? `conjunto_editar_borrador_${conjunto.id}`
    : "conjunto_nuevo_borrador";
  const [formData, setFormData] = useState({
    nombre: "",
    descripcion: "",
    imagen_url: "",
    imagen_public_id: "",
  });

  useEffect(() => {
    if (conjunto) {
      setFormData({
        nombre: conjunto.nombre || "",
        descripcion: conjunto.descripcion || "",
        imagen_url: conjunto.imagen_url || "",
        imagen_public_id: conjunto.imagen_public_id || "",
      });
    }

    if (typeof window !== "undefined") {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        try {
          setFormData(JSON.parse(raw));
        } catch (e) {
          console.error("Error al restaurar borrador:", e);
        }
      }
    }
    setBorradorCargado(true);
  }, [conjunto, storageKey]);

  useEffect(() => {
    if (!borradorCargado || typeof window === "undefined") return;
    localStorage.setItem(storageKey, JSON.stringify(formData));
  }, [formData, borradorCargado, storageKey]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleImageUpload = (imageUrl, publicId) => {
    setFormData({
      ...formData,
      imagen_url: imageUrl,
      imagen_public_id: publicId,
    });
  };

  const handleImageRemove = () => {
    setFormData((prev) => ({
      ...prev,
      imagen_url: "",
      imagen_public_id: "",
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let error;

      if (conjunto) {
        // Actualizar
        const result = await supabase
          .from("conjuntos")
          .update(formData)
          .eq("id", conjunto.id);
        error = result.error;
      } else {
        // Crear
        const result = await supabase.from("conjuntos").insert([formData]);
        error = result.error;
      }

      if (error) throw error;

      alert(
        conjunto
          ? "Conjunto actualizado exitosamente"
          : "Conjunto creado exitosamente",
      );
      localStorage.removeItem(storageKey);
      router.push("/admin/conjuntos");
    } catch (error) {
      console.error("Error al guardar conjunto:", error);
      alert("Error al guardar el conjunto");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white p-6 border border-gray-200">
        <h2 className="text-xl font-light text-gray-900 mb-6">
          Información del Conjunto
        </h2>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-light text-gray-700 mb-2 uppercase tracking-wider">
              Nombre del Conjunto *
            </label>
            <input
              type="text"
              name="nombre"
              value={formData.nombre}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 focus:outline-none focus:border-gray-500"
              placeholder="Ej: Colección Flores del Mar"
            />
          </div>

          <div>
            <label className="block text-sm font-light text-gray-700 mb-2 uppercase tracking-wider">
              Descripción
            </label>
            <textarea
              name="descripcion"
              value={formData.descripcion}
              onChange={handleChange}
              rows="4"
              className="w-full px-4 py-2 border border-gray-300 focus:outline-none focus:border-gray-500 resize-none"
              placeholder="Descripción del conjunto de joyas..."
            ></textarea>
            <p className="text-sm text-gray-500 mt-2">
              Esta descripción aparecerá en el catálogo cuando se muestren los
              productos de este conjunto
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 border border-gray-200">
        <h2 className="text-xl font-light text-gray-900 mb-6">
          Imagen del Conjunto
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          Sube una imagen mostrando el conjunto completo (modelo usando todas
          las joyas)
        </p>
        <ImageUploader
          currentImage={formData.imagen_url}
          currentPublicId={formData.imagen_public_id}
          onImageUpload={handleImageUpload}
          onImageRemove={handleImageRemove}
          productCode={formData.nombre}
          requireCode={false}
        />
      </div>

      <div className="flex justify-end space-x-4">
        <button
          type="button"
          onClick={() => router.push("/admin/conjuntos")}
          className="px-6 py-3 border border-gray-300 text-gray-700 text-sm uppercase tracking-wider hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 bg-gray-900 text-white text-sm uppercase tracking-wider hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {loading
            ? "Guardando..."
            : conjunto
              ? "Actualizar"
              : "Crear Conjunto"}
        </button>
      </div>
    </form>
  );
}
