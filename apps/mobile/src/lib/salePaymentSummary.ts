import type { SaleDetail } from './api';

/** A full first payment is not an installment, even when it has a payment record. */
export function canShowSalePaymentSummary(sale: SaleDetail): boolean {
  const paid = sale.estadoPago === 'pagado' && sale.metodoPago !== 'por_pagar'
    ? sale.total : sale.totalPagado ?? 0;
  return sale.metodoPago === 'por_pagar'
    || (sale.payments?.length ?? 0) > 1
    // Explicit zero records an original credit sale paid later; missing data does not.
    || (sale.initialPayment != null && sale.initialPayment < sale.total - .009)
    || paid < sale.total - .009;
}
