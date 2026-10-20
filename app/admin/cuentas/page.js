"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getCuentas,
  getCobrosDelMes,
  calcularSemaforo,
  diasDeAtraso,
  resumenCobrosMes,
} from "@/lib/supabase/cuentas";
import Link from "next/link";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { formatPrice } from "@/utils/formatters";

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

const SEMAFORO = {
  verde: {
    dot: "bg-green-500",
    fila: "",
    texto: "Al día",
    badge: "bg-green-100 text-green-800",
  },
  amarillo: {
    dot: "bg-yellow-500",
    fila: "bg-yellow-50",
    texto: "Atrasado",
    badge: "bg-yellow-100 text-yellow-800",
  },
  rojo: {
    dot: "bg-red-500",
    fila: "bg-red-50",
    texto: "Muy atrasado",
    badge: "bg-red-100 text-red-800",
  },
  negro: {
    dot: "bg-gray-900",
    fila: "bg-gray-100",
    texto: "Crítico",
    badge: "bg-gray-900 text-white",
  },
  pagado: {
    dot: "bg-green-600",
    fila: "",
    texto: "Pagado",
    badge: "bg-green-100 text-green-800",
  },
  aplazado: {
    dot: "bg-blue-400",
    fila: "",
    texto: "Aplazado",
    badge: "bg-blue-100 text-blue-800",
  },
  diferido: {
    dot: "bg-purple-400",
    fila: "",
    texto: "Diferido",
    badge: "bg-purple-100 text-purple-800",
  },
  gracia: {
    dot: "bg-gray-400",
    fila: "",
    texto: "Gracia",
    badge: "bg-gray-100 text-gray-600",
  },
};

export default function CuentasPage() {
  const ahora = new Date();
  const [anio, setAnio] = useState(ahora.getFullYear());
  const [mes, setMes] = useState(ahora.getMonth() + 1);

  const esMesActual =
    anio === ahora.getFullYear() && mes === ahora.getMonth() + 1;

  const { data: cobros = [], isLoading: cobrosLoading } = useQuery({
    queryKey: ["cobros-mes", anio, mes],
    queryFn: () => getCobrosDelMes(anio, mes),
    staleTime: 60 * 1000,
  });

  const { data: cuentas = [], isLoading: cuentasLoading } = useQuery({
    queryKey: ["cuentas", "activa"],
    queryFn: () => getCuentas("activa"),
    staleTime: 2 * 60 * 1000,
  });

  const [ordenCobros, setOrdenCobros] = useState("alfabetico");
  const [ordenCuentas, setOrdenCuentas] = useState("alfabetico");

  const cobrosOrdenados = [...cobros].sort((a, b) => {
    if (ordenCobros === "alfabetico") {
      return (a.cuenta?.cliente?.nombre || "").localeCompare(
        b.cuenta?.cliente?.nombre || "",
      );
    }
    return new Date(a.fecha_vencimiento) - new Date(b.fecha_vencimiento);
  });

  const cuentasOrdenadas = [...cuentas].sort((a, b) => {
    if (ordenCuentas === "alfabetico") {
      return (a.cliente?.nombre || "").localeCompare(b.cliente?.nombre || "");
    }
    return (a.dia_pago || 0) - (b.dia_pago || 0);
  });

  const resumen = resumenCobrosMes(cobros);

  const formatFecha = (fecha) => {
    if (!fecha) return "-";
    const [a, m, d] = fecha.split("-");
    return `${d}/${m}/${a}`;
  };

  const cambiarMes = (delta) => {
    let nuevoMes = mes + delta;
    let nuevoAnio = anio;
    if (nuevoMes > 12) {
      nuevoMes = 1;
      nuevoAnio++;
    } else if (nuevoMes < 1) {
      nuevoMes = 12;
      nuevoAnio--;
    }
    setMes(nuevoMes);
    setAnio(nuevoAnio);
  };

  const totalDeuda = cuentas.reduce((sum, c) => sum + parseFloat(c.saldo), 0);
  const cuentasConSaldo = cuentas.filter((c) => parseFloat(c.saldo) > 0);

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="font-elegant text-4xl font-light text-gray-900 mb-10">
        Cuentas por Cobrar
      </h1>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
          Cobros de {MESES[mes - 1]} {anio}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => cambiarMes(-1)}
            className="px-3 py-1 border border-gray-300 text-gray-700 text-sm hover:border-gray-900 transition-colors"
          >
            ← Mes anterior
          </button>
          {!esMesActual && (
            <button
              onClick={() => {
                setAnio(ahora.getFullYear());
                setMes(ahora.getMonth() + 1);
              }}
              className="px-3 py-1 bg-gray-900 text-white text-sm hover:bg-gray-800 transition-colors"
            >
              Mes actual
            </button>
          )}
          <button
            onClick={() => cambiarMes(1)}
            className="px-3 py-1 border border-gray-300 text-gray-700 text-sm hover:border-gray-900 transition-colors"
          >
            Mes siguiente →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
            Esperado
          </p>
          <p className="text-2xl font-light text-gray-900">
            {formatPrice(resumen.esperado)}
          </p>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 p-4">
          <p className="text-xs text-green-800 uppercase tracking-wider mb-1 font-medium">
            Cobrado
          </p>
          <p className="text-2xl font-light text-green-900">
            {formatPrice(resumen.cobrado)}
          </p>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 p-4">
          <p className="text-xs text-orange-800 uppercase tracking-wider mb-1 font-medium">
            Por cobrar
          </p>
          <p className="text-2xl font-light text-orange-900">
            {formatPrice(resumen.porCobrar)}
          </p>
        </div>
        <div className="bg-gray-900 border border-gray-900 p-4">
          <p className="text-xs text-gray-300 uppercase tracking-wider mb-1 font-medium">
            En mora
          </p>
          <p className="text-2xl font-light text-white">
            {formatPrice(resumen.enMora)}
          </p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 overflow-hidden mb-12">
        <div className="flex items-center justify-end px-4 py-3 border-b border-gray-200 bg-gray-50">
          <select
            value={ordenCobros}
            onChange={(e) => setOrdenCobros(e.target.value)}
            className="text-sm border border-gray-300 px-3 py-1.5 bg-white focus:outline-none focus:border-gray-500"
          >
            <option value="alfabetico">Orden alfabético</option>
            <option value="fecha">Por fecha de pago</option>
          </select>
        </div>
        {cobrosLoading ? (
          <div className="py-12">
            <LoadingSpinner />
          </div>
        ) : cobros.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">
              No hay cobros registrados para {MESES[mes - 1]} {anio}
            </p>
          </div>
        ) : (
          <div className="tabla-scroll">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    #
                  </th>
                  <th className="px-4 py-3 w-8"></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Vence
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Esperado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Pagado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Falta
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Saldo total
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {cobrosOrdenados.map((periodo, index) => {
                  const sem = calcularSemaforo(periodo);
                  const estilo = SEMAFORO[sem] || SEMAFORO.verde;
                  const esperado = parseFloat(periodo.monto_esperado) || 0;
                  const pagado = parseFloat(periodo.monto_pagado) || 0;
                  const falta = Math.max(0, esperado - pagado);
                  const ajustado = ["aplazado", "diferido", "gracia"].includes(
                    periodo.estado,
                  );

                  return (
                    <tr
                      key={periodo.id}
                      className={`${estilo.fila} hover:bg-gray-50`}
                    >
                      <td className="px-4 py-3 text-gray-500">{index + 1}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block w-3 h-3 rounded-full ${estilo.dot}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">
                          {periodo.cuenta?.cliente?.nombre}
                        </p>
                        {periodo.cuenta?.cliente?.telefono && (
                          <p className="text-xs text-gray-500">
                            {periodo.cuenta.cliente.telefono}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatFecha(periodo.fecha_vencimiento)}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {ajustado ? "—" : formatPrice(esperado)}
                        {periodo.monto_arrastre > 0 && !ajustado && (
                          <span className="block text-xs text-blue-600">
                            incluye {formatPrice(periodo.monto_arrastre)}{" "}
                            aplazado
                          </span>
                        )}
                        {periodo.monto_recargo > 0 && !ajustado && (
                          <span className="block text-xs text-purple-600">
                            incluye {formatPrice(periodo.monto_recargo)}{" "}
                            diferido
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatPrice(pagado)}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {ajustado ? "—" : formatPrice(falta)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 text-xs uppercase tracking-wider ${estilo.badge}`}
                        >
                          {estilo.texto}
                        </span>
                        {!ajustado &&
                          periodo.estado !== "pagado" &&
                          diasDeAtraso(periodo) > 0 && (
                            <p className="text-xs text-gray-500 mt-1">
                              {diasDeAtraso(periodo)} días de atraso
                            </p>
                          )}
                        {periodo.notas && (
                          <p className="text-xs text-gray-500 mt-1">
                            {periodo.notas}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-900">
                        {formatPrice(periodo.cuenta?.saldo || 0)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/clientes/${periodo.cuenta?.cliente?.id}`}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Ver cuenta
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
          Todas las Cuentas
        </h2>
        <div className="text-sm text-gray-600">
          {cuentasConSaldo.length} con saldo · Total adeudado:{" "}
          <span className="font-medium text-gray-900">
            {formatPrice(totalDeuda)}
          </span>
        </div>
      </div>

      <div className="bg-white border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-end px-4 py-3 border-b border-gray-200 bg-gray-50">
          <select
            value={ordenCuentas}
            onChange={(e) => setOrdenCuentas(e.target.value)}
            className="text-sm border border-gray-300 px-3 py-1.5 bg-white focus:outline-none focus:border-gray-500"
          >
            <option value="alfabetico">Orden alfabético</option>
            <option value="fecha">Por fecha de pago</option>
          </select>
        </div>
        {cuentasLoading ? (
          <div className="py-12">
            <LoadingSpinner />
          </div>
        ) : cuentas.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">
              No hay cuentas abiertas. Se abren desde la ficha de cada cliente o
              al registrar una venta a crédito.
            </p>
          </div>
        ) : (
          <div className="tabla-scroll">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Saldo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Cuota
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Día de pago
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Meses restantes
                  </th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {cuentasOrdenadas.map((cuenta, index) => {
                  const saldo = parseFloat(cuenta.saldo) || 0;
                  const cuota = parseFloat(cuenta.cuota_mensual) || 0;
                  const meses = cuota > 0 ? Math.ceil(saldo / cuota) : 0;
                  return (
                    <tr key={cuenta.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-gray-500">{index + 1}</td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900">
                          {cuenta.cliente?.nombre}
                        </p>
                        {cuenta.cliente?.telefono && (
                          <p className="text-xs text-gray-500">
                            {cuenta.cliente.telefono}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {formatPrice(saldo)}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {formatPrice(cuota)}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        Día {cuenta.dia_pago}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {saldo > 0
                          ? `${meses} ${meses === 1 ? "mes" : "meses"}`
                          : "Al día"}
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          href={`/admin/clientes/${cuenta.cliente?.id}`}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Ver cuenta
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
