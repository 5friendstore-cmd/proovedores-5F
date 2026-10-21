'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import HeaderNav from '@/components/HeaderNav';
import { supabase, calcularTotalVenta } from '@/lib/supabaseClient';

export default function PortalTienda() {
  const params = useParams();
  const router = useRouter();
  const tienda = params?.tienda as string;

  const [autorizado, setAutorizado] = useState(false);
  const [infoTienda, setInfoTienda] = useState<any>(null);
  const [inventario, setInventario] = useState<any[]>([]);
  const [recepcionesPendientes, setRecepcionesPendientes] = useState<any[]>([]);
  const [rentasPendientes, setRentasPendientes] = useState<any[]>([]);

  const [prodVenta, setProdVenta] = useState('');
  const [cantVenta, setCantVenta] = useState(1);
  const [descPedido, setDescPedido] = useState('');
  const [piezasPedido, setPiezasPedido] = useState(1);
  const [montoPago, setMontoPago] = useState('');
  const [notaPago, setNotaPago] = useState('');

  useEffect(() => {
    verificarSesionTienda();
  }, [tienda]);

  const verificarSesionTienda = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.replace('/login');
      return;
    }

    const { data: perfil } = await supabase
      .from('perfiles_usuarios')
      .select('rol, tienda_id')
      .eq('id', session.user.id)
      .single();

    if (!perfil) {
      router.replace('/login');
      return;
    }

    // Permitir acceso si es admin o si coincide con la tienda asignada
    if (perfil.rol === 'admin' || perfil.tienda_id === tienda) {
      setAutorizado(true);
      cargarPortal();
    } else {
      router.replace('/login');
    }
  };

  const cargarPortal = async () => {
    const { data: t } = await supabase.from('tiendas').select('*').eq('id', tienda).single();
    setInfoTienda(t);

    const { data: inv } = await supabase
      .from('inventario_tienda')
      .select('*, productos(*)')
      .eq('tienda_id', tienda);
    if (inv) setInventario(inv);

    const { data: rec } = await supabase
      .from('movimientos_stock')
      .select('*, productos(nombre)')
      .eq('tienda_id', tienda)
      .eq('estado', 'pendiente_recepcion');
    if (rec) setRecepcionesPendientes(rec);

    if (tienda === 'haruss') {
      const { data: r } = await supabase
        .from('pagos_renta')
        .select('*')
        .eq('tienda_id', 'haruss')
        .eq('aprobado_por_tienda', false);
      if (r) setRentasPendientes(r);
    }
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
      .upsert({ tienda_id: tienda, producto_id: prodId, stock_actual: nuevoStock });

    alert('Mercancía agregada exitosamente a tu inventario disponible.');
    cargarPortal();
  };

  const handleRegistrarVenta = async (e: React.FormEvent) => {
    e.preventDefault();
    const itemInv = inventario.find((i) => i.producto_id === prodVenta);
    if (!itemInv || itemInv.stock_actual < cantVenta) {
      alert('Stock insuficiente para registrar esta venta.');
      return;
    }

    const { total, precioEfectivoPorPieza, detallePromocion } = calcularTotalVenta(
      itemInv.productos.sku,
      cantVenta,
      Number(itemInv.productos.precio_venta)
    );

    const comisionPct = infoTienda?.comision_porcentaje || 0;
    const montoTienda = total * (comisionPct / 100);
    const monto5F = total - montoTienda;

    await supabase.from('ventas').insert({
      tienda_id: tienda,
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
    alert(`Venta registrada con éxito.${msjDetalle}\nTotal: $${total.toFixed(2)} MXN\nComisión Tienda: $${montoTienda.toFixed(2)} MXN\nFive Friends: $${monto5F.toFixed(2)} MXN`);

    setCantVenta(1);
    cargarPortal();
  };

  const handleReportarPago = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from('pagos_mercancia').insert({
      tienda_id: tienda,
      monto: parseFloat(montoPago),
      nota: notaPago,
      estado: 'pendiente_confirmacion'
    });
    setMontoPago('');
    setNotaPago('');
    alert('Comprobante de pago enviado a Five Friends para su autorización.');
  };

  const handleAprobarRenta = async (idRenta: string) => {
    await supabase
      .from('pagos_renta')
      .update({ aprobado_por_tienda: true, aprobado_en: new Date().toISOString() })
      .eq('id', idRenta);
    alert('Has confirmado la recepción del pago de renta.');
    cargarPortal();
  };

  const handleCrearPedido = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from('pedidos_cotizaciones').insert({
      tienda_id: tienda,
      descripcion: descPedido,
      piezas_estimadas: piezasPedido
    });
    setDescPedido('');
    alert('Encargo especial enviado al taller de Five Friends.');
  };

  if (!autorizado) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 font-mono text-xs">
        Cargando portal del punto de venta...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <HeaderNav titulo={infoTienda?.nombre || 'Punto de Venta'} rol={tienda} />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700/60 p-6 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{infoTienda?.nombre}</h1>
            <p className="text-sm text-slate-400 mt-1">
              {infoTienda?.modelo === 'consigna'
                ? `Modelo por Comisión: Recibes el ${infoTienda?.comision_porcentaje}% sobre cada venta realizada.`
                : `Modelo Renta Fija: Five Friends cubre $${infoTienda?.renta_mensual} MXN mensuales por espacio.`}
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs uppercase font-mono text-slate-400">Día de Visita y Corte</span>
            <p className="text-lg font-bold text-amber-400 capitalize">{infoTienda?.dia_visita} alternados</p>
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

        {tienda === 'haruss' && rentasPendientes.length > 0 && (
          <div className="bg-indigo-500/10 border border-indigo-500/30 p-5 rounded-2xl">
            <h3 className="text-sm font-bold text-indigo-400">Pagos de Renta Notificados por Five Friends</h3>
            {rentasPendientes.map((r) => (
              <div key={r.id} className="mt-3 flex items-center justify-between bg-slate-900 p-3 rounded-xl border border-slate-800">
                <span className="text-sm">Periodo: {r.mes_periodo} — $250.00 MXN</span>
                <button
                  onClick={() => handleAprobarRenta(r.id)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-xs font-bold px-3 py-1.5 rounded-lg"
                >
                  Confirmar recepción de renta
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
            <h2 className="text-lg font-bold text-white mb-4">Registrar Venta de Piezas</h2>
            <form onSubmit={handleRegistrarVenta} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400">Producto del inventario</label>
                <select
                  value={prodVenta}
                  onChange={(e) => setProdVenta(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm mt-1"
                  required
                >
                  <option value="">Selecciona la pieza vendida...</option>
                  {inventario.map((i) => (
                    <option key={i.id} value={i.producto_id}>
                      {i.productos?.nombre} (Stock actual: {i.stock_actual} | ${i.productos?.precio_venta} MXN)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400">Piezas Vendidas</label>
                <input
                  type="number"
                  min="1"
                  value={cantVenta}
                  onChange={(e) => setCantVenta(parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm mt-1"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg text-sm"
              >
                Confirmar Salida y Venta
              </button>
            </form>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
            <h2 className="text-lg font-bold text-white mb-4">Reportar Pago a Five Friends</h2>
            <form onSubmit={handleReportarPago} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400">Monto transferido o entregado (MXN)</label>
                <input
                  type="number"
                  step="0.50"
                  required
                  placeholder="0.00"
                  value={montoPago}
                  onChange={(e) => setMontoPago(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Nota o Folio de Transferencia</label>
                <input
                  type="text"
                  placeholder="Ej. Transferencia corte quincenal"
                  value={notaPago}
                  onChange={(e) => setNotaPago(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm mt-1"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold py-2.5 rounded-lg text-sm border border-slate-700"
              >
                Notificar Pago para Validación
              </button>
            </form>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
          <h2 className="text-lg font-bold text-white mb-2">Solicitar Pedidos o Cotizaciones Especiales</h2>
          <p className="text-xs text-slate-400 mb-4">Encarga piezas solicitadas por tus clientes que no tengas disponibles en tienda.</p>
          <form onSubmit={handleCrearPedido} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <input
                  type="text"
                  required
                  placeholder="Descripción de la pieza, medidas o especificaciones..."
                  value={descPedido}
                  onChange={(e) => setDescPedido(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm"
                />
              </div>
              <div>
                <input
                  type="number"
                  min="1"
                  value={piezasPedido}
                  onChange={(e) => setPiezasPedido(parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm"
                />
              </div>
            </div>
            <button
              type="submit"
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-5 py-2.5 rounded-lg text-sm"
            >
              Enviar Encargo a Taller 5F
            </button>
          </form>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">Inventario Físico en Tienda</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs uppercase bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-3">Categoría</th>
                  <th className="p-3">Nombre</th>
                  <th className="p-3">Precio Venta</th>
                  <th className="p-3 text-right">Piezas Disponibles</th>
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
