import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { mediaSource } from '../lib/api';
import { useTheme } from '../theme/ThemeContext';
import { formatDate } from '../lib/format';
import { useMoney } from '../context/BusinessContext';
import type { SaleEstadoPago, SaleMetodoPago, SalePayment } from '../lib/api';

interface SalePaymentSectionProps {
  metodo: SaleMetodoPago;
  isDetail: boolean;
  isVoided: boolean;
  total: number;
  estadoPago: SaleEstadoPago;
  notaPago: string;
  onChangeNota: (value: string) => void;
  onBlurNota: () => void;
  transferenciaNumero: string;
  onChangeTransferencia: (value: string) => void;
  onBlurTransferencia: () => void;
  receiptUri: string | null;
  onPickReceipt: (source: 'library' | 'camera') => void;
  payments: SalePayment[];
  totalPagado: number;
  payInicial: string;
  onChangePayInicial: (value: string) => void;
  payAmount: string;
  onChangePayAmount: (value: string) => void;
  onAddPayment: () => void;
  onDeletePayment: (paymentId: number) => void;
  busyPayment: boolean;
}

function RequiredPill() {
  return (
    <View style={[styles.pill, { backgroundColor: '#ef44441A' }]}>
      <Text style={[styles.pillText, { color: '#ef4444' }]}>Obligatorio</Text>
    </View>
  );
}

function ReadyPill() {
  return (
    <View style={[styles.pill, { backgroundColor: '#22c55e1A' }]}>
      <Ionicons name="checkmark-circle" size={12} color="#22c55e" />
      <Text style={[styles.pillText, { color: '#22c55e' }]}>Adjunta</Text>
    </View>
  );
}

export function SalePaymentSection({
  metodo,
  isDetail,
  isVoided,
  total,
  estadoPago,
  notaPago,
  onChangeNota,
  onBlurNota,
  transferenciaNumero,
  onChangeTransferencia,
  onBlurTransferencia,
  receiptUri,
  onPickReceipt,
  payments,
  totalPagado,
  payInicial,
  onChangePayInicial,
  payAmount,
  onChangePayAmount,
  onAddPayment,
  onDeletePayment,
  busyPayment,
}: SalePaymentSectionProps) {
  const { colors } = useTheme();
  const formatMoney = useMoney();
  const { token } = useAuth();
  const saldo = Math.max(total - totalPagado, 0);
  const progress = total > 0 ? Math.min((totalPagado / total) * 100, 100) : 0;

  const receiptButtons = (labels: { library: string; camera: string }) => (
    <View style={styles.receiptRow}>
      <Pressable
        style={[styles.receiptButton, { borderColor: colors.border }]}
        onPress={() => onPickReceipt('library')}
        disabled={isVoided}
      >
        <Ionicons name="images-outline" size={26} color={colors.muted} />
        <Text style={[styles.receiptText, { color: colors.muted }]}>{labels.library}</Text>
      </Pressable>
      <Pressable
        style={[styles.receiptButton, { borderColor: colors.border }]}
        onPress={() => onPickReceipt('camera')}
        disabled={isVoided}
      >
        <Ionicons name="camera-outline" size={26} color={colors.muted} />
        <Text style={[styles.receiptText, { color: colors.muted }]}>{labels.camera}</Text>
      </Pressable>
    </View>
  );

  if (metodo === 'efectivo') {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.label, { color: colors.muted }]}>Nota de pago (opcional)</Text>
        <TextInput
          style={[
            styles.noteInput,
            { color: colors.text, borderColor: colors.border },
          ]}
          value={notaPago}
          onChangeText={onChangeNota}
          onBlur={onBlurNota}
          placeholder="Ej. El cliente pagó a las 3 pm"
          placeholderTextColor={colors.muted}
          multiline
          maxLength={500}
          editable={!isVoided}
        />
      </View>
    );
  }

  if (metodo === 'qr') {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.headRow}>
          <Text style={[styles.label, { color: colors.muted }]}>Boleta de pago</Text>
          {receiptUri ? <ReadyPill /> : <RequiredPill />}
        </View>
        {receiptUri ? (
          <Image source={mediaSource(receiptUri, token)} style={styles.thumb} resizeMode="cover" />
        ) : null}
        {receiptButtons(
          receiptUri ? { library: 'Cambiar', camera: 'Otra foto' } : { library: 'Galería', camera: 'Cámara' },
        )}
        {!receiptUri && (
          <Text style={[styles.hint, { color: colors.muted }]}>
            Adjunta la boleta para poder registrar la venta.
          </Text>
        )}
      </View>
    );
  }

  if (metodo === 'transferencia') {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.headRow}>
          <Text style={[styles.label, { color: colors.muted }]}>N° de transferencia</Text>
          {transferenciaNumero.trim().length > 0 ? <ReadyPill /> : <RequiredPill />}
        </View>
        <TextInput
          style={[
            styles.input,
            { color: colors.text, borderColor: colors.border },
          ]}
          value={transferenciaNumero}
          onChangeText={onChangeTransferencia}
          onBlur={onBlurTransferencia}
          placeholder="Ej. 0012345678"
          placeholderTextColor={colors.muted}
          maxLength={50}
          editable={!isVoided}
        />
        <Text style={[styles.label, styles.sectionGap, { color: colors.muted }]}>
          Foto del comprobante (opcional)
        </Text>
        {receiptUri ? (
          <Image source={mediaSource(receiptUri, token)} style={styles.thumb} resizeMode="cover" />
        ) : null}
        <View style={styles.receiptRow}>
          <Pressable
            style={[styles.receiptButton, styles.receiptFull, { borderColor: colors.border }]}
            onPress={() => onPickReceipt('camera')}
            disabled={isVoided}
          >
            <Ionicons name="camera-outline" size={26} color={colors.muted} />
            <Text style={[styles.receiptText, { color: colors.muted }]}>
              {receiptUri ? 'Tomar otra foto' : 'Cámara'}
            </Text>
          </Pressable>
        </View>
        {transferenciaNumero.trim().length === 0 && (
          <Text style={[styles.hint, { color: colors.muted }]}>
            Escribe el número de transferencia para poder registrar la venta.
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.headRow}>
        <Text style={[styles.label, { color: colors.muted }]}>Pagos</Text>
        {estadoPago === 'pagado' && <ReadyPill />}
      </View>

      {isDetail ? (
        <>
          <View style={[styles.barTrack, { backgroundColor: colors.background }]}>
            <View
              style={[styles.barFill, { width: `${progress}%`, backgroundColor: colors.primary }]}
            />
          </View>
          <Text style={[styles.balance, { color: colors.text }]}>
            Pagado {formatMoney(totalPagado)} de {formatMoney(total)}
            {saldo > 0 ? `  ·  Saldo ${formatMoney(saldo)}` : ''}
          </Text>

          {payments.map((payment) => (
            <View
              key={payment.id}
              style={[styles.paymentRow, { borderBottomColor: colors.border }]}
            >
              <Ionicons name="cash-outline" size={16} color={colors.muted} />
              <Text style={[styles.paymentDate, { color: colors.muted }]}>
                {formatDate(payment.createdAt)}
              </Text>
              <Text style={[styles.paymentAmount, { color: colors.text }]}>
                {formatMoney(payment.monto)}
              </Text>
              {!isVoided && (
                <Pressable onPress={() => onDeletePayment(payment.id)} hitSlop={10}>
                  <Ionicons name="trash-outline" size={17} color={colors.error} />
                </Pressable>
              )}
            </View>
          ))}
          {payments.length === 0 && (
            <Text style={[styles.hint, { color: colors.muted }]}>
              Aún no hay abonos registrados.
            </Text>
          )}

          {!isVoided && saldo > 0 && (
            <View style={styles.addRow}>
              <TextInput
                style={[
                  styles.input,
                  styles.addInput,
                  { color: colors.text, borderColor: colors.border },
                ]}
                value={payAmount}
                onChangeText={onChangePayAmount}
                placeholder="Monto del abono"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
              />
              <Pressable
                style={[styles.addButton, { backgroundColor: colors.primary }]}
                onPress={onAddPayment}
                disabled={busyPayment}
              >
                <Ionicons name="add" size={18} color={colors.onPrimary} />
                <Text style={[styles.addButtonText, { color: colors.onPrimary }]}>Registrar</Text>
              </Pressable>
            </View>
          )}
        </>
      ) : (
        <>
          <Text style={[styles.label, { color: colors.muted }]}>Pago inicial (opcional)</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            value={payInicial}
            onChangeText={onChangePayInicial}
            placeholder="0"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
            editable={!isVoided}
          />
          <Text style={[styles.hint, { color: colors.muted }]}>
            Se guarda como primer abono; el saldo queda «Por cobrar» y podrás registrar más
            pagos después.
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 14,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  label: {
    fontSize: 12,
    fontFamily: 'Poppins',
  },
  sectionGap: {
    marginTop: 14,
    marginBottom: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
  },
  pillText: {
    fontSize: 10,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  receiptRow: {
    flexDirection: 'row',
    gap: 10,
  },
  receiptButton: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
  },
  receiptFull: {
    flex: 1,
  },
  receiptText: {
    fontSize: 12,
    fontFamily: 'Poppins',
  },
  thumb: {
    width: '100%',
    height: 150,
    borderRadius: 14,
    marginBottom: 10,
  },
  hint: {
    fontSize: 11,
    fontFamily: 'Poppins',
    marginTop: 8,
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Poppins',
    minHeight: 74,
    textAlignVertical: 'top',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Poppins',
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  balance: {
    fontSize: 13,
    fontFamily: 'Poppins',
    fontWeight: '600',
    marginBottom: 6,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  paymentDate: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Poppins',
  },
  paymentAmount: {
    fontSize: 13,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  addRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  addInput: {
    flex: 1,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  addButtonText: {
    fontSize: 13,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
});
