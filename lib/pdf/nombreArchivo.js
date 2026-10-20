const slug = (texto) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Ej: "lizeeth-chavez-prestamo-12.pdf". Sin número (registros antiguos
// antes de la numeración) se usa la fecha.
export const nombreArchivoPDF = (nombre, tipo, numero, fechaRespaldo) => {
  const prefijo = nombre ? `${slug(nombre)}-` : "";
  const sufijo = numero || fechaRespaldo.replace(/\//g, "-");
  return `${prefijo}${tipo}-${sufijo}.pdf`;
};
