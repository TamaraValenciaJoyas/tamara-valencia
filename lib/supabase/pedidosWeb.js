import { supabase } from "./client";
import { registrarVenta } from "./ventas";

// Crear un pedido web nuevo (queda "pendiente" hasta que se confirme el pago)
export const crearPedidoWeb = async ({ pedido, detalle }) => {
  const { data: pedidoData, error: pedidoError } = await supabase
    .from("pedidos_web")
    .insert([
      {
        nombre_cliente: pedido.nombre_cliente,
        cedula_cliente: pedido.cedula_cliente,
        celular_cliente: pedido.celular_cliente,
        nombre_receptor: pedido.nombre_receptor,
        direccion: pedido.direccion,
        ubicacion_maps: pedido.ubicacion_maps || null,
        horario_entrega: pedido.horario_entrega,
        notas: pedido.notas || null,
        subtotal: pedido.subtotal,
        metodo_pago: pedido.metodo_pago,
        estado: "pendiente",
      },
    ])
    .select()
    .single();

  if (pedidoError) throw pedidoError;

  const detalleConPedido = detalle.map((item) => ({
    id_pedido_web: pedidoData.id,
    id_producto: item.id_producto,
    cantidad: item.cantidad,
    precio_unitario: item.precio_unitario,
    subtotal: Math.round(item.precio_unitario * item.cantidad * 100) / 100,
  }));

  const { error: detalleError } = await supabase
    .from("pedidos_web_detalle")
    .insert(detalleConPedido);

  if (detalleError) {
    // Evitar dejar un pedido sin productos: si el detalle falla,
    // se elimina el pedido que se acababa de crear.
    await supabase.from("pedidos_web").delete().eq("id", pedidoData.id);
    throw detalleError;
  }

  return pedidoData;
};

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

// Obtener pedidos web, opcionalmente filtrados por estado
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

// Confirmar el pago de un pedido web: crea la venta real, descuenta stock,
// y enlaza el pedido a esa venta. Sirve tanto para pagos con Payphone
// (pasando el transactionId) como para transferencias confirmadas a mano.
export const confirmarPagoPedidoWeb = async (
  idPedidoWeb,
  { payphone_transaction_id = null } = {},
  client = supabase,
) => {
  const pedido = await getPedidoWebById(idPedidoWeb, client);

  // Ya estaba confirmado: no volver a crear la venta ni descontar stock
  if (pedido.estado === "pagado") return pedido;

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

export const cancelarPedidoWeb = async (idPedidoWeb) => {
  const { data, error } = await supabase
    .from("pedidos_web")
    .update({ estado: "cancelado" })
    .eq("id", idPedidoWeb)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const guardarTransaccionPayphone = async (
  idPedidoWeb,
  clientTransactionId,
) => {
  const { error } = await supabase
    .from("pedidos_web")
    .update({ payphone_client_transaction_id: clientTransactionId })
    .eq("id", idPedidoWeb);

  if (error) throw error;
};

export const getPedidoWebPorClientTransactionId = async (
  clientTransactionId,
) => {
  const { data, error } = await supabase
    .from("pedidos_web")
    .select("*")
    .eq("payphone_client_transaction_id", clientTransactionId)
    .single();

  if (error) throw error;
  return data;
};
