import { useEffect, useState, type FormEvent } from 'react';
import { api, RequestError, type Admin, type Business, type Overview as OverviewData } from './api';
import { BusinessTable, Companies, CompanyDialog } from './Companies';
import { Activity, LicenseValue, Plans } from './Plans';
import { useRemote } from './hooks';
import { Dialog, Empty, ErrorBox, Icon, Loading, money } from './ui';

type Page = 'overview' | 'companies' | 'licenses' | 'plans' | 'activity';
const pages: { id: Page; label: string; icon: string }[] = [
  { id: 'overview', label: 'Resumen', icon: 'grid' },
  { id: 'companies', label: 'Empresas', icon: 'business' },
  { id: 'licenses', label: 'Licencias', icon: 'key' },
  { id: 'plans', label: 'Planes', icon: 'layers' },
  { id: 'activity', label: 'Actividad', icon: 'activity' },
];
function currentPage(): Page {
  const hash = window.location.hash.replace('#/', '');
  return pages.some((p) => p.id === hash) ? (hash as Page) : 'overview';
}
export function App() {
  const [admin, setAdmin] = useState<Admin | null>(null),
    [checking, setChecking] = useState(true),
    [startupError, setStartupError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [toast, setToast] = useState('');
  const [page, setPage] = useState<Page>(currentPage),
    [menu, setMenu] = useState(false),
    [selected, setSelected] = useState<number | null>(null),
    [version, setVersion] = useState(0),
    [passwordDialog, setPasswordDialog] = useState(false);
  useEffect(() => {
    const listener = () => setPage(currentPage());
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, []);
  useEffect(() => {
    let active = true;
    void api<{ admin: Admin }>('/me')
      .then((v) => {
        if (active) {
          setAdmin(v.admin);
          setStartupError('');
        }
      })
      .catch((e) => {
        if (active && !(e instanceof RequestError && e.status === 401)) setStartupError(e.message);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  useEffect(() => {
    const listener = () => {
      setAdmin(null);
      setSelected(null);
      setToast('La sesión venció. Inicia sesión para continuar.');
    };
    window.addEventListener('lumis-admin-expired', listener);
    return () => window.removeEventListener('lumis-admin-expired', listener);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  const navigate = (id: Page) => {
    window.location.hash = '/' + id;
    setPage(id);
    setMenu(false);
  };
  const logout = async () => {
    try {
      await api('/logout', 'POST', {});
      setAdmin(null);
      setSelected(null);
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'No se pudo cerrar la sesión');
    }
  };
  if (checking)
    return (
      <div className="initial-loading">
        <img src="/brand/lumis-logo.png" alt="Lumis" />
        <Loading />
      </div>
    );
  if (!admin)
    return (
      <Login
        error={startupError}
        retry={() => {
          setChecking(true);
          setAttempt((a) => a + 1);
        }}
        onLogin={(a) => {
          setAdmin(a);
          setVersion((v) => v + 1);
          setStartupError('');
        }}
      />
    );
  return (
    <div className="app-shell">
      {menu && (
        <button className="nav-scrim" aria-label="Cerrar menú" onClick={() => setMenu(false)} />
      )}
      <aside className={'sidebar ' + (menu ? 'open' : '')}>
        <a className="brand" href="#/overview" onClick={() => navigate('overview')}>
          <img src="/brand/lumis-logo.png" alt="Lumis" />
          <span>ADMINISTRACIÓN</span>
        </a>
        <p className="nav-caption">ESPACIO DE GESTIÓN</p>
        <nav aria-label="Navegación principal">
          {pages.map((p) => (
            <a
              href={'#/' + p.id}
              aria-current={page === p.id ? 'page' : undefined}
              className={page === p.id ? 'selected' : ''}
              onClick={() => navigate(p.id)}
              key={p.id}
            >
              <Icon name={p.icon} />
              {p.label}
              {page === p.id && <span className="nav-dot" />}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="environment">
            <Icon name="shield" />
            <div>
              <strong>Lumis independiente</strong>
              <small>Licencias por empresa</small>
            </div>
          </div>
          <button className="profile" onClick={() => setPasswordDialog(true)}>
            <span className="profile-avatar">{admin.name.slice(0, 1).toUpperCase()}</span>
            <span>
              <strong>{admin.name}</strong>
              <small>Administrador de plataforma</small>
            </span>
          </button>
          <button className="logout" onClick={() => void logout()}>
            <Icon name="logout" /> Cerrar sesión
          </button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Abrir menú"
            onClick={() => setMenu(true)}
          >
            <Icon name="menu" />
          </button>
          <div>
            <span className="topbar-name">Panel de control</span>
            <span className="topbar-separator">/</span>
            <span>{pages.find((p) => p.id === page)?.label}</span>
          </div>
          <span className="workspace-badge">
            <span /> Lumis
          </span>
        </header>
        <main id="main-content" key={page + version}>
          {page === 'overview' ? (
            <Overview onOpen={setSelected} onNavigate={navigate} name={admin.name} />
          ) : page === 'companies' ? (
            <Companies onOpen={setSelected} />
          ) : page === 'licenses' ? (
            <Companies onOpen={setSelected} licenses />
          ) : page === 'plans' ? (
            <Plans />
          ) : (
            <Activity />
          )}
        </main>
        <footer className="main-footer">
          <span>Lumis · Cotiza y vende</span>
          <span>Administración de empresas y licencias</span>
        </footer>
      </div>
      {selected !== null && (
        <CompanyDialog
          key={selected}
          id={selected}
          onClose={() => setSelected(null)}
          onChanged={() => setVersion((v) => v + 1)}
          notify={setToast}
        />
      )}
      {passwordDialog && (
        <PasswordDialog
          onClose={() => setPasswordDialog(false)}
          onChanged={() => {
            setPasswordDialog(false);
            setAdmin(null);
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" />
          <span>{toast}</span>
          <button className="icon-button" onClick={() => setToast('')} aria-label="Cerrar aviso">
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function Login({
  onLogin,
  error,
  retry,
}: {
  onLogin: (a: Admin) => void;
  error: string;
  retry: () => void;
}) {
  const [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const value = await api<{ admin: Admin }>('/login', 'POST', { username, password });
      setPassword('');
      onLogin(value.admin);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudo iniciar sesión');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login-page">
      <section className="login-story">
        <img src="/brand/lumis-logo.png" alt="Lumis · Cotiza y vende" />
        <div>
          <span className="login-tag">
            <Icon name="shield" size={16} /> ADMINISTRACIÓN LUMIS
          </span>
          <h1>
            Todo tu negocio.
            <br />
            <span>En un solo lugar.</span>
          </h1>
          <p>Conecta empresas con las herramientas que necesitan para crecer.</p>
          <div className="story-tiles">
            <div>
              <Icon name="business" />
              <strong>Empresas</strong>
              <span>Una vista de cada cliente</span>
            </div>
            <div>
              <Icon name="key" />
              <strong>Licencias</strong>
              <span>Accesos bajo tu control</span>
            </div>
            <div>
              <Icon name="activity" />
              <strong>Historial</strong>
              <span>Cada cambio registrado</span>
            </div>
          </div>
        </div>
        <small>Un espacio exclusivo para administrar la plataforma.</small>
      </section>
      <section className="login-form-wrap">
        <form className="login-form" onSubmit={(e) => void submit(e)}>
          <span className="login-lock">
            <Icon name="key" size={27} />
          </span>
          <p className="eyebrow">BIENVENIDO DE NUEVO</p>
          <h2>Entra a tu panel</h2>
          <p>Gestiona las empresas y licencias de Lumis.</p>
          {error && <ErrorBox error={error} retry={retry} />}
          <label>
            Usuario de administración
            <input
              autoComplete="username"
              autoCapitalize="none"
              required
              maxLength={60}
              value={username}
              disabled={busy}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Tu usuario"
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              required
              maxLength={72}
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tu contraseña"
            />
          </label>
          {message && <ErrorBox error={message} />}
          <button className="button primary login-submit" disabled={busy}>
            {busy ? (
              <>
                <span className="spinner" /> Entrando…
              </>
            ) : (
              <>
                Entrar al panel <Icon name="arrow" />
              </>
            )}
          </button>
          <p className="login-security">
            <Icon name="shield" size={16} /> Utiliza tu cuenta de administrador de plataforma.
          </p>
        </form>
        <small className="login-footer">Lumis · Administración</small>
      </section>
    </div>
  );
}
function Overview({
  onOpen,
  onNavigate,
  name,
}: {
  onOpen: (id: number) => void;
  onNavigate: (id: Page) => void;
  name: string;
}) {
  const remote = useRemote<{ overview: OverviewData }>('/overview');
  const companies = useRemote<{ businesses: Business[] }>('/businesses?page=1');
  const stats = remote.data?.overview;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">VISTA GENERAL</p>
          <h1>Tu plataforma, de un vistazo.</h1>
          <p>Hola, {name.split(' ')[0]}. Así están las empresas de Lumis.</p>
        </div>
        <button
          className="button secondary"
          onClick={() => {
            remote.reload();
            companies.reload();
          }}
        >
          <Icon name="refresh" /> Actualizar
        </button>
      </div>
      {remote.error ? (
        <ErrorBox error={remote.error} retry={remote.reload} />
      ) : !stats ? (
        <Loading />
      ) : (
        <>
          <section className="overview-hero">
            <div>
              <span className="hero-label">
                <Icon name="shield" size={16} /> CONTROL DE ACCESO POR EMPRESA
              </span>
              <h2>
                Más claridad.
                <br />
                Más control.
              </h2>
              <p>
                Administra cada licencia y acompaña a tus clientes en la siguiente etapa de su
                negocio.
              </p>
              <button className="button hero-button" onClick={() => onNavigate('licenses')}>
                Gestionar licencias <Icon name="arrow" size={18} />
              </button>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="orbit one" />
              <div className="orbit two" />
              <div className="hero-orb">
                <Icon name="layers" size={58} />
              </div>
              <span className="floating-label first">
                <span className="green-dot" /> {stats.companies} empresas
              </span>
              <span className="floating-label second">
                <Icon name="shield" size={16} /> Accesos protegidos
              </span>
            </div>
          </section>
          <section className="stats-grid">
            {[
              {
                label: 'Empresas registradas',
                value: stats.companies,
                icon: 'business',
                hint: 'Una licencia para cada equipo',
              },
              {
                label: 'Licencias de pago activas',
                value: stats.paidCompanies,
                icon: 'key',
                hint: 'Empresas en Pro y Plus',
              },
              {
                label: 'Por vencer en 7 días',
                value: stats.expiring,
                icon: 'clock',
                hint: 'Para acompañar su renovación',
              },
              {
                label: 'En modo consulta',
                value: stats.readOnlyCompanies,
                icon: 'shield',
                hint: 'Licencias vencidas o suspendidas',
              },
            ].map((s) => (
              <article className="stat-card" key={s.label}>
                <div>
                  <span>{s.label}</span>
                  <span className="stat-icon">
                    <Icon name={s.icon} />
                  </span>
                </div>
                <strong>{money(s.value)}</strong>
                <small>{s.hint}</small>
              </article>
            ))}
          </section>
          <section className="overview-split">
            <div className="panel distribution">
              <div className="section-title">
                <h3>Distribución de empresas</h3>
                <Icon name="layers" />
              </div>
              {[
                { name: 'Plan Gratis', value: stats.freeCompanies, color: 'free' },
                { name: 'Pro y Plus activos', value: stats.paidCompanies, color: 'paid' },
                { name: 'Vencidas o suspendidas', value: stats.readOnlyCompanies, color: 'other' },
              ].map((s) => (
                <div className={'distribution-row ' + s.color} key={s.name}>
                  <div>
                    <span>{s.name}</span>
                    <strong>{s.value}</strong>
                  </div>
                  <progress max={Math.max(stats.companies, 1)} value={s.value} />
                </div>
              ))}
            </div>
            <div className="panel monthly-value">
              <div className="section-title">
                <h3>Valor de las licencias</h3>
                <span className="badge neutral">Mensual</span>
              </div>
              <LicenseValue value={stats.monthlyLicenseValue} />
              <button className="text-button" onClick={() => onNavigate('plans')}>
                Ver condiciones de los planes <Icon name="arrow" size={16} />
              </button>
            </div>
          </section>
        </>
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>Empresas recientes</h3>
            <p>Los últimos registros en Lumis.</p>
          </div>
          <button className="text-button" onClick={() => onNavigate('companies')}>
            Ver todas <Icon name="arrow" size={16} />
          </button>
        </div>
        {companies.error ? (
          <ErrorBox error={companies.error} retry={companies.reload} />
        ) : !companies.data ? (
          <Loading />
        ) : companies.data.businesses.length ? (
          <BusinessTable businesses={companies.data.businesses.slice(0, 5)} onOpen={onOpen} />
        ) : (
          <Empty title="Tu primera empresa te espera">
            Los registros de la app aparecerán aquí automáticamente.
          </Empty>
        )}
      </section>
    </>
  );
}
function PasswordDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [currentPassword, setCurrent] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/password', 'POST', { currentPassword, password });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="Cambiar contraseña"
      subtitle="Se cerrarán todas tus sesiones del panel al guardar."
      onClose={onClose}
      busy={busy}
    >
      <form className="dialog-body password-form" onSubmit={(e) => void submit(e)}>
        <label>
          Contraseña actual
          <input
            required
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          Nueva contraseña
          <input
            required
            type="password"
            minLength={12}
            maxLength={72}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
          <small>Usa al menos 12 caracteres.</small>
        </label>
        {error && <ErrorBox error={error} />}
        <button className="button primary" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar y volver a iniciar sesión'}
        </button>
      </form>
    </Dialog>
  );
}
