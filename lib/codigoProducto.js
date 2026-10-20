// Código = categoría + material + tipo (2 letras c/u) + número correlativo
// de todo el catálogo con 4 dígitos. Ej: OTBIAR2023.

const ABREV_CATEGORIA = {
  animales: "AN",
  espiritual: "ES",
  marcas: "MA",
  naturaleza: "NA",
  otros: "OT",
  religioso: "RE",
  "perlas cultivadas": "PC",
  "perlas sinteticas": "PS",
};

const ABREV_MATERIAL = {
  oro: "OR",
  plata: "PL",
  bisuteria: "BI",
  "cobre bronce": "BC",
  perlas: "PE",
  varios: "VA",
};

const ABREV_TIPO = {
  anillo: "AN",
  aretes: "AR",
  argollas: "AG",
  cadenasYDije: "CD",
  cadena: "CA",
  collar: "CO",
  dije: "DI",
  pulsera: "PU",
  trepadores: "TR",
  ulas: "UL",
  huggies: "HU",
  piercing: "PI",
  charms: "AC",
  accesorios: "AS",
};

export const prefijoCodigo = ({ categoria, material, tipo }) => {
  const c = ABREV_CATEGORIA[categoria];
  const m = ABREV_MATERIAL[material];
  const t = ABREV_TIPO[tipo];
  return c && m && t ? `${c}${m}${t}` : null;
};

export const esCodigoAutomatico = (form) => {
  const prefijo = prefijoCodigo(form);
  return !!prefijo && new RegExp(`^${prefijo}\\d+$`).test(form.codigo || "");
};

export const formatearCodigo = (prefijo, numero) =>
  `${prefijo}${String(numero).padStart(4, "0")}`;

// Mayor número al final de un código en todo el catálogo + 1.
// Se lee en páginas porque Supabase devuelve máximo 1000 filas.
export const siguienteNumeroCodigo = async (client) => {
  const tamPagina = 1000;
  let maximo = 0;
  for (let desde = 0; ; desde += tamPagina) {
    const { data, error } = await client
      .from("productos")
      .select("codigo")
      .order("id")
      .range(desde, desde + tamPagina - 1);
    if (error) throw error;

    for (const { codigo } of data) {
      const match = /(\d+)$/.exec(codigo || "");
      // Más de 5 dígitos sería un código mal tipeado, no el correlativo
      if (match && match[1].length <= 5) {
        maximo = Math.max(maximo, parseInt(match[1], 10));
      }
    }
    if (data.length < tamPagina) break;
  }
  return maximo + 1;
};

export const codigoExiste = async (client, codigo) => {
  const { data, error } = await client
    .from("productos")
    .select("id")
    .eq("codigo", codigo)
    .limit(1);
  if (error) throw error;
  return data.length > 0;
};

export const generarCodigoDisponible = async (client, prefijo) => {
  let numero = await siguienteNumeroCodigo(client);
  for (let intento = 0; intento < 20; intento++, numero++) {
    const codigo = formatearCodigo(prefijo, numero);
    if (!(await codigoExiste(client, codigo))) return codigo;
  }
  throw new Error("No se pudo generar un código libre. Escríbelo a mano.");
};
