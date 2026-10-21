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
  };

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
        Cargando portal de Taiyari Multimarcas...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <HeaderNav titulo="Taiyari Multimarcas" rol="taiyari" />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700/60 p-6 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Taiyari Multimarcas</h1>
            <p className="text-sm text-slate-400 mt-1">
              Modelo Comisión: 20% sobre cada producto vendido.
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs uppercase font-mono text-slate-400">Día de Visita y Corte</span>
            <p className="text-lg font-bold text-amber-400">Lunes alternados (Quincenal)</p>
          </div>
        </div>

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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
            <h2 className="text-lg font-bold text-white mb-4">Registrar Venta de Piezas</h2>
            <form onSubmit={handleRegistrarVenta} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400">Producto</label>
                <select
                  value={prodVenta}
                  onChange={(e) => setProdVenta(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm mt-1 text-slate-200"
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
                Confirmar Venta
              </button>
            </form>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
            <h2 className="text-lg font-bold text-white mb-4">Reportar Pago a Five Friends</h2>
            <form onSubmit={handleReportarPago} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400">Monto entregado/transferido (MXN)</label>
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
                <label className="text-xs text-slate-400">Nota o Folio</label>
                <input
                  type="text"
                  placeholder="Ej. Transferencia corte"
                  value={notaPago}
                  onChange={(e) => setNotaPago(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm mt-1 text-slate-100"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold py-2.5 rounded-lg text-sm border border-slate-700 transition"
              >
                Notificar Pago
              </button>
            </form>
          </div>
        </div>

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

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">Inventario en Tienda</h2>
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
                    <td className="p-3 font-mono">${item.productos?.precio_venta?.toFixed(2)} MXN</td>
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
