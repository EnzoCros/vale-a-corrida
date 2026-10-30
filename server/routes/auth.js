const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { rota, numObrigatorio, ErroValidacao } = require('../util');

const router = express.Router();
const BCRYPT_ROUNDS = 10;
const USUARIO_RE = /^[a-z0-9._-]{3,40}$/;

function gerarToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

// Formato público do usuário (nunca devolve senha_hash).
function paraJson(u) {
  return {
    id: u.id,
    nome: u.nome,
    usuario: u.usuario,
    veiculoAtivoId: u.veiculo_ativo_id,
    cfg: {
      amberKm: u.cfg_amber_km,
      greenKm: u.cfg_green_km,
      amberH: u.cfg_amber_h,
      greenH: u.cfg_green_h,
    },
  };
}

async function buscarUsuario(id) {
  const [rows] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [id]);
  return rows[0];
}

// POST /api/auth/cadastro  { nome, usuario, senha }
router.post('/cadastro', rota(async (req, res) => {
  const nome = String(req.body.nome || '').trim();
  const usuario = String(req.body.usuario || '').trim().toLowerCase();
  const senha = String(req.body.senha || '');

  if (nome.length < 2 || nome.length > 80) throw new ErroValidacao('Informe seu nome.');
  if (!USUARIO_RE.test(usuario)) {
    throw new ErroValidacao('Usuário deve ter de 3 a 40 caracteres: letras minúsculas, números, ponto, hífen ou _.');
  }
  if (senha.length < 6) throw new ErroValidacao('A senha precisa ter pelo menos 6 caracteres.');
  if (Buffer.byteLength(senha) > 72) throw new ErroValidacao('A senha pode ter no máximo 72 caracteres.');

  const hash = await bcrypt.hash(senha, BCRYPT_ROUNDS);
  try {
    const [r] = await pool.query(
      'INSERT INTO usuarios (nome, usuario, senha_hash) VALUES (?, ?, ?)',
      [nome, usuario, hash]
    );
    const u = await buscarUsuario(r.insertId);
    res.status(201).json({ token: gerarToken(u.id), usuario: paraJson(u) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ erro: 'Esse nome de usuário já está em uso.' });
    }
    throw err;
  }
}));

// POST /api/auth/login  { usuario, senha }
router.post('/login', rota(async (req, res) => {
  const usuario = String(req.body.usuario || '').trim().toLowerCase();
  const senha = String(req.body.senha || '');
  const [rows] = await pool.query('SELECT * FROM usuarios WHERE usuario = ?', [usuario]);
  const u = rows[0];
  // Mesma mensagem para usuário inexistente e senha errada (não revela quais usuários existem).
  if (!u || !(await bcrypt.compare(senha, u.senha_hash))) {
    return res.status(401).json({ erro: 'Usuário ou senha incorretos.' });
  }
  res.json({ token: gerarToken(u.id), usuario: paraJson(u) });
}));

// GET /api/auth/me
router.get('/me', requireAuth, rota(async (req, res) => {
  const u = await buscarUsuario(req.userId);
  if (!u) return res.status(401).json({ erro: 'Usuário não encontrado.' });
  res.json({ usuario: paraJson(u) });
}));

// PUT /api/auth/me/config  { amberKm, greenKm, amberH, greenH }
router.put('/me/config', requireAuth, rota(async (req, res) => {
  const c = req.body || {};
  const valores = [
    numObrigatorio(c.amberKm, 'R$/km amarelo'),
    numObrigatorio(c.greenKm, 'R$/km verde'),
    numObrigatorio(c.amberH, 'R$/h amarelo'),
    numObrigatorio(c.greenH, 'R$/h verde'),
  ];
  await pool.query(
    'UPDATE usuarios SET cfg_amber_km = ?, cfg_green_km = ?, cfg_amber_h = ?, cfg_green_h = ? WHERE id = ?',
    [...valores, req.userId]
  );
  res.json({ usuario: paraJson(await buscarUsuario(req.userId)) });
}));

// PUT /api/auth/me/veiculo-ativo  { veiculoId }
router.put('/me/veiculo-ativo', requireAuth, rota(async (req, res) => {
  const veiculoId = Number(req.body.veiculoId);
  const [rows] = await pool.query(
    'SELECT id FROM veiculos WHERE id = ? AND usuario_id = ?',
    [veiculoId, req.userId]
  );
  if (!rows.length) return res.status(404).json({ erro: 'Veículo não encontrado.' });
  await pool.query('UPDATE usuarios SET veiculo_ativo_id = ? WHERE id = ?', [veiculoId, req.userId]);
  res.json({ usuario: paraJson(await buscarUsuario(req.userId)) });
}));

module.exports = router;
