'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import HeaderNav from '@/components/HeaderNav';
import { supabase } from '@/lib/supabaseClient';

interface ItemInventario {
  id: string;
  sku: string;
  nombre: string;
  categoria: string;
  precio_venta: number;
  stock_taiyari: number;
  stock_haruss: number;
  stock_total: number;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  const [filtroTienda, setFiltroTienda] = useState<string>('todos');
  const [productos, setProductos] = useState<ItemInventario[]>([]);
  const [movimientosPendientes, setMovimientosPendientes] = useState<any[]>([]);
  const [pagosPendientes, setPagosPendientes] = useState<any[]>([]);
  
  // Filtros y Búsqueda
  const [busqueda, setBusqueda] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('todas');
  const [orden, setOrden] = useState<'nombre' | 'stock_desc' | 'precio_desc'>('nombre');

  // Envíos y Rentas
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
  }, [autorizado]);

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

    const { data: inv } = await supabase
      .from('inventario_tienda')
      .select('producto_id, tienda_id, stock_actual');

    if (prods) {
      const inventarioConsolidado: ItemInventario[] = prods.map((p) => {
        const regTaiyari = inv?.find(i => i.producto_id === p.id && i.tienda_id === 'taiyari');
        const regHaruss = inv?.find(i => i.producto_id === p.id && i.tienda_id === 'haruss');
        const stTaiyari = regTaiyari ? regTaiyari.stock_actual : 0;
        const stHaruss = regHaruss ? regHaruss.stock_actual : 0;

        return {
          id: p.id,
          sku: p.sku,
          nombre: p.nombre,
          categoria: p.categoria,
          precio_venta: Number(p.precio_venta) || 0,
          stock_taiyari: stTaiyari,
          stock_haruss: stHaruss,
          stock_total: stTaiyari + stHaruss,
        };
      });

      setProductos(inventarioConsolidado);
    }

    const { data: movs } = await supabase
      .from('movimientos_stock')
      .select('*, productos(nombre), tiendas(nombre)')
      .eq('estado', 'pendiente_recepcion');

    const { data: pagos } = await supabase
      .from('pagos_mercancia')
      .select('*, tiendas(nombre)')
      .eq('estado', 'pendiente_confirmacion');

    if (movs) setMovimientosPendientes(movs);
    if (pagos) setPagosPendientes(pagos);
  };

  const handleUpdatePrecio = async (id: string, nuevoPrecio: number) => {
    await supabase.from('productos').update({ precio_venta: nuevoPrecio }).eq('id', id);
    setProductos((prev) =>
      prev.map((item) => (item.id === id ? { ...item, precio_venta: nuevoPrecio } : item))
    );
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
    setSelectedProd('');
    setCantEnvio(1);
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

  // Categorías únicas
  const categorias = useMemo(() => {
    const cats = new Set(productos.map(p => p.categoria).filter(Boolean));
    return ['todas', ...Array.from(cats)];
  }, [productos]);

  // Filtrado y ordenamiento reactivo
  const productosFiltrados = useMemo(() => {
    return productos
      .filter((p) => {
        const coincideTienda = 
          filtroTienda === 'todos' ? true :
          filtroTienda === 'taiyari' ? p.stock_taiyari > 0 :
          p.stock_haruss > 0;

        const coincideTexto = 
          p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
          p.sku.toLowerCase().includes(busqueda.toLowerCase());

        const coincideCat = categoriaFiltro === 'todas' || p.categoria === categoriaFiltro;

        return coincideTienda && coincideTexto && coincideCat;
      })
      .sort((a, b) => {
        if (orden === 'stock_desc') return b.stock_total - a.stock_total;
        if (orden === 'precio_desc') return b.precio_venta - a.precio_venta;
        return a.nombre.localeCompare(b.nombre);
      });
  }, [productos, filtroTienda, busqueda, categoriaFiltro, orden]);

  // Métricas
  const totalPiezas = productosFiltrados.reduce((acc, p) => {
    if (filtroTienda === 'taiyari') return acc + p.stock_taiyari;
    if (filtroTienda === 'haruss') return acc + p.stock_haruss;
    return acc + p.stock_total;
  }, 0);

  const valorTotal = productosFiltrados.reduce((acc, p) => {
    if (filtroTienda === 'taiyari') return acc + (p.stock_taiyari * p.precio_venta);
    if (filtroTienda === 'haruss') return acc + (p.stock_haruss * p.precio_venta);
    return acc + (p.stock_total * p.precio_venta);
  }, 0);

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

      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 lg:p-8 space-y-6">
        
        {/* Próximas Visitas y Selector de Tienda */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl">
            <span className="text-[10px] uppercase font-mono text-slate-400 block">Visita Taiyari (Quincenal)</span>
            <p className="text-lg sm:text-xl font-bold text-amber-400 mt-1">Lunes Alternado</p>
            <span className="text-[11px] text-slate-500 block mt-1">Base: 19 de Octubre 2026</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl">
            <span className="text-[10px] uppercase font-mono text-slate-400 block">Visita Haruss (Quincenal)</span>
            <p className="text-lg sm:text-xl font-bold text-amber-400 mt-1">Miércoles Alternado</p>
            <span className="text-[11px] text-slate-500 block mt-1">Inicio: 21 de Octubre 2026</span>
          </div>

          <div className="sm:col-span-2 lg:col-span-1 bg-slate-900 border border-amber-500/30 p-4 sm:p-5 rounded-2xl bg-amber-500/5">
            <span className="text-[10px] uppercase font-mono text-amber-400 font-bold block">Filtrar por Tienda</span>
            <select
              value={filtroTienda}
              onChange={(e) => setFiltroTienda(e.target.value)}
              className="mt-2 w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs sm:text-sm font-semibold text-slate-100 outline-none focus:border-amber-500"
            >
              <option value="todos">🌐 Todas las Tiendas (Global)</option>
              <option value="taiyari">🏬 Taiyari Multimarcas (Consigna)</option>
              <option value="haruss">🍰 Haruss Cake (Renta Fija)</option>
            </select>
          </div>
        </div>

        {/* Métricas Adaptables */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl">
            <span className="text-xs text-slate-400 uppercase font-mono block">Piezas Físicas ({filtroTienda})</span>
            <p className="text-2xl sm:text-3xl font-extrabold text-white mt-1">{totalPiezas} <span className="text-xs sm:text-sm font-normal text-slate-400">unidades</span></p>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl">
            <span className="text-xs text-slate-400 uppercase font-mono block">Valor Estimado ({filtroTienda})</span>
            <p className="text-2xl sm:text-3xl font-extrabold text-amber-400 mt-1">${valorTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} <span className="text-xs sm:text-sm font-normal text-slate-400">MXN</span></p>
          </div>
        </div>

        {/* Formulario de Reabastecimiento y Pagos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
            <h2 className="text-base sm:text-lg font-bold text-white mb-3">Reabastecer Inventario</h2>
            <form onSubmit={handleCrearEnvio} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Destino</label>
                  <select
                    value={tiendaEnvio}
                    onChange={(e) => setTiendaEnvio(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs sm:text-sm"
                  >
                    <option value="taiyari">Taiyari Multimarcas</option>
                    <option value="haruss">Haruss Cake</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Piezas a enviar</label>
                  <input
                    type="number"
                    min="1"
                    value={cantEnvio}
                    onChange={(e) => setCantEnvio(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs sm:text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Producto</label>
                <select
                  value={selectedProd}
                  onChange={(e) => setSelectedProd(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs sm:text-sm"
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
                className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-2.5 rounded-xl text-xs sm:text-sm transition"
              >
                Registrar Envío
              </button>
            </form>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl space-y-4">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white mb-2">Validación de Pagos</h2>
              {pagosPendientes.length === 0 ? (
                <p className="text-xs text-slate-500">No hay pagos pendientes de confirmación.</p>
              ) : (
                <div className="space-y-2">
                  {pagosPendientes.map((p) => (
                    <div key={p.id} className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800 gap-2">
                      <div className="min-w-0">
                        <span className="text-xs text-amber-400 font-bold block">{p.tiendas?.nombre}</span>
                        <p className="text-xs sm:text-sm font-semibold">${Number(p.monto).toFixed(2)} MXN</p>
                        <p className="text-[11px] text-slate-400 truncate">{p.nota || 'Sin notas'}</p>
                      </div>
                      <button
                        onClick={() => handleAprobarPago(p.id)}
                        className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-xs font-bold px-3 py-1.5 rounded-lg"
                      >
                        Aprobar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-slate-800 pt-3">
              <h3 className="text-xs sm:text-sm font-bold text-slate-300 mb-1.5">Renta Mensual Haruss Cake</h3>
              <div className="flex gap-2">
                <input
                  type="month"
                  value={periodoRenta}
                  onChange={(e) => setPeriodoRenta(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs"
                />
                <button
                  onClick={handleRegistrarRenta}
                  className="bg-indigo-600 hover:bg-indigo-700 text-xs font-bold px-3.5 py-2 rounded-xl transition"
                >
                  Registrar ($250 MXN)
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* CATÁLOGO RESPONSIVO CON BUSCADOR Y FILTROS */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Catálogo de Productos y Precios</h2>
              <p className="text-xs text-slate-400">Edita el precio de venta directamente en la celda.</p>
            </div>
            <span className="text-xs text-amber-400 font-mono">
              Mostrando {productosFiltrados.length} piezas
            </span>
          </div>

          {/* Filtros */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
            <input
              type="text"
              placeholder="🔍 Buscar por nombre o SKU..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
            
            <select
              value={categoriaFiltro}
              onChange={(e) => setCategoriaFiltro(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-amber-500 capitalize"
            >
              {categorias.map(cat => (
                <option key={cat} value={cat}>
                  {cat === 'todas' ? '📁 Todas las Categorías' : `📁 ${cat}`}
                </option>
              ))}
            </select>

            <select
              value={orden}
              onChange={(e: any) => setOrden(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="nombre">🔤 Nombre (A-Z)</option>
              <option value="stock_desc">📦 Mayor Stock Total</option>
              <option value="precio_desc">💲 Mayor Precio</option>
            </select>
          </div>

          {/* VISTA MÓVIL: Tarjetas */}
          <div className="grid grid-cols-1 gap-2.5 md:hidden">
            {productosFiltrados.length === 0 ? (
              <p className="text-center text-slate-500 text-xs py-8">No se encontraron productos.</p>
            ) : (
              productosFiltrados.map((prod) => (
                <div key={prod.id} className="bg-slate-950/70 border border-slate-800/80 p-3.5 rounded-xl space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-mono block">{prod.categoria} • {prod.sku}</span>
                      <h4 className="text-sm font-semibold text-slate-100">{prod.nombre}</h4>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block font-mono">Total</span>
                      <span className="text-sm font-extrabold text-amber-400">{prod.stock_total} pzas</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs">
                    <div className="flex gap-2 font-mono text-[11px]">
                      <span className="text-amber-300">Taiyari: {prod.stock_taiyari}</span>
                      <span className="text-sky-300">Haruss: {prod.stock_haruss}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-500">$</span>
                      <input
                        type="number"
                        step="0.50"
                        defaultValue={prod.precio_venta}
                        onBlur={(e) => handleUpdatePrecio(prod.id, parseFloat(e.target.value) || 0)}
                        className="w-16 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-xs focus:border-amber-500 outline-none"
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* VISTA TABLETAS Y LAPTOPS: Tabla Tradicional */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs uppercase bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-3">Categoría</th>
                  <th className="p-3">Nombre</th>
                  <th className="p-3">SKU</th>
                  <th className="p-3">Precio Venta</th>
                  {(filtroTienda === 'todos' || filtroTienda === 'taiyari') && (
                    <th className="p-3 text-center text-amber-300">Taiyari</th>
                  )}
                  {(filtroTienda === 'todos' || filtroTienda === 'haruss') && (
                    <th className="p-3 text-center text-sky-300">Haruss</th>
                  )}
                  {filtroTienda === 'todos' && (
                    <th className="p-3 text-right font-bold text-white">Total</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {productosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-500 text-sm">
                      No se encontraron productos coincidentes.
                    </td>
                  </tr>
                ) : (
                  productosFiltrados.map((prod) => (
                    <tr key={prod.id} className="hover:bg-slate-800/40">
                      <td className="p-3 text-slate-400 text-xs">{prod.categoria}</td>
                      <td className="p-3 font-medium text-slate-100">{prod.nombre}</td>
                      <td className="p-3 font-mono text-xs text-slate-400">{prod.sku}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-slate-500">$</span>
                          <input
                            type="number"
                            step="0.50"
                            defaultValue={prod.precio_venta}
                            onBlur={(e) => handleUpdatePrecio(prod.id, parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-right font-mono focus:border-amber-500 outline-none"
                          />
                        </div>
                      </td>
                      {(filtroTienda === 'todos' || filtroTienda === 'taiyari') && (
                        <td className="p-3 text-center font-bold text-amber-400">{prod.stock_taiyari}</td>
                      )}
                      {(filtroTienda === 'todos' || filtroTienda === 'haruss') && (
                        <td className="p-3 text-center font-bold text-sky-400">{prod.stock_haruss}</td>
                      )}
                      {filtroTienda === 'todos' && (
                        <td className="p-3 text-right font-extrabold text-white">{prod.stock_total}</td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  );
}
