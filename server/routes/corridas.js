const express = require('express');
const { pool } = require('../db');
const { custoPorKm, avaliarCorrida } = require('../../public/calc');
const { rota, hoje, numOpcional, ErroValidacao } = require('../util');

const router = express.Router();

// Apps aceitos. "outro" cobre qualquer app que não esteja na lista.
const APPS = ['ifood', 'uber', '99', 'rappi', 'lalamove', 'loggi', 'indrive', 'outro'];

function paraJson(c) {
  return {
    id: c.id,
    veiculoId: c.veiculo_id,
    veiculoNome: c.veiculo_nome || null,
    app: c.app,
    data: c.data,
    km: c.km, kmColeta: c.km_coleta,
    tempo: c.tempo_min, tempoColeta: c.tempo_coleta,
    valor: c.valor,
    custoKm: c.custo_km, custo: c.custo, lucro: c.lucro,
    lucroKm: c.lucro_km, lucroH: c.lucro_h,
    veredito: c.veredito,
    status: c.status,
    criadoEm: c.criado_em,
  };
}

// GET /api/corridas?limite=200
router.get('/', rota(async (req, res) => {
  const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 200, 1), 1000);
  const [rows] = await pool.query(
    `SELECT c.*, v.nome AS veiculo_nome
       FROM corridas c LEFT JOIN veiculos v ON v.id = c.veiculo_id
      WHERE c.usuario_id = ?
      ORDER BY c.criado_em DESC, c.id DESC
      LIMIT ?`,
    [req.userId, limite]
  );
  res.json({ corridas: rows.map(paraJson) });
}));

// POST /api/corridas  { veiculoId, app, km, valor, tempo, kmColeta?, tempoColeta?, status }
// O custo e o veredito são recalculados aqui no servidor (não confia no que o front mandou).
router.post('/', rota(async (req, res) => {
  const b = req.body || {};
  if (!['aceita', 'recusada'].includes(b.status)) throw new ErroValidacao('Status inválido.');
  const app = String(b.app || 'outro').toLowerCase();
  if (!APPS.includes(app)) throw new ErroValidacao('App inválido.');

  const [[veiculo]] = await pool.query(
    'SELECT * FROM veiculos WHERE id = ? AND usuario_id = ?',
    [b.veiculoId, req.userId]
  );
  if (!veiculo) throw new ErroValidacao('Selecione um veículo válido.');
  const [[u]] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [req.userId]);

  const custoKm = custoPorKm({
    tipo: veiculo.tipo,
    precoCombustivel: veiculo.preco_combustivel, consumoKmL: veiculo.consumo_km_l,
    manutValor: veiculo.manut_valor, manutKm: veiculo.manut_km,
    pneusValor: veiculo.pneus_valor, pneusKm: veiculo.pneus_km,
    seguroValor: veiculo.seguro_valor, seguroKm: veiculo.seguro_km,
    ipvaValor: veiculo.ipva_valor, ipvaKm: veiculo.ipva_km,
  }).total;

  const r = avaliarCorrida(
    {
      km: b.km, valor: b.valor, tempo: b.tempo,
      kmColeta: numOpcional(b.kmColeta, 'km até a coleta'),
      tempoColeta: numOpcional(b.tempoColeta, 'tempo até a coleta'),
    },
    custoKm,
    { amberKm: u.cfg_amber_km, greenKm: u.cfg_green_km, amberH: u.cfg_amber_h, greenH: u.cfg_green_h }
  );
  if (!r) throw new ErroValidacao('Preencha distância, valor e tempo com números maiores que zero.');

  const [ins] = await pool.query(
    `INSERT INTO corridas
       (usuario_id, veiculo_id, app, data, km, km_coleta, tempo_min, tempo_coleta, valor,
        custo_km, custo, lucro, lucro_km, lucro_h, veredito, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.userId, veiculo.id, app, hoje(), r.km, r.kmColeta, r.tempo, r.tempoColeta, r.valor,
     r.custoKm, r.custo, r.lucro, r.lucroKm, r.lucroH, r.veredito, b.status]
  );
  const [[nova]] = await pool.query(
    `SELECT c.*, v.nome AS veiculo_nome FROM corridas c
       LEFT JOIN veiculos v ON v.id = c.veiculo_id WHERE c.id = ?`,
    [ins.insertId]
  );
  res.status(201).json({ corrida: paraJson(nova) });
}));

// DELETE /api/corridas → "apagar histórico".
// Mantém as corridas aceitas do dia em aberto, porque são elas que compõem o card "Hoje".
router.delete('/', rota(async (req, res) => {
  const [r] = await pool.query(
    `DELETE FROM corridas
      WHERE usuario_id = ? AND NOT (dia_id IS NULL AND status = 'aceita')`,
    [req.userId]
  );
  res.json({ apagadas: r.affectedRows });
}));

module.exports = { router, APPS };
