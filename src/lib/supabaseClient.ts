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
