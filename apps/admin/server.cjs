const { createServer } = require('./server-app.cjs');

// Hostinger importa esta entrada con require(): escuchar también al ser importada.
createServer().listen(Number(process.env.PORT || 3001), () =>
  console.log('Lumis admin iniciado'),
);
