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
  
  // Pestañas del Panel Admin
  const [seccionActiva, setSeccionActiva] = useState<'catalogo' | 'movimientos' | 'pagos'>('catalogo');

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('todas');
  const [orden, setOrden] = useState<'nombre' | 'stock_desc' | 'precio_desc'>('nombre');

  // Modal Crear / Editar Producto
  const [modalAbierto, setModalAbierto] = useState(false);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [prodEditId, setProdEditId] = useState('');
  const [formNombre, setFormNombre] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formCategoria, setFormCategoria] = useState('Figuras');
  const [formPrecio, setFormPrecio] = useState('0.00');

  // Envíos regulares y Bazar
  const [tiendaOperacion, setTiendaOperacion] = useState('taiyari');
  const [prodSeleccionado, setProdSeleccionado] = useState('');
  const [cantOperacion, setCantOperacion] = useState(1);
  const [tipoMovimiento, setTipoMovimiento] = useState<'alta' | 'baja_bazar' | 'retorno_bazar'>('alta');
  const [notaMovimiento, setNotaMovimiento] = useState('');

  // Renta mensual Haruss
  const [periodoRenta, setPeriodoRenta] = useState('2026-11');

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
      .eq('estado', 'pendiente_recepcion')
      .order('creado_en', { ascending: false });

    const { data: pagos } = await supabase
      .from('pagos_mercancia')
      .select('*, tiendas(nombre)')
      .eq('estado', 'pendiente_confirmacion')
      .order('creado_en', { ascending: false });

    if (movs) setMovimientosPendientes(movs);
    if (pagos) setPagosPendientes(pagos);
  };

  // Guardar (Crear o Editar Producto)
  const handleGuardarProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    const precio = parseFloat(formPrecio) || 0;

    if (modoEdicion) {
      const { error } = await supabase
        .from('productos')
        .update({
          nombre: formNombre.trim(),
          sku: formSku.trim(),
          categoria: formCategoria.trim(),
          precio_venta: precio
        })
        .eq('id', prodEditId);

      if (error) {
        alert('Error al actualizar: ' + error.message);
        return;
      }
      alert('Producto actualizado con éxito.');
    } else {
      const { data, error } = await supabase
        .from('productos')
        .insert({
          nombre: formNombre.trim(),
          sku: formSku.trim(),
          categoria: formCategoria.trim(),
          precio_venta: precio
        })
        .select()
        .single();

      if (error) {
        alert('Error al crear producto (verifica que el SKU sea único): ' + error.message);
        return;
      }

      // Inicializar stock en 0 en ambas tiendas
      if (data) {
        await supabase.from('inventario_tienda').insert([
          { tienda_id: 'taiyari', producto_id: data.id, stock_actual: 0 },
          { tienda_id: 'haruss', producto_id: data.id, stock_actual: 0 }
        ]);
      }
      alert('Nuevo producto agregado al catálogo.');
    }

    setModalAbierto(false);
    cargarDatos();
  };

  const abrirModalCrear = () => {
    setModoEdicion(false);
    setProdEditId('');
    setFormNombre('');
    setFormSku('');
    setFormCategoria('Figuras');
    setFormPrecio('0.00');
    setModalAbierto(true);
  };

  const abrirModalEditar = (prod: ItemInventario) => {
    setModoEdicion(true);
    setProdEditId(prod.id);
    setFormNombre(prod.nombre);
    setFormSku(prod.sku);
    setFormCategoria(prod.categoria);
    setFormPrecio(prod.precio_venta.toString());
    setModalAbierto(true);
  };

  const handleEliminarProducto = async (prod: ItemInventario) => {
    if (prod.stock_total > 0) {
      alert(`No puedes eliminar "${prod.nombre}" porque aún hay ${prod.stock_total} piezas físicas en stock entre las tiendas.`);
      return;
    }

    const confirmar = confirm(`¿Estás seguro de eliminar "${prod.nombre}" definitivamente del catálogo?`);
    if (!confirmar) return;

    const { error } = await supabase.from('productos').delete().eq('id', prod.id);
    if (error) {
      alert('Error al eliminar: ' + error.message);
      return;
    }

    alert('Producto eliminado correctamente.');
    cargarDatos();
  };

  // Registrar Operación de Stock (Envío Regular, Retiro Bazar, Retorno Bazar)
  const handleRegistrarOperacionStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodSeleccionado) {
      alert('Por favor selecciona un producto.');
      return;
    }

    let tipoBD = 'alta';
    let notaFinal = '';

    if (tipoMovimiento === 'alta') {
      tipoBD = 'alta';
      notaFinal = notaMovimiento.trim() || 'Reabastecimiento enviado por 5F';
    } else if (tipoMovimiento === 'baja_bazar') {
      tipoBD = 'baja';
      notaFinal = `[RETIRO PARA BAZAR]: ${notaMovimiento.trim() || 'Material retirado para evento de fin de semana'}`;
    } else if (tipoMovimiento === 'retorno_bazar') {
      tipoBD = 'alta';
      notaFinal = `[RETORNO DE BAZAR]: ${notaMovimiento.trim() || 'Piezas no vendidas que reingresan a tienda'}`;
    }

    const { error } = await supabase.from('movimientos_stock').insert({
      tienda_id: tiendaOperacion,
      producto_id: prodSeleccionado,
      cantidad: cantOperacion,
      tipo: tipoBD,
      estado: 'pendiente_recepcion',
      nota: notaFinal
    });

    if (error) {
      alert('Error al registrar operación: ' + error.message);
      return;
    }

    alert('Operación enviada. La tienda deberá confirmarla para que se aplique en su stock.');
    setProdSeleccionado('');
    setCantOperacion(1);
    setNotaMovimiento('');
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
    alert('Renta registrada. Haruss Cake deberá confirmar la recepción en su portal.');
  };

  const categorias = useMemo(() => {
    const cats = new Set(productos.map(p => p.categoria).filter(Boolean));
    return ['todas', ...Array.from(cats)];
  }, [productos]);

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
        Validando credenciales de administrador...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <HeaderNav titulo="Panel de Control Five Friends" rol="admin" />

      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 lg:p-8 space-y-6">
        
        {/* Cabecera y Resumen de Visitas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl">
            <span className="text-[10px] uppercase font-mono text-slate-400 block">Próxima Visita Taiyari</span>
            <p className="text-lg font-bold text-amber-400 mt-1">Lunes Alternado</p>
            <span className="text-[11px] text-slate-500 block mt-1">Esquema 20% Comisión (Quincenal)</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl">
            <span className="text-[10px] uppercase font-mono text-slate-400 block">Próxima Visita Haruss</span>
            <p className="text-lg font-bold text-amber-400 mt-1">Miércoles Alternado</p>
            <span className="text-[11px] text-slate-500 block mt-1">Esquema Renta $250.00 MXN</span>
          </div>

          <div className="sm:col-span-2 lg:col-span-1 bg-slate-900 border border-amber-500/30 p-4 sm:p-5 rounded-2xl bg-amber-500/5">
            <span className="text-[10px] uppercase font-mono text-amber-400 font-bold block">Filtro de Tienda</span>
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

        {/* Métricas Globales */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl">
            <span className="text-xs text-slate-400 uppercase font-mono block">Piezas en Stock ({filtroTienda})</span>
            <p className="text-2xl sm:text-3xl font-extrabold text-white mt-1">{totalPiezas} <span className="text-xs sm:text-sm font-normal text-slate-400">unidades</span></p>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl">
            <span className="text-xs text-slate-400 uppercase font-mono block">Valor del Inventario ({filtroTienda})</span>
            <p className="text-2xl sm:text-3xl font-extrabold text-amber-400 mt-1">${valorTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} <span className="text-xs sm:text-sm font-normal text-slate-400">MXN</span></p>
          </div>
        </div>

        {/* MENÚ DE SECCIONES LIMPIO Y COMPACTO */}
        <div className="flex items-center gap-2 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 text-xs sm:text-sm overflow-x-auto">
          <button
            onClick={() => setSeccionActiva('catalogo')}
            className={`flex-1 py-2.5 px-4 rounded-xl font-bold transition flex items-center justify-center gap-2 whitespace-nowrap ${
              seccionActiva === 'catalogo' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            📋 Catálogo y Productos
          </button>
          <button
            onClick={() => setSeccionActiva('movimientos')}
            className={`flex-1 py-2.5 px-4 rounded-xl font-bold transition flex items-center justify-center gap-2 whitespace-nowrap ${
              seccionActiva === 'movimientos' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            🚚 Reabastecer y Bazar
          </button>
          <button
            onClick={() => setSeccionActiva('pagos')}
            className={`flex-1 py-2.5 px-4 rounded-xl font-bold transition flex items-center justify-center gap-2 whitespace-nowrap ${
              seccionActiva === 'pagos' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            💰 Pagos y Rentas {pagosPendientes.length > 0 && <span className="w-2 h-2 rounded-full bg-rose-500"></span>}
          </button>
        </div>

        {/* SECCIÓN 1: CATÁLOGO CON AGREGAR, EDITAR Y ELIMINAR */}
        {seccionActiva === 'catalogo' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white">Catálogo Maestro</h2>
                <p className="text-xs text-slate-400">Gestiona los productos, SKUs, categorías y precios de Five Friends.</p>
              </div>
              <button
                onClick={abrirModalCrear}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs sm:text-sm flex items-center gap-2 shadow-lg transition"
              >
                <span>+</span> Agregar Nuevo Producto
              </button>
            </div>

            {/* Barra de Búsqueda y Filtros */}
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

            {/* Vista Celulares (Tarjetas) */}
            <div className="grid grid-cols-1 gap-2.5 md:hidden">
              {productosFiltrados.length === 0 ? (
                <p className="text-center text-slate-500 text-xs py-8">No se encontraron productos coincidentes.</p>
              ) : (
                productosFiltrados.map((prod) => (
                  <div key={prod.id} className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase font-mono block">{prod.categoria} • {prod.sku}</span>
                        <h4 className="text-sm font-semibold text-slate-100">{prod.nombre}</h4>
                        <span className="text-xs text-amber-400 font-mono font-bold mt-1 block">
                          ${prod.precio_venta.toFixed(2)} MXN
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block font-mono">Stock Total</span>
                        <span className="text-sm font-extrabold text-white">{prod.stock_total} pzas</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-slate-800/80 text-[11px] font-mono">
                      <span className="text-amber-400">Taiyari: {prod.stock_taiyari}</span>
                      <span className="text-sky-400">Haruss: {prod.stock_haruss}</span>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => abrirModalEditar(prod)}
                        className="flex-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs py-1.5 rounded-lg"
                      >
                        ✏️ Editar
                      </button>
                      <button
                        onClick={() => handleEliminarProducto(prod)}
                        className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs px-3 py-1.5 rounded-lg"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Vista Laptops / Tabletas (Tabla Completa) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="text-xs uppercase bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-3">Categoría</th>
                    <th className="p-3">Nombre</th>
                    <th className="p-3">SKU</th>
                    <th className="p-3">Precio Venta</th>
                    <th className="p-3 text-center text-amber-300">Taiyari</th>
                    <th className="p-3 text-center text-sky-300">Haruss</th>
                    <th className="p-3 text-right font-bold text-white">Total</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {productosFiltrados.map((prod) => (
                    <tr key={prod.id} className="hover:bg-slate-800/40">
                      <td className="p-3 text-slate-400 text-xs">{prod.categoria}</td>
                      <td className="p-3 font-medium text-slate-100">{prod.nombre}</td>
                      <td className="p-3 font-mono text-xs text-slate-400">{prod.sku}</td>
                      <td className="p-3 font-mono text-amber-400 font-bold">${prod.precio_venta.toFixed(2)}</td>
                      <td className="p-3 text-center font-bold text-amber-400">{prod.stock_taiyari}</td>
                      <td className="p-3 text-center font-bold text-sky-400">{prod.stock_haruss}</td>
                      <td className="p-3 text-right font-extrabold text-white">{prod.stock_total}</td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => abrirModalEditar(prod)}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-2.5 py-1 rounded-md border border-slate-700"
                            title="Editar información"
                          >
                            ✏️ Editar
                          </button>
                          <button
                            onClick={() => handleEliminarProducto(prod)}
                            className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs px-2 py-1 rounded-md border border-rose-500/30"
                            title="Eliminar del catálogo"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SECCIÓN 2: REABASTECIMIENTO Y MOVIMIENTOS DE BAZAR */}
        {seccionActiva === 'movimientos' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
              <h2 className="text-base sm:text-lg font-bold text-white mb-2">Operaciones de Stock y Bazar</h2>
              <p className="text-xs text-slate-400 mb-4">
                Envía inventario nuevo o gestiona salidas/retornos temporales para ventas de bazar.
              </p>

              <form onSubmit={handleRegistrarOperacionStock} className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Tipo de Operación</label>
                  <select
                    value={tipoMovimiento}
                    onChange={(e: any) => setTipoMovimiento(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs sm:text-sm font-semibold text-amber-400"
                  >
                    <option value="alta">📦 Reabastecimiento Normal (Alta de stock)</option>
                    <option value="baja_bazar">🎪 Retiro Temporal para BAZAR (Baja de anaquel)</option>
                    <option value="retorno_bazar">🔄 Retorno de BAZAR a Tienda (Reingreso de piezas no vendidas)</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Tienda Afectada</label>
                    <select
                      value={tiendaOperacion}
                      onChange={(e) => setTiendaOperacion(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs sm:text-sm"
                    >
                      <option value="taiyari">Taiyari Multimarcas</option>
                      <option value="haruss">Haruss Cake</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Cantidad de Piezas</label>
                    <input
                      type="number"
                      min="1"
                      value={cantOperacion}
                      onChange={(e) => setCantOperacion(parseInt(e.target.value) || 1)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs sm:text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Producto</label>
                  <select
                    value={prodSeleccionado}
                    onChange={(e) => setProdSeleccionado(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs sm:text-sm"
                    required
                  >
                    <option value="">Selecciona el producto...</option>
                    {productos.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.sku}] {p.nombre} (Stock {tiendaOperacion}: {tiendaOperacion === 'taiyari' ? p.stock_taiyari : p.stock_haruss})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Nota o Razón del Movimiento</label>
                  <input
                    type="text"
                    placeholder="Ej. Bazar fin de semana en Parque Tezozómoc"
                    value={notaMovimiento}
                    onChange={(e) => setNotaMovimiento(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs sm:text-sm"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-3 rounded-xl text-xs sm:text-sm transition"
                >
                  Registrar Operación (En espera de confirmación)
                </button>
              </form>
            </div>

            {/* Historial de Movimientos Pendientes de Aprobación */}
            <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl space-y-3">
              <h3 className="text-base sm:text-lg font-bold text-white">Movimientos por Aprobar en Tiendas</h3>
              <p className="text-xs text-slate-400">
                La tienda debe pulsar &quot;Confirmar&quot; en su respectivo portal para que el stock se ajuste formalmente.
              </p>

              {movimientosPendientes.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">No hay movimientos pendientes de confirmación.</p>
              ) : (
                <div className="space-y-2.5">
                  {movimientosPendientes.map((m) => (
                    <div key={m.id} className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl space-y-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-xs font-bold text-amber-400">{m.tiendas?.nombre}</span>
                          <h4 className="text-sm font-semibold text-white">{m.productos?.nombre}</h4>
                        </div>
                        <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded font-bold ${
                          m.tipo === 'alta' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                        }`}>
                          {m.tipo === 'alta' ? `+${m.cantidad} Entrada` : `-${m.cantidad} Salida`}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">{m.nota || 'Sin notas'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECCIÓN 3: PAGOS DE MERCANCÍA Y CONTROL DE RENTA */}
        {seccionActiva === 'pagos' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl space-y-4">
              <h2 className="text-base sm:text-lg font-bold text-white">Liquidaciones de Ventas por Validar</h2>
              <p className="text-xs text-slate-400">Pagos reportados por Taiyari o Haruss Cake que requieren tu autorización.</p>

              {pagosPendientes.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">No hay liquidaciones pendientes de autorizar.</p>
              ) : (
                <div className="space-y-2.5">
                  {pagosPendientes.map((p) => (
                    <div key={p.id} className="flex items-center justify-between bg-slate-950 p-3.5 rounded-xl border border-slate-800 gap-3">
                      <div>
                        <span className="text-xs text-amber-400 font-bold block">{p.tiendas?.nombre}</span>
                        <p className="text-base font-extrabold text-white">${Number(p.monto).toFixed(2)} MXN</p>
                        <p className="text-xs text-slate-400">{p.nota || 'Sin notas'}</p>
                      </div>
                      <button
                        onClick={() => handleAprobarPago(p.id)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition"
                      >
                        Aprobar Ingreso
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl space-y-4">
              <h2 className="text-base sm:text-lg font-bold text-white">Control de Renta Mensual (Haruss Cake)</h2>
              <p className="text-xs text-slate-400">Emite el pago de $250.00 MXN para que Haruss confirme su recepción.</p>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <input
                  type="month"
                  value={periodoRenta}
                  onChange={(e) => setPeriodoRenta(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs sm:text-sm text-slate-100"
                />
                <button
                  onClick={handleRegistrarRenta}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-3 rounded-xl text-xs sm:text-sm transition"
                >
                  Registrar Pago de Renta ($250 MXN)
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* MODAL CREAR / EDITAR PRODUCTO */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">
              {modoEdicion ? 'Editar Producto' : 'Crear Nuevo Producto'}
            </h3>

            <form onSubmit={handleGuardarProducto} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Nombre del Producto</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Dragón Articulado"
                  value={formNombre}
                  onChange={(e) => setFormNombre(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs sm:text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">SKU Único</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. FIG-DRAG-025"
                  value={formSku}
                  onChange={(e) => setFormSku(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs sm:text-sm font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Categoría</label>
                  <select
                    value={formCategoria}
                    onChange={(e) => setFormCategoria(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs sm:text-sm"
                  >
                    <option value="Lámparas">Lámparas</option>
                    <option value="Figuras">Figuras</option>
                    <option value="Figuras Mini">Figuras Mini</option>
                    <option value="Decoración">Decoración</option>
                    <option value="Llaveros">Llaveros</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Precio Venta (MXN)</label>
                  <input
                    type="number"
                    step="0.50"
                    required
                    value={formPrecio}
                    onChange={(e) => setFormPrecio(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs sm:text-sm font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl text-xs sm:text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-2.5 rounded-xl text-xs sm:text-sm"
                >
                  {modoEdicion ? 'Actualizar' : 'Guardar Producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
