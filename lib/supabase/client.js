import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Ordena las joyas de una venta, préstamo o pedido en el orden en que
// se ingresaron. Los registros antiguos sin número de orden van por fecha.
export const ordenarDetalle = (detalle) =>
  [...(detalle || [])].sort((a, b) => {
    const ordenA = a.orden ?? Number.MAX_SAFE_INTEGER;
    const ordenB = b.orden ?? Number.MAX_SAFE_INTEGER;
    if (ordenA !== ordenB) return ordenA - ordenB;
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  });

// ========== HELPER DE ERRORES ==========

const handleSupabaseError = (context, error) => {
  console.error(`[Supabase] ${context}:`, error.message);
  throw new Error(`${context}: ${error.message}`);
};

// Convierte el texto libre de talla en una lista de valores numéricos:
// "5 Y 3/4 - 6 Y 1/2" -> [5.75, 6.5]. Ignora las medidas que vienen
// después de SUPERFICIE, EXTREMOS, ANCHO, etc.
const FRACCIONES_TALLA = { "1/4": 0.25, "1/2": 0.5, "2/4": 0.5, "3/4": 0.75 };

const extraerTallas = (texto) => {
  if (!texto) return [];
  const limpio = texto
    .toUpperCase()
    .replace(/\/\/4/g, "3/4")
    .split(/EXTREMOS|SUPERFICIE|ANCHO|LARGO|ALTO|MEDIDA|\bCM\b/)[0];

  const tallas = [];
  const patron = /(\d+(?:[.,]\d+)?)(?:\s*Y?\s*(\d)\s*\/\s*(\d))?/g;
  let m;
  while ((m = patron.exec(limpio))) {
    if (/[.,]/.test(m[1])) continue;
    let valor = parseInt(m[1], 10);
    if (m[2]) {
      const fraccion = FRACCIONES_TALLA[`${m[2]}/${m[3]}`];
      if (fraccion === undefined) continue;
      valor += fraccion;
    }
    if (valor >= 3 && valor <= 15) tallas.push(valor);
  }
  return tallas;
};

const tieneTallaAnillo = (texto, talla) =>
  extraerTallas(texto).some((valor) => Math.abs(valor - talla) < 0.001);

// ========== FUNCIONES PARA PRODUCTOS ==========

// Obtener todos los productos activos con sus conjuntos
// FIX: Paginación para soportar más de 1,000 productos
export const getProductos = async (filters = {}) => {
  let allData = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    let query = supabase
      .from("productos")
      .select("*, conjunto:conjuntos(*), factor:factores(*)")
      .eq("activo", true)
      .gt("stock", 0)
      .not("imagen_url", "is", null)
      .order("id_conjunto", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (filters.tipo) query = query.eq("tipo", filters.tipo);
    if (filters.categoria) query = query.eq("categoria", filters.categoria);
    if (filters.material) query = query.eq("material", filters.material);
    if (filters.conjunto) query = query.eq("id_conjunto", filters.conjunto);
    if (filters.codigo) query = query.ilike("codigo", `%${filters.codigo}%`);

    const { data, error } = await query;
    if (error) handleSupabaseError("getProductos", error);

    allData = [...allData, ...data];
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const calcularPrecioFinal = (producto) => {
    if (!producto.peso || !producto.factor?.valor) return null;
    const precioCalculado =
      parseFloat(producto.peso) * parseFloat(producto.factor.valor);
    return Math.ceil(precioCalculado / 5) * 5;
  };

  let resultado = allData;

  if (filters.talla) {
    if (filters.talla === "variable") {
      resultado = resultado.filter((producto) => {
        if (!producto.talla) return false;
        const t = producto.talla.toUpperCase();
        return (
          t.includes("VARIABLE") ||
          t.includes("REGULABLE") ||
          t.includes("AJUSTABLE")
        );
      });
    } else {
      const tallaBuscada = parseFloat(filters.talla);
      resultado = resultado.filter((producto) =>
        tieneTallaAnillo(producto.talla, tallaBuscada),
      );
    }
  }

  if (filters.precioMin || filters.precioMax) {
    resultado = resultado.filter((producto) => {
      const precioFinal = calcularPrecioFinal(producto);
      if (precioFinal === null) return false;
      if (filters.precioMin && precioFinal < parseFloat(filters.precioMin))
        return false;
      if (filters.precioMax && precioFinal > parseFloat(filters.precioMax))
        return false;
      return true;
    });
  }

  if (filters.orden === "precio_asc" || filters.orden === "precio_desc") {
    resultado = [...resultado].sort((a, b) => {
      const precioA = calcularPrecioFinal(a) ?? 0;
      const precioB = calcularPrecioFinal(b) ?? 0;
      return filters.orden === "precio_asc"
        ? precioA - precioB
        : precioB - precioA;
    });
  }

  return resultado;
};

// Obtener productos agrupados por conjunto
export const getProductosAgrupados = async (filters = {}) => {
  const productos = await getProductos(filters);

  const conjuntos = {};
  const productosSueltos = [];

  productos.forEach((producto) => {
    if (producto.id_conjunto && producto.conjunto) {
      const conjuntoId = producto.id_conjunto;
      if (!conjuntos[conjuntoId]) {
        conjuntos[conjuntoId] = {
          ...producto.conjunto,
          productos: [],
        };
      }
      conjuntos[conjuntoId].productos.push(producto);
    } else {
      productosSueltos.push(producto);
    }
  });

  const conjuntosArray = Object.values(conjuntos);

  // Ordenar: conjuntos normales primero, charms al final
  conjuntosArray.sort((a, b) => {
    const aEsCharm = a.nombre.toLowerCase().includes("charm");
    const bEsCharm = b.nombre.toLowerCase().includes("charm");

    if (aEsCharm && !bEsCharm) return 1;
    if (!aEsCharm && bEsCharm) return -1;
    return 0;
  });

  return {
    conjuntos: conjuntosArray,
    productosSueltos,
  };
};

// Obtener un producto por ID
export const getProductoById = async (id) => {
  const { data, error } = await supabase
    .from("productos")
    .select("*, conjunto:conjuntos(*), factor:factores(*)")
    .eq("id", id)
    .single();

  if (error) handleSupabaseError("getProductoById", error);
  return data;
};

// Obtener productos del mismo conjunto
export const getProductosPorConjunto = async (conjuntoId) => {
  const { data, error } = await supabase
    .from("productos")
    .select("*, factor:factores(*), conjunto:conjuntos(*)")
    .eq("id_conjunto", conjuntoId)
    .eq("activo", true)
    .gt("stock", 0)
    .not("imagen_url", "is", null);

  if (error) handleSupabaseError("getProductosPorConjunto", error);
  return (data || []).sort(() => Math.random() - 0.5).slice(0, 12);
};

// ========== FUNCIONES PARA CONJUNTOS ==========

export const getConjuntos = async () => {
  const { data, error } = await supabase
    .from("conjuntos")
    .select("id, nombre")
    .order("nombre", { ascending: true });

  if (error) handleSupabaseError("getConjuntos", error);
  return data;
};

// FIX: Agregado join con factor para que los productos del conjunto tengan precio calculable
export const getConjuntoById = async (id) => {
  const { data, error } = await supabase
    .from("conjuntos")
    .select("*, productos:productos(*, factor:factores(*))")
    .eq("id", id)
    .single();

  if (error) handleSupabaseError("getConjuntoById", error);
  return data;
};

// ========== FUNCIONES PARA FACTORES ==========

export const getFactores = async () => {
  const { data, error } = await supabase
    .from("factores")
    .select("*")
    .eq("activo", true)
    .order("nombre", { ascending: true });

  if (error) handleSupabaseError("getFactores", error);
  return data;
};

export const getFactorById = async (id) => {
  const { data, error } = await supabase
    .from("factores")
    .select("*")
    .eq("id", id)
    .single();

  if (error) handleSupabaseError("getFactorById", error);
  return data;
};

export const createFactor = async (factorData) => {
  const { data, error } = await supabase
    .from("factores")
    .insert([
      {
        nombre: factorData.nombre,
        valor: factorData.valor,
        activo: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ])
    .select()
    .single();

  if (error) handleSupabaseError("createFactor", error);
  return data;
};

export const updateFactor = async (id, factorData) => {
  const { data, error } = await supabase
    .from("factores")
    .update({
      valor: factorData.valor,
      nombre: factorData.nombre,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) handleSupabaseError("updateFactor", error);
  return data;
};

// FIX: Validación antes de borrar para evitar productos huérfanos sin factor
export const deleteFactor = async (id) => {
  // Verificar si hay productos usando este factor
  const { count, error: countError } = await supabase
    .from("productos")
    .select("*", { count: "exact", head: true })
    .eq("id_factor", id);

  if (countError)
    handleSupabaseError("deleteFactor (verificación)", countError);

  if (count > 0) {
    throw new Error(
      `No se puede eliminar este factor porque ${count} producto${count !== 1 ? "s lo usan" : " lo usa"}. Reasigna o elimina esos productos primero.`,
    );
  }

  const { data, error } = await supabase
    .from("factores")
    .delete()
    .eq("id", id)
    .select()
    .single();

  if (error) handleSupabaseError("deleteFactor", error);
  return data;
};
