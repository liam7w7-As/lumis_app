export const GUIDE_VERSION = 1;
export const GUIDE_KEYS = ['dashboard', 'quotes', 'quote-create', 'quote-detail', 'sales', 'sale-editor',
  'sale-detail', 'settings', 'clients', 'products', 'pdf'] as const;
export type GuideKey = typeof GUIDE_KEYS[number];
export interface GuideContext { admin: boolean; hasItems: boolean }
export interface GuideStep {
  id: string;
  target: string;
  title: string;
  body: string;
  event?: string;
  when?: 'items' | 'admin';
}
export interface GuideDefinition {
  title: string;
  description: string;
  route: string;
  icon: 'grid-outline' | 'document-text-outline' | 'cart-outline' | 'settings-outline' | 'people-outline' | 'cube-outline';
  steps: GuideStep[];
}
export const GUIDES: Record<GuideKey, GuideDefinition> = {
  dashboard: {
    title: 'Tu inicio', description: 'Encuentra tus módulos, estadísticas y ajustes.', route: '/dashboard', icon: 'grid-outline',
    steps: [
      { id: 'modules', target: 'modules', title: 'Todo empieza aquí', body: 'Desde estas tarjetas puedes preparar cotizaciones o registrar tus ventas. Cada módulo tiene su propia guía.' },
      { id: 'statistics', target: 'statistics', title: 'Revisa cómo va tu negocio', body: 'Consulta cotizaciones, ventas y montos por cobrar. Cambia entre hoy, semana y mes para comparar períodos.' },
      { id: 'settings', target: 'settings', title: 'Tu empresa, a tu manera', body: 'Aquí están la información de empresa, la apariencia y la ayuda. Las opciones disponibles dependen de tu cuenta.' },
      { id: 'quotes', target: 'quotes', title: 'Vamos a Cotizaciones', body: 'Toca esta tarjeta para conocer cómo preparar un documento para tu cliente. También puedes terminar la guía con el botón de abajo.', event: 'open-quotes' },
    ],
  },
  quotes: {
    title: 'Cotizaciones', description: 'Busca documentos, descubre los gestos y crea una cotización.', route: '/quotes', icon: 'document-text-outline',
    steps: [
      { id: 'search', target: 'search', title: 'Encuentra una cotización', body: 'Toca la lupa para buscar por cliente o por número de cotización.', event: 'search' },
      { id: 'row', target: 'row', title: 'Desliza para ver las acciones', body: 'Desliza una tarjeta hacia la izquierda para ver Vista previa, Generar venta, Borrar y Copiar. Esta demostración solo abre los botones.', when: 'items' },
      { id: 'create', target: 'create', title: 'Prepara tu primera cotización', body: 'El botón + abre una nueva cotización. Allí podrás añadir cliente, productos y precios antes de guardarla.', event: 'create' },
    ],
  },
  'quote-create': {
    title: 'Crear una cotización', description: 'Cliente, sucursal, productos y guardado.', route: '/quotes/new', icon: 'document-text-outline',
    steps: [
      { id: 'seller', target: 'seller', title: 'Vendedor y sucursal', body: 'Tu cuenta aparece como vendedor. Elige la sucursal que corresponda al documento.' },
      { id: 'client', target: 'client', title: 'Añade tu cliente', body: 'Toca Añadir cliente para ingresar sus datos. Puedes volver aquí sin perder lo que ya preparaste.', event: 'client' },
      { id: 'products', target: 'products', title: 'Añade los productos', body: 'Selecciona un artículo o escribe su descripción, cantidad, unidad y precio. El total se calcula con tus productos.', event: 'product' },
      { id: 'save', target: 'save', title: 'Guarda cuando esté lista', body: 'Revisa el contenido y pulsa Guardar cuando quieras crear la cotización. La guía no guarda documentos automáticamente.' },
    ],
  },
  'quote-detail': {
    title: 'Detalle de cotización', description: 'Fechas, artículos, opciones y PDF.', route: '/quotes', icon: 'document-text-outline',
    steps: [
      { id: 'date', target: 'date', title: 'La fecha del documento', body: 'En cotizaciones editables puedes tocar la fecha para cambiarla. El cambio se refleja también en el PDF.' },
      { id: 'client', target: 'client', title: 'Datos del cliente', body: 'Revisa para quién preparaste la cotización antes de enviarla.' },
      { id: 'row', target: 'row', title: 'Organiza tus productos', body: 'Desliza un producto para editarlo, eliminarlo, duplicarlo o moverlo de orden. Mover cambia su posición en el documento.', when: 'items' },
      { id: 'options', target: 'options', title: 'Personaliza el documento', body: 'Decide qué información adicional y qué sello debe incluir la cotización.' },
      { id: 'preview', target: 'preview', title: 'Revisa el PDF', body: 'Toca Vista previa para ver el mismo PDF que podrás compartir o imprimir.', event: 'preview' },
    ],
  },
  sales: {
    title: 'Punto de venta', description: 'Filtra, revisa y registra ventas.', route: '/pos', icon: 'cart-outline',
    steps: [
      { id: 'filters', target: 'filters', title: 'Ve lo que necesitas', body: 'Filtra las ventas pagadas, por cobrar o por sucursal. Puedes combinarlo con la búsqueda.' },
      { id: 'search', target: 'search', title: 'Busca por cliente o número', body: 'Toca la lupa para encontrar una venta del historial.', event: 'search' },
      { id: 'row', target: 'row', title: 'Las acciones están al deslizar', body: 'Desliza hacia la izquierda para ver el PDF, anular, borrar o copiar. Anular y borrar mantienen sus confirmaciones; la guía solo muestra los botones.', when: 'items' },
      { id: 'create', target: 'create', title: 'Registra una venta', body: 'Toca + para preparar una nota de venta con sus productos y la forma de pago.', event: 'create' },
    ],
  },
  'sale-editor': {
    title: 'Crear una venta', description: 'Documento, cliente, productos y forma de pago.', route: '/pos/new', icon: 'cart-outline',
    steps: [
      { id: 'date', target: 'date', title: 'Elige la fecha', body: 'Toca la fecha para ajustarla antes de registrar la venta.' },
      { id: 'document', target: 'document', title: 'Venta y entrega', body: 'Estas pestañas cambian entre la nota de venta y la información de entrega.' },
      { id: 'seller', target: 'seller', title: 'Vendedor y sucursal', body: 'Selecciona quién realiza la venta y desde qué sucursal se registra.' },
      { id: 'client', target: 'client', title: 'Datos del cliente', body: 'Añade el cliente para que su información aparezca en el documento.', event: 'client' },
      { id: 'products', target: 'products', title: 'Los productos de la venta', body: 'Añade tus artículos, cantidades y precios para calcular el importe.', event: 'product' },
      { id: 'payment', target: 'payment', title: 'Indica cómo se pagará', body: 'Elige efectivo, QR, transferencia o por pagar. Cada opción muestra los datos que necesita.', when: 'items' },
      { id: 'save', target: 'save', title: 'Revisa y registra', body: 'El botón Guardar registra la venta cuando estés listo. Esta guía no realiza cobros ni guarda ventas por ti.' },
    ],
  },
  'sale-detail': {
    title: 'Detalle de venta', description: 'Edita fechas, organiza artículos y revisa pagos.', route: '/pos', icon: 'cart-outline',
    steps: [
      { id: 'date', target: 'date', title: 'La fecha de tu venta', body: 'Puedes ajustar la fecha en ventas activas. Los pagos y la entrega conservan sus propias fechas.' },
      { id: 'document', target: 'document', title: 'Nota de venta o entrega', body: 'Cambia entre ambos documentos desde estas pestañas.' },
      { id: 'seller', target: 'seller', title: 'Quién vende y dónde', body: 'Revisa el vendedor y la sucursal asociados a la venta.' },
      { id: 'row', target: 'row', title: 'Mueve tus productos', body: 'Desliza un artículo para editar, eliminar, duplicar o mover de orden. Las ventas anuladas permanecen en modo de consulta.', when: 'items' },
      { id: 'payment', target: 'payment', title: 'Controla los pagos', body: 'Revisa el método de pago, los comprobantes y los abonos de las ventas por cobrar.' },
      { id: 'preview', target: 'document', title: 'Revisa tu documento', body: 'Puedes consultar la nota de venta o de entrega. Para abrir el PDF, vuelve a la lista de ventas y desliza la tarjeta hasta Vista previa.' },
    ],
  },
  settings: {
    title: 'Configuración', description: 'Tu empresa, identidad visual, equipo y ayuda.', route: '/settings', icon: 'settings-outline',
    steps: [
      { id: 'logo', target: 'logo', title: 'El logo de tu empresa', body: 'El logo que suba la administración se comparte con el equipo y aparece en la app y los documentos. Un PNG transparente conserva su fondo transparente.' },
      { id: 'info', target: 'info', title: 'Datos de la empresa', body: 'La administración puede tocar directamente cada campo. Los cambios se guardan al salir del campo.' },
      { id: 'brand', target: 'tabs', title: 'El color de tu marca', body: 'En Color de marca puedes elegir la apariencia de tu empresa. Los botones ajustan su contraste para mantenerse legibles.', when: 'admin' },
      { id: 'users', target: 'users', title: 'Tu equipo de ventas', body: 'Crea usuarios vendedores para esta empresa. Cada persona tendrá su cuenta y su propio avance de los tutoriales.', when: 'admin' },
      { id: 'appearance', target: 'appearance', title: 'Tu tema personal', body: 'Elige modo claro, oscuro o el del sistema. Esta preferencia es de tu cuenta.' },
      { id: 'help', target: 'help', title: 'La ayuda siempre está aquí', body: 'Abre el centro de ayuda para retomar o repetir las guías cuando lo necesites.' },
    ],
  },
  clients: {
    title: 'Añadir un cliente', description: 'Ingresa los datos que llevará tu documento.', route: '/quotes/new/client', icon: 'people-outline',
    steps: [
      { id: 'fields', target: 'fields', title: 'Completa los datos', body: 'Escribe el nombre del cliente y, si los tienes, su teléfono y correo. Comprueba los datos antes de continuar.' },
      { id: 'save', target: 'save', title: 'Vuelve a tu documento', body: 'Guardar añade el cliente y te devuelve a la cotización o venta que estabas preparando.' },
    ],
  },
  products: {
    title: 'Añadir un producto', description: 'Descripción, cantidad, unidad y precio.', route: '/quotes/new/item', icon: 'cube-outline',
    steps: [
      { id: 'fields', target: 'fields', title: 'Describe tu artículo', body: 'Revisa el nombre, cantidad, unidad y precio. Puedes completar los datos del producto que aparecerán en el documento.' },
      { id: 'save', target: 'save', title: 'Añade el producto', body: 'Guardar incorpora el artículo y te devuelve al documento. Allí verás el total actualizado.' },
    ],
  },
  pdf: {
    title: 'Vista previa y PDF', description: 'Revisa, comparte e imprime el mismo documento.', route: '/quotes', icon: 'document-text-outline',
    steps: [
      { id: 'paper', target: 'paper', title: 'Este es tu PDF real', body: 'Puedes desplazarte por las páginas y ampliar el documento. El contenido es el mismo archivo que vas a compartir.' },
      { id: 'print', target: 'print', title: 'Imprime cuando lo necesites', body: 'Este botón abre las opciones de impresión del teléfono.' },
      { id: 'share', target: 'share', title: 'Envía el documento', body: 'Comparte el PDF con la aplicación que prefieras. La guía no abre aplicaciones ni envía documentos automáticamente.' },
    ],
  },
};

export function isGuideKey(value: string): value is GuideKey {
  return (GUIDE_KEYS as readonly string[]).includes(value);
}
export function stepsFor(guide: GuideKey, context: GuideContext): GuideStep[] {
  return GUIDES[guide].steps.filter((step) =>
    (!step.when || step.when !== 'admin' || context.admin) && (!step.when || step.when !== 'items' || context.hasItems));
}
export function stepPosition(steps: GuideStep[], stepId: string | null | undefined): number {
  const position = steps.findIndex((step) => step.id === stepId);
  return Math.max(0, position);
}
