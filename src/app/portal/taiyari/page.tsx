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
              Esquema de Consignación: <span className="text
