import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const CAMPOS_REQUERIDOS = [
  "nombre_cliente",
  "cedula_cliente",
  "celular_cliente",
  "nombre_receptor",
  "direccion",
  "horario_entrega",
];
const CAMPOS_OPCIONALES = ["ubicacion_maps", "notas"];
const METODOS_PAGO = ["payphone", "transferencia"];
const LARGO_MAXIMO = 500;

const calcularPrecio = (producto) => {
  const precio =
    (parseFloat(producto.peso) || 0) *
    (parseFloat(producto.factor?.valor) || 0);
  return Math.ceil(precio / 5) * 5;
};

const error = (mensaje, status = 400) =>
  NextResponse.json({ error: mensaje }, { status });

// Crea el pedido con precios calculados desde la base de datos: el
// navegador solo indica qué productos y cuántos.
export async function POST(request) {
  try {
    const { cliente = {}, metodo_pago, items } = await request.json();

    for (const campo of CAMPOS_REQUERIDOS) {
      const valor = cliente[campo];
      if (typeof valor !== "string" || !valor.trim()) {
        return error("Faltan datos de entrega");
      }
    }
    for (const campo of [...CAMPOS_REQUERIDOS, ...CAMPOS_OPCIONALES]) {
      const valor = cliente[campo];
      if (
        valor != null &&
        (typeof valor !== "string" || valor.length > LARGO_MAXIMO)
      ) {
        return error("Hay un dato de entrega inválido");
      }
    }
    if (!METODOS_PAGO.includes(metodo_pago)) {
      return error("Método de pago inválido");
    }
    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
      return error("El carrito está vacío o es inválido");
    }

    const cantidades = {};
    for (const item of items) {
      const cantidad = Number(item?.cantidad);
      if (
        !item?.id_producto ||
        !Number.isInteger(cantidad) ||
        cantidad < 1 ||
        cantidad > 50
      ) {
        return error("Hay un producto inválido en el carrito");
      }
      cantidades[item.id_producto] =
        (cantidades[item.id_producto] || 0) + cantidad;
    }

    const ids = Object.keys(cantidades);
    const { data: productos, error: prodError } = await supabaseAdmin
      .from("productos")
      .select(
        "id, codigo, nombre_comercial, peso, stock, activo, factor:factores(valor)",
      )
      .in("id", ids);
    if (prodError) throw prodError;

    const noDisponibles = [];
    const detalle = [];
    for (const id of ids) {
      const producto = productos.find((p) => p.id === id);
      const precio = producto ? calcularPrecio(producto) : 0;
      if (
        !producto ||
        !producto.activo ||
        producto.stock < cantidades[id] ||
        precio <= 0
      ) {
        noDisponibles.push(
          producto?.nombre_comercial || producto?.codigo || "un producto",
        );
        continue;
      }
      detalle.push({
        orden: detalle.length,
        id_producto: id,
        cantidad: cantidades[id],
        precio_unitario: precio,
        subtotal: precio * cantidades[id],
      });
    }

    if (noDisponibles.length > 0) {
      return error(
        `Ya no hay stock suficiente de: ${noDisponibles.join(", ")}. Actualiza tu carrito.`,
        409,
      );
    }

    const subtotal = detalle.reduce((s, d) => s + d.subtotal, 0);
    const limpio = (campo) => cliente[campo]?.trim() || null;

    const { data: pedido, error: pedidoError } = await supabaseAdmin
      .from("pedidos_web")
      .insert([
        {
          nombre_cliente: limpio("nombre_cliente"),
          cedula_cliente: limpio("cedula_cliente"),
          celular_cliente: limpio("celular_cliente"),
          nombre_receptor: limpio("nombre_receptor"),
          direccion: limpio("direccion"),
          ubicacion_maps: limpio("ubicacion_maps"),
          horario_entrega: limpio("horario_entrega"),
          notas: limpio("notas"),
          subtotal,
          metodo_pago,
          estado: "pendiente",
        },
      ])
      .select("id")
      .single();
    if (pedidoError) throw pedidoError;

    const { error: detalleError } = await supabaseAdmin
      .from("pedidos_web_detalle")
      .insert(detalle.map((d) => ({ ...d, id_pedido_web: pedido.id })));

    if (detalleError) {
      await supabaseAdmin.from("pedidos_web").delete().eq("id", pedido.id);
      throw detalleError;
    }

    return NextResponse.json({
      id: pedido.id,
      subtotal,
      precios: Object.fromEntries(
        detalle.map((d) => [d.id_producto, d.precio_unitario]),
      ),
    });
  } catch (e) {
    console.error("Error al crear pedido web:", e);
    return error("No se pudo registrar el pedido. Intenta de nuevo.", 500);
  }
}
