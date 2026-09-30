"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, getFactores } from "@/lib/supabase/client";
import {
  TIPOS_PRODUCTO,
  CATEGORIAS_PRODUCTO,
  MATERIALES_PRODUCTO,
} from "@/lib/constants";
import ImageUploader from "./ImageUploader";

const limitarDecimales = (valor) => {
  if (valor === "") return valor;
  return /^\d*\.?\d{0,2}$/.test(valor) ? valor : valor.slice(0, -1);
};

export default function ProductForm({ producto = null }) {
  const router = useRouter();

  // Vuelve a la lista con los filtros que tenía, aunque el formulario se
  // haya abierto en una pestaña nueva (sin historial para "volver atrás").
  const volverALista = () => {
    const volver = new URLSearchParams(window.location.search).get("volver");
    router.replace(
      volver?.startsWith("/admin/productos") ? volver : "/admin/productos",
    );
  };
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [conjuntos, setConjuntos] = useState([]);
  const [factores, setFactores] = useState([]);
  const [precioCalculado, setPrecioCalculado] = useState(0);
  const [borradorCargado, setBorradorCargado] = useState(false);
  const storageKey = producto
    ? `producto_editar_borrador_${producto.id}`
    : "producto_nuevo_borrador";
  const [formData, setFormData] = useState({
    codigo: "",
    tipo: "",
    categoria: "",
    nombre_comercial: "",
    material: "",
    peso: "",
    descripcion: "",
    observaciones: "",
    talla: "",
    id_conjunto: "",
    id_factor: "",
    activo: true,
    imagen_url: "",
    imagen_public_id: "",
    stock: 1,
  });

  useEffect(() => {
    fetchConjuntos();
    fetchFactores();
    if (producto) {
      setFormData({
        codigo: producto.codigo || "",
        tipo: producto.tipo || "",
        categoria: producto.categoria || "",
        nombre_comercial: producto.nombre_comercial || "",
        material: producto.material || "",
        peso: producto.peso || "",
        descripcion: producto.descripcion || "",
        observaciones: producto.observaciones || "",
        talla: producto.talla || "",
        id_conjunto: producto.id_conjunto || "",
        id_factor: producto.id_factor || "",
        activo: producto.activo ?? true,
        imagen_url: producto.imagen_url || "",
        imagen_public_id: producto.imagen_public_id || "",
        stock: producto.stock ?? 1,
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
  }, [producto, storageKey]);

  useEffect(() => {
    if (!borradorCargado || typeof window === "undefined") return;
    localStorage.setItem(storageKey, JSON.stringify(formData));
  }, [formData, borradorCargado, storageKey]);

  const fetchConjuntos = async () => {
    try {
      const { data, error } = await supabase
        .from("conjuntos")
        .select("*")
        .order("nombre");

      if (error) throw error;
      setConjuntos(data);
    } catch (error) {
      console.error("Error al cargar conjuntos:", error);
    }
  };

  const fetchFactores = async () => {
    try {
      const data = await getFactores();
      setFactores(data);
    } catch (error) {
      console.error("Error al cargar factores:", error);
    }
  };

  const calcularPrecio = useCallback(() => {
    const peso = parseFloat(formData.peso) || 0;
    const factor = factores.find((f) => f.id === formData.id_factor);

    if (peso > 0 && factor) {
      const precio = peso * parseFloat(factor.valor);
      const precioRedondeado = Math.round(precio * 100) / 100;
      setPrecioCalculado(precioRedondeado.toFixed(2));
    } else {
      setPrecioCalculado(0);
    }
  }, [formData.peso, formData.id_factor, factores]);

  // Calcular precio cuando cambia peso, factor o factores
  useEffect(() => {
    calcularPrecio();
  }, [calcularPrecio]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const handleImageUpload = (imageUrl, publicId) => {
    setFormData((prev) => ({
      ...prev,
      imagen_url: imageUrl,
      imagen_public_id: publicId,
    }));
  };

  const handleImageRemove = () => {
    setFormData((prev) => ({
      ...prev,
      imagen_url: "",
      imagen_public_id: "",
    }));
  };

  const validateCodigo = async (codigo) => {
    if (producto && producto.codigo === codigo) {
      return true;
    }

    const { data, error } = await supabase
      .from("productos")
      .select("codigo")
      .eq("codigo", codigo)
      .single();

    return !data;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validar código duplicado
      const codigoValido = await validateCodigo(formData.codigo);
      if (!codigoValido) {
        alert("El código ya existe. Por favor, usa otro código.");
        setLoading(false);
        return;
      }

      // Validar que tenga peso y factor para calcular precio
      if (!formData.peso || parseFloat(formData.peso) <= 0) {
        alert("El peso debe ser mayor a 0");
        setLoading(false);
        return;
      }

      if (!formData.id_factor) {
        alert("Debes seleccionar un factor");
        setLoading(false);
        return;
      }

      const dataToSave = {
        ...formData,
        peso: parseFloat(formData.peso),
        stock: parseInt(formData.stock),
        id_conjunto: formData.id_conjunto || null,
        id_factor: formData.id_factor || null,
      };

      // Guardar imagen correctamente — null si está vacía
      dataToSave.imagen_url = formData.imagen_url || null;
      dataToSave.imagen_public_id = formData.imagen_public_id || null;

      let error;

      if (producto) {
        // Actualizar
        const result = await supabase
          .from("productos")
          .update(dataToSave)
          .eq("id", producto.id);
        error = result.error;
      } else {
        // Crear
        const result = await supabase.from("productos").insert([dataToSave]);
        error = result.error;
      }

      if (error) throw error;

      alert(
        producto
          ? "Producto actualizado exitosamente"
          : "Producto creado exitosamente",
      );

      queryClient.invalidateQueries({ queryKey: ["admin-productos"] });
      localStorage.removeItem(storageKey);
      volverALista();
    } catch (error) {
      console.error("Error al guardar producto:", error);
      alert("Error al guardar el producto: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white p-6 border border-gray-200">
        <h2 className="text-xl font-light text-gray-900 mb-6">
          Información Básica
        </h2>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-light text-gray-700 mb-2 uppercase tracking-wider">
              Código *
            </label>
            <input
              type="text"
              name="codigo"
              value={formData.codigo}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 focus:outline-none focus:border-gray-500"
              placeholder="TV-001"
            />
          </div>

          <div>
            <label className="block text-sm font-light text-gray-700 mb-2 uppercase tracking-wider">
              Nombre Comercial *
            </label>
            <input
              type="text"
              name="nombre_comercial"
              value={formData.nombre_comercial}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 focus:outline-none focus:border-gray-500"
              placeholder="Anillo de Perlas"
            />
          </div>

          <div>
            <label className="block text-sm font-light text-gray-700 mb-2 uppercase tracking-wider">
              Tipo *
            </label>
            <select
              name="tipo"
              value={formData.tipo}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 focus:outline-none focus:border-gray-500"
            >
              <option value="">Seleccionar</option>
              {TIPOS_PRODUCTO.map((tipo) => (
                <option key={tipo.value} value={tipo.value}>
                  {tipo.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-light text-gray-700 mb-2 uppercase tracking-wider">
              Categoría *
            </label>
            <select
              name="categoria"
              value={formData.categoria}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 focus:outline-none focus:border-gray-500"
            >
              <option value="">Seleccionar</option>
              {CATEGORIAS_PRODUCTO.map((categoria) => (
                <option key={categoria.value} value={categoria.value}>
                  {categoria.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-light text-gray-700 mb-2 uppercase tracking-wider">
              Material *
            </label>
            <select
              name="material"
              value={formData.material}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 focus:outline-none focus:border-gray-500"
            >
              <option value="">Seleccionar</option>
              {MATERIALES_PRODUCTO.map((material) => (
                <option key={material.value} value={material.value}>
                  {material.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-light text-gray-700 mb-2 uppercase tracking-wider">
              Talla
            </label>
            <input
              type="text"
              name="talla"
              value={formData.talla}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 focus:outline-none focus:border-gray-500"
              placeholder="Ej: 6, 7, Ajustable"
            />
          </div>

          <div>
            <label className="block text-sm font-light text-gray-700 mb-2 uppercase tracking-wider">
              Conjunto
            </label>
            <select
              name="id_conjunto"
              value={formData.id_conjunto}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 focus:outline-none focus:border-gray-500"
            >
              <option value="">Sin conjunto</option>
              {conjuntos.map((conjunto) => (
                <option key={conjunto.id} value={conjunto.id}>
                  {conjunto.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-light text-gray-700 mb-2 uppercase tracking-wider">
              Stock *
            </label>
            <input
              type="number"
              name="stock"
              value={formData.stock}
              onChange={handleChange}
              required
              min="0"
              className="w-full px-4 py-2 border border-gray-300 focus:outline-none focus:border-gray-500"
              placeholder="1"
            />
            <p className="text-sm text-gray-500 mt-1">
              Cantidad disponible en inventario
            </p>
          </div>
        </div>

        <div className="mt-6">
          <label className="block text-sm font-light text-gray-700 mb-2 uppercase tracking-wider">
            Descripción
          </label>
          <textarea
            name="descripcion"
            value={formData.descripcion}
            onChange={handleChange}
            rows="4"
            className="w-full px-4 py-2 border border-gray-300 focus:outline-none focus:border-gray-500 resize-none"
            placeholder="Descripción detallada del producto..."
          ></textarea>
        </div>

        <div className="mt-6">
          <label className="block text-sm font-light text-gray-700 mb-2 uppercase tracking-wider">
            Observaciones
          </label>
          <textarea
            name="observaciones"
            value={formData.observaciones}
            onChange={handleChange}
            rows="3"
            className="w-full px-4 py-2 border border-gray-300 focus:outline-none focus:border-gray-500 resize-none"
            placeholder="Notas adicionales internas..."
          ></textarea>
        </div>

        <div className="mt-6 flex items-center">
          <input
            type="checkbox"
            name="activo"
            checked={formData.activo}
            onChange={handleChange}
            className="w-4 h-4 text-gray-900 border-gray-300 focus:ring-0"
          />
          <label className="ml-2 text-sm text-gray-700">
            Producto activo (visible en el catálogo)
          </label>
        </div>
      </div>

      {/* Sección de Precio */}
      <div className="bg-white p-6 border border-gray-200">
        <h2 className="text-xl font-light text-gray-900 mb-6">
          Cálculo de Precio
        </h2>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-light text-gray-700 mb-2 uppercase tracking-wider">
              Peso (gramos) *
            </label>
            <input
              type="number"
              name="peso"
              value={formData.peso}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  peso: limitarDecimales(e.target.value),
                }))
              }
              required
              step="0.01"
              min="0"
              className="w-full px-4 py-2 border border-gray-300 focus:outline-none focus:border-gray-500"
              placeholder="2.5"
            />
          </div>

          <div>
            <label className="block text-sm font-light text-gray-700 mb-2 uppercase tracking-wider">
              Factor *
            </label>
            <select
              name="id_factor"
              value={formData.id_factor}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 focus:outline-none focus:border-gray-500"
            >
              <option value="">Seleccionar factor</option>
              {factores.map((factor) => (
                <option key={factor.id} value={factor.id}>
                  {factor.nombre} (${factor.valor})
                </option>
              ))}
            </select>
          </div>
        </div>

        {precioCalculado > 0 && (
          <div className="mt-6 p-4 bg-green-50 border border-green-200">
            <p className="text-sm text-gray-700 mb-1">Precio calculado:</p>
            <p className="text-3xl font-light text-gray-900">
              ${precioCalculado}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              {formData.peso} gramos × $
              {factores.find((f) => f.id === formData.id_factor)?.valor || 0}
            </p>
          </div>
        )}
      </div>

      <div className="bg-white p-6 border border-gray-200">
        <h2 className="text-xl font-light text-gray-900 mb-6">
          Imagen del Producto
        </h2>
        <ImageUploader
          currentImage={formData.imagen_url}
          currentPublicId={formData.imagen_public_id}
          onImageUpload={handleImageUpload}
          onImageRemove={handleImageRemove}
          productCode={formData.codigo}
          requireCode={true}
        />
      </div>

      <div className="flex justify-end space-x-4">
        <button
          type="button"
          onClick={volverALista}
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
            : producto
              ? "Actualizar"
              : "Crear Producto"}
        </button>
      </div>
    </form>
  );
}
