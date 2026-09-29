"use client";
import { useState, useEffect } from "react";
import Script from "next/script";
import Link from "next/link";
import Image from "next/image";
import { useCartStore } from "@/lib/cartStore";
import { formatPrice } from "@/utils/formatters";
import Navbar from "@/components/ui/Navbar";
import Footer from "@/components/ui/Footer";

const DATOS_BANCARIOS = {
  banco: "PRODUBANCO",
  cuentaCorriente: "12036536",
  cuentaAhorros: "12722027775",
  titular: "Tamara Valencia",
  cedula: "1710566785",
  celular: "0998444531",
  correo: "tammyvc6@gmail.com",
};

export default function CheckoutPage() {
  const items = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clearCart);

  const [form, setForm] = useState({
    nombreCliente: "",
    cedula: "",
    celular: "",
    nombreReceptor: "",
    direccion: "",
    ubicacionMaps: "",
    horarioEntrega: "",
    notas: "",
  });
  const [metodoPago, setMetodoPago] = useState(null);
  const [scriptListo, setScriptListo] = useState(false);
  const [pedidoCreado, setPedidoCreado] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [pedidoTransferenciaConfirmado, setPedidoTransferenciaConfirmado] =
    useState(false);
  const [errores, setErrores] = useState({});
  const [toast, setToast] = useState(null);

  const mostrarToast = (mensaje, tipo = "error") => {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 4000);
  };

  const subtotal = items.reduce(
    (total, item) => total + item.precio_final * item.quantity,
    0,
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errores[name]) {
      setErrores((prev) => ({ ...prev, [name]: false }));
    }
  };

  const CAMPOS_REQUERIDOS = [
    "nombreCliente",
    "cedula",
    "celular",
    "nombreReceptor",
    "direccion",
    "horarioEntrega",
  ];

  const validarFormulario = () => {
    const nuevosErrores = {};
    CAMPOS_REQUERIDOS.forEach((campo) => {
      if (!form[campo].trim()) nuevosErrores[campo] = true;
    });
    setErrores(nuevosErrores);
    return Object.keys(nuevosErrores).length === 0;
  };

  // El servidor calcula los precios y verifica el stock.
  const registrarPedido = async (metodo_pago) => {
    const response = await fetch("/api/pedidos-web", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metodo_pago,
        cliente: {
          nombre_cliente: form.nombreCliente,
          cedula_cliente: form.cedula,
          celular_cliente: form.celular,
          nombre_receptor: form.nombreReceptor,
          direccion: form.direccion,
          ubicacion_maps: form.ubicacionMaps,
          horario_entrega: form.horarioEntrega,
          notas: form.notas,
        },
        items: items.map((item) => ({
          id_producto: item.id,
          cantidad: item.quantity,
        })),
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error);
      error.deServidor = true;
      throw error;
    }
    return data;
  };

  const mensajeDeError = (error, respaldo) =>
    error.deServidor && error.message ? error.message : respaldo;

  const handleConfirmarTransferencia = async () => {
    if (!validarFormulario()) {
      mostrarToast("Completa los campos marcados antes de continuar");
      return;
    }
    setProcesando(true);
    try {
      await registrarPedido("transferencia");
      clearCart();
      setPedidoTransferenciaConfirmado(true);
    } catch (error) {
      console.error("Error al registrar el pedido:", error);
      mostrarToast(
        mensajeDeError(
          error,
          "Hubo un error al registrar tu pedido. Intenta de nuevo.",
        ),
      );
    } finally {
      setProcesando(false);
    }
  };

  const handleIniciarPagoConTarjeta = async () => {
    if (!validarFormulario()) {
      mostrarToast("Completa los campos marcados antes de continuar");
      return;
    }
    setProcesando(true);
    try {
      const pedido = await registrarPedido("payphone");
      if (Math.abs(pedido.subtotal - subtotal) > 0.001) {
        mostrarToast(
          `El total se actualizó a ${formatPrice(pedido.subtotal)} con los precios vigentes`,
          "info",
        );
      }
      setPedidoCreado(pedido);
    } catch (error) {
      console.error("Error al preparar el pedido:", error);
      mostrarToast(
        mensajeDeError(
          error,
          "Hubo un error al preparar tu pedido. Intenta de nuevo.",
        ),
      );
    } finally {
      setProcesando(false);
    }
  };

  // Una vez que el pedido está creado y el script de Payphone cargó,
  // renderiza la cajita de pago con los datos de esta transacción.
  useEffect(() => {
    if (!pedidoCreado || !scriptListo) return;
    if (typeof window === "undefined" || !window.PPaymentButtonBox) return;

    const montoCentavos = Math.round(pedidoCreado.subtotal * 100);

    // Payphone exige el celular en formato internacional: +593987654321
    // El cliente normalmente lo escribe como 0987654321 (formato local).
    const celularLimpio = form.celular.replace(/\D/g, "");
    const celularInternacional = celularLimpio.startsWith("0")
      ? `+593${celularLimpio.slice(1)}`
      : celularLimpio.startsWith("593")
        ? `+${celularLimpio}`
        : `+593${celularLimpio}`;

    // Limpiar el contenedor antes de dibujar: en desarrollo, React Strict
    // Mode ejecuta este efecto dos veces y duplicaría el botón de pago.
    const contenedor = document.getElementById("pp-button");
    if (contenedor) contenedor.innerHTML = "";

    new window.PPaymentButtonBox({
      token: process.env.NEXT_PUBLIC_PAYPHONE_TOKEN,
      clientTransactionId: pedidoCreado.id,
      amount: montoCentavos,
      amountWithoutTax: montoCentavos,
      currency: "USD",
      storeId: process.env.NEXT_PUBLIC_PAYPHONE_STORE_ID,
      reference: `Pedido Tamara Valencia Joyas`,
      lang: "es",
      phoneNumber: celularInternacional,
      documentId: form.cedula,
    }).render("pp-button");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoCreado, scriptListo]);

  if (items.length === 0 && !pedidoTransferenciaConfirmado) {
    return (
      <main className="min-h-screen bg-white">
        <Navbar />
        <div className="pt-32 pb-20 px-4 text-center">
          <p className="text-gray-600 mb-8">Tu carrito está vacío.</p>
          <Link
            href="/catalogo"
            className="inline-block px-8 py-3 bg-gray-900 text-white text-sm uppercase tracking-widest hover:bg-gray-800 transition-colors"
          >
            Ver Catálogo
          </Link>
        </div>
        <Footer />
      </main>
    );
  }

  if (pedidoTransferenciaConfirmado) {
    return (
      <main className="min-h-screen bg-white">
        <Navbar />
        <div className="pt-28 pb-20 px-4">
          <div className="max-w-xl mx-auto text-center">
            <svg
              className="w-16 h-16 text-green-600 mx-auto mb-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h1 className="font-elegant text-3xl font-light text-gray-900 mb-4">
              Pedido Registrado
            </h1>
            <div className="w-16 h-px bg-[#FFF2E0] mx-auto mb-6" />
            <p className="text-gray-600 mb-8">
              Hemos recibido tu pedido. Realiza la transferencia o depósito con
              los datos de abajo y envíanos el comprobante por WhatsApp para
              confirmar tu pago y coordinar la entrega.
            </p>
            <div className="bg-gray-50 p-6 text-left mb-8">
              <h2 className="font-medium text-gray-900 mb-4">
                Datos para transferencia o depósito
              </h2>
              <div className="space-y-1 text-sm text-gray-700">
                <p>
                  <strong>{DATOS_BANCARIOS.banco}</strong>
                </p>
                <p>Cta. Corriente: {DATOS_BANCARIOS.cuentaCorriente}</p>
                <p>Cta. Ahorros: {DATOS_BANCARIOS.cuentaAhorros}</p>
                <p>A nombre de: {DATOS_BANCARIOS.titular}</p>
                <p>Cédula: {DATOS_BANCARIOS.cedula}</p>
              </div>
            </div>
            <a
              href={`https://wa.me/593998444531?text=${encodeURIComponent(
                "Hola! Acabo de registrar un pedido y quiero enviarles el comprobante de mi transferencia.",
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-8 py-4 bg-gray-900 text-white text-sm uppercase tracking-widest hover:bg-gray-800 transition-colors mb-4"
            >
              Enviar Comprobante por WhatsApp
            </a>
            <div>
              <Link
                href="/catalogo"
                className="text-sm text-gray-600 hover:text-gray-900 underline"
              >
                Volver al Catálogo
              </Link>
            </div>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      <Script
        src="https://cdn.payphonetodoesposible.com/box/v2.0/payphone-payment-box.js"
        type="module"
        strategy="afterInteractive"
        onLoad={() => setScriptListo(true)}
      />
      <link
        rel="stylesheet"
        href="https://cdn.payphonetodoesposible.com/box/v2.0/payphone-payment-box.css"
      />

      <Navbar />

      <div className="pt-28 pb-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="mb-10">
            <h1 className="font-elegant text-4xl md:text-5xl font-light text-gray-900 mb-2">
              Finalizar Compra
            </h1>
            <div className="w-16 h-px bg-[#FFF2E0] mt-4"></div>
          </div>

          <div className="grid lg:grid-cols-3 gap-12">
            <div className="lg:col-span-2 space-y-8">
              {/* Datos de entrega */}
              <div>
                <h2 className="text-xl font-light text-gray-900 mb-4">
                  Datos de Entrega
                </h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Nombre y apellido del cliente *
                    </label>
                    <input
                      type="text"
                      name="nombreCliente"
                      value={form.nombreCliente}
                      onChange={handleChange}
                      disabled={!!pedidoCreado}
                      className={`w-full px-4 py-2 border focus:outline-none disabled:bg-gray-100 ${
                        errores.nombreCliente
                          ? "border-red-500 focus:border-red-500"
                          : "border-gray-300 focus:border-gray-500"
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Cédula *
                    </label>
                    <input
                      type="text"
                      name="cedula"
                      value={form.cedula}
                      onChange={handleChange}
                      disabled={!!pedidoCreado}
                      className={`w-full px-4 py-2 border focus:outline-none disabled:bg-gray-100 ${
                        errores.cedula
                          ? "border-red-500 focus:border-red-500"
                          : "border-gray-300 focus:border-gray-500"
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Celular / WhatsApp *
                    </label>
                    <input
                      type="text"
                      name="celular"
                      value={form.celular}
                      onChange={handleChange}
                      disabled={!!pedidoCreado}
                      className={`w-full px-4 py-2 border focus:outline-none disabled:bg-gray-100 ${
                        errores.celular
                          ? "border-red-500 focus:border-red-500"
                          : "border-gray-300 focus:border-gray-500"
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Nombre y apellido de quien recibe *
                    </label>
                    <input
                      type="text"
                      name="nombreReceptor"
                      value={form.nombreReceptor}
                      onChange={handleChange}
                      disabled={!!pedidoCreado}
                      className={`w-full px-4 py-2 border focus:outline-none disabled:bg-gray-100 ${
                        errores.nombreReceptor
                          ? "border-red-500 focus:border-red-500"
                          : "border-gray-300 focus:border-gray-500"
                      }`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm text-gray-600 mb-1">
                      Dirección completa *
                    </label>
                    <input
                      type="text"
                      name="direccion"
                      value={form.direccion}
                      onChange={handleChange}
                      disabled={!!pedidoCreado}
                      className={`w-full px-4 py-2 border focus:outline-none disabled:bg-gray-100 ${
                        errores.direccion
                          ? "border-red-500 focus:border-red-500"
                          : "border-gray-300 focus:border-gray-500"
                      }`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm text-gray-600 mb-1">
                      Link de ubicación (Google Maps)
                    </label>
                    <input
                      type="text"
                      name="ubicacionMaps"
                      value={form.ubicacionMaps}
                      onChange={handleChange}
                      disabled={!!pedidoCreado}
                      placeholder="Opcional, pero nos ayuda a llegar más rápido"
                      className="w-full px-4 py-2 border border-gray-300 focus:outline-none focus:border-gray-500 disabled:bg-gray-100"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm text-gray-600 mb-1">
                      Horarios en que hay alguien para recibir *
                    </label>
                    <input
                      type="text"
                      name="horarioEntrega"
                      value={form.horarioEntrega}
                      onChange={handleChange}
                      disabled={!!pedidoCreado}
                      placeholder="Ej: Lunes a viernes de 9am a 6pm"
                      className={`w-full px-4 py-2 border focus:outline-none disabled:bg-gray-100 ${
                        errores.horarioEntrega
                          ? "border-red-500 focus:border-red-500"
                          : "border-gray-300 focus:border-gray-500"
                      }`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm text-gray-600 mb-1">
                      Notas adicionales
                    </label>
                    <input
                      type="text"
                      name="notas"
                      value={form.notas}
                      onChange={handleChange}
                      disabled={!!pedidoCreado}
                      className="w-full px-4 py-2 border border-gray-300 focus:outline-none focus:border-gray-500 disabled:bg-gray-100"
                    />
                  </div>
                </div>
              </div>

              {/* Info de zonas de entrega */}
              <div className="bg-gray-50 p-6 text-sm text-gray-700 space-y-2">
                <p className="font-medium text-gray-900 uppercase tracking-wider text-xs mb-2">
                  Zonas de Entrega
                </p>
                <p>
                  <strong>Quito:</strong> Zona Centro Norte y Norte, Valle de
                  Cumbayá, Tumbaco, Puembo
                </p>
                <p>
                  <strong>Resto de Ecuador:</strong> entregas por Courier
                </p>
                <p>
                  <strong>Internacional:</strong> se entrega en Quito a un
                  contacto
                </p>
                <p className="text-xs text-gray-500 pt-2">
                  El costo del envío se coordina aparte por WhatsApp, según la
                  distancia y el volumen del pedido.
                </p>
              </div>

              {/* Método de pago */}
              {!pedidoCreado && (
                <div>
                  <h2 className="text-xl font-light text-gray-900 mb-4">
                    Método de Pago
                  </h2>
                  <div className="space-y-3">
                    <button
                      onClick={() => setMetodoPago("payphone")}
                      className={`w-full text-left px-5 py-4 border transition-colors ${
                        metodoPago === "payphone"
                          ? "border-gray-900 bg-gray-50"
                          : "border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      <p className="font-medium text-gray-900">
                        Tarjeta de crédito o débito
                      </p>
                      <p className="text-sm text-gray-500">Pago con Payphone</p>
                    </button>
                    <button
                      onClick={() => setMetodoPago("transferencia")}
                      className={`w-full text-left px-5 py-4 border transition-colors ${
                        metodoPago === "transferencia"
                          ? "border-gray-900 bg-gray-50"
                          : "border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      <p className="font-medium text-gray-900">
                        Transferencia o Depósito
                      </p>
                      <p className="text-sm text-gray-500">
                        Te mostramos los datos bancarios
                      </p>
                    </button>
                  </div>

                  {metodoPago === "transferencia" && (
                    <button
                      onClick={handleConfirmarTransferencia}
                      disabled={procesando}
                      className="w-full mt-6 px-6 py-4 bg-gray-900 text-white text-center font-light tracking-widest uppercase text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
                    >
                      {procesando ? "Registrando..." : "Confirmar Pedido"}
                    </button>
                  )}

                  {metodoPago === "payphone" && (
                    <button
                      onClick={handleIniciarPagoConTarjeta}
                      disabled={procesando}
                      className="w-full mt-6 px-6 py-4 bg-gray-900 text-white text-center font-light tracking-widest uppercase text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
                    >
                      {procesando ? "Preparando..." : "Continuar al Pago"}
                    </button>
                  )}
                </div>
              )}

              {pedidoCreado && (
                <div>
                  <h2 className="text-xl font-light text-gray-900 mb-4">
                    Completa tu Pago
                  </h2>
                  <div id="pp-button"></div>
                </div>
              )}
            </div>

            {/* Resumen del pedido */}
            <div className="lg:col-span-1">
              <div className="bg-gray-50 p-6 sticky top-28">
                <h2 className="text-lg font-light text-gray-900 mb-6">
                  Resumen del Pedido
                </h2>
                <div className="space-y-4 mb-6 max-h-80 overflow-y-auto">
                  {items.map((item) => (
                    <div key={item.id} className="flex gap-3">
                      <div className="relative w-14 h-14 flex-shrink-0 bg-gray-100">
                        {item.imagen_url && (
                          <Image
                            src={item.imagen_url}
                            alt={item.nombre_comercial}
                            fill
                            className="object-cover"
                            sizes="56px"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 truncate">
                          {item.nombre_comercial}
                        </p>
                        <p className="text-xs text-gray-500">
                          {item.quantity} x {formatPrice(item.precio_final)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-300 pt-4">
                  <div className="flex justify-between text-xl font-light text-gray-900">
                    <span>Total</span>
                    <span>
                      {formatPrice(pedidoCreado?.subtotal ?? subtotal)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    No incluye envío (se coordina aparte)
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 text-sm text-white shadow-lg ${
            toast.tipo === "error" ? "bg-red-600" : "bg-green-600"
          }`}
        >
          {toast.mensaje}
        </div>
      )}
    </main>
  );
}
