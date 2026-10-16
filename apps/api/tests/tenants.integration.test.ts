import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('empresas, permisos, sincronización, archivos y orden de documentos', {
  skip: process.env.LUMIS_INTEGRATION_TEST !== '1',
}, async (t) => {
  await import('dotenv/config');
  const host = process.env.DB_HOST ?? 'localhost';
  assert.ok(['localhost','127.0.0.1','::1'].includes(host), 'Solo se permiten pruebas contra MySQL local');
  const database = 'lumis_test_' + process.pid + '_' + Date.now();
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lumis-tenant-test-'));
  process.env.DB_NAME = database;
  process.env.JWT_SECRET = 'integration-only-' + database;
  process.env.UPLOADS_DIR = uploadDir;
  const { config } = await import('../src/config');
  const mysql = await import('mysql2/promise');
  const admin = await mysql.createConnection({
    host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password,
    multipleStatements: true,
  });
  let closeServer: (() => Promise<void>) | undefined;
  let closePool: (() => Promise<void>) | undefined;
  t.after(async () => {
    await closeServer?.();
    await closePool?.();
    assert.match(database, /^lumis_test_\d+_\d+$/);
    await admin.query('DROP DATABASE IF EXISTS ' + database);
    await admin.end();
    const resolved = path.resolve(uploadDir);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep + 'lumis-tenant-test-'));
    await fs.rm(resolved, { recursive: true, force: true });
  });
  await admin.query('CREATE DATABASE ' + database);
  await admin.changeUser({ database });
  await admin.query('CREATE TABLE schema_migrations (version VARCHAR(50) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
  const migrations = path.join(__dirname, '../migrations');
  for (const file of (await fs.readdir(migrations)).filter(f => f.endsWith('.sql') && f < '019').sort()) {
    await admin.query(await fs.readFile(path.join(migrations,file),'utf8'));
    await admin.query('INSERT INTO schema_migrations(version) VALUES (?)', [file.slice(0,-4)]);
  }
  await admin.query("INSERT INTO users(username,name,email,password_hash) VALUES ('legacy_a','Anterior A',NULL,'hash'),('legacy_b','Anterior B',NULL,'hash')");
  await admin.query("INSERT INTO business(id,nombre,logo_url) VALUES (1,'Empresa anterior',NULL)");
  await admin.query("INSERT INTO clients(user_id,name) VALUES (1,'Cliente anterior')");
  const { runMigrations } = await import('../src/db/migrate');
  await runMigrations();
  await runMigrations();
  const [legacy] = await admin.query<any[]>('SELECT business_id, role FROM users ORDER BY id');
  assert.deepEqual(legacy.map(r=>[r.business_id,r.role]), [[1,'admin'],[1,'seller']]);
  const [oldBiz] = await admin.query<any[]>('SELECT nombre FROM business WHERE id=1');
  assert.equal(oldBiz[0].nombre, 'Empresa anterior');
  const { pool } = await import('../src/db/pool');
  closePool = () => pool.end();
  const { createApp } = await import('../src/app');
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening',resolve));
  closeServer = () => new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  const base = 'http://127.0.0.1:' + (server.address() as {port:number}).port;
  const request = async (url:string, token?:string, method='GET', body?:unknown, status=200) => {
    const res = await fetch(base+url, {
      method, headers: { 'Content-Type':'application/json', ...(token?{Authorization:'Bearer '+token}:{}) },
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
    });
    const data = await res.json().catch(()=>null);
    assert.equal(res.status,status, method+' '+url+' '+JSON.stringify(data));
    return data as any;
  };
  const signup = (username:string)=>request('/api/auth/register',undefined,'POST',
    {username,name:username,password:'test-only-12345'},201);
  const a=await signup('empresa_a'), b=await signup('empresa_b');
  assert.equal(a.user.role,'admin');
  assert.notEqual(a.user.businessId,b.user.businessId);
  const seller = await request('/api/auth/users',a.token,'POST',
    {username:'vendedor_a',name:'Vendedor A',password:'test-only-12345',businessId:b.user.businessId,role:'admin'},201);
  assert.equal(seller.user.role,'seller');
  assert.equal(seller.user.businessId,a.user.businessId);
  const sellerLogin = await request('/api/auth/login',undefined,'POST',{username:'vendedor_a',password:'test-only-12345'});
  const st=sellerLogin.token;
  await request('/api/auth/users',st,'POST',{username:'intruso',name:'Intruso',password:'test-only-12345'},403);
  await request('/api/business',st,'PUT',{nombre:'No autorizado'},403);
  await request('/api/business',a.token,'PUT',{nombre:'Empresa A',color_primario:'#123456',moneda:'USD',direccion:'Dirección nueva'});
  const secondLogin=await request('/api/auth/login',undefined,'POST',{username:'empresa_a',password:'test-only-12345'});
  assert.equal((await request('/api/business',secondLogin.token)).business.direccion,'Dirección nueva');
  assert.equal((await request('/api/business',st)).business.nombre,'Empresa A');
  assert.notEqual((await request('/api/business',b.token)).business.nombre,'Empresa A');
  await request('/api/auth/preferences',a.token,'PATCH',{themeMode:'dark'});
  assert.equal((await request('/api/auth/me',secondLogin.token)).user.themeMode,'dark');
  const productA=(await request('/api/products',a.token,'POST',{name:'Solo A',price:10,unit:'Unidad'},201)).product;
  assert.equal((await request('/api/products',st)).products[0].id,productA.id);
  assert.equal((await request('/api/products',b.token)).products.length,0);
  const clientA=(await request('/api/clients',a.token,'POST',{name:'Cliente A'},201)).client;
  const lines=[{productId:productA.id,description:'Primero',quantity:1,unit:'Unidad',unitPrice:10},
    {description:'Segundo',quantity:2,unit:'Unidad',unitPrice:5}];
  await request('/api/quotes',b.token,'POST',{clientId:clientA.id,items:lines},404);
  await request('/api/quotes',b.token,'POST',{items:lines},404);
  const q=(await request('/api/quotes',a.token,'POST',{clientId:clientA.id,items:lines},201)).quote;
  const s=(await request('/api/sales',st,'POST',{clientId:clientA.id,items:lines,metodoPago:'por_pagar'},201)).sale;
  for(const [route,id,key] of [['quotes',q.id,'quote'],['sales',s.id,'sale']] as const) {
    assert.equal((await request('/api/'+route,b.token))[route].length,0);
    await request('/api/'+route+'/'+id,b.token,'GET',undefined,404);
    await request('/api/'+route+'/'+id,b.token,'DELETE',undefined,404);
    await request('/api/'+route+'/'+id+'/duplicate',b.token,'POST',{},404);
    await request('/api/'+route+'/'+id,b.token,'PATCH',{},404);
    const details=(await request('/api/'+route+'/'+id,st))[key];
    const ids=details.items.map((i:any)=>i.id).reverse();
    await request('/api/'+route+'/'+id+'/items/reorder',a.token,'POST',{itemIds:ids});
    assert.deepEqual((await request('/api/'+route+'/'+id,st))[key].items.map((i:any)=>i.id),ids);
    await request('/api/'+route+'/'+id+'/items/reorder',a.token,'POST',{itemIds:[ids[0],ids[0]]},409);
    await request('/api/'+route+'/'+id+'/items/reorder',b.token,'POST',{itemIds:ids},404);
    await request('/api/'+route+'/'+id+'/items/'+ids[0],b.token,'PATCH',{quantity:99},404);
    await request('/api/'+route+'/'+id+'/items/'+ids[0]+'/duplicate',a.token,'POST',{},201);
    assert.equal((await request('/api/'+route+'/'+id,a.token))[key].items.length,3);
    const cloned=(await request('/api/'+route+'/'+id+'/duplicate',a.token,'POST',{},201))[key];
    assert.deepEqual((await request('/api/'+route+'/'+cloned.id,a.token))[key].items.map((i:any)=>i.description),
      (await request('/api/'+route+'/'+id,a.token))[key].items.map((i:any)=>i.description));
  }
  await request('/api/sales/from-quote',b.token,'POST',{quoteId:q.id},404);
  await request('/api/quotes/%30'+q.id,b.token,'GET',undefined,404);
  assert.equal((await request('/api/dashboard',b.token)).dashboard.quotes.value,0);
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
  config.uploadsDir = path.join(uploadDir, 'created-on-upload');
  const asset=await request('/api/business/assets',a.token,'POST',{tipo:'logo',base64:png,ext:'jpg'},201);
  assert.ok(asset.url.endsWith('.png'));
  assert.ok((await fs.stat(config.uploadsDir)).isDirectory());
  await request(asset.url,a.token,'HEAD');
  const goodStorage = config.uploadsDir;
  const blocked = path.join(uploadDir,'blocked-storage');
  await fs.writeFile(blocked,'not a directory');
  config.uploadsDir = blocked;
  try {
    const failure=await request('/api/business/assets',a.token,'POST',{tipo:'logo',base64:png,ext:'png'},503);
    assert.equal(failure.code,'UPLOAD_STORAGE_UNAVAILABLE');
    assert.equal((await request('/api/business',a.token)).business.logo_url,asset.url);
  } finally { config.uploadsDir = goodStorage; }
  await request(asset.url,b.token,'GET',undefined,404);
  await request(asset.url,undefined,'GET',undefined,401);
  const image=await fetch(base+asset.url,{headers:{Authorization:'Bearer '+st}});
  assert.equal(image.status,200);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()),Buffer.from(png,'base64'));
  await request('/api/business/assets',a.token,'POST',{tipo:'logo',base64:Buffer.from('not an image at all').toString('base64'),ext:'png'},400);
  const otherSale=(await request('/api/sales',b.token,'POST',{items:[{description:'B',quantity:1,unitPrice:5}],metodoPago:'efectivo'},201)).sale;
  await request('/api/sales/'+otherSale.id,b.token,'PATCH',{comprobanteUrl:asset.url},400);
  await request(asset.url,b.token,'GET',undefined,404);
  const receipt=await request('/api/sales/'+s.id+'/receipt',st,'POST',{base64:png,ext:'jpg'},201);
  assert.ok(receipt.url.endsWith('.png'));
  await request(receipt.url,b.token,'GET',undefined,404);
  const otherDetails=(await request('/api/sales/'+otherSale.id,b.token)).sale;
  await request('/api/sales/'+otherSale.id+'/items/'+otherDetails.items[0].id+'/duplicate',b.token,'POST',{},201);
  assert.equal((await request('/api/sales/'+otherSale.id,b.token)).sale.estadoPago,'pagado');
  const credit=(await request('/api/sales/'+s.id,st)).sale;
  await request('/api/sales/'+s.id+'/payments',st,'POST',{monto:credit.total},201);
  assert.equal((await request('/api/sales/'+s.id,st)).sale.estadoPago,'pagado');
  await request('/api/sales/'+s.id+'/items/'+credit.items[0].id+'/duplicate',st,'POST',{},201);
  assert.equal((await request('/api/sales/'+s.id,st)).sale.estadoPago,'por_cobrar');
  const linked=(await request('/api/agents',a.token)).agents.find((agent:any)=>agent.accountId===seller.user.id);
  assert.ok(linked);
  await request('/api/agents/'+linked.id,a.token,'DELETE',undefined,409);
  await fs.unlink(path.join(config.uploadsDir,path.basename(asset.url)));
  const missing=await request(asset.url,a.token,'GET',undefined,404);
  assert.equal(missing.code,'IMAGE_NOT_FOUND');
  const usersA=(await request('/api/auth/users',a.token)).users;
  assert.equal(usersA.length,2);
  assert.ok(usersA.every((u:any)=>u.businessId===a.user.businessId));

  await t.test('la fecha de venta se sincroniza y no modifica entregas, pagos ni datos de otra empresa', async () => {
    const dated=(await request('/api/sales',st,'POST',{
      items:[{description:'Venta con fecha',quantity:1,unitPrice:10}],metodoPago:'por_pagar',
      createdAt:'2025-09-30T23:45:20-04:00',
    },201)).sale;
    await request('/api/sales/'+dated.id+'/payments',st,'POST',{monto:3},201);
    await request('/api/sales/'+dated.id+'/deliver',st,'POST',{});
    const before=(await request('/api/sales/'+dated.id,st)).sale;
    assert.equal(before.createdAt,'2025-10-01T03:45:20.000Z');
    const changed='2026-02-28T23:45:20-04:00';
    const expected='2026-03-01T03:45:20.000Z';
    const updated=await request('/api/sales/'+dated.id,st,'PATCH',{createdAt:changed});
    assert.equal(updated.createdAt,expected);
    const after=(await request('/api/sales/'+dated.id,secondLogin.token)).sale;
    assert.equal(after.createdAt,expected);
    assert.equal(after.entregadaAt,before.entregadaAt);
    assert.equal(after.estadoPago,before.estadoPago);
    assert.deepEqual(after.payments,before.payments);
    assert.equal((await request('/api/sales',a.token)).sales.find((sale:any)=>sale.id===dated.id).createdAt,expected);
    await request('/api/sales/'+dated.id,a.token,'PATCH',{notaPago:'Sin cambiar la fecha'});
    assert.equal((await request('/api/sales/'+dated.id,st)).sale.createdAt,expected);
    await request('/api/sales/'+dated.id,b.token,'PATCH',{createdAt:'2024-01-01T12:00:00Z'},404);
    for (const invalid of ['mañana','2026-02-30T12:00:00Z','1969-12-31T12:00:00Z','2040-01-01T12:00:00Z',null]) {
      await request('/api/sales/'+dated.id,st,'PATCH',{createdAt:invalid},400);
    }
    assert.equal((await request('/api/sales/'+dated.id,st)).sale.createdAt,expected);
    await request('/api/sales/'+dated.id+'/anular',st,'POST',{});
    await request('/api/sales/'+dated.id,st,'PATCH',{createdAt:changed},409);
    await request('/api/sales',st,'POST',{
      items:[{description:'Fecha inválida',quantity:1,unitPrice:1}],createdAt:'2026-02-30T00:00:00Z',
    },400);
  });


  await t.test('la fecha de cotización se sincroniza sin modificar sus productos ni permitir cambios tras convertirla', async () => {
    const quote=(await request('/api/quotes',a.token,'POST',{
      clientId:clientA.id,items:[{description:'Cotización con fecha',quantity:2,unitPrice:12}],notes:'Conservar',
    },201)).quote;
    const before=(await request('/api/quotes/'+quote.id,st)).quote;
    const expected='2025-10-01T03:45:20.000Z';
    const updated=await request('/api/quotes/'+quote.id,st,'PATCH',{createdAt:'2025-09-30T23:45:20-04:00'});
    assert.equal(updated.createdAt,expected);
    const after=(await request('/api/quotes/'+quote.id,secondLogin.token)).quote;
    assert.equal(after.createdAt,expected);
    assert.deepEqual(after.items,before.items);
    assert.equal(after.total,before.total);
    assert.equal(after.notes,before.notes);
    assert.equal(after.status,before.status);
    assert.equal((await request('/api/quotes',a.token)).quotes.find((q:any)=>q.id===quote.id).createdAt,expected);
    await request('/api/quotes/'+quote.id,b.token,'PATCH',{createdAt:'2024-01-01T12:00:00Z'},404);
    for(const invalid of ['mañana','2026-02-30T12:00:00Z','1969-12-31T12:00:00Z','2040-01-01T12:00:00Z',null]) {
      await request('/api/quotes/'+quote.id,st,'PATCH',{createdAt:invalid,notes:'No guardar'},400);
    }
    assert.equal((await request('/api/quotes/'+quote.id,st)).quote.notes,'Conservar');
    await request('/api/quotes/'+quote.id,a.token,'PATCH',{status:'rechazada'});
    await request('/api/quotes/'+quote.id,st,'PATCH',{createdAt:expected});
    await request('/api/quotes/'+quote.id,a.token,'PATCH',{status:'aprobada'});
    await request('/api/quotes/'+quote.id,st,'PATCH',{createdAt:expected});
    const sale=(await request('/api/sales/from-quote',st,'POST',{quoteId:quote.id},201)).sale;
    await request('/api/quotes/'+quote.id,st,'PATCH',{createdAt:'2024-01-01T12:00:00Z'},409);
    assert.equal((await request('/api/quotes/'+quote.id,st)).quote.createdAt,expected);
    assert.notEqual((await request('/api/sales/'+sale.id,st)).sale.createdAt,expected);
  });

});
