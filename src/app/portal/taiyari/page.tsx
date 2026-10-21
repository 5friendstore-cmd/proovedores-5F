'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import HeaderNav from '@/components/HeaderNav';
import { supabase, calcularTotalVenta } from '@/lib/supabaseClient';

export default function PortalTaiyari() {
  const router = useRouter();
  const tienda = 'taiyari';

  const [autorizado, setAutorizado] = useState(false);
  const [infoTienda, setInfoTienda] = useState<any>(null);
  const [inventario, setInventario] = useState<any[]>([]);
  const [recepcionesPendientes, setRecepcionesPendientes] = useState<any[]>([]);
  
  // Historiales auditables
  const [historialVentas, setHistorialVentas] = useState<any[]>([]);
  const [historialMovimientos, setHistorialMovimientos] = useState<any[]>([]);
  const [historialPagos, setHistorialPagos] = useState<any[]>([]);
  const [pestanaAuditoria, setPestanaAuditoria] = useState<'ventas' | 'movimientos' | 'pagos'>('ventas');

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
    // 1. Datos de la tienda
    const { data: t } = await supabase.from('tiendas').select('*').eq('id', 'taiyari').single();
    if (t) setInfoTienda(t);

    // 2. Inventario físico actual
    const { data: inv } = await supabase
      .from('inventario_tienda')
      .select('*, productos(*)')
      .eq('tienda_id', 'taiyari');
    if (inv) setInventario(inv);

    // 3. Mercancía entrante pendiente de confirmar
    const { data: rec } = await supabase
      .from('movimientos_stock')
      .select('*, productos(nombre)')
      .eq('tienda_id', 'taiyari')
      .eq('estado', 'pendiente_recepcion');
    if (rec) setRecepcionesPendientes(rec);

    // 4. Auditoría: Historial completo de ventas
    const { data: ventas } = await supabase
      .from('ventas')
      .select('*, productos(nombre, sku)')
      .eq('tienda_id', 'taiyari')
      .order('creado_en', { ascending: false });
    if (ventas) setHistorialVentas(ventas);

    // 5. Auditoría: Historial completo de movimientos de stock (entradas/salidas)
    const { data: movs } = await supabase
      .from('movimientos_stock')
      .select('*, productos(nombre, sku)')
      .eq('tienda_id', 'taiyari')
      .order('creado_en', { ascending: false });
    if (movs) setHistorialMovimientos(movs);

    // 6. Auditoría: Historial completo de pagos registrados y adeudo
    const { data: pagos } = await supabase
      .from('pagos_mercancia')
      .select('*')
      .eq('tienda_id', 'taiyari')
      .order('creado_en', { ascending: false });
    if (pagos) setHistorialPagos(pagos);
  };

  // Cálculos Financieros Auditables
  const totalComisionGanada = historialVentas.reduce((acc, v) => acc + Number(v.monto_tienda || 0), 0);
  const totalVendidoPara5F = historialVentas.reduce((acc, v) => acc + Number(v.monto_five_friends || 0), 0);
  
  // Total que Five Friends ya ha aprobado
  const totalPagadoAprobado = historialPagos
    .filter(p => p.estado === 'aprobado')
    .reduce((acc, p) => acc + Number(p.monto || 0), 0);

  // Pagos en espera de validación
  const totalPagosPendientes = historialPagos
    .filter(p => p.estado === 'pendiente_confirmacion')
    .reduce((acc, p) => acc + Number(p.monto || 0), 0);

  // Saldo pendiente = (Adeudo histórico inicial + 80% ventas) - Pagos aprobados
  // Nota: Si el adeudo inicial de $665 está en pagos_mercancia como 'pendiente_confirmacion',
  // se incluye como parte del saldo pendiente que Taiyari debe liquidar.
  const adeudoHistoricoInicial = 665.00;
  const saldoPendientePorPagar = Math.max(0, (adeudoHistoricoInicial + totalVendidoPara5F) - totalPagadoAprobado);

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
    alert(`Venta registrada exitosamente.${msjDetalle}\nTotal: $${total.toFixed(2)} MXN\nComisión Taiyari (20%): $${montoTienda.toFixed(2)} MXN\nA liquidar a 5F (80%): $${monto5F.toFixed(2)} MXN`);

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
        Cargando portal auditable de Taiyari...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <HeaderNav titulo="Taiyari Multimarcas" rol="taiyari" />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        
        {/* Cabecera y Resumen de Condiciones */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700/60 p-6 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Taiyari Multimarcas</h1>
            <p className="text-sm text-slate-400 mt-1">
              Esquema de Consignación: <span className="text-emerald-400 font-bold">20% de ganancia</span> por venta | 80% liquidación a Five Friends.
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs uppercase font-mono text-slate-400">Próxima Visita / Corte</span>
            <p className="text-lg font-bold text-amber-400">Lunes alternados (Base: 19 Oct 2026)</p>
          </div>
        </div>

        {/* MÉTRICAS FINANCIERAS AUDITABLES EN TIEMPO REAL */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-emerald-500/30 p-5 rounded-2xl bg-emerald-500/5">
            <span className="text-xs text-emerald-400 uppercase font-mono font-bold">Tus Ganancias (20%)</span>
            <p className="text-2xl font-extrabold text-emerald-400 mt-1">
              ${totalComisionGanada.toLocaleString('es-MX', { minimumFractionDigits: 2 })} <span className="text-xs font-normal text-slate-400">MXN</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Acumulado histórico por comisiones</p>
          </div>

          <div className="bg-slate-900 border border-rose-500/30 p-5 rounded-2xl bg-rose-500/5">
            <span className="text-xs text-rose-400 uppercase font-mono font-bold">Saldo Pendiente a 5F</span>
            <p className="text-2xl font-extrabold text-rose-400 mt-1">
              ${saldoPendientePorPagar.toLocaleString('es-MX', { minimumFractionDigits: 2 })} <span className="text-xs font-normal text-slate-400">MXN</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Incluye $665.00 adeudo inicial</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <span className="text-xs text-slate-400 uppercase font-mono">Total Pagado Aprobado</span>
            <p className="text-2xl font-extrabold text-slate-200 mt-1">
              ${totalPagadoAprobado.toLocaleString('es-MX', { minimumFractionDigits: 2 })} <span className="text-xs font-normal text-slate-400">MXN</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Confirmado por Five Friends</p>
          </div>

          <div className="bg-slate-900 border border-amber-500/30 p-5 rounded-2xl bg-amber-500/5">
            <span className="text-xs text-amber-400 uppercase font-mono font-bold">Pagos por Validar</span>
            <p className="text-2xl font-extrabold text-amber-400 mt-1">
              ${totalPagosPendientes.toLocaleString('es-MX', { minimumFractionDigits: 2 })} <span className="text-xs font-normal text-slate-400">MXN</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-1">En revisión por Five Friends</p>
          </div>
        </div>

        {/* Alerta de Recepciones de Stock Pendientes */}
        {recepcionesPendientes.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 p-5 rounded-2xl space-y-3">
            <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
              Mercancía Entrante Pendiente de Recepción
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {recepcionesPendientes.map((m) => (
                <div key={m.id} className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{m.productos?.nombre}</p>
                    <p className="text-xs text-slate-400">Cantidad enviada: {m.cantidad} piezas</p>
                  </div>
                  <button
                    onClick={() => handleConfirmarRecepcion(m.id, m.producto_id, m.cantidad)}
                    className="bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold px-3 py-1.5 rounded-lg transition"
                  >
                    Confirmar recepción
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Acciones: Registrar Venta y Notificar Pago */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
            <h2 className="text-lg font-bold text-white mb-4">Registrar Venta de Piezas</h2>
            <form onSubmit={handleRegistrarVenta} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400">Producto del inventario</label>
                <select
                  value={prodVenta}
                  onChange={(e) => setProdVenta(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm mt-1 text-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                  required
                >
                  <option value="">Selecciona la pieza vendida...</option>
                  {inventario.map((i) => (
                    <option key={i.id} value={i.producto_id}>
                      {i.productos?.nombre} (Disponibles: {i.stock_actual} | ${i.productos?.precio_venta} MXN)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400">Cantidad Vendida</label>
                <input
                  type="number"
                  min="1"
                  value={cantVenta}
                  onChange={(e) => setCantVenta(parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm mt-1 text-slate-100"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg text-sm transition"
              >
                Confirmar Salida y Venta
              </button>
            </form>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
            <h2 className="text-lg font-bold text-white mb-4">Reportar Pago a Five Friends</h2>
            <form onSubmit={handleReportarPago} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400">Monto entregado o transferido (MXN)</label>
                <input
                  type="number"
                  step="0.50"
                  required
                  placeholder="0.00"
                  value={montoPago}
                  onChange={(e) => setMontoPago(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm mt-1 text-slate-100"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Nota, Folio o Fecha de Transferencia</label>
                <input
                  type="text"
                  placeholder="Ej. Transferencia corte lunes 19 Oct"
                  value={notaPago}
                  onChange={(e) => setNotaPago(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm mt-1 text-slate-100"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold py-2.5 rounded-lg text-sm border border-slate-700 transition"
              >
                Notificar Pago para Validación
              </button>
            </form>
          </div>
        </div>

        {/* SECCIÓN AUDITABLE COMPLETA (HISTORIAL CON PESTAÑAS) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-white">Módulo de Auditoría e Historial</h2>
              <p className="text-xs text-slate-400">Bitácora auditable de entradas de stock, salidas por venta y pagos.</p>
            </div>
            {/* Pestañas selectoras */}
            <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setPestanaAuditoria('ventas')}
                className={`px-3 py-1.5 rounded-lg font-bold transition ${
                  pestanaAuditoria === 'ventas' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                Ventas ({historialVentas.length})
              </button>
              <button
                onClick={() => setPestanaAuditoria('movimientos')}
                className={`px-3 py-1.5 rounded-lg font-bold transition ${
                  pestanaAuditoria === 'movimientos' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                Entradas/Salidas ({historialMovimientos.length})
              </button>
              <button
                onClick={() => setPestanaAuditoria('pagos')}
                className={`px-3 py-1.5 rounded-lg font-bold transition ${
                  pestanaAuditoria === 'pagos' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                Pagos y Cortes ({historialPagos.length})
              </button>
            </div>
          </div>

          {/* 1. TABLA AUDITABLE DE VENTAS */}
          {pestanaAuditoria === 'ventas' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="text-xs uppercase bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Producto</th>
                    <th className="p-3 text-center">Piezas</th>
                    <th className="p-3">Total Venta</th>
                    <th className="p-3 text-emerald-400">Tu Ganancia (20%)</th>
                    <th className="p-3 text-rose-400">A Liquidar 5F (80%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {historialVentas.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500 text-sm">
                        No hay registro de ventas realizadas todavía.
                      </td>
                    </tr>
                  ) : (
                    historialVentas.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-800/40">
                        <td className="p-3 text-xs text-slate-400">
                          {new Date(v.creado_en).toLocaleString('es-MX', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </td>
                        <td className="p-3 font-medium text-slate-100">
                          {v.productos?.nombre} <span className="text-xs text-slate-500 font-mono">[{v.productos?.sku}]</span>
                        </td>
                        <td className="p-3 text-center font-bold text-white">{v.cantidad}</td>
                        <td className="p-3 font-mono font-semibold">${Number(v.total_venta).toFixed(2)}</td>
                        <td className="p-3 font-mono font-bold text-emerald-400">+${Number(v.monto_tienda).toFixed(2)}</td>
                        <td className="p-3 font-mono font-bold text-rose-400">${Number(v.monto_five_friends).toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* 2. TABLA AUDITABLE DE MOVIMIENTOS DE STOCK (KARDEX) */}
          {pestanaAuditoria === 'movimientos' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="text-xs uppercase bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-3">Fecha Registro</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">Producto</th>
                    <th className="p-3 text-center">Cantidad</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3">Notas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {historialMovimientos.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500 text-sm">
                        No hay movimientos registrados.
                      </td>
                    </tr>
                  ) : (
                    historialMovimientos.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-800/40">
                        <td className="p-3 text-xs text-slate-400">
                          {new Date(m.creado_en).toLocaleString('es-MX', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </td>
                        <td className="p-3 font-mono text-xs">
                          <span className={`px-2 py-0.5 rounded uppercase font-bold ${
                            m.tipo === 'alta' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                          }`}>
                            {m.tipo === 'alta' ? 'Entrada' : 'Salida/Baja'}
                          </span>
                        </td>
                        <td className="p-3 font-medium text-slate-100">{m.productos?.nombre}</td>
                        <td className="p-3 text-center font-bold text-white">{m.cantidad} pzas</td>
                        <td className="p-3 text-xs">
                          <span className={`px-2 py-0.5 rounded font-bold ${
                            m.estado === 'confirmado' ? 'bg-sky-500/20 text-sky-300' : 'bg-amber-500/20 text-amber-300'
                          }`}>
                            {m.estado === 'confirmado' ? 'Confirmado' : 'Pendiente Recepción'}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-slate-400">{m.nota || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* 3. TABLA AUDITABLE DE PAGOS Y LIQUIDACIONES */}
          {pestanaAuditoria === 'pagos' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="text-xs uppercase bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-3">Fecha Reporte</th>
                    <th className="p-3">Monto (MXN)</th>
                    <th className="p-3">Estatus</th>
                    <th className="p-3">Referencia / Detalle</th>
                    <th className="p-3">Fecha Aprobación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {historialPagos.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-500 text-sm">
                        No hay pagos reportados todavía.
                      </td>
                    </tr>
                  ) : (
                    historialPagos.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-800/40">
                        <td className="p-3 text-xs text-slate-400">
                          {new Date(p.creado_en).toLocaleString('es-MX', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </td>
                        <td className="p-3 font-mono font-bold text-base text-white">
                          ${Number(p.monto).toFixed(2)}
                        </td>
                        <td className="p-3 text-xs">
                          <span className={`px-2 py-0.5 rounded font-bold ${
                            p.estado === 'aprobado'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}>
                            {p.estado === 'aprobado' ? '✓ Aprobado por 5F' : '⏳ Pendiente de Aprobación'}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-slate-300">{p.nota || 'Sin nota'}</td>
                        <td className="p-3 text-xs text-slate-500 font-mono">
                          {p.aprobado_en
                            ? new Date(p.aprobado_en).toLocaleString('es-MX', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })
                            : 'En revisión'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Encargos y Pedidos Especiales */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
          <h2 className="text-lg font-bold text-white mb-2">Solicitar Pedidos Especiales</h2>
          <form onSubmit={handleCrearPedido} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <input
                  type="text"
                  required
                  placeholder="Descripción de la pieza por encargo..."
                  value={descPedido}
                  onChange={(e) => setDescPedido(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-100"
                />
              </div>
              <div>
                <input
                  type="number"
                  min="1"
                  value={piezasPedido}
                  onChange={(e) => setPiezasPedido(parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-100"
                />
              </div>
            </div>
            <button
              type="submit"
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-5 py-2.5 rounded-lg text-sm transition"
            >
              Enviar Encargo
            </button>
          </form>
        </div>

        {/* Inventario Físico Disponible */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">Inventario Físico en Tienda</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs uppercase bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-3">Categoría</th>
                  <th className="p-3">Nombre</th>
                  <th className="p-3">Precio Venta</th>
                  <th className="p-3 text-right">Disponibles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {inventario.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/40">
                    <td className="p-3 text-slate-400">{item.productos?.categoria}</td>
                    <td className="p-3 font-medium">{item.productos?.nombre}</td>
                    <td className="p-3 font-mono">${Number(item.productos?.precio_venta || 0).toFixed(2)} MXN</td>
                    <td className="p-3 text-right font-bold text-amber-400">{item.stock_actual}</td>
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
