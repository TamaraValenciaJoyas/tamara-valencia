import { v2 as cloudinary } from "cloudinary";
import { supabase } from "@/lib/supabase/client";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(request) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    const { data: sesion } = token
      ? await supabase.auth.getUser(token)
      : { data: null };
    if (!sesion?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const { public_id } = await request.json();

    // Validar que venga un public_id
    if (!public_id) {
      return Response.json(
        { error: "public_id es requerido" },
        { status: 400 },
      );
    }

    // Seguridad: solo permitir eliminar imágenes de la carpeta tamara-valencia
    if (!public_id.startsWith("tamara-valencia/")) {
      return Response.json(
        { error: "No autorizado para eliminar esta imagen" },
        { status: 403 },
      );
    }

    // Eliminar de Cloudinary
    const resultado = await cloudinary.uploader.destroy(public_id);

    // Cloudinary devuelve 'ok' si se eliminó o 'not found' si no existía
    if (resultado.result !== "ok" && resultado.result !== "not found") {
      throw new Error(`Cloudinary respondió: ${resultado.result}`);
    }

    return Response.json({ success: true, result: resultado.result });
  } catch (error) {
    console.error("[Cloudinary Delete]", error);
    return Response.json(
      { error: "Error al eliminar la imagen: " + error.message },
      { status: 500 },
    );
  }
}
