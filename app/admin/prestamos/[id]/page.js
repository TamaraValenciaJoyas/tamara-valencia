"use client";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getPrestamoById,
  procesarItemsPrestamo,
  devolverTodo,
  agregarJoyaAPrestamo,
  quitarJoyaDePrestamo,
  editarPrestamo,
  eliminarPrestamo,
} from "@/lib/supabase/prestamos";
import { supabase } from "@/lib/supabase/client";
import { getDistribuidoras } from "@/lib/supabase/distribuidoras";
import { formatPrice } from "@/utils/formatters";
import { descargarPrestamoPDF } from "@/lib/pdf/prestamo";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

export default function DetallePrestamoPage({ params }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [seleccionados, setSeleccionados] = useState([]);
  const [procesando, setProcesando] = useState(false);

  // Modal de agregar joya olvidada
  const [modalAgregar, setModalAgregar] = useState(false);
  const [buscandoJoya, setBuscandoJoya] = useState(false);
  const [codigoBusqueda, setCodigoBusqueda] = useState("");
  const [resultadosBusqueda, setResultadosBusqueda] = useState([]);
  const [busquedaHecha, setBusquedaHecha] = useState(false);

  // Editar datos generales del préstamo
  const [editandoPrestamo, setEditandoPrestamo] = useState(false);
  const [formEditarPrestamo, setFormEditarPrestamo] = useState({
    fecha_prestamo: "",
    id_distribuidora: "",
    notas: "",
  });
  const [guardandoPrestamo, setGuardandoPrestamo] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  const { data: distribuidoras = [] } = useQuery({
    queryKey: ["distribuidoras-activas"],
    queryFn: getDistribuidoras,
    staleTime: 5 * 60 * 1000,
  });

  const { data: prestamo, isLoading } = useQuery({
    queryKey: ["prestamo", resolvedParams.id],
    queryFn: () => getPrestamoById(resolvedParams.id),
    staleTime: 1 * 60 * 1000,
  });

  const formatFecha = (fecha) => {
    if (!fecha) return "-";
    return new Date(fecha).toLocaleDateString("es-EC", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const calcularPrecio = (producto) => {
    if (!producto?.peso || !producto?.factor?.valor) return 0;
    const precio =
      parseFloat(producto.peso) * parseFloat(producto.factor.valor);
    return Math.ceil(precio / 5) * 5;
  };

  // Solo los items que siguen prestados se pueden seleccionar
  const itemsPrestados =
    prestamo?.detalle?.filter((d) => d.estado_item === "prestado") || [];

  // Resumen: cuántas unidades y cuánto valen las joyas que siguen prestadas
  const cantidadPrestada = itemsPrestados.reduce(
    (sum, item) => sum + item.cantidad,
    0,
  );
  const valorTotalPrestado = itemsPrestados.reduce(
    (sum, item) => sum + calcularPrecio(item.producto) * item.cantidad,
    0,
  );

  const toggleSeleccion = (itemId) => {
    setSeleccionados((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId],
    );
  };

  const toggleTodos = () => {
    if (seleccionados.length === itemsPrestados.length) {
      setSeleccionados([]);
    } else {
      setSeleccionados(itemsPrestados.map((i) => i.id));
    }
  };

  const handleDevolver = async () => {
    if (seleccionados.length === 0) {
      alert("Seleccione al menos una joya");
      return;
    }
    if (
      !confirm(
        `¿Devolver ${seleccionados.length} joya(s) al inventario? El stock volverá a subir.`,
      )
    )
      return;

    setProcesando(true);
    try {
      await procesarItemsPrestamo(seleccionados, "devuelto");
      setSeleccionados([]);
      queryClient.invalidateQueries({
        queryKey: ["prestamo", resolvedParams.id],
      });
      queryClient.invalidateQueries({ queryKey: ["prestamos"] });
      alert("Joyas devueltas al inventario");
    } catch (error) {
      console.error("Error al devolver:", error);
      alert("Error al devolver las joyas: " + error.message);
    } finally {
      setProcesando(false);
    }
  };

  const handleDevolverTodo = async () => {
    if (
      !confirm(
        "¿Devolver TODAS las joyas prestadas al inventario? El stock volverá a subir.",
      )
    )
      return;

    setProcesando(true);
    try {
      await devolverTodo(resolvedParams.id);
      setSeleccionados([]);
      queryClient.invalidateQueries({
        queryKey: ["prestamo", resolvedParams.id],
      });
      queryClient.invalidateQueries({ queryKey: ["prestamos"] });
      alert("Todas las joyas fueron devueltas al inventario");
    } catch (error) {
      console.error("Error al devolver todo:", error);
      alert("Error al devolver las joyas: " + error.message);
    } finally {
      setProcesando(false);
    }
  };

  const handleVender = async () => {
    if (seleccionados.length === 0) {
      alert("Seleccione al menos una joya");
      return;
    }
    if (
      !confirm(
        `¿Sacar ${seleccionados.length} joya(s) para vender? Se registrará la venta a continuación.`,
      )
    )
      return;

    setProcesando(true);
    try {
      // Preparar los productos para precargar en la venta ANTES de procesar
      const itemsParaVender = itemsPrestados
        .filter((i) => seleccionados.includes(i.id))
        .map((i) => ({
          id_producto: i.producto.id,
          codigo: i.producto.codigo,
          nombre: i.producto.nombre_comercial,
          precio_unitario: calcularPrecio(i.producto),
          cantidad: i.cantidad,
          stock: i.producto.stock + i.cantidad, // el stock que tendrá tras devolverse
        }));

      // Sacar las joyas del préstamo (esto devuelve el stock al inventario)
      await procesarItemsPrestamo(seleccionados, "vendido");

      // Guardar en sessionStorage para precargar la venta
      const precarga = {
        productos: itemsParaVender,
        distribuidoraId: prestamo.distribuidora?.id || "",
      };
      sessionStorage.setItem("prestamo_venta", JSON.stringify(precarga));

      setSeleccionados([]);
      queryClient.invalidateQueries({
        queryKey: ["prestamo", resolvedParams.id],
      });
      queryClient.invalidateQueries({ queryKey: ["prestamos"] });

      // Ir a nueva venta
      router.push("/admin/ventas/nueva?desde_prestamo=1");
    } catch (error) {
      console.error("Error al procesar venta:", error);
      alert("Error al procesar la venta: " + error.message);
      setProcesando(false);
    }
  };

  const handleDescargarPDF = async () => {
    try {
      await descargarPrestamoPDF(prestamo);
    } catch (error) {
      console.error("Error al generar el PDF:", error);
      alert(
        "Error al generar el PDF. Verifique que estén instaladas las librerías (npm install jspdf jspdf-autotable)",
      );
    }
  };

  const refrescarPrestamo = () => {
    queryClient.invalidateQueries({
      queryKey: ["prestamo", resolvedParams.id],
    });
    queryClient.invalidateQueries({ queryKey: ["admin-productos"] });
  };

  const handleBuscarJoya = async () => {
    if (!codigoBusqueda.trim()) return;
    setBuscandoJoya(true);
    setBusquedaHecha(true);
    try {
      const { data, error } = await supabase
        .from("productos")
        .select("*, factor:factores(*)")
        .eq("activo", true)
        .gt("stock", 0)
        .or(
          `codigo.ilike.%${codigoBusqueda}%,nombre_comercial.ilike.%${codigoBusqueda}%`,
        )
        .limit(20);
      if (error) throw error;
      setResultadosBusqueda(data || []);
    } catch (error) {
      console.error("Error al buscar producto:", error);
      alert("Error al buscar el producto");
    } finally {
      setBuscandoJoya(false);
    }
  };

  const handleAgregarJoya = async (producto) => {
    if (
      !confirm(
        `¿Agregar "${producto.nombre_comercial}" (${producto.codigo}) a este préstamo? Se descontará 1 unidad del stock.`,
      )
    )
      return;

    setProcesando(true);
    try {
      await agregarJoyaAPrestamo(resolvedParams.id, producto.id, 1);
      refrescarPrestamo();
      setModalAgregar(false);
      setCodigoBusqueda("");
      setResultadosBusqueda([]);
      setBusquedaHecha(false);
      alert("Joya agregada al préstamo");
    } catch (error) {
      console.error("Error al agregar la joya:", error);
      alert("Error al agregar la joya: " + error.message);
    } finally {
      setProcesando(false);
    }
  };

  const handleQuitarJoya = async (itemId, nombreJoya) => {
    if (
      !confirm(
        `¿Quitar "${nombreJoya}" de este préstamo? Se usa cuando se agregó por error y nunca salió físicamente. El stock vuelve al inventario.`,
      )
    )
      return;

    setProcesando(true);
    try {
      await quitarJoyaDePrestamo(itemId);
      refrescarPrestamo();
      setSeleccionados((prev) => prev.filter((id) => id !== itemId));
    } catch (error) {
      console.error("Error al quitar la joya:", error);
      alert("Error al quitar la joya: " + error.message);
    } finally {
      setProcesando(false);
    }
  };

  const handleAbrirEditarPrestamo = () => {
    setFormEditarPrestamo({
      fecha_prestamo: prestamo.fecha_prestamo?.slice(0, 10) || "",
      id_distribuidora: prestamo.id_distribuidora || "",
      notas: prestamo.notas || "",
    });
    setEditandoPrestamo(true);
  };

  const handleGuardarEdicionPrestamo = async () => {
    setGuardandoPrestamo(true);
    try {
      await editarPrestamo(prestamo.id, formEditarPrestamo);
      refrescarPrestamo();
      queryClient.invalidateQueries({ queryKey: ["prestamos"] });
      setEditandoPrestamo(false);
    } catch (error) {
      console.error("Error al editar el préstamo:", error);
      alert("Error al editar el préstamo: " + error.message);
    } finally {
      setGuardandoPrestamo(false);
    }
  };

  const handleEliminarPrestamo = async () => {
    if (
      !confirm(
        "¿Eliminar este préstamo por completo? Esto borra el registro entero, incluyendo todas las joyas que tuvo. No se puede deshacer.",
      )
    )
      return;

    setEliminando(true);
    try {
      await eliminarPrestamo(prestamo.id);
      queryClient.invalidateQueries({ queryKey: ["prestamos"] });
      router.push("/admin/prestamos");
    } catch (error) {
      console.error("Error al eliminar el préstamo:", error);
      alert("Error al eliminar el préstamo: " + error.message);
      setEliminando(false);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (!prestamo)
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <p>Préstamo no encontrado</p>
      </div>
    );

  const estadoLabel = {
    prestado: { text: "Prestado", cls: "bg-green-100 text-green-800" },
    devuelto: { text: "Devuelto", cls: "bg-gray-100 text-gray-600" },
    vendido: { text: "Vendido", cls: "bg-blue-100 text-blue-800" },
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-8">
        <button
          onClick={() => router.push("/admin/prestamos")}
          className="text-gray-600 hover:text-gray-900 text-sm"
        >
          ← Volver a préstamos
        </button>
      </div>

      <div className="flex items-center justify-between mb-8">
        <h1 className="font-elegant text-4xl font-light text-gray-900">
          Detalle del Préstamo
        </h1>
        <div className="flex items-center gap-4">
          {prestamo.estado === "activo" && (
            <button
              onClick={() => setModalAgregar(true)}
              className="text-sm text-gray-700 hover:text-gray-900 underline"
            >
              + Agregar joya olvidada
            </button>
          )}
          <button
            onClick={handleAbrirEditarPrestamo}
            className="text-sm text-gray-700 hover:text-gray-900 underline"
          >
            Editar
          </button>
          {prestamo.estado === "finalizado" && (
            <button
              onClick={handleEliminarPrestamo}
              disabled={eliminando}
              className="text-sm text-red-600 hover:text-red-900 underline disabled:opacity-50"
            >
              {eliminando ? "Eliminando..." : "Eliminar"}
            </button>
          )}
          <button
            onClick={handleDescargarPDF}
            className="text-sm text-blue-600 hover:text-blue-900"
          >
            Descargar PDF
          </button>
        </div>
      </div>

      {/* Info de la distribuidora */}
      <div className="bg-white border border-gray-200 p-6 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6 text-sm">
          <div>
            <p className="text-gray-500 uppercase tracking-wider text-xs mb-1">
              Distribuidora
            </p>
            <p className="font-medium text-gray-900">
              {prestamo.distribuidora?.nombre}
            </p>
            {prestamo.distribuidora?.telefono && (
              <p className="text-gray-600">{prestamo.distribuidora.telefono}</p>
            )}
          </div>
          <div>
            <p className="text-gray-500 uppercase tracking-wider text-xs mb-1">
              Fecha del préstamo
            </p>
            <p className="font-medium text-gray-900">
              {formatFecha(prestamo.fecha_prestamo)}
            </p>
          </div>
          <div>
            <p className="text-gray-500 uppercase tracking-wider text-xs mb-1">
              Estado
            </p>
            <span
              className={`px-2 py-1 text-xs uppercase tracking-wider ${
                prestamo.estado === "activo"
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {prestamo.estado}
            </span>
          </div>
          <div>
            <p className="text-gray-500 uppercase tracking-wider text-xs mb-1">
              Joyas Prestadas
            </p>
            <p className="font-medium text-gray-900">{cantidadPrestada}</p>
          </div>
          <div>
            <p className="text-gray-500 uppercase tracking-wider text-xs mb-1">
              Valor Total
            </p>
            <p className="font-medium text-gray-900">
              {formatPrice(valorTotalPrestado)}
            </p>
          </div>
          {prestamo.notas && (
            <div className="col-span-2 md:col-span-5">
              <p className="text-gray-500 uppercase tracking-wider text-xs mb-1">
                Notas
              </p>
              <p className="text-gray-700">{prestamo.notas}</p>
            </div>
          )}
        </div>
      </div>

      {/* Acciones sobre joyas prestadas */}
      {itemsPrestados.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-600">
              {seleccionados.length} seleccionada(s)
            </span>
            <button
              onClick={handleDevolver}
              disabled={procesando || seleccionados.length === 0}
              className="px-4 py-2 border border-gray-900 text-gray-900 text-sm uppercase tracking-wider hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Devolver seleccionadas
            </button>
            <button
              onClick={handleVender}
              disabled={procesando || seleccionados.length === 0}
              className="px-4 py-2 bg-gray-900 text-white text-sm uppercase tracking-wider hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Vender seleccionadas
            </button>
            <button
              onClick={handleDevolverTodo}
              disabled={procesando}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 underline ml-auto"
            >
              Devolver todo
            </button>
          </div>
        </div>
      )}

      {/* Lista de joyas */}
      <div className="bg-white border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                #
              </th>
              <th className="px-4 py-3 w-10">
                {itemsPrestados.length > 0 && (
                  <input
                    type="checkbox"
                    checked={
                      seleccionados.length === itemsPrestados.length &&
                      itemsPrestados.length > 0
                    }
                    onChange={toggleTodos}
                    className="w-4 h-4"
                  />
                )}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                Código
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                Descripción
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                Material
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                Cantidad
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                Precio
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                Estado
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {itemsPrestados.map((item, index) => {
              const esPrestado = item.estado_item === "prestado";
              return (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500">{index + 1}</td>
                  <td className="px-4 py-3">
                    {esPrestado && (
                      <input
                        type="checkbox"
                        checked={seleccionados.includes(item.id)}
                        onChange={() => toggleSeleccion(item.id)}
                        className="w-4 h-4"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-900">
                    {item.producto?.codigo}
                  </td>
                  <td className="px-4 py-3 text-gray-900">
                    {item.producto?.descripcion ||
                      item.producto?.nombre_comercial}
                  </td>
                  <td className="px-4 py-3 text-gray-600 capitalize">
                    {item.producto?.material}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{item.cantidad}</td>
                  <td className="px-4 py-3 text-gray-900 font-medium">
                    {formatPrice(calcularPrecio(item.producto))}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 text-xs uppercase tracking-wider ${estadoLabel[item.estado_item].cls}`}
                    >
                      {estadoLabel[item.estado_item].text}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {esPrestado && (
                      <button
                        onClick={() =>
                          handleQuitarJoya(
                            item.id,
                            item.producto?.nombre_comercial,
                          )
                        }
                        disabled={procesando}
                        className="text-xs text-red-600 hover:text-red-900 disabled:opacity-40"
                      >
                        Quitar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MODAL: Agregar joya olvidada */}
      {modalAgregar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-light text-gray-900 mb-2">
              Agregar Joya Olvidada
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              Busca por código o nombre. Se descontará el stock igual que si se
              hubiera incluido desde el inicio del préstamo.
            </p>

            <div className="flex gap-3 mb-4">
              <input
                type="text"
                value={codigoBusqueda}
                onChange={(e) => setCodigoBusqueda(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleBuscarJoya()}
                placeholder="Ej: ANPLAR710"
                autoFocus
                className="flex-1 px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
              <button
                onClick={handleBuscarJoya}
                disabled={buscandoJoya}
                className="px-4 py-2 bg-gray-900 text-white text-sm uppercase tracking-wider hover:bg-gray-800 transition-colors disabled:bg-gray-400"
              >
                {buscandoJoya ? "Buscando..." : "Buscar"}
              </button>
            </div>

            {busquedaHecha && (
              <div className="border border-gray-200 mb-6 max-h-72 overflow-y-auto">
                {resultadosBusqueda.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-6">
                    No se encontraron joyas con stock disponible
                  </p>
                ) : (
                  resultadosBusqueda.map((producto) => (
                    <div
                      key={producto.id}
                      className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {producto.codigo} — {producto.nombre_comercial}
                        </p>
                        <p className="text-xs text-gray-500">
                          {producto.material} · Stock: {producto.stock} ·{" "}
                          {formatPrice(calcularPrecio(producto))}
                        </p>
                      </div>
                      <button
                        onClick={() => handleAgregarJoya(producto)}
                        disabled={procesando}
                        className="px-3 py-1 bg-gray-900 text-white text-xs uppercase tracking-wider hover:bg-gray-700 transition-colors disabled:opacity-40 flex-shrink-0 ml-3"
                      >
                        Agregar
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            <button
              onClick={() => {
                setModalAgregar(false);
                setCodigoBusqueda("");
                setResultadosBusqueda([]);
                setBusquedaHecha(false);
              }}
              className="w-full py-3 border border-gray-300 text-gray-700 text-sm uppercase tracking-wider hover:bg-gray-50"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {editandoPrestamo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white max-w-sm w-full p-6">
            <h3 className="text-xl font-light text-gray-900 mb-6">
              Editar Préstamo
            </h3>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha del préstamo
                </label>
                <input
                  type="date"
                  value={formEditarPrestamo.fecha_prestamo}
                  onChange={(e) =>
                    setFormEditarPrestamo((p) => ({
                      ...p,
                      fecha_prestamo: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Distribuidora
                </label>
                <select
                  value={formEditarPrestamo.id_distribuidora}
                  onChange={(e) =>
                    setFormEditarPrestamo((p) => ({
                      ...p,
                      id_distribuidora: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                >
                  {distribuidoras.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas
                </label>
                <textarea
                  value={formEditarPrestamo.notas}
                  onChange={(e) =>
                    setFormEditarPrestamo((p) => ({
                      ...p,
                      notas: e.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleGuardarEdicionPrestamo}
                disabled={guardandoPrestamo}
                className="flex-1 py-3 bg-gray-900 text-white text-sm uppercase tracking-wider hover:bg-gray-800 disabled:bg-gray-400"
              >
                {guardandoPrestamo ? "Guardando..." : "Guardar"}
              </button>
              <button
                onClick={() => setEditandoPrestamo(false)}
                className="px-6 py-3 border border-gray-300 text-gray-700 text-sm uppercase tracking-wider hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
