"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getPedidosWeb,
  confirmarPagoPedidoWeb,
  cancelarPedidoWeb,
} from "@/lib/supabase/pedidosWeb";
import { formatPrice } from "@/utils/formatters";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

const ESTADO_LABEL = {
  pendiente: { texto: "Pendiente", clase: "bg-yellow-100 text-yellow-800" },
  pagado: { texto: "Pagado", clase: "bg-green-100 text-green-800" },
  cancelado: { texto: "Cancelado", clase: "bg-gray-100 text-gray-600" },
};

const METODO_LABEL = {
  payphone: "Tarjeta (Payphone)",
  transferencia: "Transferencia / Depósito",
};

export default function PedidosWebPage() {
  const queryClient = useQueryClient();
  const [filtroEstado, setFiltroEstado] = useState("pendiente");
  const [procesandoId, setProcesandoId] = useState(null);

  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ["pedidos-web", filtroEstado],
    queryFn: () => getPedidosWeb(filtroEstado || null),
    staleTime: 30 * 1000,
  });

  const formatFecha = (fecha) =>
    new Date(fecha).toLocaleDateString("es-EC", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const handleMarcarPagado = async (pedido) => {
    if (
      !confirm(
        `¿Confirmar que se recibió el pago de ${formatPrice(pedido.subtotal)} de ${pedido.nombre_cliente}? Esto creará la venta y descontará el stock.`,
      )
    )
      return;

    setProcesandoId(pedido.id);
    try {
      await confirmarPagoPedidoWeb(pedido.id);
      queryClient.invalidateQueries({ queryKey: ["pedidos-web"] });
      queryClient.invalidateQueries({ queryKey: ["ventas"] });
      queryClient.invalidateQueries({ queryKey: ["admin-productos"] });
    } catch (error) {
      console.error("Error al confirmar el pedido:", error);
      alert("Error al confirmar el pedido: " + error.message);
    } finally {
      setProcesandoId(null);
    }
  };

  const handleCancelar = async (pedido) => {
    if (!confirm(`¿Cancelar el pedido de ${pedido.nombre_cliente}?`)) return;

    setProcesandoId(pedido.id);
    try {
      await cancelarPedidoWeb(pedido.id);
      queryClient.invalidateQueries({ queryKey: ["pedidos-web"] });
    } catch (error) {
      console.error("Error al cancelar el pedido:", error);
      alert("Error al cancelar el pedido: " + error.message);
    } finally {
      setProcesandoId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <h1 className="font-elegant text-4xl font-light text-gray-900 mb-8">
        Pedidos Web
      </h1>

      <div className="flex gap-2 mb-8">
        {["pendiente", "pagado", "cancelado", ""].map((estado) => (
          <button
            key={estado || "todos"}
            onClick={() => setFiltroEstado(estado)}
            className={`px-4 py-2 text-sm uppercase tracking-wider border ${
              filtroEstado === estado
                ? "bg-gray-900 text-white border-gray-900"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {estado ? ESTADO_LABEL[estado].texto : "Todos"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : pedidos.length === 0 ? (
        <div className="bg-white border border-gray-200 p-12 text-center text-gray-500">
          No hay pedidos{" "}
          {filtroEstado ? ESTADO_LABEL[filtroEstado].texto.toLowerCase() : ""}.
        </div>
      ) : (
        <div className="space-y-4">
          {pedidos.map((pedido) => {
            const estado = ESTADO_LABEL[pedido.estado];
            const cantidadItems = pedido.detalle.reduce(
              (s, d) => s + d.cantidad,
              0,
            );

            return (
              <div
                key={pedido.id}
                className="bg-white border border-gray-200 p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="font-medium text-gray-900">
                        {pedido.nombre_cliente}
                      </h2>
                      <span
                        className={`px-2 py-0.5 text-xs uppercase tracking-wider ${estado.clase}`}
                      >
                        {estado.texto}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      {formatFecha(pedido.created_at)} ·{" "}
                      {METODO_LABEL[pedido.metodo_pago]}
                    </p>
                  </div>
                  <p className="text-xl font-light text-gray-900">
                    {formatPrice(pedido.subtotal)}
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4 text-sm mb-4">
                  <div>
                    <p className="text-gray-500">Cédula</p>
                    <p className="text-gray-900">{pedido.cedula_cliente}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Celular</p>
                    <p className="text-gray-900">{pedido.celular_cliente}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Recibe</p>
                    <p className="text-gray-900">{pedido.nombre_receptor}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Horario de entrega</p>
                    <p className="text-gray-900">{pedido.horario_entrega}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-gray-500">Dirección</p>
                    <p className="text-gray-900">
                      {pedido.direccion}
                      {pedido.ubicacion_maps && (
                        <>
                          {" — "}
                          <a
                            href={pedido.ubicacion_maps}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 underline"
                          >
                            Ver en Maps
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                  {pedido.notas && (
                    <div className="sm:col-span-2">
                      <p className="text-gray-500">Notas</p>
                      <p className="text-gray-900">{pedido.notas}</p>
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-100 pt-4 mb-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                    {cantidadItems} {cantidadItems === 1 ? "pieza" : "piezas"}
                  </p>
                  <div className="space-y-1">
                    {pedido.detalle.map((item) => (
                      <div
                        key={item.id}
                        className="flex justify-between text-sm text-gray-700"
                      >
                        <span>
                          {item.cantidad} x{" "}
                          {item.producto?.nombre_comercial || "Producto"} (
                          {item.producto?.codigo})
                        </span>
                        <span>{formatPrice(item.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {pedido.estado === "pendiente" && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleMarcarPagado(pedido)}
                      disabled={procesandoId === pedido.id}
                      className="px-4 py-2 bg-gray-900 text-white text-sm uppercase tracking-wider hover:bg-gray-800 disabled:opacity-50"
                    >
                      {procesandoId === pedido.id
                        ? "Procesando..."
                        : "Marcar como Pagado"}
                    </button>
                    <button
                      onClick={() => handleCancelar(pedido)}
                      disabled={procesandoId === pedido.id}
                      className="px-4 py-2 border border-gray-300 text-gray-700 text-sm uppercase tracking-wider hover:bg-gray-50 disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  </div>
                )}

                {pedido.estado === "pagado" && pedido.id_venta && (
                  <a
                    href={`/admin/ventas/${pedido.id_venta}`}
                    className="text-sm text-blue-600 hover:text-blue-900 underline"
                  >
                    Ver venta generada
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
