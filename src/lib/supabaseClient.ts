import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://oledhqzkgqbfeyapgrkw.supabase.co';

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_riogf1Va8lmdPgm_GmxbcQ_AR3_-FUW';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface PerfilUsuario {
  id: string;
  usuario_login: string;
  rol: 'admin' | 'punto_venta';
  tienda_id: string | null;
}

export interface Producto {
  id: string;
  sku: string;
  nombre: string;
  categoria: string;
  precio_venta: number;
}

/**
 * Función para calcular el total considerando las promociones de figuras mini:
 * - Pequeñas: $5 c/u o paquete de 16 por $50
 * - Medianas: $10 c/u o paquete de 8 por $50
 * - Grandes: $20 c/u
 */
export function calcularTotalVenta(
  sku: string,
  cantidad: number,
  precioUnitarioBase: number
): {
  total: number;
  precioEfectivoPorPieza: number;
  detallePromocion?: string;
} {
  // Figuras mini pequeñas (16 x $50, sueltas a $5)
  if (sku === 'FIG-MINI-PEQ-003') {
    const paquetes = Math.floor(cantidad / 16);
    const sobrantes = cantidad % 16;
    const total = paquetes * 50 + sobrantes * 5;
    const detalle =
      paquetes > 0
        ? `${paquetes} paquete(s) de 16 ($${paquetes * 50}) + ${sobrantes} suelta(s) ($${sobrantes * 5})`
        : undefined;

    return {
      total,
      precioEfectivoPorPieza: Number((total / cantidad).toFixed(2)),
      detallePromocion: detalle,
    };
  }

  // Figuras mini medianas (8 x $50, sueltas a $10)
  if (sku === 'FIG-MINI-MED-001') {
    const paquetes = Math.floor(cantidad / 8);
    const sobrantes = cantidad % 8;
    const total = paquetes * 50 + sobrantes * 10;
    const detalle =
      paquetes > 0
        ? `${paquetes} paquete(s) de 8 ($${paquetes * 50}) + ${sobrantes} suelta(s) ($${sobrantes * 10})`
        : undefined;

    return {
      total,
      precioEfectivoPorPieza: Number((total / cantidad).toFixed(2)),
      detallePromocion: detalle,
    };
  }

  // Figuras mini grandes u otros productos normales
  const total = cantidad * precioUnitarioBase;
  return {
    total,
    precioEfectivoPorPieza: precioUnitarioBase,
  };
}
