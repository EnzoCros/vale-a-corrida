require('dotenv').config();
const { initDatabase, config } = require('./index');

initDatabase()
  .then(() => {
    console.log(`Banco "${config.database}" pronto em ${config.host}:${config.port}.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Falha ao inicializar o banco:', err.message);
    process.exit(1);
  });
