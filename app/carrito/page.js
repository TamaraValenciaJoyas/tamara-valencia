"use client";
import { useCartStore } from "@/lib/cartStore";
import Navbar from "@/components/ui/Navbar";
import Footer from "@/components/ui/Footer";
import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/utils/formatters";

export default function CarritoPage() {
  const items = useCartStore((state) => state.items);
  const removeItem = useCartStore((state) => state.removeItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const clearCart = useCartStore((state) => state.clearCart);

  const subtotal = items.reduce((total, item) => {
    return total + item.precio_final * item.quantity;
  }, 0);

  const handleWhatsAppCheckout = () => {
    if (items.length === 0) return;

    // Construir mensaje
    let mensaje = "Hola! Me gustaría consultar por estos productos:\n\n";

    items.forEach((item, index) => {
      mensaje += `${index + 1}. *${item.nombre_comercial}*\n`;
      mensaje += `   Código: ${item.codigo}\n`;
      mensaje += `   Cantidad: ${item.quantity}\n`;
      mensaje += `   Precio unitario: $${item.precio_final.toFixed(2)}\n`;
      mensaje += `   Subtotal: $${(item.precio_final * item.quantity).toFixed(2)}\n\n`;
    });

    mensaje += `*Total: $${subtotal.toFixed(2)}*`;

    const whatsappUrl = `https://wa.me/593998444531?text=${encodeURIComponent(mensaje)}`;
    window.open(whatsappUrl, "_blank");
  };

  return (
    <main className="min-h-screen bg-white">
      <Navbar />

      <div className="pt-28 pb-16 px-4">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="mb-12">
            <h1 className="font-elegant text-4xl md:text-5xl font-light text-gray-900 mb-2">
              Carrito de Compras
            </h1>
            <div className="w-16 h-px bg-[#FFF2E0] mt-4"></div>
          </div>

          {/* Carrito vacío */}
          {items.length === 0 ? (
            <div className="text-center py-16">
              <svg
                className="w-24 h-24 text-gray-300 mx-auto mb-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1"
                  d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                />
              </svg>
              <h2 className="text-2xl font-light text-gray-900 mb-4">
                Tu carrito está vacío
              </h2>
              <p className="text-gray-600 mb-8">
                Explora nuestro catálogo y encuentra las joyas perfectas para ti
              </p>
              <Link
                href="/catalogo"
                className="inline-block px-8 py-3 bg-gray-900 text-white font-light tracking-widest uppercase text-sm hover:bg-gray-800 transition-colors"
              >
                Ver Catálogo
              </Link>
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-12">
              {/* Lista de productos */}
              <div className="lg:col-span-2 space-y-6">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex gap-6 pb-6 border-b border-gray-200"
                  >
                    {/* Imagen */}
                    <div className="relative w-24 h-24 flex-shrink-0 bg-gray-100">
                      {item.imagen_url ? (
                        <Image
                          src={item.imagen_url}
                          alt={item.nombre_comercial}
                          fill
                          className="object-cover"
                          sizes="96px"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg
                            className="w-8 h-8 text-gray-300"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1"
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Información */}
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/catalogo/${item.id}`}
                        className="font-medium text-gray-900 hover:text-gray-600 transition-colors"
                      >
                        {item.nombre_comercial}
                      </Link>
                      <p className="text-sm text-gray-500 mt-1">
                        Código: {item.codigo}
                      </p>
                      <p className="text-sm text-gray-500">
                        {item.material} • {item.categoria}
                      </p>
                      <p className="text-lg font-light text-gray-900 mt-2">
                        {formatPrice(item.precio_final)}
                      </p>

                      {/* Controles de cantidad */}
                      <div className="flex items-center gap-4 mt-4">
                        <div className="flex items-center border border-gray-300">
                          <button
                            onClick={() =>
                              updateQuantity(item.id, item.quantity - 1)
                            }
                            className="px-3 py-1 hover:bg-gray-100 transition-colors"
                          >
                            −
                          </button>
                          <span className="px-4 py-1 border-x border-gray-300 min-w-[3rem] text-center">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() =>
                              updateQuantity(item.id, item.quantity + 1)
                            }
                            disabled={item.quantity >= item.stock}
                            className={`px-3 py-1 transition-colors ${
                              item.quantity >= item.stock
                                ? "text-gray-300 cursor-not-allowed"
                                : "hover:bg-gray-100"
                            }`}
                          >
                            +
                          </button>
                        </div>

                        <button
                          onClick={() => removeItem(item.id)}
                          className="text-sm text-red-600 hover:text-red-700 transition-colors"
                        >
                          Eliminar
                        </button>
                      </div>

                      {item.quantity >= item.stock && (
                        <p className="text-xs text-yellow-600 mt-2">
                          Stock máximo alcanzado
                        </p>
                      )}
                    </div>

                    {/* Subtotal */}
                    <div className="text-right">
                      <p className="font-light text-gray-900">
                        {formatPrice(item.precio_final * item.quantity)}
                      </p>
                    </div>
                  </div>
                ))}

                {/* Botón limpiar carrito */}
                <button
                  onClick={clearCart}
                  className="text-sm text-gray-600 hover:text-red-600 transition-colors"
                >
                  Vaciar carrito
                </button>
              </div>

              {/* Resumen */}
              <div className="lg:col-span-1">
                <div className="bg-gray-50 p-6 sticky top-28">
                  <h2 className="text-xl font-light text-gray-900 mb-6">
                    Resumen del Pedido
                  </h2>

                  <div className="space-y-3 mb-6">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal</span>
                      <span>{formatPrice(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600 text-sm">
                      <span>Items</span>
                      <span>
                        {items.reduce(
                          (total, item) => total + item.quantity,
                          0,
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-gray-300 pt-4 mb-6">
                    <div className="flex justify-between text-xl font-light text-gray-900">
                      <span>Total</span>
                      <span>{formatPrice(subtotal)}</span>
                    </div>
                  </div>

                  <Link
                    href="/carrito/checkout"
                    className="block w-full px-6 py-4 bg-gray-900 text-white text-center font-light tracking-widest uppercase text-sm hover:bg-gray-800 transition-colors mb-4"
                  >
                    Proceder con la Compra
                  </Link>

                  <button
                    onClick={handleWhatsAppCheckout}
                    className="w-full px-6 py-3 border border-gray-300 text-gray-700 text-center font-light tracking-widest uppercase text-xs hover:bg-gray-50 transition-colors mb-4"
                  >
                    O Consultar por WhatsApp
                  </button>

                  <Link
                    href="/catalogo"
                    className="block w-full px-6 py-4 border border-gray-300 text-gray-900 text-center font-light tracking-widest uppercase text-sm hover:bg-gray-50 transition-colors"
                  >
                    Seguir Comprando
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </main>
  );
}
