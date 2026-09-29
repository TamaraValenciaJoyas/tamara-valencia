import { supabase, ordenarDetalle } from "./client";
import {
  cargarVentaACuenta,
  recalcularSaldos,
  generarPeriodosPendientes,
} from "./cuentas";
import { devengarComision } from "./comisiones";

export const registrarVenta = async (
  { venta, detalle, credito },
  client = supabase,
) => {
  const { data: ventaData, error: ventaError } = await client
    .from("ventas")
    .insert([
      {
        fecha: venta.fecha || new Date().toISOString(),
        id_cliente: venta.id_cliente || null,
        subtotal: venta.subtotal,
        descuento: venta.descuento || 0,
        total: venta.total,
        via: venta.via,
        id_distribuidora: venta.id_distribuidora || null,
        comision_monto: venta.comision_monto || 0,
        comision_pagada: false,
        es_credito: venta.es_credito || false,
        estado: venta.es_credito ? "en_proceso" : "cancelado",
        notas: venta.notas || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ])
    .select()
    .single();

  if (ventaError) throw ventaError;

  // 2. Crear el detalle de la venta (algunos items pueden ser manuales,
  // sin producto real: mantenimiento, cajitas, servicios, etc.)
  const detalleConVenta = detalle.map((item, index) => ({
    id_venta: ventaData.id,
    orden: index,
    id_producto: item.esManual ? null : item.id_producto,
    descripcion_manual: item.esManual ? item.nombre : null,
    cantidad: item.cantidad,
    precio_unitario: item.precio_unitario,
    subtotal: Math.round(item.precio_unitario * item.cantidad * 100) / 100,
    created_at: new Date().toISOString(),
  }));

  const { error: detalleError } = await client
    .from("ventas_detalle")
    .insert(detalleConVenta);

  if (detalleError) throw detalleError;

  // 3. Descontar stock solo de los items con producto real
  for (const item of detalle) {
    if (item.esManual) continue;

    const { data: producto, error: stockError } = await client
      .from("productos")
      .select("stock")
      .eq("id", item.id_producto)
      .single();

    if (stockError) throw stockError;

    const { error: updateError } = await client
      .from("productos")
      .update({ stock: producto.stock - item.cantidad })
      .eq("id", item.id_producto);

    if (updateError) throw updateError;
  }

  // 4. Si es a crédito, cargar el monto a la cuenta del cliente.
  //    La comisión del crédito se genera después, con cada pago.
  if (venta.es_credito && venta.id_cliente) {
    const cantidadItems = detalle.reduce((s, d) => s + d.cantidad, 0);
    await cargarVentaACuenta({
      id_cliente: venta.id_cliente,
      id_venta: ventaData.id,
      monto: venta.total,
      concepto: `Compra de ${cantidadItems} ${cantidadItems === 1 ? "pieza" : "piezas"}`,
      datosNuevaCuenta: credito
        ? {
            cuota_mensual: credito.cuota_mensual,
            dia_pago: credito.dia_pago || 1,
            fecha_primer_pago: credito.fecha_primer_pago,
          }
        : null,
    });
  }

  // 5. Si es de contado, el cliente pagó todo: se genera la comisión ya
  if (!venta.es_credito && venta.id_cliente) {
    try {
      await devengarComision({
        id_cliente: venta.id_cliente,
        base: venta.total,
        id_venta: ventaData.id,
        concepto: "Venta de contado",
      });
    } catch (e) {
      console.error("No se pudo generar la comisión de la venta:", e);
    }
  }

  return ventaData;
};

// Obtener ventas con filtros
export const getVentas = async (filtros = {}) => {
  let query = supabase
    .from("ventas")
    .select(
      `
      *,
      cliente:clientes(nombre, telefono),
      distribuidora:distribuidoras(nombre)
    `,
    )
    .order("fecha", { ascending: false });

  if (filtros.fechaDesde) query = query.gte("fecha", filtros.fechaDesde);
  if (filtros.fechaHasta) query = query.lte("fecha", filtros.fechaHasta);
  if (filtros.via) query = query.eq("via", filtros.via);
  if (filtros.id_cliente) query = query.eq("id_cliente", filtros.id_cliente);

  const { data, error } = await query;
  if (error) throw error;
  return data;
};

// Obtener una venta por ID con su detalle
// Descuento de cada venta, para mostrarlo en el estado de cuenta.
export const getDescuentosDeVentas = async (ids) => {
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from("ventas")
    .select("id, descuento")
    .in("id", ids)
    .gt("descuento", 0);
  if (error) throw error;
  return Object.fromEntries(data.map((v) => [v.id, parseFloat(v.descuento)]));
};

export const getVentaById = async (id) => {
  const { data, error } = await supabase
    .from("ventas")
    .select(
      `
      *,
      cliente:clientes(id, nombre, telefono, id_distribuidora, distribuidora:distribuidoras(id, nombre)),
      distribuidora:distribuidoras(nombre, porcentaje_comision),
      detalle:ventas_detalle(
        *,
        producto:productos(codigo, nombre_comercial, descripcion, material, imagen_url)
      )
    `,
    )
    .eq("id", id)
    .single();

  if (error) throw error;
  return { ...data, detalle: ordenarDetalle(data.detalle) };
};

// Registrar una venta HISTÓRICA (migración desde Excel)
// No toca stock ni requiere productos del inventario.
// Puede incluir un crédito histórico con pagos ya realizados.
// Registrar una venta HISTÓRICA (migración desde el registro anterior).
// No toca stock. Si es a crédito, carga el monto a la cuenta del cliente.
export const registrarVentaHistorica = async ({ venta, cuenta }) => {
  // 1. Crear la venta con la fecha real del pasado
  const { data: ventaData, error: ventaError } = await supabase
    .from("ventas")
    .insert([
      {
        fecha: venta.fecha,
        id_cliente: venta.id_cliente || null,
        subtotal: venta.total,
        descuento: 0,
        total: venta.total,
        via: venta.via,
        id_distribuidora: venta.id_distribuidora || null,
        comision_monto: venta.comision_monto || 0,
        comision_pagada: venta.comision_pagada || false,
        es_credito: venta.es_credito || false,
        estado: venta.estado || (venta.es_credito ? "en_proceso" : "cancelado"),
        notas: venta.notas
          ? `[HISTÓRICO] ${venta.notas}`
          : "[HISTÓRICO] Venta migrada del registro anterior",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ])
    .select()
    .single();

  if (ventaError) throw ventaError;

  // 2. Si fue a crédito, sumarla a la cuenta del cliente
  if (venta.es_credito && venta.id_cliente) {
    const fechaSolo = venta.fecha.split("T")[0];
    await cargarVentaACuenta({
      id_cliente: venta.id_cliente,
      id_venta: ventaData.id,
      monto: venta.total,
      concepto: venta.notas || "Compra anterior al sistema",
      fecha: fechaSolo,
      datosNuevaCuenta: cuenta
        ? {
            cuota_mensual: cuenta.cuota_mensual,
            dia_pago: cuenta.dia_pago || 1,
            fecha_primer_pago: cuenta.fecha_primer_pago,
          }
        : null,
    });
  }

  return ventaData;
};

// Cambiar el estado de una venta (en proceso / cancelado)
export const cambiarEstadoVenta = async (idVenta, estado) => {
  const { error } = await supabase
    .from("ventas")
    .update({ estado, updated_at: new Date().toISOString() })
    .eq("id", idVenta);

  if (error) throw error;
  return true;
};

const redondear2 = (n) => Math.round(n * 100) / 100;

const validarDetalle = (detalleNuevo) => {
  if (!detalleNuevo || detalleNuevo.length === 0) {
    throw new Error("La venta debe tener al menos un producto");
  }
  for (const item of detalleNuevo) {
    if (!item.cantidad || item.cantidad < 1) {
      throw new Error("Todas las cantidades deben ser al menos 1");
    }
    if (!(item.precio_unitario >= 0)) {
      throw new Error("Hay un precio inválido en la venta");
    }
    if (!item.esManual && !item.id_producto) {
      throw new Error("Hay un producto sin identificar en la venta");
    }
  }
};

// Stock final de cada producto afectado. Lo que la venta ya tenía se
// cuenta como disponible, porque se devuelve antes de descontar.
const calcularAjustesStock = async (detalleActual, detalleNuevo) => {
  const delta = {};
  for (const item of detalleActual) {
    if (!item.id_producto) continue;
    delta[item.id_producto] = (delta[item.id_producto] || 0) + item.cantidad;
  }
  for (const item of detalleNuevo) {
    if (item.esManual) continue;
    delta[item.id_producto] = (delta[item.id_producto] || 0) - item.cantidad;
  }

  const ids = Object.keys(delta).filter((id) => delta[id] !== 0);
  if (ids.length === 0) return [];

  const { data: productos, error } = await supabase
    .from("productos")
    .select("id, codigo, stock")
    .in("id", ids);
  if (error) throw error;

  return ids.map((id) => {
    const producto = productos.find((p) => p.id === id);
    if (!producto) {
      throw new Error("Uno de los productos de la venta ya no existe");
    }
    const stock = producto.stock + delta[id];
    if (stock < 0) {
      throw new Error(
        `Stock insuficiente para ${producto.codigo}: faltan ${-stock} ${-stock === 1 ? "unidad" : "unidades"}`,
      );
    }
    return { id, stock };
  });
};

// La venta siempre refleja la distribuidora del cliente, si tiene una.
const resolverDistribuidora = async (idCliente, via, idDistribuidora) => {
  if (idCliente) {
    const { data: cliente, error } = await supabase
      .from("clientes")
      .select("id_distribuidora")
      .eq("id", idCliente)
      .single();
    if (error) throw error;
    if (cliente.id_distribuidora) {
      return {
        via: "distribuidora",
        id_distribuidora: cliente.id_distribuidora,
      };
    }
  }
  return {
    via,
    id_distribuidora: via === "distribuidora" ? idDistribuidora || null : null,
  };
};

const calcularTotales = (detalleNuevo, descuento) => {
  const subtotal = redondear2(
    detalleNuevo.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0),
  );
  const descuentoNum = redondear2(parseFloat(descuento) || 0);
  const total = Math.max(0, redondear2(subtotal - descuentoNum));
  return { subtotal, descuento: descuentoNum, total };
};

// Inserta el detalle nuevo antes de borrar el viejo: si el insert falla,
// la venta queda intacta.
const reemplazarDetalle = async (idVenta, detalleActual, detalleNuevo) => {
  const filas = detalleNuevo.map((item, index) => ({
    id_venta: idVenta,
    orden: index,
    id_producto: item.esManual ? null : item.id_producto,
    descripcion_manual: item.esManual ? item.nombre : null,
    cantidad: item.cantidad,
    precio_unitario: item.precio_unitario,
    subtotal: redondear2(item.precio_unitario * item.cantidad),
    created_at: new Date().toISOString(),
  }));

  const { error: insertError } = await supabase
    .from("ventas_detalle")
    .insert(filas);
  if (insertError) throw insertError;

  const idsViejos = detalleActual.map((d) => d.id);
  if (idsViejos.length > 0) {
    const { error: deleteError } = await supabase
      .from("ventas_detalle")
      .delete()
      .in("id", idsViejos);
    if (deleteError) throw deleteError;
  }
};

const aplicarAjustesStock = async (ajustes) => {
  for (const { id, stock } of ajustes) {
    const { error } = await supabase
      .from("productos")
      .update({ stock })
      .eq("id", id);
    if (error) throw error;
  }
};

const obtenerVentaParaEditar = async (idVenta) => {
  const { data, error } = await supabase
    .from("ventas")
    .select("*, detalle:ventas_detalle(*)")
    .eq("id", idVenta)
    .single();
  if (error) throw error;
  return data;
};

const obtenerComisionDeVenta = async (idVenta) => {
  const { data, error } = await supabase
    .from("comisiones")
    .select("id, base, monto, estado")
    .eq("id_venta", idVenta)
    .maybeSingle();
  if (error) throw error;
  return data;
};

// Mismo porcentaje que ya se había usado, con la base nueva.
const recalcularComision = async (comision, total, fecha) => {
  const porcentaje =
    parseFloat(comision.base) > 0
      ? (parseFloat(comision.monto) / parseFloat(comision.base)) * 100
      : 0;
  const cambios = {
    base: total,
    monto: redondear2((total * porcentaje) / 100),
  };
  if (fecha) cambios.fecha = fecha;

  const { error } = await supabase
    .from("comisiones")
    .update(cambios)
    .eq("id", comision.id);
  if (error) throw error;
};

export const editarVentaContado = async (
  idVenta,
  { fecha, notas, via, id_distribuidora, id_cliente, descuento, detalleNuevo },
) => {
  validarDetalle(detalleNuevo);

  const ventaActual = await obtenerVentaParaEditar(idVenta);
  if (ventaActual.es_credito) {
    throw new Error("Esta función es solo para ventas de contado");
  }

  const idClienteNuevo = id_cliente || null;
  const clienteCambio = idClienteNuevo !== (ventaActual.id_cliente || null);
  const distribucion = await resolverDistribuidora(
    idClienteNuevo,
    via,
    id_distribuidora,
  );
  const ajustes = await calcularAjustesStock(ventaActual.detalle, detalleNuevo);
  const totales = calcularTotales(detalleNuevo, descuento);
  const comision = await obtenerComisionDeVenta(idVenta);

  await reemplazarDetalle(idVenta, ventaActual.detalle, detalleNuevo);
  await aplicarAjustesStock(ajustes);

  const cambiosVenta = {
    notas,
    ...distribucion,
    id_cliente: idClienteNuevo,
    ...totales,
    updated_at: new Date().toISOString(),
  };
  if (fecha) cambiosVenta.fecha = fecha;

  const { error: updateError } = await supabase
    .from("ventas")
    .update(cambiosVenta)
    .eq("id", idVenta);
  if (updateError) throw updateError;

  let avisoComisionPagada = false;
  let avisoComisionNoGenerada = false;

  if (comision?.estado === "pagada") {
    avisoComisionPagada =
      clienteCambio || parseFloat(comision.base) !== totales.total;
  } else if (clienteCambio) {
    if (comision) {
      const { error: delError } = await supabase
        .from("comisiones")
        .delete()
        .eq("id", comision.id);
      if (delError) throw delError;
    }
    if (idClienteNuevo) {
      try {
        await devengarComision({
          id_cliente: idClienteNuevo,
          base: totales.total,
          fecha: fecha || ventaActual.fecha?.slice(0, 10),
          id_venta: idVenta,
          concepto: "Venta de contado",
        });
      } catch (e) {
        console.error("No se pudo generar la comisión del nuevo cliente:", e);
        avisoComisionNoGenerada = true;
      }
    }
  } else if (comision) {
    await recalcularComision(comision, totales.total, fecha);
  }

  return { avisoComisionPagada, avisoComisionNoGenerada, total: totales.total };
};

// El cliente no se cambia en ventas a crédito: la deuda es suya.
// Si el nuevo total deja al cliente con saldo a favor, no se guarda nada
// hasta que se confirme (confirmarSaldoFavor).
export const editarVentaCredito = async (
  idVenta,
  {
    fecha,
    notas,
    via,
    id_distribuidora,
    descuento,
    detalleNuevo,
    confirmarSaldoFavor = false,
  },
) => {
  validarDetalle(detalleNuevo);

  const ventaActual = await obtenerVentaParaEditar(idVenta);
  if (!ventaActual.es_credito) {
    throw new Error("Esta función es solo para ventas a crédito");
  }

  const { data: cargo, error: cargoError } = await supabase
    .from("cuenta_movimientos")
    .select("id, id_cuenta, monto")
    .eq("id_venta", idVenta)
    .single();
  if (cargoError) throw cargoError;

  const { data: cuenta, error: cuentaError } = await supabase
    .from("cuentas")
    .select("saldo, estado")
    .eq("id", cargo.id_cuenta)
    .single();
  if (cuentaError) throw cuentaError;

  const distribucion = await resolverDistribuidora(
    ventaActual.id_cliente,
    via,
    id_distribuidora,
  );
  const ajustes = await calcularAjustesStock(ventaActual.detalle, detalleNuevo);
  const totales = calcularTotales(detalleNuevo, descuento);
  const totalCambio = parseFloat(cargo.monto) !== totales.total;

  const saldoResultante = redondear2(
    parseFloat(cuenta.saldo) - parseFloat(cargo.monto) + totales.total,
  );
  if (saldoResultante < 0 && !confirmarSaldoFavor) {
    return { requiereConfirmacion: true, saldoFavor: -saldoResultante };
  }

  const comision = await obtenerComisionDeVenta(idVenta);

  await reemplazarDetalle(idVenta, ventaActual.detalle, detalleNuevo);
  await aplicarAjustesStock(ajustes);

  const cambiosVenta = {
    notas,
    ...distribucion,
    ...totales,
    updated_at: new Date().toISOString(),
  };
  if (fecha) cambiosVenta.fecha = fecha;

  const { error: updateError } = await supabase
    .from("ventas")
    .update(cambiosVenta)
    .eq("id", idVenta);
  if (updateError) throw updateError;

  if (totalCambio || fecha) {
    const cambiosCargo = { monto: totales.total };
    if (fecha) cambiosCargo.fecha = fecha;
    const { error: cargoUpdError } = await supabase
      .from("cuenta_movimientos")
      .update(cambiosCargo)
      .eq("id", cargo.id);
    if (cargoUpdError) throw cargoUpdError;

    await recalcularSaldos(cargo.id_cuenta);
  }

  // Solo se rehacen los meses si cambió el total y la cuenta está activa.
  // Nunca se tocan meses con pagos, arrastre o recargo.
  if (totalCambio && cuenta.estado === "activa") {
    const { error: borrarError } = await supabase
      .from("cuenta_periodos")
      .delete()
      .eq("id_cuenta", cargo.id_cuenta)
      .eq("monto_pagado", 0)
      .eq("monto_arrastre", 0)
      .eq("monto_recargo", 0)
      .in("estado", ["pendiente", "mora"]);
    if (borrarError) throw borrarError;

    await generarPeriodosPendientes(cargo.id_cuenta);
  }

  let avisoComisionPagada = false;
  if (comision?.estado === "pagada") {
    avisoComisionPagada = totalCambio;
  } else if (comision && totalCambio) {
    await recalcularComision(comision, totales.total, fecha);
  }

  return { avisoComisionPagada, total: totales.total };
};
