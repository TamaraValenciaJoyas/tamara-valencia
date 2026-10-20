"use client";

export default function BotonLimpiarBorrador({ onLimpiar }) {
  const handleClick = () => {
    if (
      confirm(
        "¿Limpiar el formulario? Se borra todo lo que estaba escrito y guardado como borrador.",
      )
    ) {
      onLimpiar();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="text-sm text-gray-500 hover:text-red-700 underline"
    >
      Limpiar formulario
    </button>
  );
}
