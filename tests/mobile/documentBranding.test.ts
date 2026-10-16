import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDocumentBranding } from '../../apps/mobile/src/lib/documentBranding';

test('un logo ausente permite abrir el documento y conserva un sello disponible', async () => {
  const images=await resolveDocumentBranding({logoUrl:'/missing',selloUrl:'/stamp',includeSeal:true},async url=>{
    if(url==='/missing')throw new Error('La imagen no existe en el servidor');
    return 'data:image/png;base64,original';
  });
  assert.equal(images.logo,null);
  assert.equal(images.sello,'data:image/png;base64,original');
  assert.match(images.warnings[0],/Logo:.*no existe/);
});
test('un sello desactivado no se descarga ni bloquea la vista previa', async () => {
  const calls:string[]=[];
  const images=await resolveDocumentBranding({logoUrl:'/logo',selloUrl:'/missing',includeSeal:false},async url=>{
    calls.push(url); if(url==='/missing')throw Error('No existe'); return 'transparent-png';
  });
  assert.deepEqual(calls,['/logo']);
  assert.equal(images.logo,'transparent-png');
  assert.equal(images.sello,null);
  assert.deepEqual(images.warnings,[]);
});
test('sin marca personalizada se usa el nombre de la empresa sin imágenes de otra empresa', async () => {
  let calls=0;
  const images=await resolveDocumentBranding({},async()=>{calls++;return 'unexpected';});
  assert.equal(calls,0);
  assert.deepEqual(images,{logo:null,sello:null,warnings:[]});
});
