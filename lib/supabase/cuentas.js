import { supabase } from "./client";
import { devengarComision } from "./comisiones";

// ============================================================
// HELPERS DE FECHA
// Se construyen strings YYYY-MM-DD a mano para evitar que
// toISOString() desfase el día por zona horaria (Ecuador UTC-5).
// ============================================================

export const hoyStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Devuelve YYYY-MM-DD del día de pago en un mes dado.
// mes en base 1 (1 = enero). Si el día no existe (31 en febrero), usa el último del mes.
export const fechaVencimiento = (anio, mes, diaPago) => {
  const ultimoDia = new Date(anio, mes, 0).getDate();
  const dia = Math.min(diaPago, ultimoDia);
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
};

// Suma meses a un par (anio, mes base 1) y devuelve el nuevo par
export const sumarMeses = (anio, mes, cantidad) => {
  const total = mes - 1 + cantidad;
  return {
    anio: anio + Math.floor(total / 12),
    mes: (((total % 12) + 12) % 12) + 1,
  };
};

// Compara dos periodos: negativo si a < b
const compararPeriodos = (a, b) => a.anio * 12 + a.mes - (b.anio * 12 + b.mes);

const redondear = (n) => Math.round(n * 100) / 100;

// ============================================================
// CONSULTAS
// ============================================================

// Todas las cuentas con datos del cliente
export const getCuentas = async (estado = "activa") => {
  let query = supabase
    .from("cuentas")
    .select(
      `
      *,
      cliente:clientes(id, nombre, telefono, cedula)
    `,
    )
    .order("saldo", { ascending: false });

  if (estado) query = query.eq("estado", estado);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

// Cuenta de un cliente (null si no tiene)
export const getCuentaPorCliente = async (idCliente) => {
  const { data, error } = await supabase
    .from("cuentas")
    .select("*")
    .eq("id_cliente", idCliente)
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const getCuentaById = async (id) => {
  const { data, error } = await supabase
    .from("cuentas")
    .select(`*, cliente:clientes(id, nombre, telefono, cedula, email)`)
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
};

// Movimientos de una cuenta (estado de cuenta)
export const getMovimientos = async (idCuenta) => {
  const { data, error } = await supabase
    .from("cuenta_movimientos")
    .select("*")
    .eq("id_cuenta", idCuenta)
    .order("fecha", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
};

// Periodos (control mes a mes) de una cuenta
export const getPeriodos = async (idCuenta) => {
  const { data, error } = await supabase
    .from("cuenta_periodos")
    .select("*")
    .eq("id_cuenta", idCuenta)
    .order("anio", { ascending: false })
    .order("mes", { ascending: false });

  if (error) throw error;
  return data || [];
};

// Historial de cambios de cuota
export const getHistorialCuotas = async (idCuenta) => {
  const { data, error } = await supabase
    .from("cuenta_cuotas_historial")
    .select("*")
    .eq("id_cuenta", idCuenta)
    .order("fecha_cambio", { ascending: false });

  if (error) throw error;
  return data || [];
};

// ============================================================
// APERTURA DE CUENTA
// ============================================================

export const abrirCuenta = async ({
  id_cliente,
  cuota_mensual,
  dia_pago,
  fecha_primer_pago,
  saldo_inicial = 0,
  fecha_saldo_inicial = null,
  concepto_inicial = "Saldo inicial",
  notas = null,
}) => {
  // Validación de seguridad: un error de tipeo en el año (ej. "0226"
  // en vez de "2026") generaría cientos de meses con fechas absurdas.
  // Se rechaza de una vez en vez de dejar que el sistema lo arrastre.
  const anioPrimerPago = parseInt(fecha_primer_pago?.split("-")[0], 10);
  const anioActual = new Date().getFullYear();
  if (!anioPrimerPago || Math.abs(anioPrimerPago - anioActual) > 3) {
    throw new Error(
      `La fecha del primer pago (${fecha_primer_pago}) tiene un año que no parece correcto. Verifícala antes de continuar.`,
    );
  }

  const saldo = redondear(parseFloat(saldo_inicial) || 0);

  const { data: cuenta, error } = await supabase
    .from("cuentas")
    .insert([
      {
        id_cliente,
        saldo,
        cuota_mensual: redondear(parseFloat(cuota_mensual) || 0),
        dia_pago: parseInt(dia_pago) || 1,
        fecha_primer_pago,
        fecha_apertura: fecha_saldo_inicial || hoyStr(),
        estado: "activa",
        notas,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ])
    .select()
    .single();

  if (error) throw error;

  // Si arranca con saldo, dejar constancia como primer movimiento
  if (saldo > 0) {
    const { error: movError } = await supabase
      .from("cuenta_movimientos")
      .insert([
        {
          id_cuenta: cuenta.id,
          fecha: fecha_saldo_inicial || hoyStr(),
          tipo: "saldo_inicial",
          concepto: concepto_inicial,
          monto: saldo,
          saldo_resultante: saldo,
          created_at: new Date().toISOString(),
        },
      ]);
    if (movError) throw movError;
  }

  return cuenta;
};

// ============================================================
// RECÁLCULO DEL SALDO
// El saldo de cada línea depende del orden de las fechas, no del
// orden en que se registró. Esto recorre todos los movimientos en
// orden cronológico y deja el saldo de cada uno y el de la cuenta
// correctamente encadenados.
// ============================================================

export const recalcularSaldos = async (idCuenta) => {
  const { data: movs, error } = await supabase
    .from("cuenta_movimientos")
    .select("id, fecha, tipo, monto, saldo_resultante")
    .eq("id_cuenta", idCuenta)
    .order("fecha", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  let acumulado = 0;

  for (const mov of movs || []) {
    const monto = parseFloat(mov.monto) || 0;
    acumulado =
      mov.tipo === "abono"
        ? redondear(acumulado - monto)
        : redondear(acumulado + monto);

    // Solo tocar la fila si el valor guardado quedó desactualizado
    if (redondear(parseFloat(mov.saldo_resultante)) !== acumulado) {
      const { error: updError } = await supabase
        .from("cuenta_movimientos")
        .update({ saldo_resultante: acumulado })
        .eq("id", mov.id);
      if (updError) throw updError;
    }
  }

  // El saldo de la cuenta es el del último movimiento
  const { error: cuentaError } = await supabase
    .from("cuentas")
    .update({ saldo: acumulado, updated_at: new Date().toISOString() })
    .eq("id", idCuenta);

  if (cuentaError) throw cuentaError;

  return acumulado;
};

// ============================================================
// CARGOS (compras a crédito y ajustes que suben el saldo)
// ============================================================

export const agregarCargo = async (
  idCuenta,
  { fecha, concepto, monto, id_venta = null, notas = null },
) => {
  const { data: cuenta, error: cuentaError } = await supabase
    .from("cuentas")
    .select("saldo")
    .eq("id", idCuenta)
    .single();

  if (cuentaError) throw cuentaError;

  const montoNum = redondear(parseFloat(monto) || 0);
  const nuevoSaldo = redondear(parseFloat(cuenta.saldo) + montoNum);

  const { error: movError } = await supabase.from("cuenta_movimientos").insert([
    {
      id_cuenta: idCuenta,
      fecha: fecha || hoyStr(),
      tipo: "cargo",
      concepto,
      monto: montoNum,
      saldo_resultante: nuevoSaldo,
      id_venta,
      notas,
      created_at: new Date().toISOString(),
    },
  ]);

  if (movError) throw movError;

  // El saldo real depende del orden cronológico de los movimientos
  const saldoFinal = await recalcularSaldos(idCuenta);

  return saldoFinal;
};

// Suma una venta a crédito a la cuenta del cliente.
// Si el cliente no tiene cuenta, la abre con los datos que se pasen.
export const cargarVentaACuenta = async ({
  id_cliente,
  id_venta,
  monto,
  concepto,
  fecha = null,
  datosNuevaCuenta = null,
}) => {
  let cuenta = await getCuentaPorCliente(id_cliente);

  if (!cuenta) {
    if (!datosNuevaCuenta) {
      throw new Error(
        "El cliente no tiene cuenta abierta y no se enviaron los datos para crearla",
      );
    }
    cuenta = await abrirCuenta({
      id_cliente,
      cuota_mensual: datosNuevaCuenta.cuota_mensual,
      dia_pago: datosNuevaCuenta.dia_pago,
      fecha_primer_pago: datosNuevaCuenta.fecha_primer_pago,
      saldo_inicial: 0,
    });
  }

  await agregarCargo(cuenta.id, {
    fecha: fecha || hoyStr(),
    concepto,
    monto,
    id_venta,
  });

  return cuenta;
};

// ============================================================
// PERIODOS: generación automática mes a mes
// ============================================================

// Crea los periodos que falten desde el primer pago hasta el mes actual.
// Se llama al entrar a las pantallas de cuentas.
export const generarPeriodosPendientes = async (idCuenta) => {
  const { data: cuenta, error: cuentaError } = await supabase
    .from("cuentas")
    .select("*")
    .eq("id", idCuenta)
    .single();

  if (cuentaError) throw cuentaError;
  if (cuenta.estado !== "activa") return [];

  const { data: periodos, error: perError } = await supabase
    .from("cuenta_periodos")
    .select("*")
    .eq("id_cuenta", idCuenta);

  if (perError) throw perError;

  const existentes = new Set((periodos || []).map((p) => `${p.anio}-${p.mes}`));

  // Cuánto queda realmente por cobrar, descontando lo que ya está
  // comprometido en meses pendientes, parciales o en mora que ya existen.
  // "Mora" también es deuda real sin cubrir, no se puede ignorar aquí.
  const yaComprometido = (periodos || [])
    .filter((p) => ["pendiente", "parcial", "mora"].includes(p.estado))
    .reduce(
      (sum, p) =>
        sum + (parseFloat(p.monto_esperado) - parseFloat(p.monto_pagado)),
      0,
    );
  let saldoDisponible = redondear(
    Math.max(0, parseFloat(cuenta.saldo) - yaComprometido),
  );

  // Desde el primer pago acordado
  const [anioIni, mesIni] = cuenta.fecha_primer_pago.split("-").map(Number);
  // Se genera hasta el mes siguiente al actual, para poder ajustar por adelantado
  // (por ejemplo aplazar la cuota del próximo mes antes de que venza)
  const ahora = new Date();
  const limite = sumarMeses(ahora.getFullYear(), ahora.getMonth() + 1, 1);

  // Segunda capa de seguridad: si por algún motivo la fecha guardada tiene
  // un año absurdo (ej. un error de tipeo hecho directo en la base de datos),
  // no se genera nada en vez de recorrer cientos de meses de basura.
  if (Math.abs(anioIni - ahora.getFullYear()) > 5) {
    console.error(
      `Cuenta ${idCuenta}: fecha_primer_pago tiene un año fuera de rango (${cuenta.fecha_primer_pago}). No se generaron periodos.`,
    );
    return [];
  }

  let cursor = { anio: anioIni, mes: mesIni };
  const nuevos = [];
  let guardas = 0;

  while (compararPeriodos(cursor, limite) <= 0 && guardas < 240) {
    guardas++;
    const clave = `${cursor.anio}-${cursor.mes}`;

    if (!existentes.has(clave)) {
      // Si ya no queda saldo por cobrar, no se generan más meses:
      // no tiene sentido esperar un pago si el cliente no debe nada.
      if (saldoDisponible <= 0) {
        cursor = sumarMeses(cursor.anio, cursor.mes, 1);
        continue;
      }

      const cuotaBase = redondear(parseFloat(cuenta.cuota_mensual) || 0);
      const cuota = redondear(Math.min(cuotaBase, saldoDisponible));
      saldoDisponible = redondear(saldoDisponible - cuota);

      nuevos.push({
        id_cuenta: idCuenta,
        anio: cursor.anio,
        mes: cursor.mes,
        fecha_vencimiento: fechaVencimiento(
          cursor.anio,
          cursor.mes,
          cuenta.dia_pago,
        ),
        monto_cuota: cuota,
        monto_arrastre: 0,
        monto_recargo: 0,
        monto_esperado: cuota,
        monto_pagado: 0,
        estado: "pendiente",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    cursor = sumarMeses(cursor.anio, cursor.mes, 1);
  }

  if (nuevos.length > 0) {
    const { error: insError } = await supabase
      .from("cuenta_periodos")
      .insert(nuevos);
    if (insError) throw insError;
  }

  // Marcar en mora los periodos vencidos que quedaron sin cubrirse
  await marcarMoras(idCuenta);

  return nuevos;
};

// Pasa a 'mora' los periodos ya vencidos que siguen pendientes o parciales
const marcarMoras = async (idCuenta) => {
  const hoy = hoyStr();

  const { data: vencidos, error } = await supabase
    .from("cuenta_periodos")
    .select("id, monto_esperado, monto_pagado, estado")
    .eq("id_cuenta", idCuenta)
    .lt("fecha_vencimiento", hoy)
    .in("estado", ["pendiente", "parcial"]);

  if (error) throw error;

  for (const p of vencidos || []) {
    if (parseFloat(p.monto_pagado) < parseFloat(p.monto_esperado)) {
      await supabase
        .from("cuenta_periodos")
        .update({ estado: "mora", updated_at: new Date().toISOString() })
        .eq("id", p.id);
    }
  }
};

// Asegura que exista un periodo concreto (usado al ajustar meses futuros)
const asegurarPeriodo = async (cuenta, anio, mes) => {
  const { data: existente } = await supabase
    .from("cuenta_periodos")
    .select("*")
    .eq("id_cuenta", cuenta.id)
    .eq("anio", anio)
    .eq("mes", mes)
    .maybeSingle();

  if (existente) return existente;

  const cuota = redondear(parseFloat(cuenta.cuota_mensual) || 0);
  const { data: creado, error } = await supabase
    .from("cuenta_periodos")
    .insert([
      {
        id_cuenta: cuenta.id,
        anio,
        mes,
        fecha_vencimiento: fechaVencimiento(anio, mes, cuenta.dia_pago),
        monto_cuota: cuota,
        monto_arrastre: 0,
        monto_recargo: 0,
        monto_esperado: cuota,
        monto_pagado: 0,
        estado: "pendiente",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return creado;
};

// ============================================================
// AJUSTES DEL MES (las tres opciones que autoriza la dueña)
// ============================================================

// aplazar: el monto del mes pasa completo al mes siguiente
// diferir: el monto se reparte entre los meses que faltan
// gracia:  el mes no se cobra y no se arrastra nada
export const ajustarPeriodo = async (idPeriodo, accion, notas = null) => {
  const { data: periodo, error: perError } = await supabase
    .from("cuenta_periodos")
    .select("*")
    .eq("id", idPeriodo)
    .single();

  if (perError) throw perError;

  const { data: cuenta, error: cuentaError } = await supabase
    .from("cuentas")
    .select("*")
    .eq("id", periodo.id_cuenta)
    .single();

  if (cuentaError) throw cuentaError;

  // Lo que queda sin cubrir de ese mes
  const pendiente = redondear(
    parseFloat(periodo.monto_esperado) - parseFloat(periodo.monto_pagado),
  );

  if (pendiente <= 0) {
    throw new Error("Este mes ya está cubierto, no hay nada que ajustar");
  }

  if (accion === "aplazar") {
    const siguiente = sumarMeses(periodo.anio, periodo.mes, 1);
    const perSiguiente = await asegurarPeriodo(
      cuenta,
      siguiente.anio,
      siguiente.mes,
    );

    const nuevoArrastre = redondear(
      parseFloat(perSiguiente.monto_arrastre) + pendiente,
    );
    const nuevoEsperado = redondear(
      parseFloat(perSiguiente.monto_cuota) +
        nuevoArrastre +
        parseFloat(perSiguiente.monto_recargo),
    );

    await supabase
      .from("cuenta_periodos")
      .update({
        monto_arrastre: nuevoArrastre,
        monto_esperado: nuevoEsperado,
        updated_at: new Date().toISOString(),
      })
      .eq("id", perSiguiente.id);
  } else if (accion === "diferir") {
    // Repartir entre los meses que faltan según el saldo del momento
    const cuota = parseFloat(cuenta.cuota_mensual) || 0;
    const saldo = parseFloat(cuenta.saldo) || 0;
    const mesesRestantes = Math.max(
      1,
      Math.ceil(saldo / (cuota || saldo || 1)),
    );
    const porMes = redondear(pendiente / mesesRestantes);

    for (let i = 1; i <= mesesRestantes; i++) {
      const destino = sumarMeses(periodo.anio, periodo.mes, i);
      const perDestino = await asegurarPeriodo(
        cuenta,
        destino.anio,
        destino.mes,
      );

      const nuevoRecargo = redondear(
        parseFloat(perDestino.monto_recargo) + porMes,
      );
      const nuevoEsperado = redondear(
        parseFloat(perDestino.monto_cuota) +
          parseFloat(perDestino.monto_arrastre) +
          nuevoRecargo,
      );

      await supabase
        .from("cuenta_periodos")
        .update({
          monto_recargo: nuevoRecargo,
          monto_esperado: nuevoEsperado,
          updated_at: new Date().toISOString(),
        })
        .eq("id", perDestino.id);
    }
  } else if (accion !== "gracia") {
    throw new Error("Acción no válida");
  }

  // Cerrar el mes ajustado
  const estadoFinal =
    accion === "aplazar"
      ? "aplazado"
      : accion === "diferir"
        ? "diferido"
        : "gracia";

  const { error: updError } = await supabase
    .from("cuenta_periodos")
    .update({
      estado: estadoFinal,
      notas,
      updated_at: new Date().toISOString(),
    })
    .eq("id", idPeriodo);

  if (updError) throw updError;

  return estadoFinal;
};

// ============================================================
// PAGOS
// ============================================================

// Registra un pago: baja el saldo y lo aplica a los meses pendientes
// empezando por el más antiguo.
// Aplica un monto a los meses pendientes de una cuenta, del más viejo al
// más nuevo. La usa tanto registrarPago (pago nuevo) como
// recalcularAplicacionPagos (al editar el monto de un pago ya existente).
const aplicarMontoAPeriodos = async (idCuenta, monto) => {
  const { data: pendientes, error: penError } = await supabase
    .from("cuenta_periodos")
    .select("*")
    .eq("id_cuenta", idCuenta)
    .in("estado", ["pendiente", "parcial", "mora"])
    .order("anio", { ascending: true })
    .order("mes", { ascending: true });

  if (penError) throw penError;

  let restante = monto;

  for (const periodo of pendientes || []) {
    if (restante <= 0) break;

    const falta = redondear(
      parseFloat(periodo.monto_esperado) - parseFloat(periodo.monto_pagado),
    );
    if (falta <= 0) continue;

    const aplicar = Math.min(restante, falta);
    const pagadoTotal = redondear(parseFloat(periodo.monto_pagado) + aplicar);
    const cubierto = pagadoTotal >= parseFloat(periodo.monto_esperado);

    await supabase
      .from("cuenta_periodos")
      .update({
        monto_pagado: pagadoTotal,
        estado: cubierto ? "pagado" : "parcial",
        updated_at: new Date().toISOString(),
      })
      .eq("id", periodo.id);

    restante = redondear(restante - aplicar);
  }

  return restante;
};

export const registrarPago = async (
  idCuenta,
  { monto, fecha = null, notas = null },
) => {
  const { data: cuenta, error: cuentaError } = await supabase
    .from("cuentas")
    .select("*")
    .eq("id", idCuenta)
    .single();

  if (cuentaError) throw cuentaError;

  const montoNum = redondear(parseFloat(monto) || 0);
  if (montoNum <= 0) throw new Error("El monto debe ser mayor a cero");

  const fechaPago = fecha || hoyStr();
  const nuevoSaldo = redondear(parseFloat(cuenta.saldo) - montoNum);

  // 1. Movimiento
  const { data: movInsertado, error: movError } = await supabase
    .from("cuenta_movimientos")
    .insert([
      {
        id_cuenta: idCuenta,
        fecha: fechaPago,
        tipo: "abono",
        concepto: "Pago recibido",
        monto: montoNum,
        saldo_resultante: nuevoSaldo,
        notas,
        created_at: new Date().toISOString(),
      },
    ])
    .select()
    .single();

  if (movError) throw movError;

  // Generar comisión para la distribuidora del cliente (si tiene)
  try {
    await devengarComision({
      id_cliente: cuenta.id_cliente,
      base: montoNum,
      fecha: fechaPago,
      id_movimiento: movInsertado.id,
      concepto: "Pago de crédito",
    });
  } catch (e) {
    console.error("No se pudo generar la comisión del pago:", e);
  }

  // 2. Recalcular el saldo siguiendo el orden de fechas
  const saldoFinal = await recalcularSaldos(idCuenta);

  // 3. Aplicar a los meses pendientes, del más viejo al más nuevo
  const restante = await aplicarMontoAPeriodos(idCuenta, montoNum);

  return { nuevoSaldo: saldoFinal, sobrante: restante };
};

// Recalcula desde cero cómo quedan aplicados TODOS los pagos de una
// cuenta a sus meses. Se usa cuando se edita el monto de un pago ya
// existente: en vez de intentar "deshacer solo ese pago" (imposible de
// saber con precisión si ya se mezcló con otros pagos en el mismo mes),
// se resetea la aplicación y se vuelve a construir desde la fuente real
// (los pagos, en orden de fecha).
//
// Protegido a propósito: nunca toca meses en un estado puesto a mano
// (aplazado / diferido / gracia) - esos son decisiones de negocio, no
// resultado de pagos.
export const recalcularAplicacionPagos = async (idCuenta) => {
  const { data: periodos, error: perError } = await supabase
    .from("cuenta_periodos")
    .select("id, estado")
    .eq("id_cuenta", idCuenta);

  if (perError) throw perError;

  const estadosPagables = ["pendiente", "parcial", "pagado", "mora"];
  const idsAResetear = (periodos || [])
    .filter((p) => estadosPagables.includes(p.estado))
    .map((p) => p.id);

  if (idsAResetear.length > 0) {
    const { error: resetError } = await supabase
      .from("cuenta_periodos")
      .update({ monto_pagado: 0, estado: "pendiente" })
      .in("id", idsAResetear);

    if (resetError) throw resetError;
  }

  const { data: pagos, error: pagosError } = await supabase
    .from("cuenta_movimientos")
    .select("monto")
    .eq("id_cuenta", idCuenta)
    .eq("tipo", "abono")
    .eq("concepto", "Pago recibido")
    .order("fecha", { ascending: true })
    .order("created_at", { ascending: true });

  if (pagosError) throw pagosError;

  for (const pago of pagos || []) {
    await aplicarMontoAPeriodos(idCuenta, parseFloat(pago.monto));
  }
};

// Corrige solo la fecha de un pago ya registrado (ej. si se ingresó con
// la fecha de hoy en vez de la fecha real en que se recibió el dinero).
// El monto y a qué meses se aplicó NO cambian - solo cuándo se registra
// que ocurrió. Después de mover la fecha, se recalculan los saldos en
// cadena para que el orden cronológico quede correcto de nuevo.
export const editarFechaPago = async (idMovimiento, nuevaFecha) => {
  const { data: mov, error: movError } = await supabase
    .from("cuenta_movimientos")
    .select("id, id_cuenta, tipo")
    .eq("id", idMovimiento)
    .single();

  if (movError) throw movError;
  if (mov.tipo !== "abono") {
    throw new Error("Solo se puede corregir la fecha de un pago (abono)");
  }

  const { error: updError } = await supabase
    .from("cuenta_movimientos")
    .update({ fecha: nuevaFecha })
    .eq("id", idMovimiento);

  if (updError) throw updError;

  // Si este pago generó una comisión, mover su fecha también para que
  // no quede reportada en un mes distinto al del pago real.
  const { error: comError } = await supabase
    .from("comisiones")
    .update({ fecha: nuevaFecha })
    .eq("id_movimiento", idMovimiento);

  if (comError) throw comError;

  const nuevoSaldo = await recalcularSaldos(mov.id_cuenta);
  return nuevoSaldo;
};

// Corrige el monto de un pago ya registrado. A diferencia de la fecha,
// esto sí puede afectar a qué meses quedó aplicado el pago - por eso se
// recalcula toda la aplicación de pagos de la cuenta desde cero después
// del cambio (ver recalcularAplicacionPagos).
//
// Si el pago generó una comisión que TODAVÍA no se le ha pagado a la
// distribuidora, se recalcula con el mismo porcentaje que ya se había
// usado. Si la comisión YA se pagó, no se toca - el dinero ya se movió
// con el monto viejo, y ese ajuste debe decidirlo una persona, no el
// sistema en automático. En ese caso se avisa para que se revise a mano.
export const editarMontoPago = async (idMovimiento, nuevoMonto) => {
  const { data: mov, error: movError } = await supabase
    .from("cuenta_movimientos")
    .select("id, id_cuenta, tipo, concepto")
    .eq("id", idMovimiento)
    .single();

  if (movError) throw movError;
  if (mov.tipo !== "abono" || mov.concepto !== "Pago recibido") {
    throw new Error("Solo se puede corregir el monto de un pago registrado");
  }

  const montoNum = redondear(parseFloat(nuevoMonto) || 0);
  if (montoNum <= 0) throw new Error("El monto debe ser mayor a cero");

  const { error: updError } = await supabase
    .from("cuenta_movimientos")
    .update({ monto: montoNum })
    .eq("id", idMovimiento);

  if (updError) throw updError;

  let avisoComisionPagada = false;

  const { data: comision, error: comError } = await supabase
    .from("comisiones")
    .select("id, base, monto, estado")
    .eq("id_movimiento", idMovimiento)
    .maybeSingle();

  if (comError) throw comError;

  if (comision) {
    if (comision.estado === "pagada") {
      avisoComisionPagada = true;
    } else {
      const porcentajeUsado =
        parseFloat(comision.base) > 0
          ? (parseFloat(comision.monto) / parseFloat(comision.base)) * 100
          : 0;
      const nuevoMontoComision = redondear((montoNum * porcentajeUsado) / 100);

      const { error: comUpdError } = await supabase
        .from("comisiones")
        .update({ base: montoNum, monto: nuevoMontoComision })
        .eq("id", comision.id);

      if (comUpdError) throw comUpdError;
    }
  }

  await recalcularAplicacionPagos(mov.id_cuenta);
  const nuevoSaldo = await recalcularSaldos(mov.id_cuenta);

  return { nuevoSaldo, avisoComisionPagada };
};

// ============================================================
// AJUSTE DE CUOTA
// ============================================================

export const ajustarCuota = async (idCuenta, nuevaCuota, notas = null) => {
  const { data: cuenta, error: cuentaError } = await supabase
    .from("cuentas")
    .select("cuota_mensual")
    .eq("id", idCuenta)
    .single();

  if (cuentaError) throw cuentaError;

  const cuotaNueva = redondear(parseFloat(nuevaCuota) || 0);
  const cuotaAnterior = redondear(parseFloat(cuenta.cuota_mensual) || 0);

  if (cuotaNueva === cuotaAnterior) return cuenta;

  const { error: histError } = await supabase
    .from("cuenta_cuotas_historial")
    .insert([
      {
        id_cuenta: idCuenta,
        cuota_anterior: cuotaAnterior,
        cuota_nueva: cuotaNueva,
        fecha_cambio: hoyStr(),
        notas,
        created_at: new Date().toISOString(),
      },
    ]);

  if (histError) throw histError;

  const { error: updError } = await supabase
    .from("cuentas")
    .update({
      cuota_mensual: cuotaNueva,
      updated_at: new Date().toISOString(),
    })
    .eq("id", idCuenta);

  if (updError) throw updError;

  // Actualizar los meses aún no resueltos con la cuota nueva
  const { data: futuros } = await supabase
    .from("cuenta_periodos")
    .select("*")
    .eq("id_cuenta", idCuenta)
    .in("estado", ["pendiente", "parcial"]);

  for (const p of futuros || []) {
    const nuevoEsperado = redondear(
      cuotaNueva + parseFloat(p.monto_arrastre) + parseFloat(p.monto_recargo),
    );
    await supabase
      .from("cuenta_periodos")
      .update({
        monto_cuota: cuotaNueva,
        monto_esperado: nuevoEsperado,
        updated_at: new Date().toISOString(),
      })
      .eq("id", p.id);
  }

  return true;
};

// ============================================================
// DATOS DE LA CUENTA (edición y movimientos manuales)
// ============================================================

export const actualizarDatosCuenta = async (idCuenta, datos) => {
  const { error } = await supabase
    .from("cuentas")
    .update({
      dia_pago: parseInt(datos.dia_pago) || 1,
      fecha_primer_pago: datos.fecha_primer_pago,
      notas: datos.notas || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", idCuenta);

  if (error) throw error;
  return true;
};

// Movimiento manual: sirve para cargar historial viejo o corregir
export const agregarMovimientoManual = async (
  idCuenta,
  { fecha, tipo, concepto, monto, notas = null },
) => {
  if (tipo === "cargo") {
    return await agregarCargo(idCuenta, { fecha, concepto, monto, notas });
  }
  // Abono manual: baja saldo pero sin tocar los periodos
  const { data: cuenta, error: cuentaError } = await supabase
    .from("cuentas")
    .select("saldo")
    .eq("id", idCuenta)
    .single();

  if (cuentaError) throw cuentaError;

  const montoNum = redondear(parseFloat(monto) || 0);
  const nuevoSaldo = redondear(parseFloat(cuenta.saldo) - montoNum);

  const { error: movError } = await supabase.from("cuenta_movimientos").insert([
    {
      id_cuenta: idCuenta,
      fecha: fecha || hoyStr(),
      tipo: "abono",
      concepto,
      monto: montoNum,
      saldo_resultante: nuevoSaldo,
      notas,
      created_at: new Date().toISOString(),
    },
  ]);

  if (movError) throw movError;

  // El saldo real depende del orden cronológico
  return await recalcularSaldos(idCuenta);
};

// Corrige un movimiento genuinamente manual (fecha, concepto y/o monto).
// Protegido a propósito: nunca debe usarse sobre un pago real ni sobre
// el cargo que generó una venta, porque esos disparan cosas adicionales
// (aplicación a meses pendientes, comisión) que este camino simple no
// contempla. Esos se corrigen con sus propias funciones dedicadas.
export const editarMovimientoManual = async (
  idMovimiento,
  { fecha, concepto, monto },
) => {
  const { data: mov, error: movError } = await supabase
    .from("cuenta_movimientos")
    .select("id, id_cuenta, tipo, concepto, id_venta")
    .eq("id", idMovimiento)
    .single();

  if (movError) throw movError;

  if (mov.id_venta) {
    throw new Error(
      "Este movimiento pertenece a una venta, no se puede editar aquí",
    );
  }
  if (mov.tipo === "abono" && mov.concepto === "Pago recibido") {
    throw new Error("Este es un pago registrado, no se puede editar aquí");
  }

  const montoNum = redondear(parseFloat(monto) || 0);
  if (montoNum <= 0) throw new Error("El monto debe ser mayor a cero");
  if (!concepto?.trim()) throw new Error("El concepto es obligatorio");

  const { error: updError } = await supabase
    .from("cuenta_movimientos")
    .update({ fecha, concepto: concepto.trim(), monto: montoNum })
    .eq("id", idMovimiento);

  if (updError) throw updError;

  return await recalcularSaldos(mov.id_cuenta);
};

export const cerrarCuenta = async (idCuenta, cerrar = true) => {
  const { error } = await supabase
    .from("cuentas")
    .update({
      estado: cerrar ? "cerrada" : "activa",
      updated_at: new Date().toISOString(),
    })
    .eq("id", idCuenta);

  if (error) throw error;
  return true;
};

// ============================================================
// COBROS DEL MES (vista principal con semáforo)
// ============================================================

// Devuelve, para el mes indicado, qué se espera de cada cuenta y su estado.
export const getCobrosDelMes = async (anio, mes) => {
  // Asegurar que los periodos del mes existan (solo para el mes en curso)
  const ahora = new Date();
  const esMesActual =
    anio === ahora.getFullYear() && mes === ahora.getMonth() + 1;

  if (esMesActual) {
    const cuentasActivas = await getCuentas("activa");
    // En paralelo en vez de una por una: con muchas cuentas activas,
    // hacerlo en fila se sentía notoriamente lento al cargar la pantalla.
    await Promise.all(
      cuentasActivas.map((c) =>
        generarPeriodosPendientes(c.id).catch((e) =>
          console.error(`Error generando periodos de la cuenta ${c.id}:`, e),
        ),
      ),
    );
  }

  const { data, error } = await supabase
    .from("cuenta_periodos")
    .select(
      `
      *,
      cuenta:cuentas(
        id, saldo, cuota_mensual, dia_pago, estado,
        cliente:clientes(id, nombre, telefono)
      )
    `,
    )
    .eq("anio", anio)
    .eq("mes", mes)
    .order("fecha_vencimiento", { ascending: true });

  if (error) throw error;

  return (data || []).filter((p) => p.cuenta && p.cuenta.estado === "activa");
};

// Color del semáforo según la fecha de vencimiento y el estado
// verde: falta más de 7 días | amarillo: 1 a 7 días
// rojo: vence hoy | negro: vencido sin cubrir
// pagado / ajustado tienen su propio color
export const calcularSemaforo = (periodo) => {
  const estado = periodo.estado;

  if (estado === "pagado") return "pagado";
  if (estado === "aplazado") return "aplazado";
  if (estado === "diferido") return "diferido";
  if (estado === "gracia") return "gracia";

  // Días transcurridos desde la fecha de pago (negativo = aún no vence)
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const [a, m, d] = periodo.fecha_vencimiento.split("-").map(Number);
  const venc = new Date(a, m - 1, d);
  const diasAtraso = Math.round((hoy - venc) / (1000 * 60 * 60 * 24));

  // Escala acordada con la clienta:
  // verde hasta 21 días de atraso, amarillo hasta 32, rojo hasta 91,
  // negro a partir de ahí
  if (diasAtraso <= 21) return "verde";
  if (diasAtraso <= 32) return "amarillo";
  if (diasAtraso <= 91) return "rojo";
  return "negro";
};

// Días de atraso de un periodo (para mostrarlo en pantalla)
export const diasDeAtraso = (periodo) => {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const [a, m, d] = periodo.fecha_vencimiento.split("-").map(Number);
  const venc = new Date(a, m - 1, d);
  return Math.round((hoy - venc) / (1000 * 60 * 60 * 24));
};

// Totales del mes para el encabezado
export const resumenCobrosMes = (periodos) => {
  let esperado = 0;
  let cobrado = 0;
  let enMora = 0;

  periodos.forEach((p) => {
    const esp = parseFloat(p.monto_esperado) || 0;
    const pag = parseFloat(p.monto_pagado) || 0;
    if (!["aplazado", "diferido", "gracia"].includes(p.estado)) {
      esperado += esp;
    }
    cobrado += pag;
    if (p.estado === "mora") enMora += esp - pag;
  });

  return {
    esperado: redondear(esperado),
    cobrado: redondear(cobrado),
    porCobrar: redondear(Math.max(0, esperado - cobrado)),
    enMora: redondear(enMora),
  };
};

// ============================================================
// TOTALES GLOBALES (dashboard y reportes)
// ============================================================

export const getTotalesCuentas = async () => {
  const { data, error } = await supabase
    .from("cuentas")
    .select("saldo, estado")
    .eq("estado", "activa");

  if (error) throw error;

  const conSaldo = (data || []).filter((c) => parseFloat(c.saldo) > 0);
  const totalPendiente = conSaldo.reduce(
    (sum, c) => sum + parseFloat(c.saldo),
    0,
  );

  return {
    cuentasActivas: conSaldo.length,
    totalPendiente: redondear(totalPendiente),
  };
};

// Cobros por mes en un año (para reportes)
export const getCobrosPorMes = async (anio) => {
  const { data, error } = await supabase
    .from("cuenta_movimientos")
    .select("monto, fecha, tipo")
    .eq("tipo", "abono")
    .gte("fecha", `${anio}-01-01`)
    .lte("fecha", `${anio}-12-31`);

  if (error) throw error;

  const meses = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    nombre: new Date(anio, i, 1).toLocaleDateString("es-EC", {
      month: "short",
    }),
    cobrado: 0,
  }));

  (data || []).forEach((mov) => {
    const mesIdx = parseInt(mov.fecha.split("-")[1], 10) - 1;
    if (mesIdx >= 0 && mesIdx < 12) {
      meses[mesIdx].cobrado += parseFloat(mov.monto);
    }
  });

  meses.forEach((m) => (m.cobrado = redondear(m.cobrado)));
  return meses;
};
