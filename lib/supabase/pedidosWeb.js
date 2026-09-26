import { supabase } from "./client";
import { registrarVenta } from "./ventas";

export const getPedidoWebById = async (id, client = supabase) => {
  const { data, error } = await client
    .from("pedidos_web")
    .select(
      `
      *,
      detalle:pedidos_web_detalle(
        *,
        producto:productos(codigo, nombre_comercial, imagen_url)
      )
    `,
    )
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
};

export const getPedidosWeb = async (estado = null) => {
  let query = supabase
    .from("pedidos_web")
    .select(
      `
      *,
      detalle:pedidos_web_detalle(
        *,
        producto:productos(codigo, nombre_comercial, imagen_url)
      )
    `,
    )
    .order("created_at", { ascending: false });

  if (estado) query = query.eq("estado", estado);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

// Devuelve los productos del pedido que ya no tienen stock suficiente.
export const verificarStockPedido = async (pedido, client = supabase) => {
  const ids = pedido.detalle.map((d) => d.id_producto);
  const { data: productos, error } = await client
    .from("productos")
    .select("id, codigo, stock")
    .in("id", ids);
  if (error) throw error;

  return pedido.detalle
    .filter((d) => {
      const producto = productos.find((p) => p.id === d.id_producto);
      return !producto || producto.stock < d.cantidad;
    })
    .map((d) => d.producto?.codigo || d.id_producto);
};

// Crea la venta real, descuenta stock y enlaza el pedido a esa venta.
// Sirve para Payphone y para transferencias confirmadas a mano.
export const confirmarPagoPedidoWeb = async (
  idPedidoWeb,
  { payphone_transaction_id = null } = {},
  client = supabase,
) => {
  const pedido = await getPedidoWebById(idPedidoWeb, client);

  if (pedido.estado === "pagado") return pedido;
  if (pedido.estado === "cancelado") {
    throw new Error("Este pedido está cancelado");
  }

  const sinStock = await verificarStockPedido(pedido, client);
  if (sinStock.length > 0) {
    throw new Error(
      `Sin stock suficiente para: ${sinStock.join(", ")}. La pieza pudo haberse vendido por otro lado.`,
    );
  }

  const cantidadItems = pedido.detalle.reduce((s, d) => s + d.cantidad, 0);

  const ventaData = await registrarVenta(
    {
      venta: {
        id_cliente: null,
        subtotal: pedido.subtotal,
        descuento: 0,
        total: pedido.subtotal,
        via: "web",
        id_distribuidora: null,
        comision_monto: 0,
        es_credito: false,
        notas: `Pedido web: ${pedido.nombre_cliente} (${cantidadItems} ${
          cantidadItems === 1 ? "pieza" : "piezas"
        }) - Entrega: ${pedido.direccion}`,
      },
      detalle: pedido.detalle.map((item) => ({
        id_producto: item.id_producto,
        esManual: false,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
      })),
    },
    client,
  );

  const { data, error } = await client
    .from("pedidos_web")
    .update({
      estado: "pagado",
      id_venta: ventaData.id,
      payphone_transaction_id,
    })
    .eq("id", idPedidoWeb)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const cancelarPedidoWeb = async (idPedidoWeb, client = supabase) => {
  const { data, error } = await client
    .from("pedidos_web")
    .update({ estado: "cancelado" })
    .eq("id", idPedidoWeb)
    .select()
    .single();

  if (error) throw error;
  return data;
};
