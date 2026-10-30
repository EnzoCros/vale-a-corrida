const { parseNum } = require('../public/calc');

// Data local do servidor no formato AAAA-MM-DD.
function hoje() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Converte campo numérico opcional: vazio → null; inválido/negativo → erro.
function numOpcional(valor, nome) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = parseNum(valor);
  if (!(n >= 0)) throw new ErroValidacao(`Valor inválido em "${nome}".`);
  return n;
}

function numObrigatorio(valor, nome) {
  const n = parseNum(valor);
  if (!(n > 0)) throw new ErroValidacao(`Informe um valor maior que zero em "${nome}".`);
  return n;
}

class ErroValidacao extends Error {}

// Envolve handlers async para que erros caiam no middleware de erro.
const rota = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { hoje, numOpcional, numObrigatorio, ErroValidacao, rota };
