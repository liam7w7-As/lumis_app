// Port de App\Support\NumeroALetras (Laravel) a TypeScript.
// Misma salida: "Doce mil quinientos treinta y seis", "Treinta y dos 50/100".

const UNIDADES: Record<number, string> = {
  0: 'cero',
  1: 'uno',
  2: 'dos',
  3: 'tres',
  4: 'cuatro',
  5: 'cinco',
  6: 'seis',
  7: 'siete',
  8: 'ocho',
  9: 'nueve',
  10: 'diez',
  11: 'once',
  12: 'doce',
  13: 'trece',
  14: 'catorce',
  15: 'quince',
  16: 'dieciséis',
  17: 'diecisiete',
  18: 'dieciocho',
  19: 'diecinueve',
  20: 'veinte',
  21: 'veintiuno',
  22: 'veintidós',
  23: 'veintitrés',
  24: 'veinticuatro',
  25: 'veinticinco',
  26: 'veintiséis',
  27: 'veintisiete',
  28: 'veintiocho',
  29: 'veintinueve',
};

const DECENAS: Record<number, string> = {
  3: 'treinta',
  4: 'cuarenta',
  5: 'cincuenta',
  6: 'sesenta',
  7: 'setenta',
  8: 'ochenta',
  9: 'noventa',
};

const CENTENAS: Record<number, string> = {
  1: 'ciento',
  2: 'doscientos',
  3: 'trescientos',
  4: 'cuatrocientos',
  5: 'quinientos',
  6: 'seiscientos',
  7: 'setecientos',
  8: 'ochocientos',
  9: 'novecientos',
};

function hastaCientos(numero: number): string {
  if (numero > 100) {
    const centena = Math.floor(numero / 100);
    const resto = numero % 100;
    const texto = CENTENAS[centena];
    return resto > 0 ? `${texto} ${hastaCientos(resto)}` : texto;
  }
  if (numero === 100) {
    return 'cien';
  }
  if (numero >= 30) {
    const decena = Math.floor(numero / 10);
    const resto = numero % 10;
    const texto = DECENAS[decena];
    return resto > 0 ? `${texto} y ${UNIDADES[resto]}` : texto;
  }
  return UNIDADES[numero];
}

function hastaMiles(numero: number): string {
  if (numero >= 1000) {
    const miles = Math.floor(numero / 1000);
    const resto = numero % 1000;
    const texto = miles === 1 ? 'mil' : `${hastaCientos(miles)} mil`;
    return resto > 0 ? `${texto} ${hastaCientos(resto)}` : texto;
  }
  return hastaCientos(numero);
}

function hastaMillones(numero: number): string {
  if (numero >= 1000000) {
    const millones = Math.floor(numero / 1000000);
    const resto = numero % 1000000;
    const texto = millones === 1 ? 'un millón' : `${hastaMiles(millones)} millones`;
    return resto > 0 ? `${texto} ${hastaMiles(resto)}` : texto;
  }
  return hastaMiles(numero);
}

// Entero a letras. Ej.: 108 => "Ciento ocho", 1000 => "Mil".
export function entero(numero: number | string): string {
  const redondeado = Math.round(Number(numero));
  if (redondeado === 0) {
    return 'Cero';
  }
  const negativo = redondeado < 0;
  const letras = hastaMillones(Math.abs(redondeado));
  const conMayuscula = letras.charAt(0).toUpperCase() + letras.slice(1);
  return (negativo ? 'Menos ' : '') + conMayuscula;
}

// Monto con centavos: "Ciento ocho 50/100". Los centavos se omiten si son cero.
export function monto(montoValor: number | string, incluirCentavos = true): string {
  const redondeado = Math.round(Number(montoValor) * 100) / 100;
  const negativo = redondeado < 0;
  const absoluto = Math.abs(redondeado).toFixed(2);
  const [enteroStr, centavos] = absoluto.split('.');

  let texto = entero(Number(enteroStr));
  if (incluirCentavos && Number(centavos) > 0) {
    texto += ` ${centavos}/100`;
  }

  return (negativo ? 'Menos ' : '') + texto;
}
