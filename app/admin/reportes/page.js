"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getVentasPorMes,
  getVentasPorViaMes,
  getCarteraPorMes,
  getEgresosMensuales,
  getResumenMes,
  upsertEgreso,
  getReportePorDistribuidora,
  getComportamientoClientes,
} from "@/lib/supabase/reportes";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

const COLORES_VIA = {
  showroom: "#1f2937",
  redes: "#4b5563",
  referido: "#6b7280",
  distribuidora: "#9ca3af",
  tvcj: "#b0b5bd",
  cuenta_gerencia: "#d1d5db",
  web: "#0ea5e9",
};

const VIAS_LABEL = {
  showroom: "Showroom",
  redes: "Redes",
  referido: "Referido",
  distribuidora: "Distribuidora",
  tvcj: "TVCJ",
  cuenta_gerencia: "Cuenta Gerencia",
  web: "Página Web",
};

const COLORES_TIPO = [
  "#1f2937",
  "#374151",
  "#4b5563",
  "#6b7280",
  "#9ca3af",
  "#d1d5db",
  "#e5e7eb",
  "#f3f4f6",
];

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

export default function ReportesPage() {
  const añoActual = new Date().getFullYear();
  const mesActual = new Date().getMonth() + 1;

  const [año, setAño] = useState(añoActual);
  const [egresoEditando, setEgresoEditando] = useState(null);
  const [egresoMonto, setEgresoMonto] = useState("");
  const [egresoNotas, setEgresoNotas] = useState("");
  const [guardandoEgreso, setGuardandoEgreso] = useState(false);

  const queryClient = useQueryClient();

  const formatCurrency = (value) =>
    new Intl.NumberFormat("es-EC", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  const { data: resumen, isLoading: resumenLoading } = useQuery({
    queryKey: ["resumen-mes", año, mesActual],
    queryFn: () => getResumenMes(año, mesActual),
    staleTime: 2 * 60 * 1000,
  });

  const { data: ventasPorMes = [], isLoading: ventasLoading } = useQuery({
    queryKey: ["ventas-por-mes", año],
    queryFn: () => getVentasPorMes(año),
    staleTime: 5 * 60 * 1000,
  });

  const { data: ventasPorViaMes = [], isLoading: viaMesLoading } = useQuery({
    queryKey: ["ventas-por-via-mes", año, mesActual],
    queryFn: () => getVentasPorViaMes(año, mesActual),
    staleTime: 5 * 60 * 1000,
  });

  const { data: cartera, isLoading: carteraLoading } = useQuery({
    queryKey: ["cartera-por-mes", año],
    queryFn: () => getCarteraPorMes(año),
    staleTime: 5 * 60 * 1000,
  });

  const { data: egresos = [], isLoading: egresosLoading } = useQuery({
    queryKey: ["egresos-mensuales", año],
    queryFn: () => getEgresosMensuales(año),
    staleTime: 2 * 60 * 1000,
  });

  const { data: comportamiento, isLoading: comportamientoLoading } = useQuery({
    queryKey: ["comportamiento-clientes", año],
    queryFn: () => getComportamientoClientes(año),
    staleTime: 5 * 60 * 1000,
  });

  const { data: porDistribuidora = [], isLoading: distribuidoraLoading } =
    useQuery({
      queryKey: ["reporte-distribuidora", año],
      queryFn: () => getReportePorDistribuidora(año),
      staleTime: 5 * 60 * 1000,
    });

  // Proyección a diciembre
  const mesesConVentas = ventasPorMes.filter((m) => m.total > 0);
  const promedioMensual =
    mesesConVentas.length > 0
      ? mesesConVentas.reduce((sum, m) => sum + m.total, 0) /
        mesesConVentas.length
      : 0;
  const proyeccion = ventasPorMes.map((m) => ({
    ...m,
    proyectado:
      m.mes > mesActual && año === añoActual
        ? Math.round(promedioMensual)
        : null,
  }));

  // Datos para comparar ingresos vs egresos
  const egresosMap = {};
  egresos.forEach((e) => {
    egresosMap[e.mes] = e.monto;
  });

  const comparativoData = ventasPorMes.map((m, i) => ({
    nombre: m.nombre,
    ingresos: m.total + (cartera?.pagosPorMes?.[i]?.cobrado || 0),
    egresos: egresosMap[m.mes] || 0,
    balance:
      m.total +
      (cartera?.pagosPorMes?.[i]?.cobrado || 0) -
      (egresosMap[m.mes] || 0),
  }));

  const handleGuardarEgreso = async (mes) => {
    if (!egresoMonto || parseFloat(egresoMonto) < 0) {
      alert("Ingrese un monto válido");
      return;
    }
    setGuardandoEgreso(true);
    try {
      await upsertEgreso(año, mes, egresoMonto, egresoNotas);
      queryClient.invalidateQueries({ queryKey: ["egresos-mensuales", año] });
      queryClient.invalidateQueries({ queryKey: ["resumen-mes"] });
      setEgresoEditando(null);
      setEgresoMonto("");
      setEgresoNotas("");
    } catch (error) {
      alert("Error al guardar: " + error.message);
    } finally {
      setGuardandoEgreso(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="flex justify-between items-center mb-10">
        <h1 className="font-elegant text-4xl font-light text-gray-900">
          Reportes
        </h1>
        <select
          value={año}
          onChange={(e) => setAño(parseInt(e.target.value))}
          className="px-4 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
        >
          {[añoActual - 1, añoActual, añoActual + 1].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {/* RESUMEN DEL MES ACTUAL */}
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
        Resumen — {MESES[mesActual - 1]} {año}
      </h2>
      {resumenLoading ? (
        <LoadingSpinner />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
          {[
            { label: "Ventas directas", value: resumen?.totalVentas },
            { label: "Cobros de créditos", value: resumen?.totalPagos },
            { label: "Total ingresos", value: resumen?.totalIngresos },
            { label: "Egresos", value: resumen?.totalEgresos },
            { label: "Balance", value: resumen?.balance, highlight: true },
          ].map(({ label, value, highlight }) => (
            <div
              key={label}
              className={`border p-4 ${highlight ? "bg-gray-900 border-gray-900" : "bg-white border-gray-200"}`}
            >
              <p
                className={`text-xs uppercase tracking-wider mb-1 ${highlight ? "text-gray-300" : "text-gray-500"}`}
              >
                {label}
              </p>
              <p
                className={`text-2xl font-light ${highlight ? "text-white" : value < 0 ? "text-red-600" : "text-gray-900"}`}
              >
                {formatCurrency(value || 0)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* VENTAS POR MES */}
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
        Ventas por Mes y Vía — {año}
      </h2>
      <div className="bg-white border border-gray-200 p-6 mb-10">
        {ventasLoading ? (
          <LoadingSpinner />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={ventasPorMes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="nombre" tick={{ fontSize: 12 }} />
              <YAxis
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 12 }}
              />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Legend formatter={(value) => VIAS_LABEL[value] || value} />
              {Object.keys(COLORES_VIA).map((via) => (
                <Bar
                  key={via}
                  dataKey={via}
                  stackId="a"
                  fill={COLORES_VIA[via]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* VENTAS POR VÍA DEL MES Y UNIDADES POR MES */}
      <div className="grid md:grid-cols-2 gap-6 mb-10">
        <div>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
            Ventas por Vía — {MESES[mesActual - 1]} {año}
          </h2>
          <div className="bg-white border border-gray-200 p-6">
            {viaMesLoading ? (
              <LoadingSpinner />
            ) : ventasPorViaMes.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">
                Sin ventas este mes
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={ventasPorViaMes}
                    dataKey="monto"
                    nameKey="via"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ via, percent }) =>
                      `${VIAS_LABEL[via] || via} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {ventasPorViaMes.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={
                          COLORES_VIA[entry.via] ||
                          COLORES_TIPO[index % COLORES_TIPO.length]
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [
                      formatCurrency(value),
                      VIAS_LABEL[name] || name,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* UNIDADES POR MES */}
        <div>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
            Unidades Vendidas por Mes — {año}
          </h2>
          <div className="bg-white border border-gray-200 p-6">
            {ventasLoading ? (
              <LoadingSpinner />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={ventasPorMes}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="nombre" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value) => [value + " unidades", "Unidades"]}
                  />
                  <Bar dataKey="unidades" fill="#1f2937" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* CARTERA DE CRÉDITOS */}
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
        Cartera por Cobrar — {año}
      </h2>
      <div className="bg-white border border-gray-200 p-6 mb-10">
        {carteraLoading ? (
          <LoadingSpinner />
        ) : (
          <>
            <div className="mb-4 flex items-center gap-6">
              <div className="bg-gray-50 border border-gray-200 px-4 py-2">
                <p className="text-xs text-gray-500 uppercase tracking-wider">
                  Total pendiente actual
                </p>
                <p className="text-xl font-light text-gray-900">
                  {formatCurrency(cartera?.totalPendiente || 0)}
                </p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={cartera?.pagosPorMes || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="nombre" tick={{ fontSize: 12 }} />
                <YAxis
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Bar dataKey="cobrado" name="Cobrado" fill="#1f2937" />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </div>

      {/* VENTAS POR DISTRIBUIDORA */}
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
        Ventas por Distribuidora — {año}
      </h2>
      <div className="bg-white border border-gray-200 p-6 mb-10">
        {distribuidoraLoading ? (
          <LoadingSpinner />
        ) : porDistribuidora.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">
            No hay ventas por distribuidora en {año}
          </p>
        ) : (
          <>
            {/* Gráfica de barras: quién vendió más */}
            <ResponsiveContainer
              width="100%"
              height={Math.max(200, porDistribuidora.length * 50)}
            >
              <BarChart
                data={porDistribuidora}
                layout="vertical"
                margin={{ left: 20, right: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis
                  type="number"
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  type="category"
                  dataKey="nombre"
                  width={120}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar
                  dataKey="totalVendido"
                  name="Total vendido"
                  fill="#1f2937"
                />
              </BarChart>
            </ResponsiveContainer>

            {/* Tabla con el detalle */}
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                      #
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                      Distribuidora
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                      Ventas
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                      Unidades
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                      Total vendido
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                      Comisión
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                      Comisión pendiente
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {porDistribuidora.map((d, index) => (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-500">{index + 1}</td>
                      <td className="px-4 py-2 font-medium text-gray-900">
                        {d.nombre}
                      </td>
                      <td className="px-4 py-2 text-gray-600">
                        {d.numeroVentas}
                      </td>
                      <td className="px-4 py-2 text-gray-600">{d.unidades}</td>
                      <td className="px-4 py-2 font-medium text-gray-900">
                        {formatCurrency(d.totalVendido)}
                      </td>
                      <td className="px-4 py-2 text-gray-600">
                        {formatCurrency(d.comisionTotal)}
                      </td>
                      <td className="px-4 py-2">
                        {d.comisionPendiente > 0 ? (
                          <span className="text-red-600 font-medium">
                            {formatCurrency(d.comisionPendiente)}
                          </span>
                        ) : (
                          <span className="text-green-600">Al día</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* PROYECCIÓN A DICIEMBRE */}
      {año === añoActual && (
        <>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
            Proyección a Diciembre — Promedio {formatCurrency(promedioMensual)}
            /mes
          </h2>
          <div className="bg-white border border-gray-200 p-6 mb-10">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={proyeccion}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="nombre" tick={{ fontSize: 12 }} />
                <YAxis
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Real"
                  stroke="#1f2937"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="proyectado"
                  name="Proyectado"
                  stroke="#9ca3af"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* INGRESOS VS EGRESOS */}
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
        Ingresos vs Egresos — {año}
      </h2>
      <div className="bg-white border border-gray-200 p-6 mb-10">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={comparativoData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="nombre" tick={{ fontSize: 12 }} />
            <YAxis
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 12 }}
            />
            <Tooltip formatter={(value) => formatCurrency(value)} />
            <Legend />
            <Bar dataKey="ingresos" name="Ingresos" fill="#1f2937" />
            <Bar dataKey="egresos" name="Egresos" fill="#d1d5db" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* COMPORTAMIENTO DE CLIENTES */}
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
        Comportamiento de Clientes
      </h2>

      {comportamientoLoading ? (
        <div className="bg-white border border-gray-200 p-6 mb-10">
          <LoadingSpinner />
        </div>
      ) : !comportamiento || comportamiento.resumen.totalClientes === 0 ? (
        <div className="bg-white border border-gray-200 p-6 mb-10">
          <p className="text-gray-500 text-sm text-center py-8">
            Todavía no hay ventas con cliente registrado
          </p>
        </div>
      ) : (
        <>
          {/* Indicadores generales */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white border border-gray-200 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                Clientes que compraron
              </p>
              <p className="text-2xl font-light text-gray-900">
                {comportamiento.resumen.totalClientes}
              </p>
            </div>
            <div className="bg-white border border-gray-200 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                Compran más de una vez
              </p>
              <p className="text-2xl font-light text-gray-900">
                {comportamiento.resumen.recurrentes}
              </p>
              <p className="text-xs text-gray-500">
                {comportamiento.resumen.unaSolaCompra} compraron una sola vez
              </p>
            </div>
            <div className="bg-white border border-gray-200 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                Compra promedio
              </p>
              <p className="text-2xl font-light text-gray-900">
                {formatCurrency(comportamiento.resumen.ticketPromedio)}
              </p>
            </div>
            <div className="bg-white border border-gray-200 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                Vuelven a comprar cada
              </p>
              <p className="text-2xl font-light text-gray-900">
                {comportamiento.resumen.frecuenciaPromedio
                  ? `${comportamiento.resumen.frecuenciaPromedio} días`
                  : "—"}
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            {/* Mejores clientes */}
            <div>
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                Mejores Clientes
              </h3>
              <div className="bg-white border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                        #
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                        Cliente
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                        Compras
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 uppercase">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {comportamiento.topClientes.map((c, index) => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-500">{index + 1}</td>
                        <td className="px-4 py-2">
                          <Link
                            href={`/admin/clientes/${c.id}`}
                            className="text-gray-900 hover:text-blue-600"
                          >
                            {c.nombre}
                          </Link>
                          {c.diasEntreCompras && (
                            <p className="text-xs text-gray-500">
                              compra cada {c.diasEntreCompras} días
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-2 text-gray-600">{c.compras}</td>
                        <td className="px-4 py-2 text-right font-medium text-gray-900">
                          {formatCurrency(c.totalGastado)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Clientes por reactivar */}
            <div>
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                Sin Comprar Hace Más de 3 Meses
              </h3>
              <div className="bg-white border border-gray-200 overflow-hidden">
                {comportamiento.inactivos.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-8">
                    Todos los clientes han comprado recientemente
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                          #
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                          Cliente
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                          Sin comprar
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 uppercase">
                          Compró
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {comportamiento.inactivos.map((c, index) => (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-500">
                            {index + 1}
                          </td>
                          <td className="px-4 py-2">
                            <Link
                              href={`/admin/clientes/${c.id}`}
                              className="text-gray-900 hover:text-blue-600"
                            >
                              {c.nombre}
                            </Link>
                            {c.telefono && (
                              <p className="text-xs text-gray-500">
                                {c.telefono}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-2 text-gray-600">
                            {Math.floor(c.diasDesdeUltima / 30)} meses
                          </td>
                          <td className="px-4 py-2 text-right text-gray-600">
                            {formatCurrency(c.totalGastado)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Clientes nuevos vs recurrentes */}
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
            Clientes Nuevos vs Recurrentes por Mes — {año}
          </h3>
          <div className="bg-white border border-gray-200 p-6 mb-10">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={comportamiento.nuevosVsRecurrentes}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="nombre" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="nuevos" name="Clientes nuevos" fill="#1f2937" />
                <Bar
                  dataKey="recurrentes"
                  name="Clientes que repiten"
                  fill="#9ca3af"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* EGRESOS MENSUALES */}
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
        Egresos Mensuales — {año}
      </h2>
      <div className="bg-white border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                #
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Mes
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Gastos
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Notas
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {MESES.map((nombreMes, i) => {
              const mes = i + 1;
              const egreso = egresos.find((e) => e.mes === mes);
              const editando = egresoEditando === mes;

              return (
                <tr key={mes} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-500">{mes}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {nombreMes}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {editando ? (
                      <input
                        type="number"
                        value={egresoMonto}
                        onChange={(e) => setEgresoMonto(e.target.value)}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        autoFocus
                        className="w-32 px-2 py-1 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                      />
                    ) : egreso ? (
                      formatCurrency(egreso.monto)
                    ) : (
                      <span className="text-gray-400">Sin registrar</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {editando ? (
                      <input
                        type="text"
                        value={egresoNotas}
                        onChange={(e) => setEgresoNotas(e.target.value)}
                        placeholder="Notas opcionales..."
                        className="w-48 px-2 py-1 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                      />
                    ) : (
                      egreso?.notas || "-"
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm space-x-3">
                    {editando ? (
                      <>
                        <button
                          onClick={() => handleGuardarEgreso(mes)}
                          disabled={guardandoEgreso}
                          className="text-gray-900 hover:text-gray-600 font-medium"
                        >
                          {guardandoEgreso ? "Guardando..." : "Guardar"}
                        </button>
                        <button
                          onClick={() => {
                            setEgresoEditando(null);
                            setEgresoMonto("");
                            setEgresoNotas("");
                          }}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          setEgresoEditando(mes);
                          setEgresoMonto(egreso?.monto?.toString() || "");
                          setEgresoNotas(egreso?.notas || "");
                        }}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        {egreso ? "Editar" : "Agregar"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
