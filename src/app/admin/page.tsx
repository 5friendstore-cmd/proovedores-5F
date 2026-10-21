'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import HeaderNav from '@/components/HeaderNav';
import { supabase, Producto } from '@/lib/supabaseClient';

export default function AdminDashboard() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  const [filtroTienda, setFiltroTienda] = useState<string>('todos');
  const [productos, setProductos] = useState<Producto[]>([]);
  const [movimientosPendientes, setMovimientosPendientes] = useState<any[]>([]);
  const [pagosPendientes, setPagosPendientes] = useState<any[]>([]);
  const [selectedProd, setSelectedProd] = useState('');
  const [cantEnvio, setCantEnvio] = useState(1);
  const [tiendaEnvio, setTiendaEnvio] = useState('taiyari');
  const [periodoRenta, setPeriodoRenta] = useState('2026-10');

  useEffect(() => {
    verificarSesionAdmin();
  }, []);

  useEffect(() => {
    if (autorizado) {
      cargarDatos();
    }
  }, [autorizado, filtroTienda]);

  const verificarSesionAdmin = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      router.replace('/login');
      return;
    }

    const { data: perfil } = await supabase
      .from('perfiles_usuarios')
      .select('rol')
      .eq('id', session.user.id)
      .single();

    if (!perfil || perfil.rol !== 'admin') {
      router.replace('/login');
      return;
    }

    setAutorizado(true);
  };

  const cargarDatos = async () => {
    const { data: prods } = await supabase
      .from('productos')
      .select('*')
      .order('categoria', { ascending: true });

    const { data: movs } = await supabase
      .from('movimientos_stock')
      .select('*, productos(nombre), tiendas(nombre)')
      .eq('estado', 'pendiente_recepcion');

    const { data: pagos } = await supabase
      .from('pagos_mercancia')
      .select('*, tiendas(nombre)')
      .eq('estado', 'pendiente_confirmacion');

    if (prods) setProductos(prods);
    if (movs) setMovimientosPendientes(movs);
    if (pagos) setPagosPendientes(pagos);
  };

  const handleUpdatePrecio = async (id: string, nuevoPrecio: number) => {
    await supabase.from('productos').update({ precio_venta: nuevoPrecio }).eq('id', id);
    cargarDatos();
  };

  const handleCrearEnvio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProd) return;
    await supabase.from('movimientos_stock').insert({
      tienda_id: tiendaEnvio,
      producto_id: selectedProd,
      cantidad: cantEnvio,
      tipo: 'alta',
      estado: 'pendiente_recepcion',
      nota: 'Reabastecimiento enviado por Five Friends'
    });
    alert('Envío registrado. Quedará en espera de confirmación por la tienda.');
    cargarDatos();
  };

  const handleAprobarPago = async (pagoId: string) => {
    await supabase
      .from('pagos_mercancia')
      .update({ estado: 'aprobado', aprobado_en: new Date().toISOString() })
      .eq('id', pagoId);
    cargarDatos();
  };

  const handleRegistrarRenta = async () => {
    await supabase.from('pagos_renta').insert({
      tienda_id: 'haruss',
      mes_periodo: periodoRenta,
      monto: 250.00,
      aprobado_por_tienda: false
    });
    alert('Renta registrada. Haruss Cake deberá confirmar la recepción.');
  };

  if (!autorizado) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 font-mono text-xs">
        Verificando credenciales de acceso...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <HeaderNav titulo="Panel Administrador Five Friends" rol="admin" />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <h3 className="text-xs uppercase font-mono text-slate-400">Próxima Visita Taiyari</h3>
            <p className="text-xl font-bold text-amber-400 mt-1">Lunes Alternado</p>
            <p className="text-xs text-slate-500 mt-2">Base: 19 de Octubre 2026 (Quincenal)</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <h3 className="text-xs uppercase font-mono text-slate-400">Próxima Visita Haruss</h3>
            <p className="text-xl font-bold text-amber-400 mt-1">Miércoles Alternado</p>
            <p className="text-xs text-slate-500 mt-2">Inicio: 21 de Octubre 2026 (Quincenal)</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <h3 className="text-xs uppercase font-mono text-slate-400">Filtro de Visualización</h3>
            <select
              value={filtroTienda}
              onChange={(e) => setFiltroTienda(e.target.value)}
              className="mt-2 w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-slate-200"
            >
              <option value="todos">Todas las Tiendas (Global)</option>
              <option value="taiyari">Taiyari Multimarcas (Consigna)</option>
              <option value="haruss">Haruss Cake (Renta Fija)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
            <h2 className="text-lg font-bold text-white mb-4">Reabastecer Inventario</h2>
            <form onSubmit={handleCrearEnvio} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">Destino</label>
                  <select
                    value={tiendaEnvio}
                    onChange={(e) => setTiendaEnvio(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm mt-1"
                  >
                    <option value="taiyari">Taiyari Multimarcas</option>
                    <option value="haruss">Haruss Cake</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400">Piezas a enviar</label>
                  <input
                    type="number"
                    min="1"
                    value={cantEnvio}
                    onChange={(e) => setCantEnvio(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm mt-1"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400">Producto</label>
                <select
                  value={selectedProd}
                  onChange={(e) => setSelectedProd(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm mt-1"
                  required
                >
                  <option value="">Selecciona un producto...</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>[{p.sku}] {p.nombre}</option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-2.5 rounded-lg text-sm"
              >
                Registrar Envío a Tienda
              </button>
            </form>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white mb-3">Pagos de Mercancía por Validar</h2>
              {pagosPendientes.length === 0 ? (
                <p className="text-xs text-slate-500">No hay pagos reportados pendientes.</p>
              ) : (
                <div className="space-y-2">
                  {pagosPendientes.map((p) => (
                    <div key={p.id} className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <div>
                        <span className="text-xs text-amber-400 font-bold">{p.tiendas?.nombre}</span>
                        <p className="text-sm font-semibold">${p.monto.toFixed(2)} MXN</p>
                        <p className="text-[11px] text-slate-400">{p.nota || 'Sin notas'}</p>
                      </div>
                      <button
                        onClick={() => handleAprobarPago(p.id)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-xs font-bold px-3 py-1.5 rounded-lg"
                      >
                        Aprobar Ingreso
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-slate-800 pt-4">
              <h3 className="text-sm font-bold text-slate-300 mb-2">Emisión de Renta Mensual (Haruss Cake)</h3>
              <div className="flex gap-2">
                <input
                  type="month"
                  value={periodoRenta}
                  onChange={(e) => setPeriodoRenta(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs"
                />
                <button
                  onClick={handleRegistrarRenta}
                  className="bg-indigo-600 hover:bg-indigo-700 text-xs font-bold px-4 py-2 rounded-lg"
                >
                  Registrar Pago de Renta ($250 MXN)
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">Catálogo de Productos y Modificación de Precios</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs uppercase bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-3">SKU</th>
                  <th className="p-3">Nombre</th>
                  <th className="p-3">Categoría</th>
                  <th className="p-3">Precio Venta (MXN)</th>
                  <th className="p-3">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {productos.map((prod) => (
                  <tr key={prod.id} className="hover:bg-slate-800/40">
                    <td className="p-3 font-mono text-xs text-amber-400">{prod.sku}</td>
                    <td className="p-3 font-medium">{prod.nombre}</td>
                    <td className="p-3 text-slate-400">{prod.categoria}</td>
                    <td className="p-3">
                      <input
                        type="number"
                        step="0.50"
                        defaultValue={prod.precio_venta}
                        onBlur={(e) => handleUpdatePrecio(prod.id, parseFloat(e.target.value) || 0)}
                        className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-right font-mono"
                      />
                    </td>
                    <td className="p-3 text-xs text-slate-500">Auto-guarda al salir</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
