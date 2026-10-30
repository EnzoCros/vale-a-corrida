const express = require('express');
const { pool } = require('../db');
const { rota, hoje } = require('../util');

const router = express.Router();

// Fecha os dias em aberto: agrupa as corridas sem dia_id por data, soma as aceitas
// na tabela `dias` e marca as corridas com o dia_id correspondente.
// `incluirHoje = false` fecha só datas anteriores (virada de dia automática).
async function fecharDias(userId, incluirHoje) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [grupos] = await conn.query(
      `SELECT data,
              SUM(IF(status = 'aceita', valor, 0))                    AS ganho,
              SUM(IF(status = 'aceita', custo, 0))                    AS custo,
              SUM(IF(status = 'aceita', lucro, 0))                    AS lucro,
              SUM(IF(status = 'aceita', km + km_coleta, 0))           AS km,
              SUM(IF(status = 'aceita', tempo_min + tempo_coleta, 0)) AS minutos,
              SUM(status = 'aceita')                                  AS corridas
         FROM corridas
        WHERE usuario_id = ? AND dia_id IS NULL AND data ${incluirHoje ? '<=' : '<'} ?
        GROUP BY data
        FOR UPDATE`,
      [userId, hoje()]
    );
    for (const g of grupos) {
      if (Number(g.corridas) === 0) continue; // dia só com recusadas: nada a somar
      // Se o dia já foi fechado antes (ex: "salvar dia" duas vezes), soma na mesma linha.
      const [r] = await conn.query(
        `INSERT INTO dias (usuario_id, data, ganho, custo, lucro, km, minutos, corridas)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           id = LAST_INSERT_ID(id),
           ganho = ganho + VALUES(ganho), custo = custo + VALUES(custo),
           lucro = lucro + VALUES(lucro), km = km + VALUES(km),
           minutos = minutos + VALUES(minutos), corridas = corridas + VALUES(corridas)`,
        [userId, g.data, g.ganho, g.custo, g.lucro, g.km, Math.round(g.minutos), g.corridas]
      );
      await conn.query(
        'UPDATE corridas SET dia_id = ? WHERE usuario_id = ? AND dia_id IS NULL AND data = ?',
        [r.insertId, userId, g.data]
      );
    }
    await conn.commit();
    return grupos.filter((g) => Number(g.corridas) > 0).length;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// GET /api/dias → { hoje, semana, dias[] }
router.get('/', rota(async (req, res) => {
  await fecharDias(req.userId, false);

  const [[h]] = await pool.query(
    `SELECT COALESCE(SUM(valor), 0) AS ganho, COALESCE(SUM(custo), 0) AS custo,
            COALESCE(SUM(lucro), 0) AS lucro, COALESCE(SUM(km + km_coleta), 0) AS km,
            COALESCE(SUM(tempo_min + tempo_coleta), 0) AS minutos, COUNT(*) AS corridas
       FROM corridas
      WHERE usuario_id = ? AND dia_id IS NULL AND status = 'aceita' AND data = ?`,
    [req.userId, hoje()]
  );

  const [dias] = await pool.query(
    `SELECT id, data, ganho, custo, lucro, km, minutos, corridas
       FROM dias WHERE usuario_id = ? ORDER BY data DESC LIMIT 365`,
    [req.userId]
  );

  // Últimos 7 dias = hoje (ainda aberto) + dias fechados de 6 dias atrás pra cá.
  const [[s]] = await pool.query(
    `SELECT COALESCE(SUM(ganho), 0) AS ganho, COALESCE(SUM(lucro), 0) AS lucro, COALESCE(SUM(km), 0) AS km
       FROM dias WHERE usuario_id = ? AND data >= DATE_SUB(?, INTERVAL 6 DAY)`,
    [req.userId, hoje()]
  );
  const semana = {
    ganho: s.ganho + Number(h.ganho),
    lucro: s.lucro + Number(h.lucro),
    km: s.km + Number(h.km),
  };

  const num = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, k === 'data' ? v : Number(v)]));
  res.json({ hoje: { data: hoje(), ...num(h) }, semana, dias: dias.map(num) });
}));

// POST /api/dias/fechar → "salvar dia": arquiva tudo o que está aberto, inclusive hoje.
router.post('/fechar', rota(async (req, res) => {
  const fechados = await fecharDias(req.userId, true);
  if (!fechados) return res.status(400).json({ erro: 'Ainda não tem nada registrado hoje.' });
  res.json({ fechados });
}));

module.exports = { router, fecharDias };
