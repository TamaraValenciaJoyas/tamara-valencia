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

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const nombreMes = (fecha) => {
  if (!fecha) return "-";
  const [, mes] = fecha.split("-").map(Number);
  return MESES[mes - 1];
};

const VIAS_LABEL = {
  showroom: "Showroom",
  redes: "Redes Sociales",
  referido: "Referido",
  distribuidora: "Distribuidora",
  tvcj: "TVCJ",
  cuenta_gerencia: "Cuenta Gerencia",
  web: "Página Web",
};

export const descargarVentaPDF = async (venta, cuenta) => {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF();
  const anchoPagina = doc.internal.pageSize.getWidth();

  doc.setFontSize(18);
  doc.setTextColor(30, 30, 30);
  doc.text("Tamara Valencia Joyas", anchoPagina / 2, 20, { align: "center" });

  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  doc.text("Detalle de Venta", anchoPagina / 2, 28, { align: "center" });

  doc.setDrawColor(220, 220, 220);
  doc.line(14, 33, anchoPagina - 14, 33);

  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  let y = 42;

  doc.setFont(undefined, "bold");
  doc.text("Cliente:", 14, y);
  doc.setFont(undefined, "normal");
  doc.text(venta.cliente?.nombre || "-", 40, y);

  y += 6;
  doc.setFont(undefined, "bold");
  doc.text("Fecha:", 14, y);
  doc.setFont(undefined, "normal");
  doc.text(formatFecha(venta.fecha), 40, y);

  let yDer = 42;
  const xDer = anchoPagina / 2 + 10;

  doc.setFont(undefined, "bold");
  doc.text("Vía:", xDer, yDer);
  doc.setFont(undefined, "normal");
  doc.text(VIAS_LABEL[venta.via] || venta.via, xDer + 30, yDer);

  yDer += 6;
  doc.setFont(undefined, "bold");
  doc.text("Pago:", xDer, yDer);
  doc.setFont(undefined, "normal");
  doc.text(venta.es_credito ? "Crédito" : "Contado", xDer + 30, yDer);

  y = Math.max(y, yDer) + 8;

  if (venta.es_credito && cuenta) {
    doc.setFillColor(255, 242, 224);
    doc.rect(14, y - 6, anchoPagina - 28, 20, "F");

    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.setFont(undefined, "bold");
    doc.text("Saldo a la fecha:", 18, y);
    doc.setFont(undefined, "normal");
    doc.text(formatMoneda(cuenta.saldo), 60, y);

    doc.setFont(undefined, "bold");
    doc.text("Acuerdo de pago:", 18, y + 7);
    doc.setFont(undefined, "normal");
    doc.text(
      `${formatMoneda(cuenta.cuota_mensual)} c/ ${cuenta.dia_pago} de mes desde ${nombreMes(cuenta.fecha_primer_pago)}`,
      60,
      y + 7,
    );

    y += 22;
  }

  const filas = (venta.detalle || []).map((item) => [
    item.producto?.codigo || "-",
    item.producto?.descripcion ||
      item.producto?.nombre_comercial ||
      item.descripcion_manual ||
      "-",
    item.producto?.material || "-",
    formatMoneda(item.precio_unitario),
    String(item.cantidad),
    formatMoneda(item.subtotal),
  ]);

  autoTable(doc, {
    startY: y,
    head: [
      ["Código", "Descripción", "Material", "Precio", "Cant.", "Subtotal"],
    ],
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
      0: { cellWidth: 26 },
      1: { cellWidth: 62 },
      2: { cellWidth: 22 },
      3: { cellWidth: 22, halign: "right" },
      4: { cellWidth: 14, halign: "center" },
      5: { cellWidth: 24, halign: "right" },
    },
    margin: { left: 14, right: 14 },
  });

  const totalUnidades = (venta.detalle || []).reduce(
    (sum, item) => sum + item.cantidad,
    0,
  );

  const descuento = parseFloat(venta.descuento) || 0;
  const altoPagina = doc.internal.pageSize.getHeight();
  let yFinal = doc.lastAutoTable.finalY + 12;
  if (yFinal + (descuento > 0 ? 26 : 12) > altoPagina - 15) {
    doc.addPage();
    yFinal = 20;
  }

  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.setFont(undefined, "normal");
  doc.text(
    `${totalUnidades} ${totalUnidades === 1 ? "ítem" : "ítems"}`,
    14,
    yFinal,
  );

  if (descuento > 0) {
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.text("Subtotal:", anchoPagina - 71, yFinal);
    doc.text(formatMoneda(venta.subtotal), anchoPagina - 18, yFinal, {
      align: "right",
    });
    doc.text("Descuento:", anchoPagina - 71, yFinal + 7);
    doc.text(`-${formatMoneda(descuento)}`, anchoPagina - 18, yFinal + 7, {
      align: "right",
    });
    yFinal += 16;
  }

  doc.setFillColor(31, 41, 55);
  doc.rect(anchoPagina - 75, yFinal - 7, 61, 12, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont(undefined, "bold");
  doc.text("TOTAL:", anchoPagina - 71, yFinal);
  doc.text(formatMoneda(venta.total), anchoPagina - 18, yFinal, {
    align: "right",
  });

  const nombreArchivo = `venta-${(venta.cliente?.nombre || "cliente")
    .toLowerCase()
    .replace(/\s+/g, "-")}-${formatFecha(venta.fecha).replace(/\//g, "-")}.pdf`;

  doc.save(nombreArchivo);
};
