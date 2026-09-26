"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase/client";

// Función para eliminar imagen de Cloudinary via API Route
const eliminarDeCloudinary = async (public_id) => {
  if (!public_id) return; // Si no hay public_id, no hay nada que eliminar

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch("/api/cloudinary/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token || ""}`,
    },
    body: JSON.stringify({ public_id }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Error al eliminar imagen de Cloudinary");
  }

  return data;
};

export default function ImageUploader({
  currentImage,
  currentPublicId,
  onImageUpload,
  onImageRemove,
  productCode = "",
  requireCode = true,
}) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(currentImage || "");
  const [publicId, setPublicId] = useState(currentPublicId || "");

  // Sincronizar cuando llegan los datos del producto
  useEffect(() => {
    if (currentImage) setPreview(currentImage);
    if (currentPublicId) setPublicId(currentPublicId);
  }, [currentImage, currentPublicId]);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validar código
    if (requireCode && (!productCode || productCode.trim() === "")) {
      alert(
        "Por favor, ingresa el código del producto antes de subir la imagen",
      );
      return;
    }

    // Validar tipo de archivo
    if (!file.type.startsWith("image/")) {
      alert("Por favor selecciona un archivo de imagen válido");
      return;
    }

    // Validar tamaño (máximo 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("La imagen no debe superar los 5MB");
      return;
    }

    setUploading(true);

    try {
      // PASO 1: Si hay imagen anterior, eliminarla de Cloudinary primero
      if (publicId) {
        try {
          await eliminarDeCloudinary(publicId);
        } catch (error) {
          // Si falla la eliminación, preguntar si continuar
          const continuar = confirm(
            `No se pudo eliminar la imagen anterior de Cloudinary: ${error.message}\n\n¿Deseas continuar subiendo la nueva imagen de todas formas?`,
          );
          if (!continuar) {
            setUploading(false);
            return;
          }
        }
      }

      // PASO 2: Generar public_id igual al código limpio (sin timestamp)
      const codigoLimpio =
        requireCode && productCode
          ? productCode
              .trim()
              .replace(/[^a-zA-Z0-9\s-]/g, "")
              .replace(/\s+/g, "-")
              .toLowerCase()
          : `imagen-${Date.now()}`;

      const nuevoPublicId = codigoLimpio;

      // PASO 3: Subir nueva imagen a Cloudinary
      const formData = new FormData();
      formData.append("file", file);
      formData.append(
        "upload_preset",
        process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "tamara_valencia",
      );
      formData.append("folder", "tamara-valencia");
      formData.append("public_id", nuevoPublicId);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: "POST", body: formData },
      );

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message);
      }

      // PASO 4: Actualizar estado local
      setPreview(data.secure_url);
      setPublicId(data.public_id);

      // PASO 5: Notificar al padre con nueva URL y public_id
      onImageUpload(data.secure_url, data.public_id);
    } catch (error) {
      console.error("Error al procesar imagen:", error);
      alert("Error al procesar la imagen: " + error.message);
    } finally {
      setUploading(false);
      // Limpiar el input para permitir subir el mismo archivo de nuevo
      e.target.value = "";
    }
  };

  const handleEliminarImagen = async () => {
    if (
      !confirm(
        "¿Estás seguro de eliminar esta imagen? Esta acción no se puede deshacer.",
      )
    )
      return;

    setUploading(true);

    try {
      // Eliminar de Cloudinary si hay public_id
      if (publicId) {
        await eliminarDeCloudinary(publicId);
      }

      // Limpiar estado local
      setPreview("");
      setPublicId("");

      // Notificar al padre que se eliminó la imagen
      if (onImageRemove) {
        onImageRemove();
      } else {
        onImageUpload("", "");
      }
    } catch (error) {
      console.error("Error al eliminar imagen:", error);
      alert("Error al eliminar la imagen: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const isDisabled = requireCode && (!productCode || productCode.trim() === "");

  return (
    <div className="space-y-4">
      {requireCode && !productCode && (
        <div className="bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-800">
          <strong>Nota:</strong> Debes ingresar el código del producto antes de
          subir la imagen.
        </div>
      )}

      {preview ? (
        <div className="space-y-4">
          <div className="relative w-64 h-64 mx-auto bg-gray-100 border border-gray-300">
            <Image
              src={preview}
              alt="Preview"
              fill
              className="object-cover"
              sizes="256px"
            />
          </div>
          <div className="flex justify-center gap-6">
            <label
              htmlFor="file-upload"
              className={`px-6 py-2 bg-gray-900 text-white text-sm uppercase tracking-wider transition-colors ${
                isDisabled || uploading
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:bg-gray-800 cursor-pointer"
              }`}
            >
              {uploading ? "Procesando..." : "Cambiar imagen"}
            </label>
            <button
              type="button"
              onClick={handleEliminarImagen}
              disabled={uploading}
              className="px-6 py-2 border border-red-300 text-red-600 text-sm uppercase tracking-wider hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? "Procesando..." : "Eliminar imagen"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="border-2 border-dashed border-gray-300 p-12 text-center">
            <svg
              className="w-16 h-16 mx-auto mb-4 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-gray-600 mb-4">Sin imagen</p>
          </div>
          <div className="text-center">
            <label
              htmlFor="file-upload"
              className={`inline-block px-6 py-3 bg-gray-900 text-white text-sm uppercase tracking-wider transition-colors ${
                isDisabled || uploading
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:bg-gray-800 cursor-pointer"
              }`}
            >
              {uploading ? "Procesando..." : "Seleccionar imagen"}
            </label>
          </div>
        </div>
      )}

      <input
        id="file-upload"
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={uploading || isDisabled}
        className="hidden"
      />

      <p className="text-sm text-gray-500 text-center">
        Formatos aceptados: JPG, PNG, WEBP. Tamaño máximo: 5MB
      </p>
    </div>
  );
}
