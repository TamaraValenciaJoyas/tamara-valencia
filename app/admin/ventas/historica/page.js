"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { buscarClientes } from "@/lib/supabase/clientes";
import { getDistribuidoras } from "@/lib/supabase/distribuidoras";
import { registrarVentaHistorica } from "@/lib/supabase/ventas";
import { getCuentaPorCliente } from "@/lib/supabase/cuentas";
import { formatPrice } from "@/utils/formatters";
import BotonLimpiarBorrador from "@/components/admin/BotonLimpiarBorrador";

const VIAS_VENTA = [
  { value: "showroom", label: "Showroom" },
  { value: "redes", label: "Redes Sociales" },
  { value: "referido", label: "Referido" },
  { value: "distribuidora", label: "Distribuidora" },
  { value: "tvcj", label: "TVCJ" },
  { value: "cuenta_gerencia", label: "Cuenta Gerencia" },
];

const limitarDecimales = (valor) => {
  if (valor === "") return valor;
  return /^\d*\.?\d{0,2}$/.test(valor) ? valor : valor.slice(0, -1);
};

export default function VentaHistoricaPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [fecha, setFecha] = useState("");
  const [total, setTotal] = useState("");
  const [via, setVia] = useState("");
  const [distribuidoraId, setDistribuidoraId] = useState("");
  const [descripcion, setDescripcion] = useState("");

  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [clientesEncontrados, setClientesEncontrados] = useState([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [buscandoCliente, setBuscandoCliente] = useState(false);

  const [esCredito, setEsCredito] = useState(false);
  const [cuentaCliente, setCuentaCliente] = useState(null);
  const [cargandoCuenta, setCargandoCuenta] = useState(false);
  const [cuotaMensual, setCuotaMensual] = useState("");
  const [diaPago, setDiaPago] = useState("1");
  const [fechaPrimerPago, setFechaPrimerPago] = useState("");

  const [guardando, setGuardando] = useState(false);
  const [borradorCargado, setBorradorCargado] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("venta_historica_borrador");
    if (raw) {
      try {
        const data = JSON.parse(raw);
        if (data.fecha) setFecha(data.fecha);
        if (data.total) setTotal(data.total);
        if (data.via) setVia(data.via);
        if (data.distribuidoraId) setDistribuidoraId(data.distribuidoraId);
        if (data.descripcion) setDescripcion(data.descripcion);
        if (data.clienteSeleccionado)
          setClienteSeleccionado(data.clienteSeleccionado);
        if (data.esCredito) setEsCredito(data.esCredito);
        if (data.cuotaMensual) setCuotaMensual(data.cuotaMensual);
        if (data.diaPago) setDiaPago(data.diaPago);
        if (data.fechaPrimerPago) setFechaPrimerPago(data.fechaPrimerPago);
      } catch (e) {
        console.error("Error al restaurar borrador:", e);
      }
    }
    setBorradorCargado(true);
  }, []);

  const limpiarFormulario = () => {
    localStorage.removeItem("venta_historica_borrador");
    setFecha("");
    setTotal("");
    setVia("");
    setDistribuidoraId("");
    setDescripcion("");
    setClienteSeleccionado(null);
    setBusquedaCliente("");
    setClientesEncontrados([]);
    setEsCredito(false);
    setCuotaMensual("");
    setDiaPago("1");
    setFechaPrimerPago("");
  };

  useEffect(() => {
    if (!borradorCargado || typeof window === "undefined") return;
    localStorage.setItem(
      "venta_historica_borrador",
      JSON.stringify({
        fecha,
        total,
        via,
        distribuidoraId,
        descripcion,
        clienteSeleccionado,
        esCredito,
        cuotaMensual,
        diaPago,
        fechaPrimerPago,
      }),
    );
  }, [
    borradorCargado,
    fecha,
    total,
    via,
    distribuidoraId,
    descripcion,
    clienteSeleccionado,
    esCredito,
    cuotaMensual,
    diaPago,
    fechaPrimerPago,
  ]);

  const { data: distribuidoras = [] } = useQuery({
    queryKey: ["distribuidoras-activas"],
    queryFn: getDistribuidoras,
    staleTime: 10 * 60 * 1000,
  });

  // Buscar la cuenta del cliente seleccionado
  useEffect(() => {
    if (!clienteSeleccionado?.id) {
      setCuentaCliente(null);
      return;
    }
    let cancelado = false;
    setCargandoCuenta(true);
    getCuentaPorCliente(clienteSeleccionado.id)
      .then((c) => {
        if (!cancelado) setCuentaCliente(c);
      })
      .catch((e) => console.error("Error al buscar cuenta:", e))
      .finally(() => {
        if (!cancelado) setCargandoCuenta(false);
      });
    return () => {
      cancelado = true;
    };
  }, [clienteSeleccionado?.id]);

  const distribuidoraSeleccionada = distribuidoras.find(
    (d) => d.id === distribuidoraId,
  );
  const totalNum = parseFloat(total) || 0;
  const comisionMonto = distribuidoraSeleccionada
    ? (totalNum * distribuidoraSeleccionada.porcentaje_comision) / 100
    : 0;

  const cuotaNum = parseFloat(cuotaMensual) || 0;
  const mesesPlazo = cuotaNum > 0 ? Math.ceil(totalNum / cuotaNum) : 0;

  const handleBuscarCliente = async () => {
    if (!busquedaCliente.trim()) return;
    setBuscandoCliente(true);
    try {
      const data = await buscarClientes(busquedaCliente);
      setClientesEncontrados(data);
    } catch (error) {
      console.error("Error al buscar clientes:", error);
    } finally {
      setBuscandoCliente(false);
    }
  };

  const handleConfirmar = async () => {
    if (!fecha) {
      alert("Debe ingresar la fecha de la venta");
      return;
    }
    if (totalNum <= 0) {
      alert("Debe ingresar el monto total de la venta");
      return;
    }
    if (!via) {
      alert("Debe seleccionar la vía de venta");
      return;
    }
    if (via === "distribuidora" && !distribuidoraId) {
      alert("Debe seleccionar una distribuidora");
      return;
    }
    if (esCredito) {
      if (!clienteSeleccionado) {
        alert("Para ventas a crédito debe seleccionar un cliente");
        return;
      }
      if (!cuentaCliente) {
        if (cuotaNum <= 0) {
          alert("Debe ingresar la cuota mensual acordada");
          return;
        }
        if (!fechaPrimerPago) {
          alert("Debe ingresar la fecha del primer pago");
          return;
        }
      }
    }

    if (
      !confirm("¿Confirmar el registro histórico? No afecta el inventario.")
    ) {
      return;
    }

    setGuardando(true);
    try {
      await registrarVentaHistorica({
        venta: {
          fecha: `${fecha}T12:00:00`,
          id_cliente: clienteSeleccionado?.id || null,
          total: totalNum,
          via,
          id_distribuidora: distribuidoraId || null,
          comision_monto: comisionMonto,
          es_credito: esCredito,
          notas: descripcion,
        },
        cuenta:
          esCredito && !cuentaCliente
            ? {
                cuota_mensual: cuotaNum,
                dia_pago: parseInt(diaPago) || 1,
                fecha_primer_pago: fechaPrimerPago,
              }
            : null,
      });

      alert("Registro histórico guardado exitosamente");
      localStorage.removeItem("venta_historica_borrador");
      queryClient.invalidateQueries({ queryKey: ["ventas"] });
      router.push("/admin/ventas");
    } catch (error) {
      console.error("Error al registrar:", error);
      alert("Error al registrar: " + error.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8">
        <button
          onClick={() => router.back()}
          className="text-gray-600 hover:text-gray-900 text-sm"
        >
          ← Volver a ventas
        </button>
      </div>

      <div className="flex items-center justify-between mb-2">
        <h1 className="font-elegant text-4xl font-light text-gray-900">
          Registro Histórico
        </h1>
        <BotonLimpiarBorrador onLimpiar={limpiarFormulario} />
      </div>
      <p className="text-gray-500 mb-10">
        Para registrar ventas anteriores al sistema. No afecta el inventario ni
        descuenta stock.
      </p>

      {/* DATOS DE LA VENTA */}
      <div className="bg-white border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-medium text-gray-900 mb-6 uppercase tracking-wider">
          Datos de la Venta
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha de la venta *
            </label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Monto total ($) *
            </label>
            <input
              type="number"
              value={total}
              onChange={(e) => setTotal(limitarDecimales(e.target.value))}
              placeholder="0.00"
              min="0"
              step="0.01"
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Descripción de las joyas (opcional)
          </label>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={2}
            placeholder="Ej: Aretes de oro, collar de perlas..."
            className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
        </div>
      </div>

      {/* CLIENTE */}
      <div className="bg-white border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-medium text-gray-900 mb-6 uppercase tracking-wider">
          Cliente
        </h2>

        {clienteSeleccionado ? (
          <div className="flex items-center justify-between bg-gray-50 p-4 border border-gray-200">
            <div>
              <p className="font-medium text-gray-900">
                {clienteSeleccionado.nombre}
              </p>
              {clienteSeleccionado.telefono && (
                <p className="text-sm text-gray-600">
                  {clienteSeleccionado.telefono}
                </p>
              )}
            </div>
            <button
              onClick={() => {
                setClienteSeleccionado(null);
                setBusquedaCliente("");
              }}
              className="text-sm text-red-600 hover:text-red-900"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-3">
              <input
                type="text"
                value={busquedaCliente}
                onChange={(e) => setBusquedaCliente(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleBuscarCliente()}
                placeholder="Buscar por nombre o teléfono..."
                className="flex-1 px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
              <button
                onClick={handleBuscarCliente}
                disabled={buscandoCliente}
                className="px-4 py-2 bg-gray-900 text-white text-sm uppercase tracking-wider hover:bg-gray-800 transition-colors disabled:bg-gray-400"
              >
                {buscandoCliente ? "Buscando..." : "Buscar"}
              </button>
            </div>

            {clientesEncontrados.length > 0 && (
              <div className="border border-gray-200 mt-3">
                {clientesEncontrados.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setClienteSeleccionado(c);
                      setClientesEncontrados([]);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                  >
                    <p className="font-medium text-gray-900">{c.nombre}</p>
                    {c.telefono && (
                      <p className="text-sm text-gray-600">{c.telefono}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
            <p className="text-sm text-gray-500 mt-2">
              Opcional para ventas de contado, obligatorio para crédito
            </p>
          </>
        )}
      </div>

      {/* VÍA DE VENTA */}
      <div className="bg-white border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-medium text-gray-900 mb-6 uppercase tracking-wider">
          Vía de Venta
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          {VIAS_VENTA.map((v) => (
            <button
              key={v.value}
              onClick={() => {
                setVia(v.value);
                if (v.value !== "distribuidora") setDistribuidoraId("");
              }}
              className={`py-3 px-4 border text-sm uppercase tracking-wider transition-colors ${
                via === v.value
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-700 border-gray-300 hover:border-gray-900"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        {via === "distribuidora" && (
          <div className="max-w-sm">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Distribuidora
            </label>
            <select
              value={distribuidoraId}
              onChange={(e) => setDistribuidoraId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
            >
              <option value="">Seleccionar</option>
              {distribuidoras.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre} ({d.porcentaje_comision}%)
                </option>
              ))}
            </select>
            {comisionMonto > 0 && (
              <p className="text-sm text-gray-600 mt-2">
                Comisión: {formatPrice(comisionMonto)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* FORMA DE PAGO */}
      <div className="bg-white border border-gray-200 p-6 mb-8">
        <h2 className="text-xl font-medium text-gray-900 mb-6 uppercase tracking-wider">
          Forma de Pago
        </h2>

        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setEsCredito(false)}
            className={`flex-1 py-4 border text-sm uppercase tracking-wider transition-colors ${
              !esCredito
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-700 border-gray-300 hover:border-gray-900"
            }`}
          >
            Contado
          </button>
          <button
            onClick={() => setEsCredito(true)}
            className={`flex-1 py-4 border text-sm uppercase tracking-wider transition-colors ${
              esCredito
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-700 border-gray-300 hover:border-gray-900"
            }`}
          >
            Crédito
          </button>
        </div>

        {esCredito && (
          <div className="max-w-md space-y-4">
            {!clienteSeleccionado ? (
              <div className="bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-800">
                Seleccione primero el cliente.
              </div>
            ) : cargandoCuenta ? (
              <p className="text-sm text-gray-500">Revisando cuenta...</p>
            ) : cuentaCliente ? (
              <div className="bg-gray-50 border border-gray-200 p-4 text-sm text-gray-600 space-y-1">
                <p className="font-medium text-gray-900">
                  {clienteSeleccionado.nombre} ya tiene cuenta abierta
                </p>
                <p>
                  Saldo actual: {formatPrice(cuentaCliente.saldo)} · Cuota{" "}
                  {formatPrice(cuentaCliente.cuota_mensual)}
                </p>
                <p className="pt-2 border-t border-gray-200">
                  Esta compra se sumará a su cuenta con la fecha indicada.
                </p>
              </div>
            ) : (
              <>
                <div className="bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
                  Se abrirá una cuenta nueva para {clienteSeleccionado.nombre}.
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cuota mensual acordada ($)
                  </label>
                  <input
                    type="number"
                    value={cuotaMensual}
                    onChange={(e) =>
                      setCuotaMensual(limitarDecimales(e.target.value))
                    }
                    placeholder="Ej: 200"
                    min="1"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  />
                  {mesesPlazo > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Plazo estimado: {mesesPlazo}{" "}
                      {mesesPlazo === 1 ? "mes" : "meses"}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Día de pago (cada mes)
                  </label>
                  <input
                    type="number"
                    value={diaPago}
                    onChange={(e) => setDiaPago(e.target.value)}
                    min="1"
                    max="31"
                    className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha del primer pago
                  </label>
                  <input
                    type="date"
                    value={fechaPrimerPago}
                    onChange={(e) => setFechaPrimerPago(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Ponga la fecha real en que empezó a pagar, aunque sea del
                    pasado
                  </p>
                </div>
              </>
            )}

            <div className="bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600">
              Los pagos que el cliente ya hizo se registran después desde su
              ficha, con el botón <strong>Agregar movimiento</strong>.
            </div>
          </div>
        )}
      </div>

      <button
        onClick={handleConfirmar}
        disabled={guardando}
        className="w-full py-5 bg-gray-900 text-white text-sm uppercase tracking-widest hover:bg-gray-800 transition-colors disabled:bg-gray-400"
      >
        {guardando ? "Guardando..." : "Guardar Registro Histórico"}
      </button>
    </div>
  );
}
