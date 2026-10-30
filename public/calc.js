/*
 * Regras de cálculo do Vale a Corrida.
 * Arquivo compartilhado: roda no navegador (window.Calc) e no Node (require).
 * Assim o backend e o front usam exatamente a mesma conta.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(this, function () {

  // Aceita "12,5", "12.5", "1.234,56", "1,234.56", "R$ 7,90" etc.
  // O último separador (vírgula ou ponto) é o decimal; os outros são milhar.
  function parseNum(valor) {
    if (valor === null || valor === undefined) return NaN;
    if (typeof valor === 'number') return valor;
    var s = String(valor).trim().replace(/[^\d.,-]/g, '');
    if (!s) return NaN;
    var ultimaVirgula = s.lastIndexOf(',');
    var ultimoPonto = s.lastIndexOf('.');
    if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
      if (ultimaVirgula > ultimoPonto) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (ultimaVirgula >= 0) {
      // Só vírgula: se aparecer mais de uma, as anteriores são milhar.
      var partes = s.split(',');
      var dec = partes.pop();
      s = partes.join('') + '.' + dec;
    } else if ((s.match(/\./g) || []).length > 1 || /^-?[1-9]\d{0,2}\.\d{3}$/.test(s)) {
      // "1.234.567" ou "10.000" → ponto de milhar (padrão brasileiro).
      // "5.89", "12.5" e "0.500" continuam sendo decimais.
      s = s.replace(/\./g, '');
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : NaN;
  }

  // Divide com segurança: se faltar valor ou divisor, o custo daquele item é 0.
  function razao(valor, km) {
    var v = parseNum(valor), k = parseNum(km);
    return v > 0 && k > 0 ? v / k : 0;
  }

  var TIPOS_SEM_COMBUSTIVEL = ['bicicleta'];

  // Custo operacional detalhado por km de um veículo.
  function custoPorKm(v) {
    var combustivel = 0;
    if (TIPOS_SEM_COMBUSTIVEL.indexOf(v.tipo) === -1) {
      combustivel = razao(v.precoCombustivel, v.consumoKmL);
    }
    var itens = {
      combustivel: combustivel,
      manutencao: razao(v.manutValor, v.manutKm),
      pneus: razao(v.pneusValor, v.pneusKm),
      seguro: razao(v.seguroValor, v.seguroKm),
      ipva: razao(v.ipvaValor, v.ipvaKm)
    };
    itens.total = itens.combustivel + itens.manutencao + itens.pneus + itens.seguro + itens.ipva;
    return itens;
  }

  var CFG_PADRAO = { amberKm: 1.2, greenKm: 1.6, amberH: 15, greenH: 22 };

  // Avalia uma corrida. `c` = { km, valor, tempo, kmColeta, tempoColeta }.
  // km/tempo de coleta são opcionais (Uber, 99 etc. mostram o deslocamento até o cliente separado).
  function avaliarCorrida(c, custoKm, cfg) {
    cfg = cfg || CFG_PADRAO;
    var km = parseNum(c.km), valor = parseNum(c.valor), tempo = parseNum(c.tempo);
    var kmColeta = parseNum(c.kmColeta) || 0, tempoColeta = parseNum(c.tempoColeta) || 0;
    if (!(km > 0) || !(valor > 0) || !(tempo > 0) || kmColeta < 0 || tempoColeta < 0) return null;

    var kmTotal = km + kmColeta;
    var tempoTotal = tempo + tempoColeta;
    var custo = kmTotal * (custoKm || 0);
    var lucro = valor - custo;
    var lucroKm = lucro / kmTotal;
    var lucroH = lucro / (tempoTotal / 60);

    var veredito;
    if (lucroKm >= cfg.greenKm && lucroH >= cfg.greenH) veredito = 'green';
    else if (lucroKm >= cfg.amberKm && lucroH >= cfg.amberH) veredito = 'amber';
    else veredito = 'red';

    return {
      km: km, valor: valor, tempo: tempo, kmColeta: kmColeta, tempoColeta: tempoColeta,
      kmTotal: kmTotal, tempoTotal: tempoTotal, custoKm: custoKm || 0,
      custo: custo, lucro: lucro, lucroKm: lucroKm, lucroH: lucroH, veredito: veredito
    };
  }

  return {
    parseNum: parseNum,
    custoPorKm: custoPorKm,
    avaliarCorrida: avaliarCorrida,
    CFG_PADRAO: CFG_PADRAO,
    TIPOS_SEM_COMBUSTIVEL: TIPOS_SEM_COMBUSTIVEL
  };
});
