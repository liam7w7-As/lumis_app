import { useState } from 'react';
import type { AuditEvent, Plan } from './api';
import { useRemote } from './hooks';
import { date, Empty, ErrorBox, Icon, Loading, money, Pagination, planNames } from './ui';
export function Plans() {
  const { data, error, loading, reload } = useRemote<{ plans: Plan[] }>('/plans');
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SIMPLE, CLARO Y PARA CADA ETAPA</p>
          <h1>Los planes de Lumis</h1>
          <p>Las condiciones que se aplican a todas las empresas.</p>
        </div>
        <span className="badge neutral">Precios en bolivianos</span>
      </div>
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading ? (
        <Loading />
      ) : (
        <div className="plans-grid">
          {data?.plans.map((p) => (
            <article className={'plan-card ' + (p.id === 'pro' ? 'featured' : '')} key={p.id}>
              {p.id === 'pro' && (
                <span className="popular">
                  <Icon name="star" size={14} /> Más popular
                </span>
              )}
              <h2>{p.name}</h2>
              <p className="price">
                Bs. {p.price}
                <small>{p.price > 0 ? ' / mes' : ''}</small>
              </p>
              <p className="plan-description">
                {p.id === 'free'
                  ? 'Para empezar a organizar tu negocio con Lumis.'
                  : p.id === 'pro'
                    ? 'Para negocios que necesitan más herramientas cada día.'
                    : 'Para negocios con más movimiento y equipos de trabajo.'}
              </p>
              <ul>
                {[
                  p.limits.quotes === null
                    ? 'Cotizaciones ilimitadas'
                    : `${p.limits.quotes} cotizaciones`,
                  p.limits.sales === null
                    ? 'Notas de venta ilimitadas'
                    : `${p.limits.sales} notas de venta`,
                  p.limits.deliveries === null
                    ? 'Notas de entrega ilimitadas'
                    : `${p.limits.deliveries} notas de entrega`,
                  `${p.limits.scans} escaneos mágicos${p.scansPeriod === 'monthly' ? ' al mes' : ''}`,
                  ...(p.editDocuments
                    ? ['Modificar documentos guardados']
                    : ['Datos de tu empresa y logo']),
                  ...(p.brandColors ? ['Paleta de colores'] : []),
                  p.users === null ? 'Usuarios ilimitados' : `Hasta ${p.users} usuarios`,
                ].map((line) => (
                  <li key={line}>
                    <Icon name="check" size={18} />
                    {line}
                  </li>
                ))}
              </ul>
              <div className="plan-bottom">
                {p.id === 'free'
                  ? 'Cupos totales, por única vez'
                  : 'Consulta y exportación al vencer'}
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="info-note">
        <Icon name="alert" />
        <div>
          <strong>Escaneos mágicos: preparados en los planes</strong>
          <p>
            El escáner todavía no está implementado. No se cobra ni se registra consumo ficticio. En
            Pro y Plus, su cupo se renovará por mes calendario, hora de Bolivia.
          </p>
        </div>
      </div>
      <div className="panel policy">
        <h3>Reglas de acceso</h3>
        <div className="policy-grid">
          <div>
            <Icon name="shield" />
            <strong>Los datos se conservan</strong>
            <p>
              Una licencia vencida o suspendida permite consultar y exportar. Para crear o
              modificar, se debe renovar o habilitar.
            </p>
          </div>
          <div>
            <Icon name="users" />
            <strong>La licencia pertenece a la empresa</strong>
            <p>
              El plan cubre al administrador y a sus vendedores. Cada cuenta habilitada ocupa un
              cupo.
            </p>
          </div>
          <div>
            <Icon name="clock" />
            <strong>Un vencimiento claro</strong>
            <p>
              La fecha elegida incluye todo ese día en Bolivia. Renovar o cambiar de plan conserva
              los documentos y su historial.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
export function Activity({
  businessId,
  compact = false,
}: {
  businessId?: number;
  compact?: boolean;
}) {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useRemote<{ events: AuditEvent[]; total: number }>(
    '/activity?' +
      new URLSearchParams({
        page: String(page),
        ...(businessId ? { businessId: String(businessId) } : {}),
      }),
  );
  return (
    <>
      {!compact && (
        <div className="page-heading">
          <div>
            <p className="eyebrow">TRAZABILIDAD</p>
            <h1>Actividad</h1>
            <p>Un registro de quién cambió las licencias y los accesos.</p>
          </div>
          <button className="button secondary" onClick={reload}>
            <Icon name="refresh" /> Actualizar
          </button>
        </div>
      )}
      <div className={compact ? '' : 'panel'}>
        {error ? (
          <ErrorBox error={error} retry={reload} />
        ) : loading ? (
          <Loading />
        ) : !data?.events.length ? (
          <Empty title="El historial comienza aquí">
            Los cambios que realices en licencias y usuarios aparecerán en este registro.
          </Empty>
        ) : (
          <div className="activity-list">
            {data.events.map((e) => (
              <div className="activity-row" key={e.id}>
                <span className="event-icon">
                  <Icon name={e.action === 'license_updated' ? 'key' : 'users'} />
                </span>
                <div>
                  <strong>
                    {e.action === 'license_updated'
                      ? 'Licencia actualizada'
                      : 'Acceso de usuario actualizado'}
                  </strong>
                  <p>
                    {e.businessName}
                    {e.detail.after
                      ? ` · ${planNames[e.detail.after.plan]} · ${e.detail.after.status === 'active' ? 'Habilitada' : 'Suspendida'}${e.detail.after.expiresOn ? ' hasta ' + date(e.detail.after.expiresOn) : ''}`
                      : ` · Usuario #${e.detail.userId} ${e.detail.enabled ? 'habilitado' : 'deshabilitado'}`}
                  </p>
                  {e.detail.note && <p className="event-note">“{e.detail.note}”</p>}
                  <small>
                    {e.actor} · {date(e.createdAt)} ·{' '}
                    {new Date(e.createdAt).toLocaleTimeString('es-BO', {
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'America/La_Paz',
                    })}
                  </small>
                </div>
              </div>
            ))}
          </div>
        )}
        {data && <Pagination page={page} size={25} total={data.total} onChange={setPage} />}
      </div>
    </>
  );
}
export function LicenseValue({ value }: { value: number }) {
  return (
    <>
      <span>Bs. {money(value)}</span>
      <small>Valor mensual de licencias activas. Los pagos se verifican por fuera del panel.</small>
    </>
  );
}
