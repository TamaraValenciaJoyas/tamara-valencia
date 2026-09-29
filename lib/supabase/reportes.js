import { supabase } from "./client";

// Ventas por mes con desglose por vía
export const getVentasPorMes = async (año) => {
  const { data, error } = await supabase
    .from("ventas")
    .select(
      `
      fecha, total, via,
      detalle:ventas_detalle(
        cantidad,
        producto:productos(tipo)
      )
    `,
    )
    .gte("fecha", `${año}-01-01`)
    .lte("fecha", `${año}-12-31`);

  if (error) throw error;

  // Agrupar por mes
  const meses = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    nombre: new Date(año, i, 1).toLocaleDateString("es-EC", { month: "short" }),
    total: 0,
    showroom: 0,
    redes: 0,
    referido: 0,
    distribuidora: 0,
    tvcj: 0,
    cuenta_gerencia: 0,
    web: 0,
    unidades: 0,
  }));

  data?.forEach((venta) => {
    const mes = new Date(venta.fecha).getMonth();
    meses[mes].total += parseFloat(venta.total);
    meses[mes][venta.via] =
      (meses[mes][venta.via] || 0) + parseFloat(venta.total);
    meses[mes].unidades +=
      venta.detalle?.reduce((sum, d) => sum + d.cantidad, 0) || 0;
  });

  return meses;
};

// Ventas por tipo de joya
export const getVentasPorTipo = async (año, mes = null) => {
  let query = supabase.from("ventas_detalle").select(`
      cantidad,
      producto:productos(tipo)
    `);

  if (mes) {
    const mesStr = mes.toString().padStart(2, "0");
    query = query
      .gte("created_at", `${año}-${mesStr}-01`)
      .lte("created_at", `${año}-${mesStr}-31`);
  } else {
    query = query
      .gte("created_at", `${año}-01-01`)
      .lte("created_at", `${año}-12-31`);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Agrupar por tipo
  const tipos = {};
  data?.forEach((item) => {
    const tipo = item.producto?.tipo || "Sin tipo";
    tipos[tipo] = (tipos[tipo] || 0) + item.cantidad;
  });

  return Object.entries(tipos)
    .map(([tipo, cantidad]) => ({ tipo, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);
};

// Pagos de créditos por mes
export const getPagosCreditosPorMes = async (año) => {
  const { data, error } = await supabase
    .from("cuenta_movimientos")
    .select("monto, fecha")
    .eq("tipo", "abono")
    .gte("fecha", `${año}-01-01`)
    .lte("fecha", `${año}-12-31`);

  if (error) throw error;

  const meses = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    nombre: new Date(año, i, 1).toLocaleDateString("es-EC", { month: "short" }),
    cobrado: 0,
  }));

  (data || []).forEach((pago) => {
    const idx = parseInt(pago.fecha.split("-")[1], 10) - 1;
    if (idx >= 0 && idx < 12) meses[idx].cobrado += parseFloat(pago.monto);
  });

  return meses;
};

// Cartera de créditos (cobrado vs pendiente por mes)
export const getCarteraPorMes = async (año) => {
  const pagosPorMes = await getPagosCreditosPorMes(año);

  const { data: cuentas, error } = await supabase
    .from("cuentas")
    .select("saldo")
    .eq("estado", "activa");

  if (error) throw error;

  const totalPendiente =
    cuentas?.reduce((sum, c) => sum + parseFloat(c.saldo), 0) || 0;

  return { pagosPorMes, totalPendiente };
};

// Egresos mensuales
export const getEgresosMensuales = async (año) => {
  const { data, error } = await supabase
    .from("egresos_mensuales")
    .select("*")
    .eq("año", año)
    .order("mes", { ascending: true });

  if (error) throw error;
  return data || [];
};

// Guardar o actualizar egreso mensual
export const upsertEgreso = async (año, mes, monto, notas = "") => {
  const { data, error } = await supabase
    .from("egresos_mensuales")
    .upsert(
      [
        {
          año,
          mes,
          monto: parseFloat(monto),
          notas,
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: "año,mes" },
    )
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Resumen del mes actual
export const getResumenMes = async (año, mes) => {
  const mesStr = mes.toString().padStart(2, "0");
  const inicioMes = `${año}-${mesStr}-01`;
  const finMes = new Date(año, mes, 0).toISOString().split("T")[0];

  const [{ data: ventas }, { data: pagos }, { data: egreso }] =
    await Promise.all([
      supabase
        .from("ventas")
        .select("total")
        .gte("fecha", inicioMes)
        .lte("fecha", `${finMes}T23:59:59`),
      supabase
        .from("cuenta_movimientos")
        .select("monto")
        .eq("tipo", "abono")
        .gte("fecha", inicioMes)
        .lte("fecha", finMes),
      supabase
        .from("egresos_mensuales")
        .select("monto")
        .eq("año", año)
        .eq("mes", mes)
        .maybeSingle(),
    ]);

  const totalVentas =
    ventas?.reduce((sum, v) => sum + parseFloat(v.total), 0) || 0;
  const totalPagos =
    pagos?.reduce((sum, p) => sum + parseFloat(p.monto), 0) || 0;
  const totalEgresos = egreso?.monto || 0;
  const totalIngresos = totalVentas + totalPagos;

  return {
    totalVentas,
    totalPagos,
    totalIngresos,
    totalEgresos,
    balance: totalIngresos - totalEgresos,
  };
};

// Reporte de ventas por distribuidora en un año
// Devuelve, por cada distribuidora que tuvo ventas: total vendido,
// número de ventas, unidades vendidas y comisión generada.
// Reporte por distribuidora: ventas y comisiones generadas en el periodo.
// Las comisiones ahora se leen de la tabla comisiones (se generan al pagar).
export const getReportePorDistribuidora = async (año, mes = null) => {
  // Rango de fechas
  let desde, hasta;
  if (mes) {
    const mesStr = mes.toString().padStart(2, "0");
    const finMes = new Date(año, mes, 0).getDate();
    desde = `${año}-${mesStr}-01`;
    hasta = `${año}-${mesStr}-${finMes}`;
  } else {
    desde = `${año}-01-01`;
    hasta = `${año}-12-31`;
  }

  // Ventas por distribuidora (vía distribuidora)
  const { data: ventas, error: ventasError } = await supabase
    .from("ventas")
    .select(
      `
      total, fecha,
      distribuidora:distribuidoras(id, nombre),
      detalle:ventas_detalle(cantidad)
    `,
    )
    .eq("via", "distribuidora")
    .not("id_distribuidora", "is", null)
    .gte("fecha", desde)
    .lte("fecha", `${hasta}T23:59:59`);

  if (ventasError) throw ventasError;

  // Comisiones generadas en el periodo
  const { data: comisiones, error: comError } = await supabase
    .from("comisiones")
    .select("id_distribuidora, monto, estado, fecha")
    .gte("fecha", desde)
    .lte("fecha", hasta);

  if (comError) throw comError;

  const mapa = {};

  ventas?.forEach((venta) => {
    const dist = venta.distribuidora;
    if (!dist) return;
    if (!mapa[dist.id]) {
      mapa[dist.id] = {
        id: dist.id,
        nombre: dist.nombre,
        totalVendido: 0,
        numeroVentas: 0,
        unidades: 0,
        comisionTotal: 0,
        comisionPagada: 0,
        comisionPendiente: 0,
      };
    }
    const reg = mapa[dist.id];
    reg.totalVendido += parseFloat(venta.total);
    reg.numeroVentas += 1;
    reg.unidades += venta.detalle?.reduce((sum, d) => sum + d.cantidad, 0) || 0;
  });

  comisiones?.forEach((c) => {
    if (!mapa[c.id_distribuidora]) {
      mapa[c.id_distribuidora] = {
        id: c.id_distribuidora,
        nombre: "(sin nombre)",
        totalVendido: 0,
        numeroVentas: 0,
        unidades: 0,
        comisionTotal: 0,
        comisionPagada: 0,
        comisionPendiente: 0,
      };
    }
    const reg = mapa[c.id_distribuidora];
    const monto = parseFloat(c.monto) || 0;
    reg.comisionTotal += monto;
    if (c.estado === "pagada") reg.comisionPagada += monto;
    else reg.comisionPendiente += monto;
  });

  return Object.values(mapa).sort((a, b) => b.totalVendido - a.totalVendido);
};

// Ventas por vía en un mes concreto (para el pastel de reportes)
export const getVentasPorViaMes = async (año, mes) => {
  const mesStr = mes.toString().padStart(2, "0");
  const ultimoDia = new Date(año, mes, 0).getDate();

  const { data, error } = await supabase
    .from("ventas")
    .select("via, total")
    .gte("fecha", `${año}-${mesStr}-01`)
    .lte("fecha", `${año}-${mesStr}-${ultimoDia}T23:59:59`);

  if (error) throw error;

  const acumulado = {};
  (data || []).forEach((venta) => {
    const via = venta.via || "sin_via";
    acumulado[via] = (acumulado[via] || 0) + parseFloat(venta.total);
  });

  return Object.entries(acumulado)
    .map(([via, monto]) => ({ via, monto: Math.round(monto * 100) / 100 }))
    .sort((a, b) => b.monto - a.monto);
};

// ============================================================
// COMPORTAMIENTO DE COMPRA DE LOS CLIENTES
// ============================================================
// Analiza todas las ventas con cliente para entender quién compra,
// cada cuánto y cuánto gasta.
export const getComportamientoClientes = async (año) => {
  const { data, error } = await supabase
    .from("ventas")
    .select(
      `
      id, fecha, total, es_credito,
      cliente:clientes(id, nombre, telefono)
    `,
    )
    .not("id_cliente", "is", null)
    .order("fecha", { ascending: true });

  if (error) throw error;

  const ventas = (data || []).filter((v) => v.cliente);

  // --- Agrupar por cliente ---
  const porCliente = {};
  ventas.forEach((v) => {
    const c = v.cliente;
    if (!porCliente[c.id]) {
      porCliente[c.id] = {
        id: c.id,
        nombre: c.nombre,
        telefono: c.telefono,
        compras: 0,
        totalGastado: 0,
        primeraCompra: v.fecha,
        ultimaCompra: v.fecha,
        aCredito: 0,
      };
    }
    const reg = porCliente[c.id];
    reg.compras += 1;
    reg.totalGastado += parseFloat(v.total);
    reg.ultimaCompra = v.fecha;
    if (v.es_credito) reg.aCredito += 1;
  });

  const hoy = new Date();
  const clientes = Object.values(porCliente).map((c) => {
    const ultima = new Date(c.ultimaCompra);
    const primera = new Date(c.primeraCompra);
    const diasDesdeUltima = Math.floor((hoy - ultima) / (1000 * 60 * 60 * 24));
    // Cada cuántos días compra en promedio (solo si compró más de una vez)
    const diasEntreCompras =
      c.compras > 1
        ? Math.round(
            (ultima - primera) / (1000 * 60 * 60 * 24) / (c.compras - 1),
          )
        : null;

    return {
      ...c,
      totalGastado: Math.round(c.totalGastado * 100) / 100,
      ticketPromedio: Math.round((c.totalGastado / c.compras) * 100) / 100,
      diasDesdeUltima,
      diasEntreCompras,
      esRecurrente: c.compras > 1,
    };
  });

  // --- Top clientes por monto ---
  const topClientes = [...clientes]
    .sort((a, b) => b.totalGastado - a.totalGastado)
    .slice(0, 10);

  // --- Clientes sin comprar hace más de 90 días ---
  const inactivos = clientes
    .filter((c) => c.diasDesdeUltima > 90)
    .sort((a, b) => b.totalGastado - a.totalGastado)
    .slice(0, 15);

  // --- Nuevos vs recurrentes por mes (del año consultado) ---
  const vistos = new Set();
  const meses = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    nombre: new Date(año, i, 1).toLocaleDateString("es-EC", { month: "short" }),
    nuevos: 0,
    recurrentes: 0,
  }));

  ventas.forEach((v) => {
    const fechaVenta = new Date(v.fecha);
    const anioVenta = fechaVenta.getFullYear();
    const mesIdx = fechaVenta.getMonth();
    const esNuevo = !vistos.has(v.cliente.id);
    vistos.add(v.cliente.id);

    if (anioVenta === año) {
      if (esNuevo) meses[mesIdx].nuevos += 1;
      else meses[mesIdx].recurrentes += 1;
    }
  });

  // --- Totales generales ---
  const totalVentas = ventas.length;
  const totalMonto = ventas.reduce((s, v) => s + parseFloat(v.total), 0);
  const recurrentes = clientes.filter((c) => c.esRecurrente).length;
  const conDiasEntre = clientes.filter((c) => c.diasEntreCompras !== null);
  const frecuenciaPromedio =
    conDiasEntre.length > 0
      ? Math.round(
          conDiasEntre.reduce((s, c) => s + c.diasEntreCompras, 0) /
            conDiasEntre.length,
        )
      : null;

  return {
    resumen: {
      totalClientes: clientes.length,
      recurrentes,
      unaSolaCompra: clientes.length - recurrentes,
      ticketPromedio:
        totalVentas > 0
          ? Math.round((totalMonto / totalVentas) * 100) / 100
          : 0,
      frecuenciaPromedio,
    },
    topClientes,
    inactivos,
    nuevosVsRecurrentes: meses,
  };
};
