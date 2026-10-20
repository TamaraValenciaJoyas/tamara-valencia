import { supabase, ordenarDetalle } from "./client";
import { insertarConNumero } from "./numeracion";

// Obtener todos los préstamos activos con info de la distribuidora
export const getPrestamos = async (estado = "activo") => {
  let query = supabase
    .from("prestamos")
    .select(
      `
      *,
      distribuidora:distribuidoras(id, nombre, telefono),
      detalle:prestamos_detalle(id, cantidad, estado_item)
    `,
    )
    .order("fecha_prestamo", { ascending: false });

  if (estado) query = query.eq("estado", estado);

  const { data, error } = await query;
  if (error) throw error;
  return data;
};

// Obtener un préstamo por ID con todo su detalle y productos
export const getPrestamoById = async (id) => {
  const { data, error } = await supabase
    .from("prestamos")
    .select(
      `
      *,
      distribuidora:distribuidoras(id, nombre, telefono, porcentaje_comision),
      detalle:prestamos_detalle(
        id, id_producto, cantidad, estado_item, fecha_resolucion, orden, created_at,
        descripcion_manual, precio_manual,
        producto:productos(id, codigo, nombre_comercial, descripcion, material, peso, stock, imagen_url, factor:factores(valor, nombre))
      )
    `,
    )
    .eq("id", id)
    .single();

  if (error) throw error;
  return { ...data, detalle: ordenarDetalle(data.detalle) };
};

const sumarStock = async (idProducto, cantidad) => {
  const { data: producto, error } = await supabase
    .from("productos")
    .select("stock")
    .eq("id", idProducto)
    .single();
  if (error) throw error;

  const { error: updateError } = await supabase
    .from("productos")
    .update({ stock: producto.stock + cantidad })
    .eq("id", idProducto);
  if (updateError) throw updateError;
};

const validarItemManual = ({ descripcion, precio, cantidad }) => {
  if (!descripcion?.trim())
    throw new Error("La joya manual necesita una descripción");
  if (!(parseFloat(precio) >= 0))
    throw new Error("La joya manual tiene un precio inválido");
  if (!(parseInt(cantidad, 10) >= 1))
    throw new Error("La cantidad debe ser al menos 1");
};

const filaDetalle = (idPrestamo, item, orden) => ({
  id_prestamo: idPrestamo,
  orden,
  id_producto: item.esManual ? null : item.id_producto,
  descripcion_manual: item.esManual ? item.descripcion.trim() : null,
  precio_manual: item.esManual
    ? Math.round(parseFloat(item.precio) * 100) / 100
    : null,
  cantidad: item.cantidad,
  estado_item: "prestado",
  created_at: new Date().toISOString(),
});

// Las joyas manuales (sin registro en el sistema) no mueven stock.
export const registrarPrestamo = async ({ id_distribuidora, notas, items }) => {
  items.filter((i) => i.esManual).forEach(validarItemManual);

  const prestamo = await insertarConNumero(supabase, "prestamos", {
    id_distribuidora,
    fecha_prestamo: new Date().toISOString(),
    estado: "activo",
    notas: notas || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const { error: detalleError } = await supabase
    .from("prestamos_detalle")
    .insert(items.map((item, index) => filaDetalle(prestamo.id, item, index)));

  if (detalleError) throw detalleError;

  for (const item of items) {
    if (item.esManual) continue;
    await sumarStock(item.id_producto, -item.cantidad);
  }

  return prestamo;
};

// Devolver o sacar para vender: en ambos casos la joya vuelve al
// inventario y sale del préstamo (en "vendido" luego la descuenta la venta).
export const procesarItemsPrestamo = async (itemIds) => {
  let idPrestamo = null;

  for (const itemId of itemIds) {
    const { data: item, error: itemError } = await supabase
      .from("prestamos_detalle")
      .select("id, id_producto, cantidad, estado_item, id_prestamo")
      .eq("id", itemId)
      .single();

    if (itemError) throw itemError;
    idPrestamo = item.id_prestamo;

    if (item.estado_item !== "prestado") continue;

    if (item.id_producto) await sumarStock(item.id_producto, item.cantidad);

    const { error: deleteItemError } = await supabase
      .from("prestamos_detalle")
      .delete()
      .eq("id", itemId);

    if (deleteItemError) throw deleteItemError;
  }

  if (idPrestamo) await verificarCierrePrestamo(idPrestamo);

  return true;
};

// Cierra el préstamo si ya no quedan items en estado "prestado"
export const verificarCierrePrestamo = async (idPrestamo) => {
  const { data: items, error } = await supabase
    .from("prestamos_detalle")
    .select("estado_item")
    .eq("id_prestamo", idPrestamo);

  if (error) throw error;

  const quedanPrestados = items.some((i) => i.estado_item === "prestado");

  if (!quedanPrestados) {
    await supabase
      .from("prestamos")
      .update({ estado: "finalizado", updated_at: new Date().toISOString() })
      .eq("id", idPrestamo);
  }
};

// Devolver todos los items prestados de un préstamo de una sola vez
export const devolverTodo = async (idPrestamo) => {
  const { data: items, error } = await supabase
    .from("prestamos_detalle")
    .select("id")
    .eq("id_prestamo", idPrestamo)
    .eq("estado_item", "prestado");

  if (error) throw error;

  const itemIds = items.map((i) => i.id);
  if (itemIds.length > 0) {
    await procesarItemsPrestamo(itemIds, "devuelto");
  }

  return true;
};

// ============================================================
// EDITAR UN PRÉSTAMO YA EXISTENTE (activo)
// ============================================================

// Va al final. En préstamos antiguos sin número de orden, se ordena por fecha.
const siguienteOrden = async (idPrestamo) => {
  const { data: existentes, error } = await supabase
    .from("prestamos_detalle")
    .select("orden")
    .eq("id_prestamo", idPrestamo);
  if (error) throw error;

  if (existentes.length === 0) return 0;
  const conOrden = existentes.filter((e) => e.orden !== null);
  return conOrden.length === existentes.length
    ? Math.max(...conOrden.map((e) => e.orden)) + 1
    : null;
};

// Agrega una joya olvidada, descontando stock.
export const agregarJoyaAPrestamo = async (
  idPrestamo,
  idProducto,
  cantidad,
) => {
  const { data: producto, error: productoError } = await supabase
    .from("productos")
    .select("stock")
    .eq("id", idProducto)
    .single();

  if (productoError) throw productoError;
  if (producto.stock < cantidad) {
    throw new Error(`Solo hay ${producto.stock} unidades disponibles`);
  }

  const orden = await siguienteOrden(idPrestamo);
  const { error: detalleError } = await supabase
    .from("prestamos_detalle")
    .insert([
      filaDetalle(idPrestamo, { id_producto: idProducto, cantidad }, orden),
    ]);

  if (detalleError) throw detalleError;

  await sumarStock(idProducto, -cantidad);

  return true;
};

export const agregarJoyaManualAPrestamo = async (idPrestamo, item) => {
  validarItemManual(item);
  const orden = await siguienteOrden(idPrestamo);
  const { error } = await supabase
    .from("prestamos_detalle")
    .insert([
      filaDetalle(
        idPrestamo,
        { ...item, esManual: true, cantidad: parseInt(item.cantidad, 10) },
        orden,
      ),
    ]);
  if (error) throw error;
  return true;
};

// Quita un ítem agregado por error; devuelve el stock y lo borra.
export const quitarJoyaDePrestamo = async (idDetalleItem) => {
  const { data: item, error: itemError } = await supabase
    .from("prestamos_detalle")
    .select("id_producto, cantidad, estado_item, id_prestamo")
    .eq("id", idDetalleItem)
    .single();

  if (itemError) throw itemError;
  if (item.estado_item !== "prestado") {
    throw new Error("Esta joya ya fue devuelta o vendida, no se puede quitar");
  }

  if (item.id_producto) await sumarStock(item.id_producto, item.cantidad);

  const { error: deleteError } = await supabase
    .from("prestamos_detalle")
    .delete()
    .eq("id", idDetalleItem);

  if (deleteError) throw deleteError;

  await verificarCierrePrestamo(item.id_prestamo);

  return true;
};

export const editarPrestamo = async (
  idPrestamo,
  { fecha_prestamo, id_distribuidora, notas },
) => {
  const { error } = await supabase
    .from("prestamos")
    .update({
      fecha_prestamo,
      id_distribuidora,
      notas,
      updated_at: new Date().toISOString(),
    })
    .eq("id", idPrestamo);

  if (error) throw error;

  return true;
};

// Solo permite borrar préstamos ya finalizados; no toca stock.
export const eliminarPrestamo = async (idPrestamo) => {
  const { data: prestamo, error: prestamoError } = await supabase
    .from("prestamos")
    .select("id, estado")
    .eq("id", idPrestamo)
    .single();

  if (prestamoError) throw prestamoError;

  if (prestamo.estado !== "finalizado") {
    throw new Error(
      "Solo se puede eliminar un préstamo ya finalizado (todas sus joyas devueltas o vendidas)",
    );
  }

  const { error: detalleError } = await supabase
    .from("prestamos_detalle")
    .delete()
    .eq("id_prestamo", idPrestamo);

  if (detalleError) throw detalleError;

  const { error: prestamoDeleteError } = await supabase
    .from("prestamos")
    .delete()
    .eq("id", idPrestamo);

  if (prestamoDeleteError) throw prestamoDeleteError;

  return true;
};
