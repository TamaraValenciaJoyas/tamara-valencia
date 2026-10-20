import { nombreArchivoPDF } from "./nombreArchivo";
import {
  precioItemPrestamo,
  descripcionItemPrestamo,
} from "@/lib/prestamoItems";

// PDF con las joyas que siguen prestadas.

const formatMoneda = (valor) =>
  new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor || 0);

const formatFecha = (fecha) => {
  if (!fecha) return "-";
  return new Date(fecha).toLocaleDateString("es-EC", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

export const descargarPrestamoPDF = async (prestamo) => {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF();
  const anchoPagina = doc.internal.pageSize.getWidth();

  // Encabezado
  doc.setFontSize(18);
  doc.setTextColor(30, 30, 30);
  doc.text("Tamara Valencia Joyas", anchoPagina / 2, 20, { align: "center" });

  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  doc.text(
    prestamo.numero
      ? `Detalle de Préstamo N° ${prestamo.numero}`
      : "Detalle de Préstamo",
    anchoPagina / 2,
    28,
    { align: "center" },
  );

  doc.setDrawColor(220, 220, 220);
  doc.line(14, 33, anchoPagina - 14, 33);

  // Datos del préstamo
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  let y = 42;

  doc.setFont(undefined, "bold");
  doc.text("Distribuidora:", 14, y);
  doc.setFont(undefined, "normal");
  doc.text(prestamo.distribuidora?.nombre || "-", 50, y);

  y += 6;
  if (prestamo.distribuidora?.telefono) {
    doc.setFont(undefined, "bold");
    doc.text("Teléfono:", 14, y);
    doc.setFont(undefined, "normal");
    doc.text(prestamo.distribuidora.telefono, 50, y);
    y += 6;
  }

  let yDer = 42;
  const xDer = anchoPagina / 2 + 10;

  doc.setFont(undefined, "bold");
  doc.text("Fecha del préstamo:", xDer, yDer);
  doc.setFont(undefined, "normal");
  doc.text(formatFecha(prestamo.fecha_prestamo), xDer + 42, yDer);

  yDer += 6;
  doc.setFont(undefined, "bold");
  doc.text("Estado:", xDer, yDer);
  doc.setFont(undefined, "normal");
  doc.text(
    prestamo.estado === "activo" ? "Activo" : "Finalizado",
    xDer + 42,
    yDer,
  );

  y = Math.max(y, yDer) + 8;

  // Préstamos antiguos pueden tener filas vendidas o devueltas
  const detalle = (prestamo.detalle || []).filter(
    (item) => item.estado_item === "prestado",
  );
  const filas = detalle.map((item) => [
    item.producto?.codigo || "-",
    descripcionItemPrestamo(item),
    item.producto?.material || "-",
    String(item.cantidad),
    formatMoneda(precioItemPrestamo(item)),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Código", "Descripción", "Material", "Cant.", "Precio"]],
    body: filas,
    theme: "grid",
    headStyles: {
      fillColor: [31, 41, 55],
      textColor: [255, 255, 255],
      fontSize: 9,
    },
    bodyStyles: { fontSize: 8, textColor: [60, 60, 60] },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 82 },
      2: { cellWidth: 24 },
      3: { cellWidth: 16, halign: "center" },
      4: { cellWidth: 32, halign: "right" },
    },
    margin: { left: 14, right: 14 },
  });

  const totalPrestado = detalle.reduce(
    (sum, item) => sum + precioItemPrestamo(item) * item.cantidad,
    0,
  );
  const totalUnidadesPrestadas = detalle.reduce(
    (sum, item) => sum + item.cantidad,
    0,
  );

  let yFinal = doc.lastAutoTable.finalY + 12;
  if (yFinal + 12 > doc.internal.pageSize.getHeight() - 15) {
    doc.addPage();
    yFinal = 20;
  }

  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.setFont(undefined, "normal");
  doc.text(
    `${totalUnidadesPrestadas} ${totalUnidadesPrestadas === 1 ? "joya prestada" : "joyas prestadas"}`,
    14,
    yFinal,
  );

  doc.setFillColor(31, 41, 55);
  doc.rect(anchoPagina - 95, yFinal - 7, 81, 12, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont(undefined, "bold");
  doc.text("VALOR TOTAL PRESTADO:", anchoPagina - 91, yFinal);
  doc.text(formatMoneda(totalPrestado), anchoPagina - 18, yFinal, {
    align: "right",
  });

  // Pie de página
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(8);
  doc.setFont(undefined, "normal");
  doc.text(
    `Documento generado el ${formatFecha(new Date().toISOString())}`,
    anchoPagina / 2,
    doc.internal.pageSize.getHeight() - 12,
    { align: "center" },
  );

  doc.save(
    nombreArchivoPDF(
      prestamo.distribuidora?.nombre,
      "prestamo",
      prestamo.numero,
      formatFecha(prestamo.fecha_prestamo),
    ),
  );
};
