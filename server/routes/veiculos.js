const express = require('express');
const { pool } = require('../db');
const { custoPorKm, TIPOS_SEM_COMBUSTIVEL } = require('../../public/calc');
const { rota, numOpcional, numObrigatorio, ErroValidacao } = require('../util');

const router = express.Router();

const TIPOS = ['carro', 'moto', 'bicicleta'];
const COMBUSTIVEIS = ['gasolina', 'etanol', 'diesel', 'gnv', 'eletrico'];

// Linha do banco (snake_case) → JSON da API (camelCase) + custo/km calculado.
function paraJson(v) {
  const dados = {
    id: v.id,
    nome: v.nome,
    tipo: v.tipo,
    combustivel: v.combustivel,
    precoCombustivel: v.preco_combustivel,
    consumoKmL: v.consumo_km_l,
    manutValor: v.manut_valor, manutKm: v.manut_km,
    pneusValor: v.pneus_valor, pneusKm: v.pneus_km,
    seguroValor: v.seguro_valor, seguroKm: v.seguro_km,
    ipvaValor: v.ipva_valor, ipvaKm: v.ipva_km,
  };
  dados.custoKm = custoPorKm(dados);
  return dados;
}

// Valida o corpo da requisição. Combustível é obrigatório (exceto bicicleta);
// custos extras são opcionais, mas se vier o valor precisa vir o km (e vice-versa).
function validar(body) {
  const nome = String(body.nome || '').trim();
  const tipo = body.tipo;
  if (!nome || nome.length > 60) throw new ErroValidacao('Dê um nome ao veículo (até 60 caracteres).');
  if (!TIPOS.includes(tipo)) throw new ErroValidacao('Tipo de veículo inválido.');

  let combustivel = 'nenhum', preco = null, consumo = null;
  if (!TIPOS_SEM_COMBUSTIVEL.includes(tipo)) {
    combustivel = body.combustivel;
    if (!COMBUSTIVEIS.includes(combustivel)) throw new ErroValidacao('Escolha o combustível.');
    preco = numObrigatorio(body.precoCombustivel, 'preço do combustível');
    consumo = numObrigatorio(body.consumoKmL, 'média de consumo');
  }

  const extras = {};
  [
    ['manut', 'manutenção'],
    ['pneus', 'pneus'],
    ['seguro', 'seguro'],
    ['ipva', 'IPVA/licenciamento'],
  ].forEach(([chave, rotulo]) => {
    const valor = numOpcional(body[chave + 'Valor'], rotulo + ' (valor)');
    const km = numOpcional(body[chave + 'Km'], rotulo + ' (km)');
    if (!valor !== !km) {
      throw new ErroValidacao(`Em ${rotulo}, preencha o valor e o km juntos (ou deixe os dois vazios).`);
    }
    extras[chave + '_valor'] = valor || null;
    extras[chave + '_km'] = km ? Math.round(km) : null;
  });

  return {
    nome, tipo, combustivel,
    preco_combustivel: preco,
    consumo_km_l: consumo,
    ...extras,
  };
}

async function buscar(id, userId) {
  const [rows] = await pool.query('SELECT * FROM veiculos WHERE id = ? AND usuario_id = ?', [id, userId]);
  return rows[0];
}

// GET /api/veiculos
router.get('/', rota(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM veiculos WHERE usuario_id = ? ORDER BY id', [req.userId]);
  res.json({ veiculos: rows.map(paraJson) });
}));

// GET /api/veiculos/:id
router.get('/:id', rota(async (req, res) => {
  const v = await buscar(req.params.id, req.userId);
  if (!v) return res.status(404).json({ erro: 'Veículo não encontrado.' });
  res.json({ veiculo: paraJson(v) });
}));

// POST /api/veiculos
router.post('/', rota(async (req, res) => {
  const dados = validar(req.body || {});
  const [r] = await pool.query('INSERT INTO veiculos SET ?, usuario_id = ?', [dados, req.userId]);
  // Primeiro veículo (ou nenhum ativo) vira o ativo automaticamente.
  await pool.query(
    'UPDATE usuarios SET veiculo_ativo_id = ? WHERE id = ? AND veiculo_ativo_id IS NULL',
    [r.insertId, req.userId]
  );
  res.status(201).json({ veiculo: paraJson(await buscar(r.insertId, req.userId)) });
}));

// PUT /api/veiculos/:id
router.put('/:id', rota(async (req, res) => {
  if (!(await buscar(req.params.id, req.userId))) {
    return res.status(404).json({ erro: 'Veículo não encontrado.' });
  }
  const dados = validar(req.body || {});
  await pool.query('UPDATE veiculos SET ? WHERE id = ? AND usuario_id = ?', [dados, req.params.id, req.userId]);
  res.json({ veiculo: paraJson(await buscar(req.params.id, req.userId)) });
}));

// DELETE /api/veiculos/:id
router.delete('/:id', rota(async (req, res) => {
  const [r] = await pool.query('DELETE FROM veiculos WHERE id = ? AND usuario_id = ?', [req.params.id, req.userId]);
  if (!r.affectedRows) return res.status(404).json({ erro: 'Veículo não encontrado.' });
  // Se era o ativo, passa a ser o mais antigo que sobrou (ou nenhum).
  const [restantes] = await pool.query(
    'SELECT id FROM veiculos WHERE usuario_id = ? ORDER BY id LIMIT 1',
    [req.userId]
  );
  await pool.query(
    'UPDATE usuarios SET veiculo_ativo_id = ? WHERE id = ? AND veiculo_ativo_id = ?',
    [restantes[0] ? restantes[0].id : null, req.userId, req.params.id]
  );
  res.status(204).end();
}));

module.exports = router;
