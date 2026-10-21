'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import HeaderNav from '@/components/HeaderNav';

export default function LoginPage() {
  const router = useRouter();
  const [identificador, setIdentificador] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    let emailToAuth = identificador.trim();
    if (!emailToAuth.includes('@')) {
      const alias = emailToAuth.toLowerCase();
      if (alias === 'taiyari551020') emailToAuth = 'taiyari551020@fivefriends.internal';
      else if (alias === 'harusscake') emailToAuth = 'harusscake@fivefriends.internal';
      else emailToAuth = `${alias}@fivefriends.internal`;
    }

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: emailToAuth,
      password,
    });

    if (authError || !authData.user) {
      setErrorMsg('Credenciales inválidas. Verifica tu usuario y contraseña.');
      setLoading(false);
      return;
    }

    const { data: perfil, error: perfilError } = await supabase
      .from('perfiles_usuarios')
      .select('rol, tienda_id')
      .eq('id', authData.user.id)
      .single();

    if (perfilError || !perfil) {
      setErrorMsg('No se encontró el perfil de acceso del usuario.');
      setLoading(false);
      return;
    }

    if (perfil.rol === 'admin') {
      router.push('/admin');
    } else if (perfil.tienda_id === 'taiyari' || identificador.toLowerCase().includes('taiyari')) {
      router.push('/portal/taiyari');
    } else if (perfil.tienda_id === 'haruss' || identificador.toLowerCase().includes('haruss')) {
      router.push('/portal/haruss');
    } else {
      router.push(`/portal/${perfil.tienda_id}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans">
      <HeaderNav titulo="Acceso a Proveedores" />

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white tracking-tight">Proveedores y Puntos de Venta</h1>
            <p className="text-sm text-slate-400 mt-2">Ingresa con tus credenciales asignadas</p>
          </div>

          {errorMsg && (
            <div className="mb-6 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
                Usuario
              </label>
              <input
                type="text"
                required
                value={identificador}
                onChange={(e) => setIdentificador(e.target.value)}
                placeholder="usuario"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
                Contraseña
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="contraseña"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-bold py-3 px-4 rounded-xl text-sm transition duration-150 disabled:opacity-50"
            >
              {loading ? 'Validando...' : 'Iniciar Sesión'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
