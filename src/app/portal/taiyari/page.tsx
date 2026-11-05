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
  
  // Pestaña activa del portal de Taiyari
  const [seccionActiva, setSeccionActiva] = useState<'inventario' | 'acciones' | 'aprobaciones' | 'auditoria' | 'pedidos'>('inventario');

  // Auditoría
  const [historialVentas, setHistorialVentas] = useState<any[]>([]);
  const [historialMovimientos, setHistorialMovimientos] = useState<any[]>([]);
  const [historialPagos, setHistorialPagos] = useState<any[]>([]);
  const [subPestanaAuditoria, setSubPestanaAuditoria] = useState<'ventas' | 'movimientos' | 'pagos'>('ventas');

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

  const totalComisionGanada = historialVentas.reduce((acc, v) => acc + Number(v.monto_tienda || 0), 0);
  const totalVendidoPara5F = historialVentas.reduce((acc, v) => acc + Number(v.monto_five_friends || 0), 0);
  const totalPagadoAprobado = historialPagos
    .filter(p => p.estado === 'aprobado')
    .reduce((acc, p) => acc + Number(p.monto || 0), 0);
  const totalPagosPendientes = historialPagos
    .filter(p => p.estado === 'pendiente_confirmacion')
    .reduce((acc, p) => acc + Number(p.monto || 0), 0);

  const saldoPendientePorPagar = Math.max(0, (665.00 + totalVendidoPara5F) - totalPagadoAprobado);

  const categorias = useMemo(() => {
    const cats = new Set(inventario.map(i => i.productos?.categoria).filter(Boolean));
    return ['todas', ...Array.from(cats)];
  }, [inventario]);

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

  // Confirmar Reabastecimiento o Retiro/Retorno de Bazar
  const handleConfirmarMovimiento = async (mov: any) => {
    await supabase
      .from('movimientos_stock')
      .update({ estado: 'confirmado', confirmado_en: new Date().toISOString() })
      .eq('id', mov.id);

    const item = inventario.find((i) => i.producto_id === mov.producto_id);
    const stockActual = item?.stock_actual || 0;
    
    // Si el movimiento es 'alta' se suma; si es 'baja' (retiro bazar) se resta
    const nuevoStock = mov.tipo === 'alta' 
      ? stockActual + mov.cantidad 
      : Math.max(0, stockActual - mov.cantidad);

    await supabase
      .from('inventario_tienda')
      .upsert({ tienda_id: 'taiyari', producto_id: mov.producto_id, stock_actual: nuevoStock });

    alert('Movimiento confirmado y reflejado en tu stock disponible.');
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
        Cargando portal de Taiyari...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <HeaderNav titulo="Taiyari Multimarcas" rol="taiyari" />

      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 lg:p-8 space-y-6">
        
        {/* Cabecera Comercial */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-800 p-4 sm:p-6 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Taiyari Multimarcas</h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Consignación: <span className="text-emerald-400 font-semibold">20% ganancia</span> por venta | 80% liquidación 5F
            </p>
          </div>
          <div className="w-full sm:w-auto bg-slate-950/60 border border-slate-800/80 px-3.5 py-2 rounded-xl text-left sm:text-right">
            <span className="text-[10px] uppercase font-mono text-slate-400 block">Día de Visita / Corte</span>
            <span className="text-xs sm:text-sm font-bold text-amber-400">Lunes alternados (Quincenal)</span>
          </div>
        </div>

        {/* Tarjetas Financieras */}
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
            <span className="text-[10px] text-slate-500 block mt-1">Confirmado por 5F</span>
          </div>

          <div className="bg-slate-900 border border-amber-500/30 p-4 sm:p-5 rounded-2xl bg-amber-500/5">
            <span className="text-[11px] text-amber-400 uppercase font-mono font-bold block">Pagos en Revisión</span>
            <p className="text-2xl font-extrabold text-amber-400 mt-1">
              ${totalPagosPendientes.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </p>
            <span className="text-[10px] text-slate-400 block mt-1">Pendientes de confirmación</span>
          </div>
        </div>

        {/* MENÚ DE PESTAÑAS INTUITIVO */}
        <div className="flex items-center gap-1.5 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 text-xs sm:text-sm overflow-x-auto">
          <button
            onClick={() => setSeccionActiva('inventario')}
            className={`flex-1 py-2.5 px-3 rounded-xl font-bold transition whitespace-nowrap ${
              seccionActiva === 'inventario' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            📦 Mi Inventario
          </button>
          <button
            onClick={() => setSeccionActiva('acciones')}
            className={`flex-1 py-2.5 px-3 rounded-xl font-bold transition whitespace-nowrap ${
              seccionActiva === 'acciones' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            ⚡ Registrar Venta / Pago
          </button>
          <button
            onClick={() => setSeccionActiva('aprobaciones')}
            className={`flex-1 py-2.5 px-3 rounded-xl font-bold transition whitespace-nowrap relative ${
              seccionActiva === 'aprobaciones' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            🔔 Aprobaciones {recepcionesPendientes.length > 0 && <span className="w-2 h-2 rounded-full bg-rose-500 inline-block ml-1"></span>}
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

        {/* CONTENIDO 1: INVENTARIO */}
        {seccionActiva === 'inventario' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white">Stock Disponible en Tienda</h2>
                <p className="text-xs text-slate-400">Total en tienda: {inventario.reduce((acc, i) => acc + (i.stock_actual || 0), 0)} piezas</p>
              </div>
              <span className="text-xs text-amber-400 font-mono">Mostrando {productosFiltrados.length} piezas</span>
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
              {productosFiltrados.map((item) => (
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
              ))}
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
                      <td className="p-3 text-right font-bold text-amber-400">{item.stock_actual}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CONTENIDO 2: ACCIONES (VENTA Y PAGO) */}
        {seccionActiva === 'acciones' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
              <h2 className="text-base sm:text-lg font-bold text-white mb-3">Registrar Venta de Piezas</h2>
              <form onSubmit={handleRegistrarVenta} className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Producto</label>
                  <select
                    value={prodVenta}
                    onChange={(e) => setProdVenta(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs sm:text-sm text-slate-200 outline-none focus:border-emerald-500"
                    required
                  >
                    <option value="">Selecciona el producto vendido...</option>
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
              <h2 className="text-base sm:text-lg font-bold text-white mb-3">Reportar Pago a Five Friends</h2>
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
                  <label className="text-xs text-slate-400 block mb-1">Folio o Referencia</label>
                  <input
                    type="text"
                    placeholder="Ej. Transferencia corte lunes"
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
        )}

        {/* CONTENIDO 3: APROBACIONES DE STOCK Y BAZAR */}
        {seccionActiva === 'aprobaciones' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
            <h2 className="text-base sm:text-lg font-bold text-white">Movimientos Pendientes de Aprobación</h2>
            <p className="text-xs text-slate-400">
              Confirma los reabastecimientos que recibes en tienda o las salidas de stock autorizadas para eventos/bazar.
            </p>

            {recepcionesPendientes.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">No tienes mercancía ni movimientos pendientes de confirmar.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {recepcionesPendientes.map((m) => (
                  <div key={m.id} className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded font-bold inline-block mb-1 ${
                        m.tipo === 'alta' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                      }`}>
                        {m.tipo === 'alta' ? 'Entrada / Reingreso' : 'Salida / Retiro Bazar'}
                      </span>
                      <h4 className="text-sm font-semibold text-white truncate">{m.productos?.nombre}</h4>
                      <p className="text-xs text-amber-400 font-mono font-bold">{m.cantidad} piezas</p>
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

        {/* CONTENIDO 4: HISTORIAL Y AUDITORÍA */}
        {seccionActiva === 'auditoria' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white">Historial Auditable</h2>
                <p className="text-xs text-slate-400">Consulta las ventas registradas, movimientos de inventario y pagos.</p>
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
                  Pagos ({historialPagos.length})
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              {subPestanaAuditoria === 'ventas' && (
                <table className="w-full text-left text-xs sm:text-sm text-slate-300 min-w-[550px]">
                  <thead className="uppercase bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">Fecha</th>
                      <th className="p-2.5">Producto</th>
                      <th className="p-2.5 text-center">Pzas</th>
                      <th className="p-2.5">Total</th>
                      <th className="p-2.5 text-emerald-400">20% Ganancia</th>
                      <th className="p-2.5 text-rose-400">80% 5F</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {historialVentas.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-800/40">
                        <td className="p-2.5 text-slate-400 text-[11px] whitespace-nowrap">{new Date(v.creado_en).toLocaleDateString('es-MX')}</td>
                        <td className="p-2.5 font-medium text-slate-100">{v.productos?.nombre}</td>
                        <td className="p-2.5 text-center font-bold">{v.cantidad}</td>
                        <td className="p-2.5 font-mono">${Number(v.total_venta).toFixed(2)}</td>
                        <td className="p-2.5 font-mono text-emerald-400 font-bold">+${Number(v.monto_tienda).toFixed(2)}</td>
                        <td className="p-2.5 font-mono text-rose-400">${Number(v.monto_five_friends).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {subPestanaAuditoria === 'movimientos' && (
                <table className="w-full text-left text-xs sm:text-sm text-slate-300 min-w-[550px]">
                  <thead className="uppercase bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">Fecha</th>
                      <th className="p-2.5">Tipo</th>
                      <th className="p-2.5">Producto</th>
                      <th className="p-2.5 text-center">Pzas</th>
                      <th className="p-2.5">Estado</th>
                      <th className="p-2.5">Detalle / Razón</th>
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
                            {p.estado === 'aprobado' ? '✓ Aprobado por 5F' : '⏳ En revisión'}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-400 text-xs">{p.nota || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* CONTENIDO 5: ENCARGOS */}
        {seccionActiva === 'pedidos' && (
          <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
            <h2 className="text-base sm:text-lg font-bold text-white mb-2">Solicitar Pedidos Especiales</h2>
            <p className="text-xs text-slate-400 mb-4">Encarga piezas solicitadas por clientes que no tengas en stock.</p>
            <form onSubmit={handleCrearPedido} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  required
                  placeholder="Descripción de la pieza, personaje o especificaciones..."
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
