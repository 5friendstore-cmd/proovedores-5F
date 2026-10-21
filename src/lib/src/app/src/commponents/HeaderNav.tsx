'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function HeaderNav({ titulo = "Portal Proveedores 5F", rol = "" }: { titulo?: string; rol?: string }) {
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
            Five Friends
          </span>
          <span className="text-slate-400 text-sm hidden md:inline">| {titulo}</span>
          {rol && (
            <span className="text-xs bg-slate-800 border border-slate-700 text-amber-300 font-mono px-2 py-0.5 rounded uppercase">
              {rol}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-3">
          <a
            href="https://five-friends-web.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs sm:text-sm font-bold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 px-3.5 py-1.5 rounded-lg shadow transition"
          >
            <span>Sitio Oficial</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          {rol && (
            <button
              onClick={handleLogout}
              className="text-xs text-slate-400 hover:text-white px-2 py-1.5 rounded border border-transparent hover:border-slate-700 transition"
            >
              Cerrar sesión
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
