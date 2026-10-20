// Inserta una fila con el siguiente número correlativo de la tabla.
// El índice único en "numero" evita repetidos; si dos registros chocan,
// se reintenta con el número siguiente.
export const insertarConNumero = async (client, tabla, fila) => {
  for (let intento = 0; intento < 5; intento++) {
    const { data: ultimo, error } = await client
      .from(tabla)
      .select("numero")
      .not("numero", "is", null)
      .order("numero", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    const numero = (ultimo?.numero || 0) + 1;
    const { data, error: insertError } = await client
      .from(tabla)
      .insert([{ ...fila, numero }])
      .select()
      .single();

    if (!insertError) return data;
    if (insertError.code !== "23505") throw insertError;
  }
  throw new Error(
    "No se pudo asignar un número al documento. Intenta de nuevo.",
  );
};
