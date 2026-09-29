"use client";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getVentaById,
  cambiarEstadoVenta,
  editarVentaContado,
  editarVentaCredito,
} from "@/lib/supabase/ventas";
import { getCuentaPorCliente } from "@/lib/supabase/cuentas";
import { getDistribuidoras } from "@/lib/supabase/distribuidoras";
import { buscarClientes } from "@/lib/supabase/clientes";
import { supabase } from "@/lib/supabase/client";
import { formatPrice } from "@/utils/formatters";
import { descargarVentaPDF } from "@/lib/pdf/venta";
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

const VIAS_VENTA = Object.entries(VIAS_LABEL).map(([value, label]) => ({
  value,
  label,
}));

const limitarDecimales = (valor) => {
  if (valor === "") return valor;
  return /^\d*\.?\d{0,2}$/.test(valor) ? valor : valor.slice(0, -1);
};

const calcularPrecio = (producto) => {
  if (!producto.peso || !producto.factor?.valor) return 0;
  const precio = parseFloat(producto.peso) * parseFloat(producto.factor.valor);
  return Math.ceil(precio / 5) * 5;
};

export default function DetalleVentaPage({ params }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [editando, setEditando] = useState(false);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [formEdit, setFormEdit] = useState({
    fecha: "",
    notas: "",
    via: "",
    id_distribuidora: "",
    descuento: "0",
  });
  const [detalleEdit, setDetalleEdit] = useState([]);
  const [fechaOriginal, setFechaOriginal] = useState("");
  const [clienteEdit, setClienteEdit] = useState(null);
  const [mostrarBuscadorCliente, setMostrarBuscadorCliente] = useState(false);
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [resultadosCliente, setResultadosCliente] = useState([]);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [codigoBusqueda, setCodigoBusqueda] = useState("");
  const [resultadosBusqueda, setResultadosBusqueda] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [mostrarItemManual, setMostrarItemManual] = useState(false);
  const [itemManual, setItemManual] = useState({
    descripcion: "",
    precio: "",
    cantidad: "1",
  });

  const { data: venta, isLoading } = useQuery({
    queryKey: ["venta", resolvedParams.id],
    queryFn: () => getVentaById(resolvedParams.id),
  });

  const { data: distribuidoras = [] } = useQuery({
    queryKey: ["distribuidoras-activas"],
    queryFn: getDistribuidoras,
    staleTime: 5 * 60 * 1000,
  });

  const formatFecha = (fecha) =>
    new Date(fecha).toLocaleDateString("es-EC", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const handleCambiarEstado = async (nuevoEstado) => {
    setCambiandoEstado(true);
    try {
      await cambiarEstadoVenta(resolvedParams.id, nuevoEstado);
      queryClient.invalidateQueries({ queryKey: ["venta", resolvedParams.id] });
    } catch (error) {
      console.error(error);
      alert("Error al cambiar el estado: " + error.message);
    } finally {
      setCambiandoEstado(false);
    }
  };

  const handleDescargarPDF = async () => {
    try {
      let cuenta = null;
      if (venta.es_credito && venta.cliente?.id) {
        cuenta = await getCuentaPorCliente(venta.cliente.id);
      }
      await descargarVentaPDF(venta, cuenta);
    } catch (error) {
      console.error("Error al generar el PDF:", error);
      alert("Error al generar el PDF: " + error.message);
    }
  };

  const handleIniciarEdicion = () => {
    const fecha = venta.fecha?.slice(0, 10) || "";
    setFechaOriginal(fecha);
    setClienteEdit(venta.cliente || null);
    setMostrarBuscadorCliente(false);
    setBusquedaCliente("");
    setResultadosCliente([]);
    setFormEdit({
      fecha,
      notas: venta.notas || "",
      via: venta.via || "",
      id_distribuidora: venta.id_distribuidora || "",
      descuento: (venta.descuento || 0).toString(),
    });
    setDetalleEdit(
      (venta.detalle || []).map((item) => ({
        clave: item.id,
        id_producto: item.id_producto,
        esManual: !item.id_producto,
        codigo: item.producto?.codigo || null,
        nombre: item.producto?.nombre_comercial || item.descripcion_manual,
        precio_unitario: item.precio_unitario,
        cantidad: item.cantidad,
      })),
    );
    setEditando(true);
  };

  const handleBuscarProducto = async () => {
    if (!codigoBusqueda.trim()) return;
    setBuscando(true);
    try {
      const { data, error } = await supabase
        .from("productos")
        .select("*, factor:factores(*)")
        .eq("activo", true)
        .ilike("codigo", `%${codigoBusqueda.trim()}%`)
        .limit(10);
      if (error) throw error;
      setResultadosBusqueda(data || []);
    } catch (error) {
      console.error("Error al buscar producto:", error);
      alert("Error al buscar producto");
    } finally {
      setBuscando(false);
    }
  };

  const handleAgregarProductoEdit = (producto) => {
    setDetalleEdit((prev) => {
      const existente = prev.find(
        (item) => !item.esManual && item.id_producto === producto.id,
      );
      if (existente) {
        return prev.map((item) =>
          item.clave === existente.clave
            ? { ...item, cantidad: item.cantidad + 1 }
            : item,
        );
      }
      return [
        ...prev,
        {
          clave: `nuevo-${Date.now()}-${Math.random()}`,
          id_producto: producto.id,
          esManual: false,
          codigo: producto.codigo,
          nombre: producto.nombre_comercial,
          precio_unitario: calcularPrecio(producto),
          cantidad: 1,
        },
      ];
    });
    setResultadosBusqueda([]);
    setCodigoBusqueda("");
  };

  const handleBuscarClienteEdit = async () => {
    if (!busquedaCliente.trim()) return;
    setBuscandoCliente(true);
    try {
      setResultadosCliente(await buscarClientes(busquedaCliente.trim()));
    } catch (error) {
      console.error("Error al buscar cliente:", error);
      alert("Error al buscar cliente");
    } finally {
      setBuscandoCliente(false);
    }
  };

  const handleSeleccionarClienteEdit = (cliente) => {
    const teniaDistribuidora = !!clienteEdit?.id_distribuidora;
    setClienteEdit(cliente);
    if (cliente?.id_distribuidora) {
      setFormEdit((p) => ({
        ...p,
        via: "distribuidora",
        id_distribuidora: cliente.id_distribuidora,
      }));
    } else if (teniaDistribuidora) {
      setFormEdit((p) => ({ ...p, id_distribuidora: "" }));
    }
    setMostrarBuscadorCliente(false);
    setBusquedaCliente("");
    setResultadosCliente([]);
  };

  const handleAgregarItemManualEdit = () => {
    const precio = parseFloat(itemManual.precio);
    const cantidad = parseInt(itemManual.cantidad, 10);
    if (!itemManual.descripcion.trim()) {
      alert("Escribe una descripción para el ítem");
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
    setDetalleEdit((prev) => [
      ...prev,
      {
        clave: `manual-${Date.now()}-${Math.random()}`,
        id_producto: null,
        esManual: true,
        codigo: null,
        nombre: itemManual.descripcion.trim(),
        precio_unitario: precio,
        cantidad,
      },
    ]);
    setItemManual({ descripcion: "", precio: "", cantidad: "1" });
    setMostrarItemManual(false);
  };

  const handleQuitarItemEdit = (clave) => {
    setDetalleEdit((prev) => prev.filter((item) => item.clave !== clave));
  };

  const handleCambiarCantidadEdit = (clave, cantidad) => {
    if (cantidad < 1) return;
    setDetalleEdit((prev) =>
      prev.map((item) => (item.clave === clave ? { ...item, cantidad } : item)),
    );
  };

  const handleCambiarPrecioEdit = (clave, precio) => {
    setDetalleEdit((prev) =>
      prev.map((item) =>
        item.clave === clave
          ? { ...item, precio_unitario: parseFloat(precio) || 0 }
          : item,
      ),
    );
  };

  const subtotalEdit = detalleEdit.reduce(
    (sum, item) => sum + item.precio_unitario * item.cantidad,
    0,
  );
  const descuentoEditNum = parseFloat(formEdit.descuento) || 0;
  const tieneDistribuidoraCliente = !!clienteEdit?.id_distribuidora;
  const nombreDistribuidoraCliente =
    clienteEdit?.distribuidora?.nombre ||
    distribuidoras.find((d) => d.id === clienteEdit?.id_distribuidora)
      ?.nombre ||
    "";
  const totalEdit = Math.max(0, subtotalEdit - descuentoEditNum);

  const handleGuardarEdicion = async () => {
    if (detalleEdit.length === 0) {
      alert("La venta debe tener al menos un producto");
      return;
    }
    if (!formEdit.fecha) {
      alert("La fecha es obligatoria");
      return;
    }
    setGuardandoEdicion(true);
    try {
      const funcionEditar = venta.es_credito
        ? editarVentaCredito
        : editarVentaContado;

      const datos = {
        fecha: formEdit.fecha !== fechaOriginal ? formEdit.fecha : undefined,
        notas: formEdit.notas,
        via: formEdit.via,
        id_distribuidora: formEdit.id_distribuidora || null,
        descuento: formEdit.descuento,
        detalleNuevo: detalleEdit.map((item) => ({
          id_producto: item.id_producto,
          esManual: item.esManual,
          nombre: item.nombre,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
        })),
      };
      if (!venta.es_credito) datos.id_cliente = clienteEdit?.id || null;

      let resultado = await funcionEditar(resolvedParams.id, datos);

      if (resultado.requiereConfirmacion) {
        const confirmado = confirm(
          `Con este cambio el cliente queda con un saldo a favor de ${formatPrice(resultado.saldoFavor)} (pagó más de lo que ahora debe). ¿Guardar de todas formas?`,
        );
        if (!confirmado) return;
        resultado = await funcionEditar(resolvedParams.id, {
          ...datos,
          confirmarSaldoFavor: true,
        });
      }

      if (resultado.avisoComisionPagada) {
        alert(
          "La venta se corrigió, pero la comisión que generó ya estaba marcada como pagada, así que no se tocó. Revísala a mano si hace falta un ajuste.",
        );
      }
      if (resultado.avisoComisionNoGenerada) {
        alert(
          "La venta se corrigió, pero no se pudo generar la comisión para la distribuidora del nuevo cliente. Revísala a mano.",
        );
      }

      queryClient.invalidateQueries();
      setEditando(false);
    } catch (error) {
      console.error("Error al guardar la edición:", error);
      alert("Error al guardar: " + error.message);
    } finally {
      setGuardandoEdicion(false);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (!venta)
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <p>Venta no encontrada</p>
      </div>
    );

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-8">
        <button
          onClick={() => router.back()}
          className="text-gray-600 hover:text-gray-900 text-sm"
        >
          ← Volver a ventas
        </button>
      </div>

      <div className="flex items-center justify-between mb-8">
        <h1 className="font-elegant text-4xl font-light text-gray-900">
          Detalle de Venta
        </h1>
        <div className="flex items-center gap-4">
          {!editando && (
            <button
              onClick={handleIniciarEdicion}
              className="text-sm text-gray-700 hover:text-gray-900 underline"
            >
              Editar
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

      {venta.es_credito && editando && (
        <div className="bg-yellow-50 border border-yellow-200 p-4 mb-6 text-sm text-yellow-800">
          Esta venta es a crédito y ya generó una cuenta. Si cambias el total,
          los meses que el cliente ya empezó a pagar no se tocan - solo se
          ajustan los meses que todavía no tienen ningún pago encima.
        </div>
      )}

      {!editando ? (
        <>
          {/* Info general */}
          <div className="bg-white border border-gray-200 p-6 mb-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-sm">
              <div>
                <p className="text-gray-500 uppercase tracking-wider text-xs mb-1">
                  Fecha
                </p>
                <p className="font-medium text-gray-900">
                  {formatFecha(venta.fecha)}
                </p>
              </div>
              <div>
                <p className="text-gray-500 uppercase tracking-wider text-xs mb-1">
                  Cliente
                </p>
                <p className="font-medium text-gray-900">
                  {venta.cliente?.nombre || "Sin cliente"}
                </p>
                {venta.cliente?.telefono && (
                  <p className="text-gray-600">{venta.cliente.telefono}</p>
                )}
              </div>
              <div>
                <p className="text-gray-500 uppercase tracking-wider text-xs mb-1">
                  Vía de venta
                </p>
                <p className="font-medium text-gray-900">
                  {VIAS_LABEL[venta.via]}
                </p>
                {venta.distribuidora && (
                  <p className="text-gray-600">{venta.distribuidora.nombre}</p>
                )}
              </div>
              <div>
                <p className="text-gray-500 uppercase tracking-wider text-xs mb-1">
                  Forma de pago
                </p>
                <span
                  className={`px-2 py-1 text-xs uppercase tracking-wider ${
                    venta.es_credito
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-green-100 text-green-800"
                  }`}
                >
                  {venta.es_credito ? "Crédito" : "Contado"}
                </span>
              </div>
              <div>
                <p className="text-gray-500 uppercase tracking-wider text-xs mb-1">
                  Estado
                </p>
                <span
                  className={`px-2 py-1 text-xs uppercase tracking-wider ${
                    venta.estado === "cancelado"
                      ? "bg-green-100 text-green-800"
                      : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {venta.estado === "cancelado" ? "Cancelado" : "En proceso"}
                </span>
                <div className="mt-2">
                  {venta.estado === "cancelado" ? (
                    <button
                      onClick={() => handleCambiarEstado("en_proceso")}
                      disabled={cambiandoEstado}
                      className="text-xs text-gray-600 hover:text-gray-900 underline"
                    >
                      Marcar en proceso
                    </button>
                  ) : (
                    <button
                      onClick={() => handleCambiarEstado("cancelado")}
                      disabled={cambiandoEstado}
                      className="text-xs text-blue-600 hover:text-blue-900 underline"
                    >
                      Marcar cancelado
                    </button>
                  )}
                </div>
              </div>
              {venta.notas && (
                <div className="col-span-2 md:col-span-3">
                  <p className="text-gray-500 uppercase tracking-wider text-xs mb-1">
                    Notas
                  </p>
                  <p className="text-gray-700">{venta.notas}</p>
                </div>
              )}
            </div>
          </div>

          {/* Productos */}
          <div className="bg-white border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900 uppercase tracking-wider">
                Productos
              </h2>
              <span className="text-sm text-gray-500">
                {venta.detalle?.reduce((sum, item) => sum + item.cantidad, 0) ||
                  0}{" "}
                joyas
              </span>
            </div>
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
                    Producto
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                    Descripción
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                    Material
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                    Precio
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                    Cantidad
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                    Subtotal
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {venta.detalle?.map((item, index) => (
                  <tr key={item.id}>
                    <td className="px-4 py-2 text-gray-500">{index + 1}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {item.producto?.codigo || "-"}
                    </td>
                    <td className="px-4 py-2 text-gray-900">
                      {item.producto?.nombre_comercial ||
                        item.descripcion_manual ||
                        "-"}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {item.producto?.descripcion ||
                        (!item.producto ? "Ítem manual" : "-")}
                    </td>
                    <td className="px-4 py-2 text-gray-600 capitalize">
                      {item.producto?.material || "-"}
                    </td>
                    <td className="px-4 py-2 text-gray-900">
                      {formatPrice(item.precio_unitario)}
                    </td>
                    <td className="px-4 py-2 text-gray-900">{item.cantidad}</td>
                    <td className="px-4 py-2 font-medium text-gray-900">
                      {formatPrice(item.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totales */}
          <div className="bg-white border border-gray-200 p-6">
            <div className="max-w-xs ml-auto space-y-2 text-sm">
              <div className="flex justify-between text-gray-700">
                <span>Subtotal</span>
                <span>{formatPrice(venta.subtotal)}</span>
              </div>
              {venta.descuento > 0 && (
                <div className="flex justify-between text-gray-700">
                  <span>Descuento</span>
                  <span>-{formatPrice(venta.descuento)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-medium text-gray-900 pt-2 border-t border-gray-200">
                <span>Total</span>
                <span>{formatPrice(venta.total)}</span>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* MODO EDICIÓN */}
          <div className="bg-white border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-medium text-gray-900 uppercase tracking-wider mb-4">
              Cliente
            </h2>
            {venta.es_credito ? (
              <div>
                <p className="font-medium text-gray-900">
                  {clienteEdit?.nombre || "Sin cliente"}
                </p>
                {clienteEdit?.telefono && (
                  <p className="text-sm text-gray-600">
                    {clienteEdit.telefono}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-2">
                  En una venta a crédito el cliente no se puede cambiar, porque
                  la deuda está registrada en su cuenta.
                </p>
              </div>
            ) : !mostrarBuscadorCliente ? (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-gray-900">
                    {clienteEdit?.nombre || "Sin cliente"}
                  </p>
                  {clienteEdit?.telefono && (
                    <p className="text-sm text-gray-600">
                      {clienteEdit.telefono}
                    </p>
                  )}
                </div>
                <div className="flex gap-4">
                  <button
                    onClick={() => setMostrarBuscadorCliente(true)}
                    className="text-sm text-gray-700 hover:text-gray-900 underline"
                  >
                    {clienteEdit ? "Cambiar cliente" : "Asignar cliente"}
                  </button>
                  {clienteEdit && (
                    <button
                      onClick={() => handleSeleccionarClienteEdit(null)}
                      className="text-sm text-red-600 hover:text-red-900 underline"
                    >
                      Quitar cliente
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={busquedaCliente}
                    onChange={(e) => setBusquedaCliente(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleBuscarClienteEdit()
                    }
                    placeholder="Buscar por nombre o teléfono..."
                    className="flex-1 px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  />
                  <button
                    onClick={handleBuscarClienteEdit}
                    disabled={buscandoCliente}
                    className="px-4 py-2 border border-gray-300 text-gray-700 text-sm hover:bg-gray-50"
                  >
                    {buscandoCliente ? "Buscando..." : "Buscar"}
                  </button>
                  <button
                    onClick={() => {
                      setMostrarBuscadorCliente(false);
                      setBusquedaCliente("");
                      setResultadosCliente([]);
                    }}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
                  >
                    Cancelar
                  </button>
                </div>
                {resultadosCliente.length > 0 && (
                  <div className="border border-gray-200 max-h-56 overflow-y-auto">
                    {resultadosCliente.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => handleSeleccionarClienteEdit(c)}
                        className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 text-left"
                      >
                        <div>
                          <p className="text-sm text-gray-900">{c.nombre}</p>
                          {c.telefono && (
                            <p className="text-xs text-gray-500">
                              {c.telefono}
                            </p>
                          )}
                        </div>
                        {c.distribuidora?.nombre && (
                          <span className="text-xs text-gray-500">
                            {c.distribuidora.nombre}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-medium text-gray-900 uppercase tracking-wider mb-4">
              Datos Generales
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Fecha
                </label>
                <input
                  type="date"
                  value={formEdit.fecha}
                  onChange={(e) =>
                    setFormEdit((p) => ({ ...p, fecha: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
              </div>
              {tieneDistribuidoraCliente ? (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    Vía de venta
                  </label>
                  <p className="px-3 py-2 border border-gray-200 bg-gray-50 text-gray-700">
                    Distribuidora — {nombreDistribuidoraCliente}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Viene del cliente.
                    {!venta.es_credito &&
                      " La comisión es para esta distribuidora."}
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Vía de venta
                    </label>
                    <select
                      value={formEdit.via}
                      onChange={(e) =>
                        setFormEdit((p) => ({
                          ...p,
                          via: e.target.value,
                          id_distribuidora:
                            e.target.value === "distribuidora"
                              ? p.id_distribuidora
                              : "",
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                    >
                      {VIAS_VENTA.map((v) => (
                        <option key={v.value} value={v.value}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {formEdit.via === "distribuidora" && (
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">
                        Distribuidora
                      </label>
                      <select
                        value={formEdit.id_distribuidora}
                        onChange={(e) =>
                          setFormEdit((p) => ({
                            ...p,
                            id_distribuidora: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                      >
                        <option value="">-</option>
                        {distribuidoras.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.nombre}
                          </option>
                        ))}
                      </select>
                      {!venta.es_credito && (
                        <p className="text-xs text-gray-500 mt-1">
                          Esta venta no genera comisión porque{" "}
                          {clienteEdit
                            ? "el cliente no tiene distribuidora asignada."
                            : "no tiene cliente."}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Descuento
                </label>
                <input
                  type="number"
                  value={formEdit.descuento}
                  onChange={(e) =>
                    setFormEdit((p) => ({
                      ...p,
                      descuento: limitarDecimales(e.target.value),
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm text-gray-600 mb-1">
                  Notas
                </label>
                <input
                  type="text"
                  value={formEdit.notas}
                  onChange={(e) =>
                    setFormEdit((p) => ({ ...p, notas: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-medium text-gray-900 uppercase tracking-wider mb-4">
              Productos
            </h2>

            <table className="w-full text-sm mb-6">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                    Código
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                    Producto
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                    Precio
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                    Cantidad
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                    Subtotal
                  </th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {detalleEdit.map((item) => (
                  <tr key={item.clave}>
                    <td className="px-4 py-2 text-gray-600">
                      {item.codigo || (
                        <span className="text-xs text-gray-400 italic">
                          Manual
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-900">{item.nombre}</td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        value={item.precio_unitario}
                        onChange={(e) =>
                          handleCambiarPrecioEdit(
                            item.clave,
                            limitarDecimales(e.target.value),
                          )
                        }
                        className="w-24 px-2 py-1 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min="1"
                        value={item.cantidad}
                        onChange={(e) =>
                          handleCambiarCantidadEdit(
                            item.clave,
                            parseInt(e.target.value, 10) || 1,
                          )
                        }
                        className="w-16 px-2 py-1 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                      />
                    </td>
                    <td className="px-4 py-2 font-medium text-gray-900">
                      {formatPrice(item.precio_unitario * item.cantidad)}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => handleQuitarItemEdit(item.clave)}
                        className="text-xs text-red-600 hover:text-red-900"
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Buscar y agregar producto */}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={codigoBusqueda}
                onChange={(e) => setCodigoBusqueda(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleBuscarProducto()}
                placeholder="Buscar producto por código..."
                className="flex-1 px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
              <button
                onClick={handleBuscarProducto}
                disabled={buscando}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm hover:bg-gray-50"
              >
                {buscando ? "Buscando..." : "Buscar"}
              </button>
            </div>

            {resultadosBusqueda.length > 0 && (
              <div className="border border-gray-200 mb-4 max-h-56 overflow-y-auto">
                {resultadosBusqueda.map((producto) => (
                  <button
                    key={producto.id}
                    onClick={() => handleAgregarProductoEdit(producto)}
                    className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 text-left"
                  >
                    <div>
                      <p className="text-sm text-gray-900">
                        {producto.codigo} — {producto.nombre_comercial}
                      </p>
                      <p className="text-xs text-gray-500">
                        Stock: {producto.stock}
                      </p>
                    </div>
                    <span className="text-sm text-gray-900">
                      {formatPrice(calcularPrecio(producto))}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {!mostrarItemManual ? (
              <button
                onClick={() => setMostrarItemManual(true)}
                className="text-sm text-blue-600 hover:text-blue-900 underline"
              >
                + Agregar ítem sin código (mantenimiento, cajita, servicio...)
              </button>
            ) : (
              <div className="border border-gray-200 p-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <div className="md:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">
                      Descripción
                    </label>
                    <input
                      type="text"
                      value={itemManual.descripcion}
                      onChange={(e) =>
                        setItemManual((p) => ({
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
                      value={itemManual.precio}
                      onChange={(e) =>
                        setItemManual((p) => ({
                          ...p,
                          precio: limitarDecimales(e.target.value),
                        }))
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
                      value={itemManual.cantidad}
                      onChange={(e) =>
                        setItemManual((p) => ({
                          ...p,
                          cantidad: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={handleAgregarItemManualEdit}
                    className="px-4 py-2 bg-gray-900 text-white text-sm uppercase tracking-wider hover:bg-gray-800"
                  >
                    Agregar
                  </button>
                  <button
                    onClick={() => setMostrarItemManual(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 text-sm uppercase tracking-wider hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 p-6 mb-6">
            <div className="max-w-xs ml-auto space-y-2 text-sm">
              <div className="flex justify-between text-gray-700">
                <span>Subtotal</span>
                <span>{formatPrice(subtotalEdit)}</span>
              </div>
              {descuentoEditNum > 0 && (
                <div className="flex justify-between text-gray-700">
                  <span>Descuento</span>
                  <span>-{formatPrice(descuentoEditNum)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-medium text-gray-900 pt-2 border-t border-gray-200">
                <span>Total</span>
                <span>{formatPrice(totalEdit)}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleGuardarEdicion}
              disabled={guardandoEdicion}
              className="px-6 py-3 bg-gray-900 text-white text-sm uppercase tracking-wider hover:bg-gray-800 disabled:bg-gray-400"
            >
              {guardandoEdicion ? "Guardando..." : "Guardar Cambios"}
            </button>
            <button
              onClick={() => setEditando(false)}
              className="px-6 py-3 border border-gray-300 text-gray-700 text-sm uppercase tracking-wider hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
