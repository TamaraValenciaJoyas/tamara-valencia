import { supabase, ordenarDetalle } from "./client";

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
        id, cantidad, estado_item, fecha_resolucion, orden, created_at,
        producto:productos(id, codigo, nombre_comercial, descripcion, material, peso, stock, imagen_url, factor:factores(valor, nombre))
      )
    `,
    )
    .eq("id", id)
    .single();

  if (error) throw error;
  return { ...data, detalle: ordenarDetalle(data.detalle) };
};

// Crear un préstamo y descontar stock de cada producto
export const registrarPrestamo = async ({ id_distribuidora, notas, items }) => {
  // 1. Crear la cabecera del préstamo
  const { data: prestamo, error: prestamoError } = await supabase
    .from("prestamos")
    .insert([
      {
        id_distribuidora,
        fecha_prestamo: new Date().toISOString(),
        estado: "activo",
        notas: notas || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ])
    .select()
    .single();

  if (prestamoError) throw prestamoError;

  // 2. Crear el detalle
  const detalleConPrestamo = items.map((item, index) => ({
    id_prestamo: prestamo.id,
    orden: index,
    id_producto: item.id_producto,
    cantidad: item.cantidad,
    estado_item: "prestado",
    created_at: new Date().toISOString(),
  }));

  const { error: detalleError } = await supabase
    .from("prestamos_detalle")
    .insert(detalleConPrestamo);

  if (detalleError) throw detalleError;

  // 3. Descontar stock de cada producto
  for (const item of items) {
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

  return prestamo;
};

// Procesar items de un préstamo: devolver o marcar como vendido
// accion = 'devuelto' | 'vendido'
// En ambos casos el stock vuelve a subir (en "vendido" luego lo descuenta la venta)
export const procesarItemsPrestamo = async (itemIds, accion) => {
  for (const itemId of itemIds) {
    // Obtener el item con su producto
    const { data: item, error: itemError } = await supabase
      .from("prestamos_detalle")
      .select("id, id_producto, cantidad, estado_item, id_prestamo")
      .eq("id", itemId)
      .single();

    if (itemError) throw itemError;

    // Solo procesar items que sigan prestados
    if (item.estado_item !== "prestado") continue;

    // Devolver el stock al inventario
    const { data: producto, error: stockError } = await supabase
      .from("productos")
      .select("stock")
      .eq("id", item.id_producto)
      .single();

    if (stockError) throw stockError;

    const { error: updateStockError } = await supabase
      .from("productos")
      .update({ stock: producto.stock + item.cantidad })
      .eq("id", item.id_producto);

    if (updateStockError) throw updateStockError;

    // Actualizar el estado del item
    const { error: deleteItemError } = await supabase
      .from("prestamos_detalle")
      .delete()
      .eq("id", itemId);

    if (deleteItemError) throw deleteItemError;
  }

  // Verificar si el préstamo debe cerrarse (todos los items resueltos)
  if (itemIds.length > 0) {
    const { data: primerItem } = await supabase
      .from("prestamos_detalle")
      .select("id_prestamo")
      .eq("id", itemIds[0])
      .single();

    if (primerItem) {
      await verificarCierrePrestamo(primerItem.id_prestamo);
    }
  }

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

  // Va al final. En préstamos antiguos sin número de orden, se ordena por fecha.
  const { data: existentes, error: existentesError } = await supabase
    .from("prestamos_detalle")
    .select("orden")
    .eq("id_prestamo", idPrestamo);
  if (existentesError) throw existentesError;
  const conOrden = existentes.filter((e) => e.orden !== null);
  const orden =
    existentes.length > 0 && conOrden.length === existentes.length
      ? Math.max(...conOrden.map((e) => e.orden)) + 1
      : existentes.length === 0
        ? 0
        : null;

  const { error: detalleError } = await supabase
    .from("prestamos_detalle")
    .insert([
      {
        id_prestamo: idPrestamo,
        id_producto: idProducto,
        cantidad,
        orden,
        estado_item: "prestado",
        created_at: new Date().toISOString(),
      },
    ]);

  if (detalleError) throw detalleError;

  const { error: stockError } = await supabase
    .from("productos")
    .update({ stock: producto.stock - cantidad })
    .eq("id", idProducto);

  if (stockError) throw stockError;

  return true;
};

// Quita un ítem agregado por error; devuelve el stock y lo borra.
export const quitarJoyaDePrestamo = async (idDetalleItem) => {
  const { data: item, error: itemError } = await supabase
    .from("prestamos_detalle")
    .select("id_producto, cantidad, estado_item")
    .eq("id", idDetalleItem)
    .single();

  if (itemError) throw itemError;
  if (item.estado_item !== "prestado") {
    throw new Error("Esta joya ya fue devuelta o vendida, no se puede quitar");
  }

  const { data: producto, error: productoError } = await supabase
    .from("productos")
    .select("stock")
    .eq("id", item.id_producto)
    .single();

  if (productoError) throw productoError;

  const { error: stockError } = await supabase
    .from("productos")
    .update({ stock: producto.stock + item.cantidad })
    .eq("id", item.id_producto);

  if (stockError) throw stockError;

  const { error: deleteError } = await supabase
    .from("prestamos_detalle")
    .delete()
    .eq("id", idDetalleItem);

  if (deleteError) throw deleteError;

  return true;
};

// Regresa un ítem a "prestado" si se marcó vendido/devuelto por error.
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
