require('dotenv').config();
const path = require('path');
const express = require('express');
const { initDatabase, config } = require('./db');
const { requireAuth } = require('./middleware/auth');
const { ErroValidacao } = require('./util');
const authRoutes = require('./routes/auth');
const veiculosRoutes = require('./routes/veiculos');
const { router: corridasRoutes } = require('./routes/corridas');
const { router: diasRoutes } = require('./routes/dias');

if (!process.env.JWT_SECRET) {
  console.error('Defina JWT_SECRET no arquivo .env (veja .env.example).');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '100kb' }));

app.use('/api/auth', authRoutes);
app.use('/api/veiculos', requireAuth, veiculosRoutes);
app.use('/api/corridas', requireAuth, corridasRoutes);
app.use('/api/dias', requireAuth, diasRoutes);
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

// Front-end estático (public/index.html, app.js, calc.js, ...)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Tratamento central de erros
app.use((err, req, res, next) => {
  if (err instanceof ErroValidacao) return res.status(400).json({ erro: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' });
  console.error(err);
  res.status(500).json({ erro: 'Erro interno no servidor.' });
});

const PORT = Number(process.env.PORT || 3000);

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Vale a Corrida rodando em http://localhost:${PORT} (MySQL ${config.host}:${config.port}/${config.database})`);
    });
  })
  .catch((err) => {
    console.error('Não consegui conectar no MySQL:', err.message);
    console.error('Confira DB_HOST, DB_PORT, DB_USER e DB_PASSWORD no arquivo .env.');
    process.exit(1);
  });
