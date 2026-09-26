import { NextResponse } from "next/server";
import {
  getPedidoWebById,
  verificarStockPedido,
  confirmarPagoPedidoWeb,
  cancelarPedidoWeb,
} from "@/lib/supabase/pedidosWeb";
import { supabaseAdmin } from "@/lib/supabase/admin";

const noProcesado = (message) =>
  NextResponse.json({ statusCode: 0, transactionStatus: "Canceled", message });

export async function POST(request) {
  try {
    const { id, clientTransactionId } = await request.json();

    if (!id || !clientTransactionId) {
      return NextResponse.json(
        { error: "Faltan datos de la transacción" },
        { status: 400 },
      );
    }

    let pedido;
    try {
      pedido = await getPedidoWebById(clientTransactionId, supabaseAdmin);
    } catch {
      return noProcesado(
        "No se encontró el pedido. No se realizó ningún cobro.",
      );
    }

    // Recarga de la página después de un pago ya registrado
    if (pedido.estado === "pagado") {
      return NextResponse.json({
        statusCode: 3,
        transactionStatus: "Approved",
        transactionId: pedido.payphone_transaction_id,
        amount: parseFloat(pedido.subtotal),
      });
    }
    if (pedido.estado === "cancelado") {
      return noProcesado(
        "Este pedido fue cancelado. No se realizó ningún cobro.",
      );
    }

    // Sin confirmar, Payphone reversa el cobro automáticamente.
    const sinStock = await verificarStockPedido(pedido, supabaseAdmin);
    if (sinStock.length > 0) {
      await cancelarPedidoWeb(pedido.id, supabaseAdmin);
      return noProcesado(
        "Una de las piezas de tu pedido acaba de agotarse. No se realizó el cobro; si ves un cargo pendiente, se reversará automáticamente.",
      );
    }

    const payphoneResponse = await fetch(
      "https://paymentbox.payphonetodoesposible.com/api/confirm",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_PAYPHONE_TOKEN}`,
        },
        body: JSON.stringify({
          id: parseInt(id, 10),
          clientTxId: clientTransactionId,
        }),
      },
    );

    const data = await payphoneResponse.json();

    if (data.statusCode !== 3) {
      return NextResponse.json({
        statusCode: data.statusCode,
        transactionStatus: data.transactionStatus,
        message: data.message,
      });
    }

    // El monto cobrado debe ser exactamente el total del pedido.
    const esperadoCentavos = Math.round(parseFloat(pedido.subtotal) * 100);
    const cobradoCentavos = Number(data.amount);
    if (cobradoCentavos !== esperadoCentavos) {
      console.error(
        `Pedido ${pedido.id}: monto cobrado ${cobradoCentavos} distinto al esperado ${esperadoCentavos}`,
      );
      await supabaseAdmin
        .from("pedidos_web")
        .update({
          payphone_transaction_id: data.transactionId,
          notas:
            `REVISAR: Payphone cobró $${(cobradoCentavos / 100).toFixed(2)} y el pedido es de $${(esperadoCentavos / 100).toFixed(2)}. ${pedido.notas || ""}`.trim(),
        })
        .eq("id", pedido.id);
      return NextResponse.json({
        statusCode: 0,
        transactionStatus: "Review",
        message:
          "Tu pago requiere una revisión manual. Te contactaremos por WhatsApp para completar tu pedido.",
      });
    }

    await confirmarPagoPedidoWeb(
      pedido.id,
      { payphone_transaction_id: data.transactionId },
      supabaseAdmin,
    );

    return NextResponse.json({
      statusCode: data.statusCode,
      transactionStatus: data.transactionStatus,
      transactionId: data.transactionId,
      amount: data.amount / 100,
    });
  } catch (error) {
    console.error("Error al confirmar pago de Payphone:", error);
    return NextResponse.json(
      { error: "Error al confirmar el pago" },
      { status: 500 },
    );
  }
}
