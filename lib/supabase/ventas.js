import { supabase } from "./client";
import {
  cargarVentaACuenta,
  recalcularSaldos,
  generarPeriodosPendientes,
} from "./cuentas";
import { devengarComision } from "./comisiones";

// Registrar una venta completa con transacción
export const registrarVenta = async ({ venta, detalle, credito }) => {
  // 1. Crear la venta
  const { data: ventaData, error: ventaError } = await supabase
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
  const detalleConVenta = detalle.map((item) => ({
    id_venta: ventaData.id,
    id_producto: item.esManual ? null : item.id_producto,
    descripcion_manual: item.esManual ? item.nombre : null,
    cantidad: item.cantidad,
    precio_unitario: item.precio_unitario,
    subtotal: Math.round(item.precio_unitario * item.cantidad * 100) / 100,
    created_at: new Date().toISOString(),
  }));

  const { error: detalleError } = await supabase
    .from("ventas_detalle")
    .insert(detalleConVenta);

  if (detalleError) throw detalleError;

  // 3. Descontar stock solo de los items con producto real
  for (const item of detalle) {
    if (item.esManual) continue;

    const { data: producto, error: stockError } = await supabase
      .from("productos")
      .select("stock")
      .eq("id", item.id_producto)
      .single();

    if (stockError) throw stockError;

    const { error: updateError } = await supabase
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
export const getVentaById = async (id) => {
  const { data, error } = await supabase
    .from("ventas")
    .select(
      `
      *,
      cliente:clientes(id, nombre, telefono),
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
  return data;
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

// Edita una venta de CONTADO ya registrada: datos generales, y/o los
// productos que tiene. No sirve para ventas a crédito (esas tienen una
// cuenta enganchada, con su propia función dedicada).
//
// Si cambian los productos: se revierte el stock de lo que había antes,
// se aplica el stock de lo que queda ahora. Si cambia el total y la
// venta generó comisión: se recalcula (mismo % que ya se había usado),
// salvo que esa comisión ya se le haya pagado a la distribuidora - en
// ese caso no se toca, y se avisa para que se revise a mano.
export const editarVentaContado = async (
  idVenta,
  { fecha, notas, via, id_distribuidora, descuento, detalleNuevo },
) => {
  const { data: ventaActual, error: ventaError } = await supabase
    .from("ventas")
    .select("*, detalle:ventas_detalle(*)")
    .eq("id", idVenta)
    .single();

  if (ventaError) throw ventaError;

  if (ventaActual.es_credito) {
    throw new Error(
      "Esta función es solo para ventas de contado, no a crédito",
    );
  }

  if (!detalleNuevo || detalleNuevo.length === 0) {
    throw new Error("La venta debe tener al menos un producto");
  }

  // 1. Revertir el stock de los productos que tenía antes
  for (const item of ventaActual.detalle) {
    if (!item.id_producto) continue; // ítem manual, no tiene stock
    const { data: producto, error: prodError } = await supabase
      .from("productos")
      .select("stock")
      .eq("id", item.id_producto)
      .single();
    if (prodError) throw prodError;

    const { error: stockError } = await supabase
      .from("productos")
      .update({ stock: producto.stock + item.cantidad })
      .eq("id", item.id_producto);
    if (stockError) throw stockError;
  }

  // 2. Reemplazar el detalle
  const { error: deleteError } = await supabase
    .from("ventas_detalle")
    .delete()
    .eq("id_venta", idVenta);
  if (deleteError) throw deleteError;

  const detalleConVenta = detalleNuevo.map((item) => ({
    id_venta: idVenta,
    id_producto: item.esManual ? null : item.id_producto,
    descripcion_manual: item.esManual ? item.nombre : null,
    cantidad: item.cantidad,
    precio_unitario: item.precio_unitario,
    subtotal: Math.round(item.precio_unitario * item.cantidad * 100) / 100,
    created_at: new Date().toISOString(),
  }));

  const { error: insertError } = await supabase
    .from("ventas_detalle")
    .insert(detalleConVenta);
  if (insertError) throw insertError;

  // 3. Descontar el stock de los productos que quedan ahora
  for (const item of detalleNuevo) {
    if (item.esManual) continue;
    const { data: producto, error: prodError } = await supabase
      .from("productos")
      .select("stock")
      .eq("id", item.id_producto)
      .single();
    if (prodError) throw prodError;

    const { error: stockError } = await supabase
      .from("productos")
      .update({ stock: producto.stock - item.cantidad })
      .eq("id", item.id_producto);
    if (stockError) throw stockError;
  }

  // 4. Actualizar los datos generales y el total
  const subtotalNuevo = detalleNuevo.reduce(
    (sum, item) => sum + item.precio_unitario * item.cantidad,
    0,
  );
  const descuentoNum = Math.round((parseFloat(descuento) || 0) * 100) / 100;
  const totalNuevo = Math.max(
    0,
    Math.round((subtotalNuevo - descuentoNum) * 100) / 100,
  );

  const { error: updateError } = await supabase
    .from("ventas")
    .update({
      fecha,
      notas,
      via,
      id_distribuidora: id_distribuidora || null,
      subtotal: Math.round(subtotalNuevo * 100) / 100,
      descuento: descuentoNum,
      total: totalNuevo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", idVenta);
  if (updateError) throw updateError;

  // 5. Comisión ligada a esta venta, si tiene
  let avisoComisionPagada = false;

  const { data: comision, error: comError } = await supabase
    .from("comisiones")
    .select("id, base, monto, estado")
    .eq("id_venta", idVenta)
    .maybeSingle();
  if (comError) throw comError;

  if (comision) {
    if (comision.estado === "pagada") {
      avisoComisionPagada = true;
    } else {
      const porcentajeUsado =
        parseFloat(comision.base) > 0
          ? (parseFloat(comision.monto) / parseFloat(comision.base)) * 100
          : 0;
      const nuevoMontoComision =
        Math.round(((totalNuevo * porcentajeUsado) / 100) * 100) / 100;

      const { error: comUpdError } = await supabase
        .from("comisiones")
        .update({ base: totalNuevo, monto: nuevoMontoComision })
        .eq("id", comision.id);
      if (comUpdError) throw comUpdError;
    }
  }

  return { avisoComisionPagada, total: totalNuevo };
};

// Edita una venta A CRÉDITO ya registrada: datos generales, y/o los
// productos que tiene. La venta está enganchada a una cuenta - si el
// total cambia, hay que corregir el cargo que generó ahí, y luego
// reacomodar los meses pendientes según el nuevo saldo real.
//
// A diferencia de un pago (donde varios pagos pueden mezclarse en un
// mismo mes y por eso hay que rehacer TODA la aplicación desde cero),
// aquí basta con borrar los meses que todavía no tienen ningún pago
// encima y dejar que el sistema los regenere con el monto correcto -
// los meses que el cliente ya empezó a pagar no se tocan.
export const editarVentaCredito = async (
  idVenta,
  { fecha, notas, via, id_distribuidora, descuento, detalleNuevo },
) => {
  const { data: ventaActual, error: ventaError } = await supabase
    .from("ventas")
    .select("*, detalle:ventas_detalle(*)")
    .eq("id", idVenta)
    .single();

  if (ventaError) throw ventaError;

  if (!ventaActual.es_credito) {
    throw new Error("Esta función es solo para ventas a crédito");
  }

  if (!detalleNuevo || detalleNuevo.length === 0) {
    throw new Error("La venta debe tener al menos un producto");
  }

  const { data: cargo, error: cargoError } = await supabase
    .from("cuenta_movimientos")
    .select("id, id_cuenta")
    .eq("id_venta", idVenta)
    .single();

  if (cargoError) throw cargoError;

  // 1. Revertir el stock de los productos que tenía antes
  for (const item of ventaActual.detalle) {
    if (!item.id_producto) continue;
    const { data: producto, error: prodError } = await supabase
      .from("productos")
      .select("stock")
      .eq("id", item.id_producto)
      .single();
    if (prodError) throw prodError;

    const { error: stockError } = await supabase
      .from("productos")
      .update({ stock: producto.stock + item.cantidad })
      .eq("id", item.id_producto);
    if (stockError) throw stockError;
  }

  // 2. Reemplazar el detalle
  const { error: deleteError } = await supabase
    .from("ventas_detalle")
    .delete()
    .eq("id_venta", idVenta);
  if (deleteError) throw deleteError;

  const detalleConVenta = detalleNuevo.map((item) => ({
    id_venta: idVenta,
    id_producto: item.esManual ? null : item.id_producto,
    descripcion_manual: item.esManual ? item.nombre : null,
    cantidad: item.cantidad,
    precio_unitario: item.precio_unitario,
    subtotal: Math.round(item.precio_unitario * item.cantidad * 100) / 100,
    created_at: new Date().toISOString(),
  }));

  const { error: insertError } = await supabase
    .from("ventas_detalle")
    .insert(detalleConVenta);
  if (insertError) throw insertError;

  // 3. Descontar el stock de los productos que quedan ahora
  for (const item of detalleNuevo) {
    if (item.esManual) continue;
    const { data: producto, error: prodError } = await supabase
      .from("productos")
      .select("stock")
      .eq("id", item.id_producto)
      .single();
    if (prodError) throw prodError;

    const { error: stockError } = await supabase
      .from("productos")
      .update({ stock: producto.stock - item.cantidad })
      .eq("id", item.id_producto);
    if (stockError) throw stockError;
  }

  // 4. Actualizar los datos generales y el total de la venta
  const subtotalNuevo = detalleNuevo.reduce(
    (sum, item) => sum + item.precio_unitario * item.cantidad,
    0,
  );
  const descuentoNum = Math.round((parseFloat(descuento) || 0) * 100) / 100;
  const totalNuevo = Math.max(
    0,
    Math.round((subtotalNuevo - descuentoNum) * 100) / 100,
  );

  const { error: updateError } = await supabase
    .from("ventas")
    .update({
      fecha,
      notas,
      via,
      id_distribuidora: id_distribuidora || null,
      subtotal: Math.round(subtotalNuevo * 100) / 100,
      descuento: descuentoNum,
      total: totalNuevo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", idVenta);
  if (updateError) throw updateError;

  // 5. Corregir el cargo que esta venta generó en la cuenta, y
  // recalcular los saldos en orden cronológico
  const { error: cargoUpdError } = await supabase
    .from("cuenta_movimientos")
    .update({ monto: totalNuevo, fecha })
    .eq("id", cargo.id);
  if (cargoUpdError) throw cargoUpdError;

  await recalcularSaldos(cargo.id_cuenta);

  // 6. Borrar los meses que todavía no tienen ningún pago (no se toca
  // nada que ya esté parcial, pagado, o en un estado puesto a mano
  // como aplazado/diferido/gracia), y dejar que se regeneren solos
  // con el monto correcto.
  const { error: borrarPeriodosError } = await supabase
    .from("cuenta_periodos")
    .delete()
    .eq("id_cuenta", cargo.id_cuenta)
    .eq("monto_pagado", 0)
    .in("estado", ["pendiente", "mora"]);
  if (borrarPeriodosError) throw borrarPeriodosError;

  await generarPeriodosPendientes(cargo.id_cuenta);

  // 7. Comisión ligada a esta venta, si tiene
  let avisoComisionPagada = false;

  const { data: comision, error: comError } = await supabase
    .from("comisiones")
    .select("id, base, monto, estado")
    .eq("id_venta", idVenta)
    .maybeSingle();
  if (comError) throw comError;

  if (comision) {
    if (comision.estado === "pagada") {
      avisoComisionPagada = true;
    } else {
      const porcentajeUsado =
        parseFloat(comision.base) > 0
          ? (parseFloat(comision.monto) / parseFloat(comision.base)) * 100
          : 0;
      const nuevoMontoComision =
        Math.round(((totalNuevo * porcentajeUsado) / 100) * 100) / 100;

      const { error: comUpdError } = await supabase
        .from("comisiones")
        .update({ base: totalNuevo, monto: nuevoMontoComision })
        .eq("id", comision.id);
      if (comUpdError) throw comUpdError;
    }
  }

  return { avisoComisionPagada, total: totalNuevo };
};
