import { useState, type FormEvent } from 'react';
import { api, type Business, type BusinessDetail, type PlanId } from './api';
import { useDebounced, useRemote } from './hooks';
import { Activity } from './Plans';
import {
  date,
  Dialog,
  Empty,
  ErrorBox,
  Icon,
  Loading,
  Pagination,
  PlanBadge,
  planNames,
  Status,
} from './ui';

export function Companies({
  onOpen,
  licenses = false,
}: {
  onOpen: (id: number) => void;
  licenses?: boolean;
}) {
  const [search, setSearch] = useState(''),
    [plan, setPlan] = useState(''),
    [state, setState] = useState(''),
    [page, setPage] = useState(1);
  const text = useDebounced(search);
  const params = new URLSearchParams({
    page: String(page),
    search: text,
    ...(plan ? { plan } : {}),
    ...(state ? { state } : {}),
  });
  const { data, error, loading, reload } = useRemote<{ businesses: Business[]; total: number }>(
    '/businesses?' + params,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{licenses ? 'ACCESO Y VENCIMIENTOS' : 'TU CARTERA DE CLIENTES'}</p>
          <h1>{licenses ? 'Licencias' : 'Empresas'}</h1>
          <p>
            {licenses
              ? 'Activa, renueva o suspende el acceso de cada empresa.'
              : 'Todas las empresas que se han registrado en Lumis.'}
          </p>
        </div>
        <button className="button secondary" onClick={reload}>
          <Icon name="refresh" /> Actualizar
        </button>
      </div>
      <div className="panel">
        <div className="filters">
          <label className="search">
            <Icon name="search" />
            <input
              aria-label="Buscar empresas"
              placeholder="Buscar por empresa, usuario o correo…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="sr-only" htmlFor="plan-filter">
            Plan
          </label>
          <select
            id="plan-filter"
            value={plan}
            onChange={(e) => {
              setPlan(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos los planes</option>
            <option value="free">Gratis</option>
            <option value="pro">Pro</option>
            <option value="plus">Plus</option>
          </select>
          <label className="sr-only" htmlFor="state-filter">
            Estado
          </label>
          <select
            id="state-filter"
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos los estados</option>
            <option value="active">Activas</option>
            <option value="expired">Vencidas</option>
            <option value="suspended">Suspendidas</option>
          </select>
        </div>
        {error ? (
          <ErrorBox error={error} retry={reload} />
        ) : loading ? (
          <Loading />
        ) : !data?.businesses.length ? (
          <Empty title="No hay empresas para mostrar">
            Las nuevas empresas aparecerán aquí cuando se registren. Prueba también a cambiar los
            filtros.
          </Empty>
        ) : (
          <BusinessTable businesses={data.businesses} onOpen={onOpen} />
        )}
        {data && <Pagination page={page} total={data.total} size={20} onChange={setPage} />}
      </div>
      <p className="footnote">
        <Icon name="shield" size={16} /> Los cambios de licencia se registran en Actividad. Los
        documentos se conservan cuando vence un plan.
      </p>
    </>
  );
}
export function BusinessTable({
  businesses,
  onOpen,
}: {
  businesses: Business[];
  onOpen: (id: number) => void;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Empresa</th>
            <th>Plan</th>
            <th>Estado</th>
            <th>Usuarios</th>
            <th>Vencimiento</th>
            <th>
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {businesses.map((b) => (
            <tr key={b.id}>
              <td>
                <button className="company-link" onClick={() => onOpen(b.id)}>
                  <span className="company-avatar">
                    <Icon name="business" />
                  </span>
                  <span>
                    <strong>{b.name}</strong>
                    <small>{b.ownerName || b.email || `Empresa #${b.id}`}</small>
                  </span>
                </button>
              </td>
              <td>
                <PlanBadge plan={b.plan} />
              </td>
              <td>
                <Status state={b.state} />
              </td>
              <td>
                {b.enabledUsers}
                <span className="muted">
                  {b.plan === 'plus' ? ' / ∞' : b.plan === 'pro' ? ' / 6' : ' / 2'}
                </span>
              </td>
              <td className="date-cell">{date(b.expiresOn)}</td>
              <td>
                <button
                  className="table-action"
                  onClick={() => onOpen(b.id)}
                  aria-label={'Administrar ' + b.name}
                >
                  Administrar <Icon name="arrow" size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function CompanyDialog({
  id,
  onClose,
  onChanged,
  notify,
}: {
  id: number;
  onClose: () => void;
  onChanged: () => void;
  notify: (s: string) => void;
}) {
  const { data, error, loading, reload } = useRemote<BusinessDetail>('/businesses/' + id);
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState(''),
    [confirmUser, setConfirmUser] = useState<number | null>(null),
    [version, setVersion] = useState(0);
  const toggleUser = async () => {
    if (!data || confirmUser === null) return;
    const user = data.users.find((u) => u.id === confirmUser)!;
    setBusy(true);
    setActionError('');
    try {
      await api('/businesses/' + id + '/users/' + user.id, 'PATCH', { enabled: !user.enabled });
      setConfirmUser(null);
      reload();
      onChanged();
      setVersion((v) => v + 1);
      notify('Acceso del usuario actualizado');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'No se pudo actualizar el usuario');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={data?.business.name || 'Empresa'}
      subtitle={
        data ? `Empresa #${id} · ${data.business.city || 'Lumis independiente'}` : undefined
      }
      onClose={onClose}
      wide
      busy={busy}
    >
      <div className="dialog-body">
        {error ? (
          <ErrorBox error={error} retry={reload} />
        ) : loading || !data ? (
          <Loading />
        ) : (
          <>
            <div className="license-summary">
              <div>
                <div className="inline-badges">
                  <PlanBadge plan={data.license.plan} />
                  <Status state={data.license.state} />
                </div>
                <h3>
                  {data.license.state === 'active'
                    ? 'Una empresa, todo su equipo'
                    : 'Acceso de consulta y exportación'}
                </h3>
                <p>
                  {data.license.expiresOn
                    ? 'Válida hasta el ' + date(data.license.expiresOn)
                    : 'Los cupos de Gratis se usan una sola vez.'}
                </p>
              </div>
              <button
                className="button primary"
                onClick={() => {
                  setEditing(!editing);
                  setActionError('');
                }}
              >
                <Icon name="key" />
                {editing ? 'Cerrar edición' : 'Gestionar licencia'}
              </button>
            </div>
            {editing && (
              <LicenseForm
                key={data.license.plan + data.license.expiresOn + data.license.state}
                detail={data}
                busy={busy}
                setBusy={setBusy}
                onSaved={() => {
                  setEditing(false);
                  reload();
                  onChanged();
                  setVersion((v) => v + 1);
                  notify('Licencia actualizada');
                }}
              />
            )}
            <div className="section-title">
              <h3>Uso del plan</h3>
              <span className="muted">
                {data.license.users.enabled} usuarios habilitados /{' '}
                {data.license.users.limit ?? 'sin límite'}
              </span>
            </div>
            <div className="quota-grid">
              {Object.entries(data.license.quotas).map(([meter, q]) => (
                <div className="quota" key={meter}>
                  <span>
                    {
                      (
                        {
                          quotes: 'Cotizaciones',
                          sales: 'Notas de venta',
                          deliveries: 'Notas de entrega',
                          scans: 'Escaneos mágicos',
                        } as Record<string, string>
                      )[meter]
                    }
                  </span>
                  <strong>
                    {q.used} <small>/ {q.limit ?? '∞'}</small>
                  </strong>
                  <progress
                    max={q.limit ?? Math.max(q.used, 1)}
                    value={q.limit === null ? 0 : Math.min(q.used, q.limit)}
                  />
                  <small>
                    {meter === 'scans'
                      ? 'Función aún no disponible'
                      : q.limit === null
                        ? 'Sin límite'
                        : q.period === 'lifetime'
                          ? 'Cupo total, por única vez'
                          : 'Cupo del mes'}
                  </small>
                </div>
              ))}
            </div>
            <div className="section-title">
              <h3>Usuarios de la empresa</h3>
            </div>
            <p className="footnote">
              El administrador de la empresa crea a sus vendedores desde la app. Los cupos priorizan
              administradores y luego el orden de registro; los usuarios sin cupo conservan
              consulta.
            </p>
            {actionError && <ErrorBox error={actionError} />}
            <div className="user-list">
              {data.users.map((u) => (
                <div className="user-row" key={u.id}>
                  <span className="user-avatar">
                    <Icon name="users" />
                  </span>
                  <div className="user-info">
                    <strong>{u.name}</strong>
                    <small>
                      @{u.username} · {u.role === 'admin' ? 'Administrador' : 'Vendedor'}
                    </small>
                  </div>
                  <span
                    className={
                      'badge ' + (!u.enabled ? 'neutral' : u.hasSeat ? 'active' : 'expired')
                    }
                  >
                    {!u.enabled ? 'Deshabilitado' : u.hasSeat ? 'Con cupo' : 'Solo consulta'}
                  </span>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      setConfirmUser(u.id);
                      setActionError('');
                    }}
                  >
                    {u.enabled ? 'Deshabilitar' : 'Habilitar'}
                  </button>
                </div>
              ))}
            </div>
            {confirmUser !== null && (
              <div className="confirmation" role="alert">
                <strong>
                  {data.users.find((u) => u.id === confirmUser)?.enabled
                    ? '¿Deshabilitar este usuario?'
                    : '¿Habilitar este usuario?'}
                </strong>
                <p>Sus documentos y su historial se conservarán.</p>
                <div className="button-row">
                  <button
                    className="button secondary small"
                    disabled={busy}
                    onClick={() => setConfirmUser(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    className="button primary small"
                    disabled={busy}
                    onClick={() => void toggleUser()}
                  >
                    {busy ? 'Guardando…' : 'Confirmar cambio'}
                  </button>
                </div>
              </div>
            )}
            <div className="section-title">
              <h3>Historial de esta empresa</h3>
            </div>
            <Activity key={version} businessId={id} compact />
          </>
        )}
      </div>
    </Dialog>
  );
}
function LicenseForm({
  detail,
  busy,
  setBusy,
  onSaved,
}: {
  detail: BusinessDetail;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onSaved: () => void;
}) {
  const [plan, setPlan] = useState<PlanId>(detail.license.plan),
    [status, setStatus] = useState(detail.license.state === 'suspended' ? 'suspended' : 'active'),
    [expiresOn, setExpires] = useState(detail.license.expiresOn || ''),
    [note, setNote] = useState(''),
    [error, setError] = useState('');
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/businesses/' + detail.business.id + '/license', 'PUT', {
        plan,
        status,
        expiresOn: plan === 'free' ? null : expiresOn,
        note,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la licencia');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="license-form" onSubmit={(e) => void save(e)}>
      <div className="form-grid">
        <label>
          Plan
          <select value={plan} disabled={busy} onChange={(e) => setPlan(e.target.value as PlanId)}>
            {Object.entries(planNames).map(([id, name]) => (
              <option value={id} key={id}>
                {name}
                {id === 'free' ? ' · Bs. 0' : id === 'pro' ? ' · Bs. 95 / mes' : ' · Bs. 170 / mes'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Estado
          <select disabled={busy} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Habilitada</option>
            <option value="suspended">Suspendida</option>
          </select>
        </label>
        {plan !== 'free' && (
          <label className="span-two">
            Válida hasta (inclusive, hora de Bolivia)
            <input
              type="date"
              value={expiresOn}
              required
              disabled={busy}
              onChange={(e) => setExpires(e.target.value)}
            />
          </label>
        )}
        <label className="span-two">
          Motivo del cambio
          <textarea
            required
            minLength={3}
            maxLength={500}
            value={note}
            disabled={busy}
            placeholder="Ej. Renovación de Pro por un mes, pago verificado."
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>
      <p className="footnote">
        La activación es manual. Al vencer un plan de pago solo se permite consultar y exportar.
        Volver a Gratis conserva el consumo acumulado.
      </p>
      {error && <ErrorBox error={error} />}
      <button className="button primary" disabled={busy}>
        {busy ? 'Guardando…' : 'Guardar licencia'}
      </button>
    </form>
  );
}
