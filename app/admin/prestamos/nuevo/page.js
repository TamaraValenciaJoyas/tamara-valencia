"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { getDistribuidoras } from "@/lib/supabase/distribuidoras";
import { registrarPrestamo } from "@/lib/supabase/prestamos";
import { formatPrice } from "@/utils/formatters";
import BotonLimpiarBorrador from "@/components/admin/BotonLimpiarBorrador";
import {
  TIPOS_PRODUCTO,
  CATEGORIAS_PRODUCTO,
  MATERIALES_PRODUCTO,
} from "@/lib/constants";

export default function NuevoPrestamoPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [distribuidoraId, setDistribuidoraId] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [borradorCargado, setBorradorCargado] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("prestamo_nuevo_borrador");
    if (raw) {
      try {
        const data = JSON.parse(raw);
        if (data.distribuidoraId) setDistribuidoraId(data.distribuidoraId);
        if (data.notas) setNotas(data.notas);
        if (data.seleccionados?.length) setSeleccionados(data.seleccionados);
      } catch (e) {
        console.error("Error al restaurar borrador:", e);
      }
    }
    setBorradorCargado(true);
  }, []);

  // Búsqueda de productos
  const [filtros, setFiltros] = useState({
    codigo: "",
    tipo: "",
    categoria: "",
    material: "",
    conjunto: "",
  });
  const [busquedaEjecutada, setBusquedaEjecutada] = useState(false);
  const [productosResultado, setProductosResultado] = useState([]);
  const [buscando, setBuscando] = useState(false);

  // Productos seleccionados para el préstamo
  const [seleccionados, setSeleccionados] = useState([]);
  const [mostrarJoyaManual, setMostrarJoyaManual] = useState(false);
  const [joyaManual, setJoyaManual] = useState({
    descripcion: "",
    precio: "",
    cantidad: "1",
  });

  const claveDe = (p) => p.clave || p.id_producto;

  const limpiarFormulario = () => {
    localStorage.removeItem("prestamo_nuevo_borrador");
    setDistribuidoraId("");
    setNotas("");
    setSeleccionados([]);
    setMostrarJoyaManual(false);
    setJoyaManual({ descripcion: "", precio: "", cantidad: "1" });
  };

  useEffect(() => {
    if (!borradorCargado || typeof window === "undefined") return;
    localStorage.setItem(
      "prestamo_nuevo_borrador",
      JSON.stringify({ distribuidoraId, notas, seleccionados }),
    );
  }, [borradorCargado, distribuidoraId, notas, seleccionados]);

  const { data: distribuidoras = [] } = useQuery({
    queryKey: ["distribuidoras-activas"],
    queryFn: getDistribuidoras,
    staleTime: 10 * 60 * 1000,
  });

  const { data: conjuntos = [] } = useQuery({
    queryKey: ["conjuntos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conjuntos")
        .select("id, nombre")
        .order("nombre");
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60 * 1000,
  });

  const calcularPrecio = (producto) => {
    if (!producto.peso || !producto.factor?.valor) return 0;
    const precio =
      parseFloat(producto.peso) * parseFloat(producto.factor.valor);
    return Math.ceil(precio / 5) * 5;
  };

  const buscarProductos = async () => {
    setBuscando(true);
    setBusquedaEjecutada(true);
    try {
      let query = supabase
        .from("productos")
        .select("*, factor:factores(*), conjunto:conjuntos(*)")
        .eq("activo", true)
        .gt("stock", 0)
        .order("created_at", { ascending: false })
        .limit(50);

      if (filtros.codigo) query = query.ilike("codigo", `%${filtros.codigo}%`);
      if (filtros.tipo) query = query.eq("tipo", filtros.tipo);
      if (filtros.categoria) query = query.eq("categoria", filtros.categoria);
      if (filtros.material) query = query.eq("material", filtros.material);
      if (filtros.conjunto) query = query.eq("id_conjunto", filtros.conjunto);

      const { data, error } = await query;
      if (error) throw error;
      setProductosResultado(data || []);
    } catch (error) {
      console.error("Error al buscar productos:", error);
      alert("Error al buscar productos");
    } finally {
      setBuscando(false);
    }
  };

  const agregarJoyaManual = () => {
    const precio = parseFloat(joyaManual.precio);
    const cantidad = parseInt(joyaManual.cantidad, 10);
    if (!joyaManual.descripcion.trim()) {
      alert("Escribe una descripción para la joya");
      return;
    }
    if (isNaN(precio) || precio <= 0) {
      alert("El precio debe ser un número mayor a 0");
      return;
    }
    if (isNaN(cantidad) || cantidad < 1) {
      alert("La cantidad debe ser al menos 1");
      return;
    }
    setSeleccionados((prev) => [
      ...prev,
      {
        clave: `manual-${Date.now()}-${Math.random()}`,
        esManual: true,
        id_producto: null,
        codigo: null,
        nombre: joyaManual.descripcion.trim(),
        precio,
        cantidad,
        stock: null,
      },
    ]);
    setJoyaManual({ descripcion: "", precio: "", cantidad: "1" });
    setMostrarJoyaManual(false);
  };

  const agregarProducto = (producto) => {
    const existe = seleccionados.find(
      (p) => !p.esManual && p.id_producto === producto.id,
    );
    if (existe) {
      if (existe.cantidad >= producto.stock) {
        alert(`Solo hay ${producto.stock} unidades disponibles`);
        return;
      }
      setSeleccionados((prev) =>
        prev.map((p) =>
          !p.esManual && p.id_producto === producto.id
            ? { ...p, cantidad: p.cantidad + 1 }
            : p,
        ),
      );
    } else {
      setSeleccionados((prev) => [
        ...prev,
        {
          id_producto: producto.id,
          codigo: producto.codigo,
          nombre: producto.nombre_comercial,
          precio: calcularPrecio(producto),
          cantidad: 1,
          stock: producto.stock,
        },
      ]);
    }
  };

  const cambiarCantidad = (clave, cantidad) => {
    const producto = seleccionados.find((p) => claveDe(p) === clave);
    if (cantidad < 1) return;
    if (!producto.esManual && cantidad > producto.stock) {
      alert(`Solo hay ${producto.stock} unidades disponibles`);
      return;
    }
    setSeleccionados((prev) =>
      prev.map((p) => (claveDe(p) === clave ? { ...p, cantidad } : p)),
    );
  };

  const quitarProducto = (clave) => {
    setSeleccionados((prev) => prev.filter((p) => claveDe(p) !== clave));
  };

  const handleFiltroChange = (campo, valor) => {
    setFiltros((prev) => ({ ...prev, [campo]: valor }));
  };

  const handleConfirmar = async () => {
    if (!distribuidoraId) {
      alert("Debe seleccionar una distribuidora");
      return;
    }
    if (seleccionados.length === 0) {
      alert("Debe agregar al menos una joya");
      return;
    }

    if (
      !confirm(
        "¿Confirmar el préstamo? El stock de las joyas del inventario se descontará.",
      )
    )
      return;

    setGuardando(true);
    try {
      await registrarPrestamo({
        id_distribuidora: distribuidoraId,
        notas,
        items: seleccionados.map((p) =>
          p.esManual
            ? {
                esManual: true,
                descripcion: p.nombre,
                precio: p.precio,
                cantidad: p.cantidad,
              }
            : { id_producto: p.id_producto, cantidad: p.cantidad },
        ),
      });

      alert("Préstamo registrado exitosamente");
      localStorage.removeItem("prestamo_nuevo_borrador");
      queryClient.invalidateQueries({ queryKey: ["prestamos"] });
      queryClient.invalidateQueries({ queryKey: ["admin-productos"] });
      router.push("/admin/prestamos");
    } catch (error) {
      console.error("Error al registrar préstamo:", error);
      alert("Error al registrar el préstamo: " + error.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="mb-8">
        <button
          onClick={() => router.back()}
          className="text-gray-600 hover:text-gray-900 text-sm"
        >
          ← Volver a préstamos
        </button>
      </div>

      <div className="flex items-center justify-between mb-10">
        <h1 className="font-elegant text-4xl font-light text-gray-900">
          Nuevo Préstamo
        </h1>
        <BotonLimpiarBorrador onLimpiar={limpiarFormulario} />
      </div>

      {/* SECCIÓN 1: DISTRIBUIDORA */}
      <div className="bg-white border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-medium text-gray-900 mb-6 uppercase tracking-wider">
          1. Distribuidora
        </h2>
        <div className="max-w-md">
          <select
            value={distribuidoraId}
            onChange={(e) => setDistribuidoraId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
          >
            <option value="">Seleccionar distribuidora</option>
            {distribuidoras.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* SECCIÓN 2: BUSCAR PRODUCTOS */}
      <div className="bg-white border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-medium text-gray-900 mb-6 uppercase tracking-wider">
          2. Buscar Joyas
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Código
            </label>
            <input
              type="text"
              value={filtros.codigo}
              onChange={(e) => handleFiltroChange("codigo", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && buscarProductos()}
              placeholder="Ej: OANP..."
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo
            </label>
            <select
              value={filtros.tipo}
              onChange={(e) => handleFiltroChange("tipo", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
            >
              <option value="">Todos</option>
              {TIPOS_PRODUCTO.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Categoría
            </label>
            <select
              value={filtros.categoria}
              onChange={(e) => handleFiltroChange("categoria", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
            >
              <option value="">Todas</option>
              {CATEGORIAS_PRODUCTO.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Material
            </label>
            <select
              value={filtros.material}
              onChange={(e) => handleFiltroChange("material", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
            >
              <option value="">Todos</option>
              {MATERIALES_PRODUCTO.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Conjunto
            </label>
            <select
              value={filtros.conjunto}
              onChange={(e) => handleFiltroChange("conjunto", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
            >
              <option value="">Todos</option>
              {conjuntos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={buscarProductos}
          disabled={buscando}
          className="px-6 py-2 bg-gray-900 text-white text-sm uppercase tracking-wider hover:bg-gray-800 transition-colors disabled:bg-gray-400"
        >
          {buscando ? "Buscando..." : "Buscar Joyas"}
        </button>

        {busquedaEjecutada && (
          <div className="mt-4 overflow-x-auto">
            {productosResultado.length === 0 ? (
              <p className="text-gray-500 text-sm py-4">
                No se encontraron joyas
              </p>
            ) : (
              <div className="tabla-scroll">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                        #
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                        Código
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                        Nombre
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                        Material
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                        Precio
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                        Stock
                      </th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {productosResultado.map((producto, index) => {
                      const yaAgregado = seleccionados.find(
                        (p) => !p.esManual && p.id_producto === producto.id,
                      );
                      return (
                        <tr key={producto.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-500">
                            {index + 1}
                          </td>
                          <td className="px-4 py-2 text-gray-900">
                            {producto.codigo}
                          </td>
                          <td className="px-4 py-2 text-gray-900">
                            {producto.nombre_comercial}
                          </td>
                          <td className="px-4 py-2 text-gray-600">
                            {producto.material}
                          </td>
                          <td className="px-4 py-2 text-gray-900 font-medium">
                            {formatPrice(calcularPrecio(producto))}
                          </td>
                          <td className="px-4 py-2 text-gray-600">
                            {producto.stock}
                          </td>
                          <td className="px-4 py-2">
                            <button
                              onClick={() => agregarProducto(producto)}
                              className="px-3 py-1 bg-gray-900 text-white text-xs uppercase tracking-wider hover:bg-gray-700 transition-colors"
                            >
                              {yaAgregado ? "Agregar más" : "Agregar"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SECCIÓN 3: JOYAS SELECCIONADAS */}
      <div className="bg-white border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-medium text-gray-900 mb-6 uppercase tracking-wider">
          3. Joyas a Prestar
        </h2>

        {seleccionados.length === 0 ? (
          <p className="text-gray-500 text-sm">No hay joyas agregadas aún</p>
        ) : (
          <div className="tabla-scroll">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                    #
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                    Código
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                    Nombre
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                    Cantidad
                  </th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {seleccionados.map((p, index) => (
                  <tr key={claveDe(p)}>
                    <td className="px-4 py-2 text-gray-500">{index + 1}</td>
                    <td className="px-4 py-2 text-gray-900">
                      {p.codigo || (
                        <span className="text-xs text-gray-400 italic">
                          Manual
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-900">{p.nombre}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            cambiarCantidad(claveDe(p), p.cantidad - 1)
                          }
                          className="w-7 h-7 border border-gray-300 hover:bg-gray-100 flex items-center justify-center text-gray-700"
                        >
                          -
                        </button>
                        <span className="w-8 text-center">{p.cantidad}</span>
                        <button
                          onClick={() =>
                            cambiarCantidad(claveDe(p), p.cantidad + 1)
                          }
                          className="w-7 h-7 border border-gray-300 hover:bg-gray-100 flex items-center justify-center text-gray-700"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => quitarProducto(claveDe(p))}
                        className="text-red-600 hover:text-red-900 text-xs uppercase tracking-wider"
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!mostrarJoyaManual ? (
          <button
            onClick={() => setMostrarJoyaManual(true)}
            className="mt-4 text-sm text-blue-600 hover:text-blue-900 underline"
          >
            + Agregar joya sin registro en el sistema
          </button>
        ) : (
          <div className="mt-4 border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-3">
              Para joyas que no están en el inventario (por ejemplo, un arete
              suelto). No mueve stock.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="md:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">
                  Descripción
                </label>
                <input
                  type="text"
                  value={joyaManual.descripcion}
                  onChange={(e) =>
                    setJoyaManual((p) => ({
                      ...p,
                      descripcion: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Precio
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={joyaManual.precio}
                  onChange={(e) =>
                    setJoyaManual((p) => ({ ...p, precio: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Cantidad
                </label>
                <input
                  type="number"
                  min="1"
                  value={joyaManual.cantidad}
                  onChange={(e) =>
                    setJoyaManual((p) => ({ ...p, cantidad: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={agregarJoyaManual}
                className="px-4 py-2 bg-gray-900 text-white text-sm uppercase tracking-wider hover:bg-gray-800"
              >
                Agregar
              </button>
              <button
                onClick={() => setMostrarJoyaManual(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm uppercase tracking-wider hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* NOTAS */}
      <div className="bg-white border border-gray-200 p-6 mb-8">
        <h2 className="text-xl font-medium text-gray-900 mb-4 uppercase tracking-wider">
          Notas (opcional)
        </h2>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={3}
          placeholder="Observaciones sobre el préstamo..."
          className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
      </div>

      {/* CONFIRMAR */}
      <button
        onClick={handleConfirmar}
        disabled={guardando || seleccionados.length === 0 || !distribuidoraId}
        className="w-full py-5 bg-gray-900 text-white text-sm uppercase tracking-widest hover:bg-gray-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {guardando ? "Registrando préstamo..." : "Confirmar Préstamo"}
      </button>
    </div>
  );
}
