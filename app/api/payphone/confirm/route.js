import { NextResponse } from "next/server";
import { confirmarPagoPedidoWeb } from "@/lib/supabase/pedidosWeb";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request) {
  try {
    const { id, clientTransactionId } = await request.json();

    if (!id || !clientTransactionId) {
      return NextResponse.json(
        { error: "Faltan datos de la transacción" },
        { status: 400 },
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

    // Pago aprobado por Payphone. clientTransactionId es el id del
    // pedido_web: crear la venta real, descontar stock, y marcarlo pagado.
    await confirmarPagoPedidoWeb(
      clientTransactionId,
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
