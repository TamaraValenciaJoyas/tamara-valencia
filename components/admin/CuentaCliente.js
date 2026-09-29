"use client";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCuentaPorCliente,
  getMovimientos,
  getPeriodos,
  getHistorialCuotas,
  abrirCuenta,
  registrarPago,
  editarFechaPago,
  editarMontoPago,
  ajustarCuota,
  ajustarPeriodo,
  agregarMovimientoManual,
  editarMovimientoManual,
  generarPeriodosPendientes,
  recalcularSaldos,
  calcularSemaforo,
  hoyStr,
} from "@/lib/supabase/cuentas";
import { descargarEstadoCuenta } from "@/lib/pdf/estadoCuenta";
import { getDescuentosDeVentas } from "@/lib/supabase/ventas";
import { formatPrice } from "@/utils/formatters";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const ESTADO_PERIODO = {
  pendiente: { texto: "Pendiente", cls: "bg-gray-100 text-gray-700" },
  pagado: { texto: "Pagado", cls: "bg-green-100 text-green-800" },
  parcial: { texto: "Parcial", cls: "bg-yellow-100 text-yellow-800" },
  mora: { texto: "En mora", cls: "bg-gray-900 text-white" },
  aplazado: { texto: "Aplazado", cls: "bg-blue-100 text-blue-800" },
  diferido: { texto: "Diferido", cls: "bg-purple-100 text-purple-800" },
  gracia: { texto: "Gracia", cls: "bg-gray-100 text-gray-600" },
};

const TIPO_MOV = {
  cargo: { texto: "Compra", cls: "text-gray-900" },
  abono: { texto: "Pago", cls: "text-green-700" },
  saldo_inicial: { texto: "Saldo inicial", cls: "text-gray-900" },
};

const limitarDecimales = (valor) => {
  if (valor === "") return valor;
  return /^\d*\.?\d{0,2}$/.test(valor) ? valor : valor.slice(0, -1);
};

export default function CuentaCliente({ cliente }) {
  const queryClient = useQueryClient();
  const [procesando, setProcesando] = useState(false);

  const [modal, setModal] = useState(null); // 'pago' | 'cuota' | 'movimiento' | 'ajuste'
  const [periodoAjustar, setPeriodoAjustar] = useState(null);

  const [formApertura, setFormApertura] = useState({
    cuota_mensual: "",
    dia_pago: "1",
    fecha_primer_pago: "",
    saldo_inicial: "",
    fecha_saldo_inicial: "",
  });
  const [formPago, setFormPago] = useState({
    monto: "",
    fecha: hoyStr(),
    notas: "",
  });
  const [editandoFechaPago, setEditandoFechaPago] = useState(null);
  const [nuevaFechaPago, setNuevaFechaPago] = useState("");
  const [nuevoMontoPago, setNuevoMontoPago] = useState("");
  const [guardandoFechaPago, setGuardandoFechaPago] = useState(false);
  const [editandoMovManual, setEditandoMovManual] = useState(null);
  const [formEditarMov, setFormEditarMov] = useState({
    fecha: "",
    concepto: "",
    monto: "",
  });
  const [guardandoMovManual, setGuardandoMovManual] = useState(false);
  const [formCuota, setFormCuota] = useState({ nueva: "", notas: "" });
  const [formMov, setFormMov] = useState({
    tipo: "cargo",
    fecha: hoyStr(),
    concepto: "",
    monto: "",
  });
  const [formAjuste, setFormAjuste] = useState({
    accion: "aplazar",
    notas: "",
  });

  const { data: cuenta, isLoading: cuentaLoading } = useQuery({
    queryKey: ["cuenta-cliente", cliente.id],
    queryFn: () => getCuentaPorCliente(cliente.id),
  });

  const { data: movimientos = [] } = useQuery({
    queryKey: ["cuenta-movimientos", cuenta?.id],
    queryFn: () => getMovimientos(cuenta.id),
    enabled: !!cuenta?.id,
  });

  const { data: periodos = [] } = useQuery({
    queryKey: ["cuenta-periodos", cuenta?.id],
    queryFn: () => getPeriodos(cuenta.id),
    enabled: !!cuenta?.id,
  });

  const { data: historialCuotas = [] } = useQuery({
    queryKey: ["cuenta-cuotas", cuenta?.id],
    queryFn: () => getHistorialCuotas(cuenta.id),
    enabled: !!cuenta?.id,
  });

  useEffect(() => {
    if (cuenta?.id && cuenta.estado === "activa") {
      Promise.all([
        generarPeriodosPendientes(cuenta.id),
        recalcularSaldos(cuenta.id),
      ])
        .then(() => {
          queryClient.invalidateQueries({
            queryKey: ["cuenta-periodos", cuenta.id],
          });
          queryClient.invalidateQueries({
            queryKey: ["cuenta-movimientos", cuenta.id],
          });
          queryClient.invalidateQueries({
            queryKey: ["cuenta-cliente", cliente.id],
          });
          queryClient.invalidateQueries({ queryKey: ["cobros-mes"] });
        })
        .catch((e) => console.error("Error al preparar la cuenta:", e));
    }
  }, [cuenta?.id, cuenta?.estado, cliente.id, queryClient]);

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ["cuenta-cliente", cliente.id] });
    queryClient.invalidateQueries({ queryKey: ["cuenta-movimientos"] });
    queryClient.invalidateQueries({ queryKey: ["cuenta-periodos"] });
    queryClient.invalidateQueries({ queryKey: ["cuenta-cuotas"] });
    queryClient.invalidateQueries({ queryKey: ["cobros-mes"] });
    queryClient.invalidateQueries({ queryKey: ["cuentas"] });
  };

  const handleGuardarFechaPago = async () => {
    if (!nuevaFechaPago || !nuevoMontoPago) {
      alert("Completa la fecha y el monto");
      return;
    }
    setGuardandoFechaPago(true);
    try {
      const fechaCambio = nuevaFechaPago !== editandoFechaPago.fecha;
      const montoCambio =
        parseFloat(nuevoMontoPago) !== parseFloat(editandoFechaPago.monto);

      if (fechaCambio) {
        await editarFechaPago(editandoFechaPago.id, nuevaFechaPago);
      }

      if (montoCambio) {
        const resultado = await editarMontoPago(
          editandoFechaPago.id,
          nuevoMontoPago,
        );
        if (resultado.avisoComisionPagada) {
          alert(
            "El pago se corrigió, pero la comisión que generó ya estaba marcada como pagada, así que no se tocó. Revísala a mano si hace falta un ajuste.",
          );
        }
      }

      refrescar();
      setEditandoFechaPago(null);
    } catch (error) {
      console.error("Error al corregir el pago:", error);
      alert("Error al corregir el pago: " + error.message);
    } finally {
      setGuardandoFechaPago(false);
    }
  };

  const handleGuardarMovManual = async () => {
    if (
      !formEditarMov.fecha ||
      !formEditarMov.concepto.trim() ||
      !formEditarMov.monto
    ) {
      alert("Completa todos los campos");
      return;
    }
    setGuardandoMovManual(true);
    try {
      await editarMovimientoManual(editandoMovManual.id, {
        fecha: formEditarMov.fecha,
        concepto: formEditarMov.concepto,
        monto: formEditarMov.monto,
      });
      refrescar();
      setEditandoMovManual(null);
    } catch (error) {
      console.error("Error al editar el movimiento:", error);
      alert("Error al editar el movimiento: " + error.message);
    } finally {
      setGuardandoMovManual(false);
    }
  };

  const formatFecha = (fecha) => {
    if (!fecha) return "-";
    const [a, m, d] = fecha.split("-");
    return `${d}/${m}/${a}`;
  };

  const handleAbrirCuenta = async () => {
    if (
      !formApertura.cuota_mensual ||
      parseFloat(formApertura.cuota_mensual) <= 0
    ) {
      alert("Ingrese la cuota mensual acordada");
      return;
    }
    if (!formApertura.fecha_primer_pago) {
      alert("Ingrese la fecha del primer pago");
      return;
    }

    setProcesando(true);
    try {
      await abrirCuenta({
        id_cliente: cliente.id,
        cuota_mensual: formApertura.cuota_mensual,
        dia_pago: formApertura.dia_pago,
        fecha_primer_pago: formApertura.fecha_primer_pago,
        saldo_inicial: formApertura.saldo_inicial || 0,
        fecha_saldo_inicial: formApertura.fecha_saldo_inicial || null,
      });
      refrescar();
      alert("Cuenta abierta correctamente");
    } catch (error) {
      console.error(error);
      alert("Error al abrir la cuenta: " + error.message);
    } finally {
      setProcesando(false);
    }
  };

  const handleRegistrarPago = async () => {
    if (!formPago.monto || parseFloat(formPago.monto) <= 0) {
      alert("Ingrese un monto válido");
      return;
    }
    setProcesando(true);
    try {
      await registrarPago(cuenta.id, {
        monto: formPago.monto,
        fecha: formPago.fecha,
        notas: formPago.notas || null,
      });
      setModal(null);
      setFormPago({ monto: "", fecha: hoyStr(), notas: "" });
      refrescar();
    } catch (error) {
      console.error(error);
      alert("Error al registrar el pago: " + error.message);
    } finally {
      setProcesando(false);
    }
  };

  const handleAjustarCuota = async () => {
    if (!formCuota.nueva || parseFloat(formCuota.nueva) <= 0) {
      alert("Ingrese la nueva cuota");
      return;
    }
    setProcesando(true);
    try {
      await ajustarCuota(cuenta.id, formCuota.nueva, formCuota.notas || null);
      setModal(null);
      setFormCuota({ nueva: "", notas: "" });
      refrescar();
    } catch (error) {
      console.error(error);
      alert("Error al ajustar la cuota: " + error.message);
    } finally {
      setProcesando(false);
    }
  };

  const handleAgregarMovimiento = async () => {
    if (!formMov.concepto.trim()) {
      alert("Ingrese el concepto");
      return;
    }
    if (!formMov.monto || parseFloat(formMov.monto) <= 0) {
      alert("Ingrese un monto válido");
      return;
    }
    setProcesando(true);
    try {
      await agregarMovimientoManual(cuenta.id, {
        fecha: formMov.fecha,
        tipo: formMov.tipo,
        concepto: formMov.concepto,
        monto: formMov.monto,
      });
      setModal(null);
      setFormMov({ tipo: "cargo", fecha: hoyStr(), concepto: "", monto: "" });
      refrescar();
    } catch (error) {
      console.error(error);
      alert("Error al agregar el movimiento: " + error.message);
    } finally {
      setProcesando(false);
    }
  };

  const handleAjustarPeriodo = async () => {
    setProcesando(true);
    try {
      await ajustarPeriodo(
        periodoAjustar.id,
        formAjuste.accion,
        formAjuste.notas || null,
      );
      setModal(null);
      setPeriodoAjustar(null);
      setFormAjuste({ accion: "aplazar", notas: "" });
      refrescar();
    } catch (error) {
      console.error(error);
      alert("Error al ajustar el mes: " + error.message);
    } finally {
      setProcesando(false);
    }
  };

  const handleDescargarPDF = async () => {
    try {
      const idsVentas = movimientos
        .filter((m) => m.tipo === "cargo" && m.id_venta)
        .map((m) => m.id_venta);
      const descuentos = await getDescuentosDeVentas(idsVentas);
      const movimientosConDescuento = movimientos.map((m) =>
        descuentos[m.id_venta]
          ? {
              ...m,
              concepto: `${m.concepto} (descuento ${formatPrice(descuentos[m.id_venta])})`,
            }
          : m,
      );
      await descargarEstadoCuenta({
        cliente,
        cuenta,
        movimientos: movimientosConDescuento,
      });
    } catch (error) {
      console.error(error);
      alert(
        "Error al generar el PDF. Verifique que estén instaladas las librerías (npm install jspdf jspdf-autotable)",
      );
    }
  };

  if (cuentaLoading) {
    return (
      <div className="bg-white border border-gray-200 p-6 mb-10">
        <LoadingSpinner />
      </div>
    );
  }

  if (!cuenta) {
    return (
      <div className="bg-white border border-gray-200 p-6 mb-10">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
          Cuenta de Crédito
        </h2>
        <p className="text-gray-500 text-sm mb-6">
          Este cliente no tiene cuenta abierta. Ábrela para poder venderle a
          crédito y llevar el control de sus pagos.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cuota mensual acordada *
            </label>
            <input
              type="number"
              value={formApertura.cuota_mensual}
              onChange={(e) =>
                setFormApertura((p) => ({
                  ...p,
                  cuota_mensual: limitarDecimales(e.target.value),
                }))
              }
              placeholder="Ej: 200"
              min="0"
              step="0.01"
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Día de pago *
            </label>
            <input
              type="number"
              value={formApertura.dia_pago}
              onChange={(e) =>
                setFormApertura((p) => ({ ...p, dia_pago: e.target.value }))
              }
              min="1"
              max="31"
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha del primer pago *
            </label>
            <input
              type="date"
              value={formApertura.fecha_primer_pago}
              onChange={(e) =>
                setFormApertura((p) => ({
                  ...p,
                  fecha_primer_pago: e.target.value,
                }))
              }
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
            <p className="text-xs text-gray-500 mt-1">
              Si le da meses de gracia, ponga aquí el mes en que empieza a pagar
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Saldo inicial (opcional)
            </label>
            <input
              type="number"
              value={formApertura.saldo_inicial}
              onChange={(e) =>
                setFormApertura((p) => ({
                  ...p,
                  saldo_inicial: limitarDecimales(e.target.value),
                }))
              }
              placeholder="Si ya le debe de antes"
              min="0"
              step="0.01"
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha del saldo inicial
            </label>
            <input
              type="date"
              value={formApertura.fecha_saldo_inicial}
              onChange={(e) =>
                setFormApertura((p) => ({
                  ...p,
                  fecha_saldo_inicial: e.target.value,
                }))
              }
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </div>
        </div>

        <button
          onClick={handleAbrirCuenta}
          disabled={procesando}
          className="px-6 py-3 bg-gray-900 text-white text-sm uppercase tracking-wider hover:bg-gray-800 transition-colors disabled:bg-gray-400"
        >
          {procesando ? "Abriendo..." : "Abrir Cuenta"}
        </button>
      </div>
    );
  }

  const saldo = parseFloat(cuenta.saldo) || 0;
  const cuota = parseFloat(cuenta.cuota_mensual) || 0;
  const mesesRestantes = cuota > 0 ? Math.ceil(saldo / cuota) : 0;

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
          Cuenta de Crédito
        </h2>
        <button
          onClick={handleDescargarPDF}
          className="text-sm text-blue-600 hover:text-blue-900"
        >
          Descargar estado de cuenta (PDF)
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 p-4">
          <p className="text-xs text-orange-800 uppercase tracking-wider mb-1 font-medium">
            Saldo actual
          </p>
          <p className="text-2xl font-light text-orange-900">
            {formatPrice(saldo)}
          </p>
        </div>
        <div className="bg-white border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
            Cuota mensual
          </p>
          <p className="text-2xl font-light text-gray-900">
            {formatPrice(cuota)}
          </p>
        </div>
        <div className="bg-white border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
            Día de pago
          </p>
          <p className="text-2xl font-light text-gray-900">{cuenta.dia_pago}</p>
        </div>
        <div className="bg-white border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
            Meses restantes
          </p>
          <p className="text-2xl font-light text-gray-900">
            {saldo > 0 ? mesesRestantes : "—"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={() => setModal("pago")}
          className="px-5 py-2 bg-gray-900 text-white text-sm uppercase tracking-wider hover:bg-gray-800 transition-colors"
        >
          Registrar pago
        </button>
        <button
          onClick={() => {
            setFormCuota({ nueva: String(cuota), notas: "" });
            setModal("cuota");
          }}
          className="px-5 py-2 border border-gray-900 text-gray-900 text-sm uppercase tracking-wider hover:bg-gray-50 transition-colors"
        >
          Cambiar cuota
        </button>
        <button
          onClick={() => setModal("movimiento")}
          className="px-5 py-2 border border-gray-300 text-gray-700 text-sm uppercase tracking-wider hover:border-gray-900 transition-colors"
        >
          Agregar movimiento
        </button>
      </div>

      <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
        Control de Cuotas
      </h3>
      <div className="bg-white border border-gray-200 overflow-hidden mb-8">
        {periodos.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm">
              Aún no hay meses registrados. Se generan automáticamente desde la
              fecha del primer pago.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                  #
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                  Mes
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                  Vence
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                  Esperado
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                  Pagado
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                  Estado
                </th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {periodos.map((p, index) => {
                const est =
                  ESTADO_PERIODO[p.estado] || ESTADO_PERIODO.pendiente;
                const puedeAjustar = ["pendiente", "parcial", "mora"].includes(
                  p.estado,
                );
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-500">{index + 1}</td>
                    <td className="px-4 py-2 text-gray-900">
                      {MESES[p.mes - 1]} {p.anio}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {formatFecha(p.fecha_vencimiento)}
                    </td>
                    <td className="px-4 py-2 text-gray-900">
                      {formatPrice(p.monto_esperado)}
                      {parseFloat(p.monto_arrastre) > 0 && (
                        <span className="block text-xs text-blue-600">
                          +{formatPrice(p.monto_arrastre)} aplazado
                        </span>
                      )}
                      {parseFloat(p.monto_recargo) > 0 && (
                        <span className="block text-xs text-purple-600">
                          +{formatPrice(p.monto_recargo)} diferido
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {formatPrice(p.monto_pagado)}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`px-2 py-1 text-xs uppercase tracking-wider ${est.cls}`}
                      >
                        {est.texto}
                      </span>
                      {p.notas && (
                        <p className="text-xs text-gray-500 mt-1">{p.notas}</p>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {puedeAjustar && (
                        <button
                          onClick={() => {
                            setPeriodoAjustar(p);
                            setFormAjuste({ accion: "aplazar", notas: "" });
                            setModal("ajuste");
                          }}
                          className="text-blue-600 hover:text-blue-900 text-xs"
                        >
                          Ajustar mes
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
        Estado de Cuenta
      </h3>
      <div className="bg-white border border-gray-200 overflow-hidden mb-8">
        {movimientos.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm">Sin movimientos aún</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                  #
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                  Fecha
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                  Concepto
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 uppercase">
                  Cargo
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 uppercase">
                  Abono
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 uppercase">
                  Saldo
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {movimientos.map((mov, index) => {
                const tipo = TIPO_MOV[mov.tipo] || TIPO_MOV.cargo;
                return (
                  <tr key={mov.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-500">{index + 1}</td>
                    <td className="px-4 py-2 text-gray-600">
                      <div className="flex items-center gap-2">
                        {formatFecha(mov.fecha)}
                        {mov.tipo === "abono" &&
                          mov.concepto === "Pago recibido" && (
                            <button
                              onClick={() => {
                                setEditandoFechaPago(mov);
                                setNuevaFechaPago(mov.fecha);
                                setNuevoMontoPago(mov.monto.toString());
                              }}
                              title="Editar este pago"
                              className="text-gray-400 hover:text-gray-900"
                            >
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            </button>
                          )}
                        {!mov.id_venta &&
                          !(
                            mov.tipo === "abono" &&
                            mov.concepto === "Pago recibido"
                          ) && (
                            <button
                              onClick={() => {
                                setEditandoMovManual(mov);
                                setFormEditarMov({
                                  fecha: mov.fecha,
                                  concepto: mov.concepto,
                                  monto: mov.monto.toString(),
                                });
                              }}
                              title="Editar este movimiento"
                              className="text-gray-400 hover:text-gray-900"
                            >
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            </button>
                          )}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <span className={tipo.cls}>{mov.concepto}</span>
                      {mov.notas && (
                        <p className="text-xs text-gray-500">{mov.notas}</p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-900">
                      {mov.tipo !== "abono" ? formatPrice(mov.monto) : ""}
                    </td>
                    <td className="px-4 py-2 text-right text-green-700">
                      {mov.tipo === "abono" ? formatPrice(mov.monto) : ""}
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-gray-900">
                      {formatPrice(mov.saldo_resultante)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {historialCuotas.length > 0 && (
        <>
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
            Cambios de Cuota
          </h3>
          <div className="bg-white border border-gray-200 overflow-hidden mb-8">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                    #
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                    Fecha
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                    Antes
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                    Después
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                    Motivo
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {historialCuotas.map((h, index) => (
                  <tr key={h.id}>
                    <td className="px-4 py-2 text-gray-500">{index + 1}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {formatFecha(h.fecha_cambio)}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {formatPrice(h.cuota_anterior)}
                    </td>
                    <td className="px-4 py-2 font-medium text-gray-900">
                      {formatPrice(h.cuota_nueva)}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {h.notas || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            {modal === "pago" && (
              <>
                <h3 className="text-xl font-light text-gray-900 mb-6">
                  Registrar Pago
                </h3>
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Monto recibido
                    </label>
                    <input
                      type="number"
                      value={formPago.monto}
                      onChange={(e) =>
                        setFormPago((p) => ({
                          ...p,
                          monto: limitarDecimales(e.target.value),
                        }))
                      }
                      placeholder={`Cuota: ${formatPrice(cuota)}`}
                      min="0.01"
                      step="0.01"
                      autoFocus
                      className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Saldo actual: {formatPrice(saldo)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Fecha del pago
                    </label>
                    <input
                      type="date"
                      value={formPago.fecha}
                      onChange={(e) =>
                        setFormPago((p) => ({ ...p, fecha: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notas (opcional)
                    </label>
                    <input
                      type="text"
                      value={formPago.notas}
                      onChange={(e) =>
                        setFormPago((p) => ({ ...p, notas: e.target.value }))
                      }
                      placeholder="Observaciones del pago"
                      className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleRegistrarPago}
                    disabled={procesando}
                    className="flex-1 py-3 bg-gray-900 text-white text-sm uppercase tracking-wider hover:bg-gray-800 disabled:bg-gray-400"
                  >
                    {procesando ? "Guardando..." : "Registrar Pago"}
                  </button>
                  <button
                    onClick={() => setModal(null)}
                    className="px-6 py-3 border border-gray-300 text-gray-700 text-sm uppercase tracking-wider hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}

            {modal === "cuota" && (
              <>
                <h3 className="text-xl font-light text-gray-900 mb-2">
                  Cambiar Cuota Mensual
                </h3>
                <p className="text-sm text-gray-500 mb-6">
                  Cuota actual: {formatPrice(cuota)} · Saldo:{" "}
                  {formatPrice(saldo)}
                </p>
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nueva cuota
                    </label>
                    <input
                      type="number"
                      value={formCuota.nueva}
                      onChange={(e) =>
                        setFormCuota((p) => ({
                          ...p,
                          nueva: limitarDecimales(e.target.value),
                        }))
                      }
                      min="0.01"
                      step="0.01"
                      autoFocus
                      className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                    />
                    {formCuota.nueva && parseFloat(formCuota.nueva) > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        Con esta cuota el saldo se termina en{" "}
                        {Math.ceil(saldo / parseFloat(formCuota.nueva))} meses
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Motivo del cambio (opcional)
                    </label>
                    <input
                      type="text"
                      value={formCuota.notas}
                      onChange={(e) =>
                        setFormCuota((p) => ({ ...p, notas: e.target.value }))
                      }
                      placeholder="Ej: acordado para terminar antes"
                      className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleAjustarCuota}
                    disabled={procesando}
                    className="flex-1 py-3 bg-gray-900 text-white text-sm uppercase tracking-wider hover:bg-gray-800 disabled:bg-gray-400"
                  >
                    {procesando ? "Guardando..." : "Guardar Cuota"}
                  </button>
                  <button
                    onClick={() => setModal(null)}
                    className="px-6 py-3 border border-gray-300 text-gray-700 text-sm uppercase tracking-wider hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}

            {modal === "movimiento" && (
              <>
                <h3 className="text-xl font-light text-gray-900 mb-2">
                  Agregar Movimiento
                </h3>
                <p className="text-sm text-gray-500 mb-6">
                  Para registrar compras o pagos anteriores al sistema, o
                  corregir la cuenta.
                </p>
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tipo
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          setFormMov((p) => ({ ...p, tipo: "cargo" }))
                        }
                        className={`flex-1 py-2 text-sm uppercase tracking-wider transition-colors ${
                          formMov.tipo === "cargo"
                            ? "bg-gray-900 text-white"
                            : "border border-gray-300 text-gray-700"
                        }`}
                      >
                        Compra (sube saldo)
                      </button>
                      <button
                        onClick={() =>
                          setFormMov((p) => ({ ...p, tipo: "abono" }))
                        }
                        className={`flex-1 py-2 text-sm uppercase tracking-wider transition-colors ${
                          formMov.tipo === "abono"
                            ? "bg-gray-900 text-white"
                            : "border border-gray-300 text-gray-700"
                        }`}
                      >
                        Pago (baja saldo)
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Fecha
                    </label>
                    <input
                      type="date"
                      value={formMov.fecha}
                      onChange={(e) =>
                        setFormMov((p) => ({ ...p, fecha: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Concepto
                    </label>
                    <input
                      type="text"
                      value={formMov.concepto}
                      onChange={(e) =>
                        setFormMov((p) => ({ ...p, concepto: e.target.value }))
                      }
                      placeholder="Ej: Compra de aretes y collar"
                      className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Monto
                    </label>
                    <input
                      type="number"
                      value={formMov.monto}
                      onChange={(e) =>
                        setFormMov((p) => ({
                          ...p,
                          monto: limitarDecimales(e.target.value),
                        }))
                      }
                      min="0.01"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleAgregarMovimiento}
                    disabled={procesando}
                    className="flex-1 py-3 bg-gray-900 text-white text-sm uppercase tracking-wider hover:bg-gray-800 disabled:bg-gray-400"
                  >
                    {procesando ? "Guardando..." : "Agregar"}
                  </button>
                  <button
                    onClick={() => setModal(null)}
                    className="px-6 py-3 border border-gray-300 text-gray-700 text-sm uppercase tracking-wider hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}

            {modal === "ajuste" && periodoAjustar && (
              <>
                <h3 className="text-xl font-light text-gray-900 mb-2">
                  Ajustar {MESES[periodoAjustar.mes - 1]} {periodoAjustar.anio}
                </h3>
                <p className="text-sm text-gray-500 mb-6">
                  Falta cubrir{" "}
                  {formatPrice(
                    parseFloat(periodoAjustar.monto_esperado) -
                      parseFloat(periodoAjustar.monto_pagado),
                  )}{" "}
                  de este mes
                </p>

                <div className="space-y-3 mb-6">
                  {[
                    {
                      value: "aplazar",
                      titulo: "Aplazar al mes siguiente",
                      desc: "El monto pendiente se suma a la cuota del próximo mes.",
                    },
                    {
                      value: "diferir",
                      titulo: "Diferir entre los meses restantes",
                      desc: "El monto se reparte en partes iguales entre los meses que faltan.",
                    },
                    {
                      value: "gracia",
                      titulo: "Mes de gracia",
                      desc: "No se cobra este mes y no se arrastra nada. Todo se corre un mes.",
                    },
                  ].map((op) => (
                    <button
                      key={op.value}
                      onClick={() =>
                        setFormAjuste((p) => ({ ...p, accion: op.value }))
                      }
                      className={`w-full text-left p-4 border transition-colors ${
                        formAjuste.accion === op.value
                          ? "border-gray-900 bg-gray-50"
                          : "border-gray-300 hover:border-gray-500"
                      }`}
                    >
                      <p className="font-medium text-gray-900 text-sm">
                        {op.titulo}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{op.desc}</p>
                    </button>
                  ))}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Motivo (opcional)
                    </label>
                    <input
                      type="text"
                      value={formAjuste.notas}
                      onChange={(e) =>
                        setFormAjuste((p) => ({ ...p, notas: e.target.value }))
                      }
                      placeholder="Ej: no pudo pagar por tema médico"
                      className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleAjustarPeriodo}
                    disabled={procesando}
                    className="flex-1 py-3 bg-gray-900 text-white text-sm uppercase tracking-wider hover:bg-gray-800 disabled:bg-gray-400"
                  >
                    {procesando ? "Guardando..." : "Confirmar Ajuste"}
                  </button>
                  <button
                    onClick={() => {
                      setModal(null);
                      setPeriodoAjustar(null);
                    }}
                    className="px-6 py-3 border border-gray-300 text-gray-700 text-sm uppercase tracking-wider hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {editandoFechaPago && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white max-w-sm w-full p-6">
            <h3 className="text-xl font-light text-gray-900 mb-2">
              Editar Pago
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              {editandoFechaPago.concepto}
            </p>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha
                </label>
                <input
                  type="date"
                  value={nuevaFechaPago}
                  onChange={(e) => setNuevaFechaPago(e.target.value)}
                  autoFocus
                  className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monto
                </label>
                <input
                  type="number"
                  value={nuevoMontoPago}
                  onChange={(e) =>
                    setNuevoMontoPago(limitarDecimales(e.target.value))
                  }
                  className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Si cambias el monto, se vuelve a calcular a qué meses queda
                  aplicado este pago (junto con los demás pagos de la cuenta).
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleGuardarFechaPago}
                disabled={guardandoFechaPago}
                className="flex-1 py-3 bg-gray-900 text-white text-sm uppercase tracking-wider hover:bg-gray-800 disabled:bg-gray-400"
              >
                {guardandoFechaPago ? "Guardando..." : "Guardar"}
              </button>
              <button
                onClick={() => setEditandoFechaPago(null)}
                className="px-6 py-3 border border-gray-300 text-gray-700 text-sm uppercase tracking-wider hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {editandoMovManual && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white max-w-sm w-full p-6">
            <h3 className="text-xl font-light text-gray-900 mb-6">
              Editar Movimiento
            </h3>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha
                </label>
                <input
                  type="date"
                  value={formEditarMov.fecha}
                  onChange={(e) =>
                    setFormEditarMov((p) => ({ ...p, fecha: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Concepto
                </label>
                <input
                  type="text"
                  value={formEditarMov.concepto}
                  onChange={(e) =>
                    setFormEditarMov((p) => ({
                      ...p,
                      concepto: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monto
                </label>
                <input
                  type="number"
                  value={formEditarMov.monto}
                  onChange={(e) =>
                    setFormEditarMov((p) => ({
                      ...p,
                      monto: limitarDecimales(e.target.value),
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleGuardarMovManual}
                disabled={guardandoMovManual}
                className="flex-1 py-3 bg-gray-900 text-white text-sm uppercase tracking-wider hover:bg-gray-800 disabled:bg-gray-400"
              >
                {guardandoMovManual ? "Guardando..." : "Guardar"}
              </button>
              <button
                onClick={() => setEditandoMovManual(null)}
                className="px-6 py-3 border border-gray-300 text-gray-700 text-sm uppercase tracking-wider hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
