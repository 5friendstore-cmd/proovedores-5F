'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import HeaderNav from '@/components/HeaderNav';
import { supabase, calcularTotalVenta, obtenerProximoCorte } from '@/lib/supabaseClient';

export default function PortalHaruss() {
  const router = useRouter();

  const [autorizado, setAutorizado] = useState(false);
  const [infoTienda, setInfoTienda] = useState<any>(null);
  const [inventario, setInventario] = useState<any[]>([]);
  const [recepcionesPendientes, setRecepcionesPendientes] = useState<any[]>([]);
  const [rentasHistorial, setRentasHistorial] = useState<any[]>([]);
  
  const [seccionActiva, setSeccionActiva] = useState<'inventario' | 'acciones' | 'aprobaciones' | 'auditoria' | 'pedidos'>('inventario');

  // Auditoría
  const [historialVentas, setHistorialVentas] = useState<any[]>([]);
  const [historialMovimientos, setHistorialMovimientos] = useState<any[]>([]);
  const [historialPagos, setHistorialPagos] = useState<any[]>([]);
  const [subPestanaAuditoria, setSubPestanaAuditoria] = useState<'ventas' | 'movimientos' | 'pagos' | 'rentas'>('ventas');

  // Filtros de Inventario
  const [busqueda, setBusqueda] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('todas');
  const [soloExistencia, setSoloExistencia] = useState(true);
  const [orden, setOrden] = useState<'nombre' | 'stock_desc' | 'precio_desc'>('nombre');

  // Formularios y Buscador Desplegable de Venta
  const [prodVenta, setProdVenta] = useState('');
  const [textoBusquedaVenta, setTextoBusquedaVenta] = useState('');
  const [dropdownVentaAbierto, setDropdownVentaAbierto] = useState(false);
  const ventaDropdownRef = useRef<HTMLDivElement>(null);

  const [cantVenta, setCantVenta] = useState(1);
  const [descPedido, setDescPedido] = useState('');
  const [piezasPedido, setPiezasPedido] = useState(1);
  const [montoPago, setMontoPago] = useState('');
  const [notaPago, setNotaPago] = useState('');

  const proximoCorte = useMemo(() => obtenerProximoCorte('haruss'), []);

  useEffect(() => {
    verificarSesion();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ventaDropdownRef.current && !ventaDropdownRef.current.contains(e.target as Node)) {
        setDropdownVentaAbierto(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const verificarSesion = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    setAutorizado(true);
    cargarPortal();
  };

  const cargarPortal = async () => {
    const { data: t } = await supabase.from('tiendas').select('*').eq('id', 'haruss').single();
    if (t) setInfoTienda(t);

    // Catálogo completo sincronizado con el stock de Haruss
    const { data: prods } = await supabase.from('productos').select('*').order('nombre', { ascending: true });
    const { data: inv } = await supabase
      .from('inventario_tienda')
      .select('*')
      .eq('tienda_id', 'haruss');

    if (prods) {
      const listaCompleta = prods.map((p) => {
        const reg = inv?.find((i) => i.producto_id === p.id);
        return {
          id: reg?.id || `temp-${p.id}`,
          producto_id: p.id,
          stock_actual: reg ? reg.stock_actual : 0,
          productos: p,
        };
      });
      setInventario(listaCompleta);
    }

    const { data: rec } = await supabase
      .from('movimientos_stock')
      .select('*, productos(nombre, sku)')
      .eq('tienda_id', 'haruss')
      .eq('estado', 'pendiente_recepcion')
      .order('creado_en', { ascending: false });
    if (rec) setRecepcionesPendientes(rec);

    const { data: rentas } = await supabase
      .from('pagos_renta')
      .select('*')
      .eq('tienda_id', 'haruss')
      .order('creado_en', { ascending: false });
    if (rentas) setRentasHistorial(rentas);

    const { data: ventas } = await supabase
      .from('ventas')
      .select('*, productos(nombre, sku)')
      .eq('tienda_id', 'haruss')
      .order('creado_en', { ascending: false });
    if (ventas) setHistorialVentas(ventas);

    const { data: movs } = await supabase
      .from('movimientos_stock')
      .select('*, productos(nombre, sku)')
      .eq('tienda_id', 'haruss')
      .order('creado_en', { ascending: false });
    if (movs) setHistorialMovimientos(movs);

    const { data: pagos } = await supabase
      .from('pagos_mercancia')
      .select('*')
      .eq('tienda_id', 'haruss')
      .order('creado_en', { ascending: false });
    if (pagos) setHistorialPagos(pagos);
  };

  const totalVendidoPiezas = historialVentas.reduce((acc, v) => acc + Number(v.total_venta || 0), 0);
  const totalPiezasVendidas = historialVentas.reduce((acc, v) => acc + Number(v.cantidad || 0), 0);
  const totalPagadoAprobado = historialPagos
    .filter(p => p.estado === 'aprobado')
    .reduce((acc, p) => acc + Number(p.monto || 0), 0);

  const saldoPendientePorLiquidar = Math.max(0, totalVendidoPiezas - totalPagadoAprobado);
  const rentasPorConfirmar = rentasHistorial.filter(r => !r.aprobado_por_tienda);

  const categorias = useMemo(() => {
    const cats = new Set(inventario.map(i => i.productos?.categoria).filter(Boolean));
    return ['todas', ...Array.from(cats)];
  }, [inventario]);

  const productosFiltrados = useMemo(() => {
    return inventario
      .filter(item => {
        const coincideExistencia = soloExistencia ? item.stock_actual > 0 : true;
        const coincideTexto = 
          item.productos?.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
          item.productos?.sku?.toLowerCase().includes(busqueda.toLowerCase());
        const coincideCat = categoriaFiltro === 'todas' || item.productos?.categoria === categoriaFiltro;
        return coincideExistencia && coincideTexto && coincideCat;
      })
      .sort((a, b) => {
        if (orden === 'stock_desc') return b.stock_actual - a.stock_actual;
        if (orden === 'precio_desc') return (b.productos?.precio_venta || 0) - (a.productos?.precio_venta || 0);
        return (a.productos?.nombre || '').localeCompare(b.productos?.nombre || '');
      });
  }, [inventario, busqueda, categoriaFiltro, soloExistencia, orden]);

  const opcionesVentaFiltradas = useMemo(() => {
    const disponibles = inventario.filter(i => i.stock_actual > 0);
    if (!textoBusquedaVenta.trim()) return disponibles;
    const q = textoBusquedaVenta.toLowerCase();
    return disponibles.filter(i =>
      i.productos?.nombre?.toLowerCase().includes(q) ||
      i.productos?.sku?.toLowerCase().includes(q)
    );
  }, [inventario, textoBusquedaVenta]);

  // Confirmar movimiento y actualizar stock real en anaquel
  const handleConfirmarMovimiento = async (mov: any) => {
    const { data: registroActual } = await supabase
      .from('inventario_tienda')
      .select('id, stock_actual')
      .eq('tienda_id', 'haruss')
      .eq('producto_id', mov.producto_id)
      .maybeSingle();

    const stockPrevio = registroActual?.stock_actual || 0;
    const nuevoStock = mov.tipo === 'alta'
      ? stockPrevio + mov.cantidad
      : Math.max(0, stockPrevio - mov.cantidad);

    if (registroActual?.id) {
      const { error: errUpd } = await supabase
        .from('inventario_tienda')
        .update({ stock_actual: nuevoStock, actualizado_en: new Date().toISOString() })
        .eq('id', registroActual.id);
      if (errUpd) {
        alert('Error al actualizar anaquel: ' + errUpd.message);
        return;
      }
    } else {
      const { error: errIns } = await supabase
        .from('inventario_tienda')
        .insert({ tienda_id: 'haruss', producto_id: mov.producto_id, stock_actual: nuevoStock });
      if (errIns) {
        alert('Error al insertar en anaquel: ' + errIns.message);
        return;
      }
    }

    await supabase
      .from('movimientos_stock')
      .update({ estado: 'confirmado', confirmado_en: new Date().toISOString() })
      .eq('id', mov.id);

    alert(`Movimiento confirmado. Nuevo stock en anaquel de "${mov.productos?.nombre}": ${nuevoStock} piezas.`);
    cargarPortal();
  };

  const handleAprobarRenta = async (idRenta: string) => {
    await supabase
      .from('pagos_renta')
      .update({ aprobado_por_tienda: true, aprobado_en: new Date().toISOString() })
      .eq('id', idRenta);
    alert('Has confirmado la recepción del pago de renta mensual.');
    cargarPortal();
  };

  const handleRegistrarVenta = async (e: React.FormEvent) => {
    e.preventDefault();
    const itemInv = inventario.find((i) => i.producto_id === prodVenta);
    if (!itemInv || itemInv.stock_actual < cantVenta) {
      alert('Selecciona un producto válido con stock suficiente.');
      return;
    }

    const { total, precioEfectivoPorPieza, detallePromocion } = calcularTotalVenta(
      itemInv.productos.sku,
      cantVenta,
      Number(itemInv.productos.precio_venta)
    );

    await supabase.from('ventas').insert({
      tienda_id: 'haruss',
      producto_id: prodVenta,
      cantidad: cantVenta,
      precio_unitario: precioEfectivoPorPieza,
      total_venta: total,
      monto_tienda: 0.00,
      monto_five_friends: total,
    });

    await supabase
      .from('inventario_tienda')
      .update({ stock_actual: itemInv.stock_actual - cantVenta, actualizado_en: new Date().toISOString() })
      .eq('tienda_id', 'haruss')
      .eq('producto_id', prodVenta);

    const msjDetalle = detallePromocion ? ` (${detallePromocion})` : '';
    alert(`Venta registrada.${msjDetalle}\nTotal recaudado: $${total.toFixed(2)} MXN`);

    setProdVenta('');
    setTextoBusquedaVenta('');
    setCantVenta(1);
    cargarPortal();
  };

  const handleReportarPago = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from('pagos_mercancia').insert({
      tienda_id: 'haruss',
      monto: parseFloat(montoPago),
      nota: notaPago,
      estado: 'pendiente_confirmacion'
    });
    setMontoPago('');
    setNotaPago('');
    alert('Comprobante de corte enviado a Five Friends.');
    cargarPortal();
  };

  const handleCrearPedido = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from('pedidos_cotizaciones').insert({
      tienda_id: 'haruss',
      descripcion: descPedido,
      piezas_estimadas: piezasPedido
    });
    setDescPedido('');
    alert('Encargo especial enviado al taller 5F.');
  };

  if (!autorizado) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 font-mono text-xs">
        Cargando portal de Haruss Cake...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <HeaderNav titulo="Haruss Cake" rol="haruss" />

      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 lg:p-8 space-y-5">
        
        {/* RECORDATORIO DE CORTE QUINCENAL Y RENTA */}
        <div className={`border p-3.5 sm:p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 ${
          proximoCorte.esHoy || proximoCorte.esManana
            ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
            : 'bg-slate-900 border-slate-800 text-slate-300'
        }`}>
          <div className="flex items-center gap-2.5">
            <span className="text-lg">📅</span>
            <div>
              <p className="text-xs sm:text-sm font-bold text-white">
                {proximoCorte.esHoy
                  ? '¡Hoy toca visita y corte quincenal en Haruss Cake!'
                  : proximoCorte.esManana
                  ? 'Recordatorio: Mañana toca corte quincenal'
                  : `Próximo corte quincenal: ${proximoCorte.fechaTexto}`}
              </p>
              <p className="text-[11px] text-slate-400">
                {proximoCorte.diasRestantes === 0
                  ? 'Corte de ventas del anaquel y revisión de espacio.'
                  : `Faltan ${proximoCorte.diasRestantes} día(s) • Renta mensual fija: $250.00 MXN`}
              </p>
            </div>
          </div>
          {rentasPorConfirmar.length > 0 && (
            <button
              onClick={() => setSeccionActiva('aprobaciones')}
              className="text-xs font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-3 py-1.5 rounded-lg font-bold animate-pulse"
            >
              🔔 {rentasPorConfirmar.length} pago(s) de renta por confirmar
            </button>
          )}
        </div>

        {/* Tarjetas Financieras */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-slate-900 border border-indigo-500/30 p-4 rounded-2xl bg-indigo-500/5">
            <span className="text-[11px] text-indigo-400 uppercase font-mono font-bold block">Renta Mensual 5F</span>
            <p className="text-2xl font-extrabold text-indigo-400 mt-1">$250.00 <span className="text-xs font-normal text-slate-400">MXN</span></p>
          </div>

          <div className="bg-slate-900 border border-amber-500/30 p-4 rounded-2xl bg-amber-500/5">
            <span className="text-[11px] text-amber-400 uppercase font-mono font-bold block">Por Entregar en Corte</span>
            <p className="text-2xl font-extrabold text-amber-400 mt-1">
              ${saldoPendientePorLiquidar.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <span className="text-[11px] text-slate-400 uppercase font-mono block">Cortes Liquidados</span>
            <p className="text-2xl font-extrabold text-slate-200 mt-1">
              ${totalPagadoAprobado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <span className="text-[11px] text-slate-400 uppercase font-mono block">Piezas Vendidas</span>
            <p className="text-2xl font-extrabold text-white mt-1">
              {totalPiezasVendidas} <span className="text-xs font-normal text-slate-400">pzas</span>
            </p>
          </div>
        </div>

        {/* Menú de Pestañas */}
        <div className="flex items-center gap-1.5 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 text-xs sm:text-sm overflow-x-auto">
          <button
            onClick={() => setSeccionActiva('inventario')}
            className={`flex-1 py-2.5 px-3 rounded-xl font-bold transition whitespace-nowrap ${
              seccionActiva === 'inventario' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            📦 Anaquel
          </button>
          <button
            onClick={() => setSeccionActiva('acciones')}
            className={`flex-1 py-2.5 px-3 rounded-xl font-bold transition whitespace-nowrap ${
              seccionActiva === 'acciones' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            ⚡ Venta / Corte
          </button>
          <button
            onClick={() => setSeccionActiva('aprobaciones')}
            className={`flex-1 py-2.5 px-3 rounded-xl font-bold transition whitespace-nowrap ${
              seccionActiva === 'aprobaciones' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            🔔 Aprobaciones {(recepcionesPendientes.length + rentasPorConfirmar.length) > 0 && (
              <span className="ml-1 bg-rose-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                {recepcionesPendientes.length + rentasPorConfirmar.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setSeccionActiva('auditoria')}
            className={`flex-1 py-2.5 px-3 rounded-xl font-bold transition whitespace-nowrap ${
              seccionActiva === 'auditoria' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            📑 Historial
          </button>
          <button
            onClick={() => setSeccionActiva('pedidos')}
            className={`flex-1 py-2.5 px-3 rounded-xl font-bold transition whitespace-nowrap ${
              seccionActiva === 'pedidos' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            📝 Encargos
          </button>
        </div>

        {/* 1. ANAQUEL CON BOTÓN "SOLO EN EXISTENCIA" */}
        {seccionActiva === 'inventario' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white">Catálogo e Inventario en Anaquel</h2>
                <p className="text-xs text-slate-400">
                  Piezas disponibles en espacio: {inventario.reduce((acc, i) => acc + (i.stock_actual || 0), 0)} unidades
                </p>
              </div>
              <button
                onClick={() => setSoloExistencia(!soloExistencia)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-2 ${
                  soloExistencia
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <span>{soloExistencia ? '✓ Mostrando solo en existencia' : 'Mostrar todos (incluye 0 stock)'}</span>
              </button>
            </div>

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
                  <option key={cat} value={cat}>{cat === 'todas' ? '📁 Todas las Categorías' : `📁 ${cat}`}</option>
                ))}
              </select>
              <select
                value={orden}
                onChange={(e: any) => setOrden(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="nombre">🔤 Nombre (A-Z)</option>
                <option value="stock_desc">📦 Mayor Stock Disponible</option>
                <option value="precio_desc">💲 Mayor Precio</option>
              </select>
            </div>

            {/* Móvil */}
            <div className="grid grid-cols-1 gap-2.5 md:hidden">
              {productosFiltrados.length === 0 ? (
                <p className="text-center text-slate-500 text-xs py-6">No hay productos con esos filtros.</p>
              ) : (
                productosFiltrados.map((item) => (
                  <div key={item.id} className="bg-slate-950/70 border border-slate-800/80 p-3 rounded-xl flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[10px] text-slate-500 uppercase font-mono block truncate">{item.productos?.categoria} • {item.productos?.sku}</span>
                      <h4 className="text-sm font-semibold text-slate-100 truncate mt-0.5">{item.productos?.nombre}</h4>
                      <p className="text-xs text-amber-400 font-mono mt-0.5">${Number(item.productos?.precio_venta || 0).toFixed(2)} MXN</p>
                    </div>
                    <div className="text-right shrink-0 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
                      <span className="text-[10px] text-slate-400 block font-mono">Anaquel</span>
                      <span className={`text-base font-extrabold ${item.stock_actual > 0 ? 'text-amber-400' : 'text-slate-600'}`}>
                        {item.stock_actual}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Laptop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="text-xs uppercase bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-3">Categoría</th>
                    <th className="p-3">Nombre</th>
                    <th className="p-3">SKU</th>
                    <th className="p-3">Precio Venta</th>
                    <th className="p-3 text-right">Disponibles</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {productosFiltrados.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-800/40">
                      <td className="p-3 text-slate-400 text-xs">{item.productos?.categoria}</td>
                      <td className="p-3 font-medium text-slate-100">{item.productos?.nombre}</td>
                      <td className="p-3 font-mono text-xs text-slate-400">{item.productos?.sku}</td>
                      <td className="p-3 font-mono">${Number(item.productos?.precio_venta || 0).toFixed(2)} MXN</td>
                      <td className={`p-3 text-right font-bold ${item.stock_actual > 0 ? 'text-amber-400' : 'text-slate-600'}`}>
                        {item.stock_actual}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 2. ACCIONES CON BUSCADOR DESPLEGABLE INTERACTIVO */}
        {seccionActiva === 'acciones' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
              <h2 className="text-base sm:text-lg font-bold text-white mb-3">Registrar Venta de Piezas</h2>
              <form onSubmit={handleRegistrarVenta} className="space-y-3">
                <div ref={ventaDropdownRef} className="relative">
                  <label className="text-xs text-slate-400 block mb-1">
                    Pieza vendida (Escribe para filtrar o despliega la lista)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="🔍 Escribe el nombre o haz clic para ver lista..."
                      value={textoBusquedaVenta}
                      onFocus={() => setDropdownVentaAbierto(true)}
                      onChange={(e) => {
                        setTextoBusquedaVenta(e.target.value);
                        setProdVenta('');
                        setDropdownVentaAbierto(true);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setDropdownVentaAbierto(!dropdownVentaAbierto)}
                      className="absolute right-3 top-2.5 text-slate-400 text-xs"
                    >
                      ▼
                    </button>
                  </div>

                  {dropdownVentaAbierto && (
                    <div className="absolute left-0 right-0 mt-1.5 max-h-60 overflow-y-auto bg-slate-950 border border-slate-700 rounded-xl shadow-2xl z-50 divide-y divide-slate-800">
                      {opcionesVentaFiltradas.length === 0 ? (
                        <div className="p-3 text-xs text-slate-500 text-center">No hay piezas disponibles con ese nombre.</div>
                      ) : (
                        opcionesVentaFiltradas.map((item) => (
                          <button
                            type="button"
                            key={item.producto_id}
                            onClick={() => {
                              setProdVenta(item.producto_id);
                              setTextoBusquedaVenta(`${item.productos?.nombre} ($${item.productos?.precio_venta} MXN)`);
                              setDropdownVentaAbierto(false);
                            }}
                            className="w-full text-left p-3 hover:bg-slate-900 transition flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <span className="font-semibold text-slate-100 block truncate">{item.productos?.nombre}</span>
                              <span className="text-[10px] text-slate-500 font-mono">${item.productos?.precio_venta} MXN c/u</span>
                            </div>
                            <span className="shrink-0 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-mono font-bold">
                              {item.stock_actual} disp.
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Cantidad</label>
                  <input
                    type="number"
                    min="1"
                    value={cantVenta}
                    onChange={(e) => setCantVenta(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs sm:text-sm text-slate-100"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs sm:text-sm transition"
                >
                  Confirmar Salida de Anaquel
                </button>
              </form>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
              <h2 className="text-base sm:text-lg font-bold text-white mb-3">Reportar Pago de Corte a 5F</h2>
              <form onSubmit={handleReportarPago} className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Monto entregado / transferido (MXN)</label>
                  <input
                    type="number"
                    step="0.50"
                    required
                    placeholder="0.00"
                    value={montoPago}
                    onChange={(e) => setMontoPago(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs sm:text-sm text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Referencia o Folio</label>
                  <input
                    type="text"
                    placeholder="Ej. Liquidación corte quincenal miércoles"
                    value={notaPago}
                    onChange={(e) => setNotaPago(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs sm:text-sm text-slate-100"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold py-2.5 rounded-xl text-xs sm:text-sm border border-slate-700 transition"
                >
                  Notificar Pago de Corte
                </button>
              </form>
            </div>
          </div>
        )}

        {/* 3. APROBACIONES */}
        {seccionActiva === 'aprobaciones' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
            <h2 className="text-base sm:text-lg font-bold text-white">Aprobaciones de Mercancía y Rentas</h2>

            {rentasPorConfirmar.length > 0 && (
              <div className="bg-indigo-500/10 border border-indigo-500/30 p-4 rounded-xl space-y-2">
                <h3 className="text-xs sm:text-sm font-bold text-indigo-400">Renta Mensual por Confirmar</h3>
                {rentasPorConfirmar.map((r) => (
                  <div key={r.id} className="bg-slate-950 border border-slate-800 p-3 rounded-lg flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs sm:text-sm font-semibold text-white">Periodo: {r.mes_periodo}</p>
                      <p className="text-xs text-indigo-300 font-mono font-bold">$250.00 MXN</p>
                    </div>
                    <button
                      onClick={() => handleAprobarRenta(r.id)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
                    >
                      Aprobar Recepción
                    </button>
                  </div>
                ))}
              </div>
            )}

            {recepcionesPendientes.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No tienes mercancía pendiente de confirmar.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {recepcionesPendientes.map((m) => (
                  <div key={m.id} className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded font-bold inline-block mb-1 ${
                        m.tipo === 'alta' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                      }`}>
                        {m.tipo === 'alta' ? `+${m.cantidad} Entrada / Reingreso` : `-${m.cantidad} Retiro Bazar`}
                      </span>
                      <h4 className="text-sm font-semibold text-white truncate">{m.productos?.nombre}</h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">{m.nota || 'Sin notas'}</p>
                    </div>
                    <button
                      onClick={() => handleConfirmarMovimiento(m)}
                      className="shrink-0 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold px-3.5 py-2 rounded-xl transition shadow"
                    >
                      Confirmar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4. HISTORIAL */}
        {seccionActiva === 'auditoria' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white">Historial Auditable</h2>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px] w-full sm:w-auto overflow-x-auto">
                <button
                  onClick={() => setSubPestanaAuditoria('ventas')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition ${
                    subPestanaAuditoria === 'ventas' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                  }`}
                >
                  Ventas ({historialVentas.length})
                </button>
                <button
                  onClick={() => setSubPestanaAuditoria('movimientos')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition ${
                    subPestanaAuditoria === 'movimientos' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                  }`}
                >
                  Stock ({historialMovimientos.length})
                </button>
                <button
                  onClick={() => setSubPestanaAuditoria('pagos')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition ${
                    subPestanaAuditoria === 'pagos' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                  }`}
                >
                  Cortes ({historialPagos.length})
                </button>
                <button
                  onClick={() => setSubPestanaAuditoria('rentas')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition ${
                    subPestanaAuditoria === 'rentas' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                  }`}
                >
                  Rentas ({rentasHistorial.length})
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              {subPestanaAuditoria === 'ventas' && (
                <table className="w-full text-left text-xs sm:text-sm text-slate-300 min-w-[500px]">
                  <thead className="uppercase bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">Fecha</th>
                      <th className="p-2.5">Producto</th>
                      <th className="p-2.5 text-center">Pzas</th>
                      <th className="p-2.5">Unitario</th>
                      <th className="p-2.5 text-right font-bold text-white">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {historialVentas.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-800/40">
                        <td className="p-2.5 text-slate-400 text-[11px] whitespace-nowrap">{new Date(v.creado_en).toLocaleDateString('es-MX')}</td>
                        <td className="p-2.5 font-medium text-slate-100">{v.productos?.nombre}</td>
                        <td className="p-2.5 text-center font-bold">{v.cantidad}</td>
                        <td className="p-2.5 font-mono">${Number(v.precio_unitario).toFixed(2)}</td>
                        <td className="p-2.5 font-mono text-right font-bold text-amber-400">${Number(v.total_venta).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {subPestanaAuditoria === 'movimientos' && (
                <table className="w-full text-left text-xs sm:text-sm text-slate-300 min-w-[500px]">
                  <thead className="uppercase bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">Fecha</th>
                      <th className="p-2.5">Tipo</th>
                      <th className="p-2.5">Producto</th>
                      <th className="p-2.5 text-center">Pzas</th>
                      <th className="p-2.5">Estado</th>
                      <th className="p-2.5">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {historialMovimientos.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-800/40">
                        <td className="p-2.5 text-slate-400 text-[11px] whitespace-nowrap">{new Date(m.creado_en).toLocaleDateString('es-MX')}</td>
                        <td className="p-2.5 uppercase font-mono text-[10px]">
                          <span className={`px-1.5 py-0.5 rounded ${m.tipo === 'alta' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                            {m.tipo === 'alta' ? 'Entrada' : 'Salida/Bazar'}
                          </span>
                        </td>
                        <td className="p-2.5 font-medium text-slate-100">{m.productos?.nombre}</td>
                        <td className="p-2.5 text-center font-bold">{m.cantidad}</td>
                        <td className="p-2.5 text-[11px]">{m.estado === 'confirmado' ? '✓ Confirmado' : '⏳ Pendiente'}</td>
                        <td className="p-2.5 text-xs text-slate-400">{m.nota || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {subPestanaAuditoria === 'pagos' && (
                <table className="w-full text-left text-xs sm:text-sm text-slate-300 min-w-[500px]">
                  <thead className="uppercase bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">Fecha</th>
                      <th className="p-2.5">Monto</th>
                      <th className="p-2.5">Estatus</th>
                      <th className="p-2.5">Nota</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {historialPagos.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-800/40">
                        <td className="p-2.5 text-slate-400 text-[11px] whitespace-nowrap">{new Date(p.creado_en).toLocaleDateString('es-MX')}</td>
                        <td className="p-2.5 font-mono font-bold text-white">${Number(p.monto).toFixed(2)}</td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${p.estado === 'aprobado' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                            {p.estado === 'aprobado' ? '✓ Aprobado' : '⏳ En revisión'}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-400 text-xs">{p.nota || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {subPestanaAuditoria === 'rentas' && (
                <table className="w-full text-left text-xs sm:text-sm text-slate-300 min-w-[500px]">
                  <thead className="uppercase bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">Mes / Periodo</th>
                      <th className="p-2.5">Monto</th>
                      <th className="p-2.5">Estatus</th>
                      <th className="p-2.5">Fecha Confirmación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {rentasHistorial.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-800/40">
                        <td className="p-2.5 font-semibold text-slate-100">{r.mes_periodo}</td>
                        <td className="p-2.5 font-mono font-bold text-indigo-400">${Number(r.monto).toFixed(2)} MXN</td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.aprobado_por_tienda ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                            {r.aprobado_por_tienda ? '✓ Confirmado' : '⏳ Pendiente'}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-400 text-[11px] whitespace-nowrap">
                          {r.aprobado_en ? new Date(r.aprobado_en).toLocaleDateString('es-MX') : 'En espera'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* 5. ENCARGOS */}
        {seccionActiva === 'pedidos' && (
          <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
            <h2 className="text-base sm:text-lg font-bold text-white mb-2">Solicitar Pedidos Especiales</h2>
            <form onSubmit={handleCrearPedido} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  required
                  placeholder="Descripción del encargo..."
                  value={descPedido}
                  onChange={(e) => setDescPedido(e.target.value)}
                  className="sm:col-span-2 bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs sm:text-sm text-slate-100"
                />
                <input
                  type="number"
                  min="1"
                  value={piezasPedido}
                  onChange={(e) => setPiezasPedido(parseInt(e.target.value) || 1)}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs sm:text-sm text-slate-100"
                />
              </div>
              <button
                type="submit"
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs sm:text-sm transition w-full sm:w-auto"
              >
                Enviar Encargo al Taller 5F
              </button>
            </form>
          </div>
        )}

      </main>
    </div>
  );
}
