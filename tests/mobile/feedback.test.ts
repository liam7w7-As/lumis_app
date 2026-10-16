import test from 'node:test';
import assert from 'node:assert/strict';
import { feedback, getFeedbackSnapshot, registerFeedbackHost, unregisterFeedbackHost, activeFeedbackHost } from '../../apps/mobile/src/lib/feedback';

test.beforeEach(() => feedback.clear());
test('cancelar una confirmación no ejecuta la acción destructiva', async () => {
  let deleted = false;
  const id = feedback.alert('Borrar venta', 'Confirmar', [
    {text:'Cancelar', style:'cancel'},
    {text:'Borrar', style:'destructive', onPress:()=>{deleted=true;}},
  ]);
  assert.equal(getFeedbackSnapshot().messages[0].kind, 'warning');
  await feedback.press(id,0);
  assert.equal(deleted,false);
  assert.equal(getFeedbackSnapshot().messages.length,0);
});
test('una doble pulsación ejecuta una acción una sola vez', async () => {
  let calls=0;
  const id=feedback.alert('Continuar','',[{text:'Guardar',onPress:async()=>{calls++;}}]);
  await Promise.all([feedback.press(id,0),feedback.press(id,0)]);
  assert.equal(calls,1);
});
test('un error de una acción asíncrona se muestra y mantiene los mensajes en orden', async () => {
  const id=feedback.alert('Guardar','',[{text:'Sí',onPress:async()=>{throw new Error('Sin conexión');}}]);
  feedback.success('Otro cambio','Ya está guardado');
  await feedback.press(id,0);
  assert.deepEqual(getFeedbackSnapshot().messages.map(m=>m.kind),['success','error']);
  assert.equal(getFeedbackSnapshot().messages[1].message,'Sin conexión');
});
test('el mensaje se presenta dentro del último formulario abierto', () => {
  registerFeedbackHost('form'); registerFeedbackHost('picker');
  assert.equal(activeFeedbackHost(getFeedbackSnapshot()),'picker');
  unregisterFeedbackHost('picker');
  assert.equal(activeFeedbackHost(getFeedbackSnapshot()),'form');
  unregisterFeedbackHost('form');
  assert.equal(activeFeedbackHost(getFeedbackSnapshot()),'root');
});
test('un fallo repetido no llena la cola y un diálogo obligatorio respeta cancelar', () => {
  feedback.error('Conexión','Intenta de nuevo');
  feedback.error('Conexión','Intenta de nuevo');
  assert.equal(getFeedbackSnapshot().messages.length,1);
  feedback.clear();
  feedback.alert('Confirmar','',undefined,{cancelable:false});
  feedback.dismiss();
  assert.equal(getFeedbackSnapshot().messages.length,1);
});

test('cerrar un éxito conserva la navegación asociada a Listo', () => {
  let continued=false;
  feedback.success('Venta creada','Lista',[{text:'Ver venta',onPress:()=>{continued=true;}}]);
  feedback.dismiss();
  assert.equal(continued,true);
});
