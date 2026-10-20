export const calcularPrecio = (producto) => {
  if (!producto?.peso || !producto?.factor?.valor) return 0;
  const precio = parseFloat(producto.peso) * parseFloat(producto.factor.valor);
  return Math.ceil(precio / 5) * 5;
};

// Una joya prestada puede ser un producto del inventario o una joya manual.
export const precioItemPrestamo = (item) =>
  item.producto
    ? calcularPrecio(item.producto)
    : parseFloat(item.precio_manual) || 0;

export const descripcionItemPrestamo = (item) =>
  item.producto
    ? item.producto.descripcion || item.producto.nombre_comercial || "-"
    : item.descripcion_manual || "-";
