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

export function calcularTotalVenta(
  sku: string,
  cantidad: number,
  precioUnitarioBase: number
): {
  total: number;
  precioEfectivoPorPieza: number;
  detallePromocion?: string;
} {
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

  const total = cantidad * precioUnitarioBase;
  return {
    total,
    precioEfectivoPorPieza: precioUnitarioBase,
  };
}

/**
 * Calcula la próxima fecha de corte quincenal a partir de la fecha base:
 * - Taiyari: Lunes alternados desde 19 Oct 2026
 * - Haruss: Miércoles alternados desde 21 Oct 2026
 */
export function obtenerProximoCorte(tiendaId: 'taiyari' | 'haruss'): {
  fechaTexto: string;
  diasRestantes: number;
  esHoy: boolean;
  esManana: boolean;
} {
  const baseStr = tiendaId === 'taiyari' ? '2026-10-19T00:00:00' : '2026-10-21T00:00:00';
  const fechaBase = new Date(baseStr);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const msPorDia = 1000 * 60 * 60 * 24;
  const diffDias = Math.floor((hoy.getTime() - fechaBase.getTime()) / msPorDia);

  let diasParaProximo = 0;
  if (diffDias <= 0) {
    diasParaProximo = Math.abs(diffDias);
  } else {
    const resto = diffDias % 14;
    diasParaProximo = resto === 0 ? 0 : 14 - resto;
  }

  const proximaFecha = new Date(hoy.getTime() + diasParaProximo * msPorDia);
  const fechaTexto = proximaFecha.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return {
    fechaTexto,
    diasRestantes: diasParaProximo,
    esHoy: diasParaProximo === 0,
    esManana: diasParaProximo === 1,
  };
}
