"use client";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useState } from "react";

export default function AdminNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const isActive = (path) =>
    pathname === path || pathname.startsWith(path + "/");

  const navLinks = [
    { href: "/admin", label: "Dashboard", exact: true },
    { href: "/admin/productos", label: "Productos" },
    { href: "/admin/conjuntos", label: "Conjuntos" },
    { href: "/admin/factores", label: "Factores" },
    { href: "/admin/distribuidoras", label: "Distribuidoras" },
    { href: "/admin/prestamos", label: "Préstamos" },
    { href: "/admin/clientes", label: "Clientes" },
    { href: "/admin/ventas", label: "Ventas" },
    { href: "/admin/pedidos-web", label: "Pedidos Web" },
    { href: "/admin/cuentas", label: "Cuentas" },
    { href: "/admin/reportes", label: "Reportes" },
  ];

  return (
    <nav className="fixed w-full bg-gray-900 text-white z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link href="/admin" className="font-elegant text-xl font-light">
              Tamara Valencia Joyas - Admin
            </Link>

            <div className="hidden md:flex items-center space-x-6">
              {navLinks.map(({ href, label, exact }) => (
                <Link
                  key={href}
                  href={href}
                  className={`text-sm uppercase tracking-wider transition-colors ${
                    exact
                      ? pathname === href
                      : isActive(href)
                        ? "text-white"
                        : "text-gray-400 hover:text-white"
                  }`}
                >
                  {label}
                </Link>
              ))}
              <Link
                href="/"
                target="_blank"
                className="text-sm uppercase tracking-wider text-gray-400 hover:text-white transition-colors"
              >
                Ver Sitio
              </Link>
            </div>
          </div>

          <div className="hidden md:block">
            <button
              onClick={handleLogout}
              className="text-sm uppercase tracking-wider text-gray-400 hover:text-white transition-colors"
            >
              Cerrar Sesión
            </button>
          </div>

          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 rounded-md hover:bg-gray-800"
          >
            {isOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="md:hidden border-t border-gray-800">
          <div className="px-2 pt-2 pb-3 space-y-1">
            {navLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="block px-3 py-2 text-sm uppercase tracking-wider hover:bg-gray-800"
                onClick={() => setIsOpen(false)}
              >
                {label}
              </Link>
            ))}
            <Link
              href="/"
              target="_blank"
              className="block px-3 py-2 text-sm uppercase tracking-wider hover:bg-gray-800"
              onClick={() => setIsOpen(false)}
            >
              Ver Sitio
            </Link>
            <button
              onClick={handleLogout}
              className="block w-full text-left px-3 py-2 text-sm uppercase tracking-wider hover:bg-gray-800"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
