'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import HeaderNav from '@/components/HeaderNav';
import { supabase, calcularTotalVenta } from '@/lib/supabaseClient';

export default function PortalTaiyari() {
  const router = useRouter();

  const [autorizado, setAutorizado] = useState(false);
  const [infoTienda, setInfoTienda] = useState<any>(null);
  const [inventario, setInventario] = useState<any[]>([]);
  const [recepcionesPendientes, setRecepcionesPendientes] = useState<any[]>([]);
  
  // Auditoría
  const [historialVentas, setHistorialVentas] = useState<any[]>([]);
  const [historialMovimientos, setHistorialMovimientos] = useState<any[]>([]);
  const [historialPagos, setHistorialPagos] = useState<any[]>([]);
  const [pestanaAuditoria, setPestanaAuditoria] = useState<'ventas' | 'movimientos' | 'pagos'>('ventas');

  // Filtros de Inventario
  const [busqueda, setBusqueda] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('todas');
  const [orden, setOrden] = useState<'nombre' | 'stock_desc' | 'precio_desc'>('nombre');

  // Formularios
  const [prodVenta, setProdVenta] = useState('');
  const [cantVenta, setCantVenta] = useState(1);
  const [descPedido, setDescPedido] = useState('');
  const [piezasPedido, setPiezasPedido] = useState(1);
  const [montoPago, setMontoPago] = useState('');
  const [notaPago, setNotaPago] = useState('');

  useEffect(() => {
    verificarSesion();
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
    const { data: t } = await supabase.from('tiendas').select('*').eq('id', 'taiyari').single();
    if (t) setInfoTienda(t);

    const { data: inv } = await supabase
      .from('inventario_tienda')
      .select('*, productos(*)')
      .eq('tienda_id', 'taiyari');
    if (inv) setInventario(inv);

    const { data: rec } = await supabase
      .from('movimientos_stock')
      .select('*, productos(nombre)')
      .eq('tienda_id', 'taiyari')
      .eq('estado', 'pendiente_recepcion');
    if (rec) setRecepcionesPendientes(rec);

    const { data: ventas } = await supabase
      .from('ventas')
      .select('*, productos(nombre, sku)')
      .eq('tienda_id', 'taiyari')
      .order('creado_en', { ascending: false });
    if (ventas) setHistorialVentas(ventas);

    const { data: movs } = await supabase
      .from('movimientos_stock')
      .select('*, productos(nombre, sku)')
      .eq('tienda_id', 'taiyari')
      .order('creado_en', { ascending: false });
    if (movs) setHistorialMovimientos(movs);

    const { data: pagos } = await supabase
      .from('pagos_mercancia')
      .select('*')
      .eq('tienda_id', 'taiyari')
      .order('creado_en', { ascending: false });
    if (pagos) setHistorialPagos(pagos);
  };

  // Cálculos Financieros
  const totalComisionGanada = historialVentas.reduce((acc, v) => acc + Number(v.monto_tienda || 0), 0);
  const totalVendidoPara5F = historialVentas.reduce((acc, v) => acc + Number(v.monto_five_friends || 0), 0);
  const totalPagadoAprobado = historialPagos
    .filter(p => p.estado === 'aprobado')
    .reduce((acc, p) => acc + Number(p.monto || 0), 0);
  const totalPagosPendientes = historialPagos
    .filter(p => p.estado === 'pendiente_confirmacion')
    .reduce((acc, p) => acc + Number(p.monto || 0), 0);

  const saldoPendientePorPagar = Math.max(0, (665.00 + totalVendidoPara5F) - totalPagadoAprobado);

  // Lista de categorías únicas para los filtros
  const categorias = useMemo(() => {
    const cats = new Set(inventario.map(i => i.productos?.categoria).filter(Boolean));
    return ['todas', ...Array.from(cats)];
  }, [inventario]);

  // Filtrado y ordenamiento de productos
  const productosFiltrados = useMemo(() => {
    return inventario
      .filter(item => {
        const coincideTexto = 
          item.productos?.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
          item.productos?.sku?.toLowerCase().includes(busqueda.toLowerCase());
        const coincideCat = categoriaFiltro === 'todas' || item.productos?.categoria === categoriaFiltro;
        return coincideTexto && coincideCat;
      })
      .sort((a, b) => {
        if (orden === 'stock_desc') return b.stock_actual - a.stock_actual;
        if (orden === 'precio_desc') return (b.productos?.precio_venta || 0) - (a.productos?.precio_venta || 0);
        return (a.productos?.nombre || '').localeCompare(b.productos?.nombre || '');
      });
  }, [inventario, busqueda, categoriaFiltro, orden]);

  const handleConfirmarRecepcion = async (movId: string, prodId: string, cant: number) => {
    await supabase
      .from('movimientos_stock')
      .update({ estado: 'confirmado', confirmado_en: new Date().toISOString() })
      .eq('id', movId);

    const item = inventario.find((i) => i.producto_id === prodId);
    const nuevoStock = (item?.stock_actual || 0) + cant;

    await supabase
      .from('inventario_tienda')
      .upsert({ tienda_id: 'taiyari', producto_id: prodId, stock_actual: nuevoStock });

    alert('Mercancía agregada a tu inventario disponible.');
    cargarPortal();
  };

  const handleRegistrarVenta = async (e: React.FormEvent) => {
    e.preventDefault();
    const itemInv = inventario.find((i) => i.producto_id === prodVenta);
    if (!itemInv || itemInv.stock_actual < cantVenta) {
      alert('Stock insuficiente para registrar la venta.');
      return;
    }

    const { total, precioEfectivoPorPieza, detallePromocion } = calcularTotalVenta(
      itemInv.productos.sku,
      cantVenta,
      Number(itemInv.productos.precio_venta)
    );

    const comisionPct = infoTienda?.comision_porcentaje || 20;
    const montoTienda = total * (comisionPct / 100);
    const monto5F = total - montoTienda;

    await supabase.from('ventas').insert({
      tienda_id: 'taiyari',
      producto_id: prodVenta,
      cantidad: cantVenta,
      precio_unitario: precioEfectivoPorPieza,
      total_venta: total,
      monto_tienda: montoTienda,
      monto_five_friends: monto5F,
    });

    await supabase
      .from('inventario_tienda')
      .update({ stock_actual: itemInv.stock_actual - cantVenta })
      .eq('id', itemInv.id);

    const msjDetalle = detallePromocion ? ` (${detallePromocion})` : '';
    alert(`Venta registrada exitosamente.${msjDetalle}\nTotal: $${total.toFixed(2)} MXN\nComisión Taiyari: $${montoTienda.toFixed(2)} MXN\nFive Friends: $${monto5F.toFixed(2)} MXN`);

    setCantVenta(1);
    cargarPortal();
  };

  const handleReportarPago = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from('pagos_mercancia').insert({
      tienda_id: 'taiyari',
      monto: parseFloat(montoPago),
      nota: notaPago,
      estado: 'pendiente_confirmacion'
    });
    setMontoPago('');
    setNotaPago('');
    alert('Comprobante de pago notificado a Five Friends.');
    cargarPortal();
  };

  const handleCrearPedido = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from('pedidos_cotizaciones').insert({
      tienda_id: 'taiyari',
      descripcion: descPedido,
      piezas_estimadas: piezasPedido
    });
    setDescPedido('');
    alert('Encargo especial enviado al taller 5F.');
  };

  if (!autorizado) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 font-mono text-xs">
        Cargando portal adaptativo de Taiyari...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <HeaderNav titulo="Taiyari Multimarcas" rol="taiyari" />

      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 lg:p-8 space-y-6">
        
        {/* Cabecera Responsiva */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-800 p-4 sm:p-6 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Taiyari Multimarcas</h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Consignación: <span className="text-emerald-400 font-semibold">20% ganancia</span> | 80% liquidación 5F
            </p>
          </div>
          <div className="w-full sm:w-auto bg-slate-950/60 border border-slate-800/80 px-3.5 py-2 rounded-xl text-left sm:text-right">
            <span className="text-[10px] uppercase font-mono text-slate-400 block">Día de Corte / Visita</span>
            <span className="text-xs sm:text-sm font-bold text-amber-400">Lunes alternados (Quincenal)</span>
          </div>
        </div>

        {/* Tarjetas Financieras (1 col en celular, 2 en tableta, 4 en PC) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-slate-900 border border-emerald-500/30 p-4 sm:p-5 rounded-2xl bg-emerald-500/5">
            <span className="text-[11px] text-emerald-400 uppercase font-mono font-bold block">Tus Ganancias (20%)</span>
            <p className="text-2xl font-extrabold text-emerald-400 mt-1">
              ${totalComisionGanada.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </p>
            <span className="text-[10px] text-slate-400 block mt-1">Acumulado por ventas</span>
          </div>

          <div className="bg-slate-900 border border-rose-500/30 p-4 sm:p-5 rounded-2xl bg-rose-500/5">
            <span className="text-[11px] text-rose-400 uppercase font-mono font-bold block">Saldo Pendiente a 5F</span>
            <p className="text-2xl font-extrabold text-rose-400 mt-1">
              ${saldoPendientePorPagar.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </p>
            <span className="text-[10px] text-slate-400 block mt-1">Incluye saldo base $665.00</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl">
            <span className="text-[11px] text-slate-400 uppercase font-mono block">Pagado Aprobado</span>
            <p className="text-2xl font-extrabold text-slate-200 mt-1">
              ${totalPagadoAprobado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </p>
            <span className="text-[10px] text-slate-500 block mt-1">Validado por Five Friends</span>
          </div>

          <div className="bg-slate-900 border border-amber-500/30 p-4 sm:p-5 rounded-2xl bg-amber-500/5">
            <span className="text-[11px] text-amber-400 uppercase font-mono font-bold block">Pagos en Revisión</span>
            <p className="text-2xl font-extrabold text-amber-400 mt-1">
              ${totalPagosPendientes.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </p>
            <span className="text-[10px] text-slate-400 block mt-1">Pendientes de confirmación</span>
          </div>
        </div>

        {/* Mercancía Entrante */}
        {recepcionesPendientes.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 p-4 sm:p-5 rounded-2xl space-y-3">
            <h3 className="text-xs sm:text-sm font-bold text-amber-400 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
              Mercancía Entrante por Confirmar
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {recepcionesPendientes.map((m) => (
                <div key={m.id} className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-semibold truncate">{m.productos?.nombre}</p>
                    <p className="text-[11px] text-slate-400">{m.cantidad} piezas enviadas</p>
                  </div>
                  <button
                    onClick={() => handleConfirmarRecepcion(m.id, m.producto_id, m.cantidad)}
                    className="shrink-0 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold px-3 py-1.5 rounded-lg transition"
                  >
                    Confirmar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MÓDULO DE INVENTARIO CON FILTROS Y TARJETAS EN CELULAR */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Inventario en Tienda</h2>
              <p className="text-xs text-slate-400">Total de piezas: {inventario.reduce((acc, i) => acc + (i.stock_actual || 0), 0)} unidades</p>
            </div>
            <span className="text-xs text-amber-400 font-mono">
              Mostrando {productosFiltrados.length} piezas
            </span>
          </div>

          {/* Barra de Filtros y Búsqueda */}
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
              <option value="stock_desc">📦 Mayor Stock Disponible</option>
              <option value="precio_desc">💲 Mayor Precio</option>
            </select>
          </div>

          {/* VISTA 1: Celulares (Tarjetas Táctiles) */}
          <div className="grid grid-cols-1 gap-2.5 md:hidden">
            {productosFiltrados.length === 0 ? (
              <p className="text-center text-slate-500 text-xs py-8">No se encontraron productos con esos filtros.</p>
            ) : (
              productosFiltrados.map((item) => (
                <div key={item.id} className="bg-slate-950/70 border border-slate-800/80 p-3 rounded-xl flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-500 uppercase font-mono block truncate">{item.productos?.categoria} • {item.productos?.sku}</span>
                    <h4 className="text-sm font-semibold text-slate-100 truncate mt-0.5">{item.productos?.nombre}</h4>
                    <p className="text-xs text-amber-400 font-mono mt-0.5">${Number(item.productos?.precio_venta || 0).toFixed(2)} MXN</p>
                  </div>
                  <div className="text-right shrink-0 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
                    <span className="text-[10px] text-slate-400 block font-mono">Stock</span>
                    <span className="text-base font-extrabold text-amber-400">{item.stock_actual}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* VISTA 2: Tabletas y Laptops (Tabla Completa) */}
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
                {productosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-500 text-sm">
                      No se encontraron productos con esos filtros.
                    </td>
                  </tr>
                ) : (
                  productosFiltrados.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-800/40">
                      <td className="p-3 text-slate-400 text-xs">{item.productos?.categoria}</td>
                      <td className="p-3 font-medium text-slate-100">{item.productos?.nombre}</td>
                      <td className="p-3 font-mono text-xs text-slate-400">{item.productos?.sku}</td>
                      <td className="p-3 font-mono">${Number(item.productos?.precio_venta || 0).toFixed(2)} MXN</td>
                      <td className="p-3 text-right font-bold text-amber-400">{item.stock_actual}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Acciones: Venta y Pagos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
            <h2 className="text-base sm:text-lg font-bold text-white mb-3">Registrar Venta</h2>
            <form onSubmit={handleRegistrarVenta} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Producto</label>
                <select
                  value={prodVenta}
                  onChange={(e) => setProdVenta(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs sm:text-sm text-slate-200 outline-none focus:border-emerald-500"
                  required
                >
                  <option value="">Selecciona el producto...</option>
                  {inventario.map((i) => (
                    <option key={i.id} value={i.producto_id}>
                      {i.productos?.nombre} ({i.stock_actual} disp. | ${i.productos?.precio_venta})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Piezas Vendidas</label>
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
                Confirmar Salida y Venta
              </button>
            </form>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
            <h2 className="text-base sm:text-lg font-bold text-white mb-3">Reportar Pago a 5F</h2>
            <form onSubmit={handleReportarPago} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Monto (MXN)</label>
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
                <label className="text-xs text-slate-400 block mb-1">Folio / Referencia</label>
                <input
                  type="text"
                  placeholder="Ej. Transferencia corte lunes 19 Oct"
                  value={notaPago}
                  onChange={(e) => setNotaPago(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs sm:text-sm text-slate-100"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold py-2.5 rounded-xl text-xs sm:text-sm border border-slate-700 transition"
              >
                Notificar Pago
              </button>
            </form>
          </div>
        </div>

        {/* Módulo de Auditoría Responsivo */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Auditoría e Historial</h2>
              <p className="text-xs text-slate-400">Bitácora de movimientos y ventas</p>
            </div>
            
            {/* Pestañas Desplazables en Celular */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px] w-full sm:w-auto overflow-x-auto">
              <button
                onClick={() => setPestanaAuditoria('ventas')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition ${
                  pestanaAuditoria === 'ventas' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                }`}
              >
                Ventas ({historialVentas.length})
              </button>
              <button
                onClick={() => setPestanaAuditoria('movimientos')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition ${
                  pestanaAuditoria === 'movimientos' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                }`}
              >
                Stock ({historialMovimientos.length})
              </button>
              <button
                onClick={() => setPestanaAuditoria('pagos')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition ${
                  pestanaAuditoria === 'pagos' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                }`}
              >
                Pagos ({historialPagos.length})
              </button>
            </div>
          </div>

          {/* Tabla con Scroll Suave en Móvil */}
          <div className="overflow-x-auto">
            {pestanaAuditoria === 'ventas' && (
              <table className="w-full text-left text-xs sm:text-sm text-slate-300 min-w-[550px]">
                <thead className="uppercase bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-2.5">Fecha</th>
                    <th className="p-2.5">Producto</th>
                    <th className="p-2.5 text-center">Pzas</th>
                    <th className="p-2.5">Total</th>
                    <th className="p-2.5 text-emerald-400">20% Taiyari</th>
                    <th className="p-2.5 text-rose-400">80% 5F</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {historialVentas.length === 0 ? (
                    <tr><td colSpan={6} className="p-4 text-center text-slate-500">Sin ventas aún.</td></tr>
                  ) : (
                    historialVentas.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-800/40">
                        <td className="p-2.5 text-slate-400 text-[11px] whitespace-nowrap">{new Date(v.creado_en).toLocaleDateString('es-MX')}</td>
                        <td className="p-2.5 font-medium text-slate-100">{v.productos?.nombre}</td>
                        <td className="p-2.5 text-center font-bold">{v.cantidad}</td>
                        <td className="p-2.5 font-mono">${Number(v.total_venta).toFixed(2)}</td>
                        <td className="p-2.5 font-mono text-emerald-400 font-bold">+${Number(v.monto_tienda).toFixed(2)}</td>
                        <td className="p-2.5 font-mono text-rose-400">${Number(v.monto_five_friends).toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {pestanaAuditoria === 'movimientos' && (
              <table className="w-full text-left text-xs sm:text-sm text-slate-300 min-w-[550px]">
                <thead className="uppercase bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-2.5">Fecha</th>
                    <th className="p-2.5">Tipo</th>
                    <th className="p-2.5">Producto</th>
                    <th className="p-2.5 text-center">Pzas</th>
                    <th className="p-2.5">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {historialMovimientos.length === 0 ? (
                    <tr><td colSpan={5} className="p-4 text-center text-slate-500">Sin movimientos aún.</td></tr>
                  ) : (
                    historialMovimientos.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-800/40">
                        <td className="p-2.5 text-slate-400 text-[11px] whitespace-nowrap">{new Date(m.creado_en).toLocaleDateString('es-MX')}</td>
                        <td className="p-2.5 uppercase font-mono text-[10px]">
                          <span className={`px-1.5 py-0.5 rounded ${m.tipo === 'alta' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                            {m.tipo === 'alta' ? 'Entrada' : 'Salida'}
                          </span>
                        </td>
                        <td className="p-2.5 font-medium text-slate-100">{m.productos?.nombre}</td>
                        <td className="p-2.5 text-center font-bold">{m.cantidad}</td>
                        <td className="p-2.5 text-[11px]">{m.estado === 'confirmado' ? '✓ Recibido' : '⏳ Pendiente'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {pestanaAuditoria === 'pagos' && (
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
                  {historialPagos.length === 0 ? (
                    <tr><td colSpan={4} className="p-4 text-center text-slate-500">Sin pagos registrados.</td></tr>
                  ) : (
                    historialPagos.map((p) => (
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
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Encargos */}
        <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
          <h2 className="text-base sm:text-lg font-bold text-white mb-2">Solicitar Pedidos Especiales</h2>
          <form onSubmit={handleCrearPedido} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                required
                placeholder="Descripción de la pieza por encargo..."
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
              Enviar Encargo
            </button>
          </form>
        </div>

      </main>
    </div>
  );
}
