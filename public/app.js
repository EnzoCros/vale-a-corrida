(function () {
  var TOKEN_KEY = 'vale_a_corrida_token';
  var parseNum = Calc.parseNum;

  var APPS = [
    { id: 'ifood', nome: 'iFood' },
    { id: 'uber', nome: 'Uber' },
    { id: '99', nome: '99' },
    { id: 'rappi', nome: 'Rappi' },
    { id: 'lalamove', nome: 'Lalamove' },
    { id: 'loggi', nome: 'Loggi' },
    { id: 'indrive', nome: 'inDrive' },
    { id: 'outro', nome: 'Outro' }
  ];
  var NOME_APP = {};
  APPS.forEach(function (a) { NOME_APP[a.id] = a.nome; });

  var ICONES = { carro: '🚗', moto: '🏍️', bicicleta: '🚲' };
  var UNIDADES = {
    gasolina: { preco: 'R$/L', consumo: 'km/L' },
    etanol: { preco: 'R$/L', consumo: 'km/L' },
    diesel: { preco: 'R$/L', consumo: 'km/L' },
    gnv: { preco: 'R$/m³', consumo: 'km/m³' },
    eletrico: { preco: 'R$/kWh', consumo: 'km/kWh' }
  };

  var state = {
    token: null,
    usuario: null,
    veiculos: [],
    appAtual: 'ifood',
    corrida: null,
    editandoVeiculoId: null
  };

  function $(id) { return document.getElementById(id); }

  function lerToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  function gravarToken(t) {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  }

  function api(metodo, caminho, corpo) {
    var opts = { method: metodo, headers: {} };
    if (state.token) opts.headers.Authorization = 'Bearer ' + state.token;
    if (corpo !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(corpo);
    }
    return fetch('/api' + caminho, opts).then(function (res) {
      if (res.status === 204) return null;
      return res.json().catch(function () { return {}; }).then(function (dados) {
        if (res.status === 401 && state.token && caminho.indexOf('/auth/login') !== 0) {
          sair('Sua sessão expirou. Entre novamente.');
        }
        if (!res.ok) {
          var err = new Error(dados.erro || 'Erro ' + res.status);
          err.status = res.status;
          throw err;
        }
        return dados;
      });
    }, function () {
      throw new Error('Sem conexão com o servidor.');
    });
  }

  function fmtBRL(n) {
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtN(n, casas) {
    return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  }
  function fmtInput(n) {
    return n === null || n === undefined ? '' : String(n).replace('.', ',');
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtData(iso) {
    var p = iso.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    var dias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    return p[2] + '/' + p[1] + '/' + p[0] + ' · ' + dias[d.getDay()];
  }
  function fmtHora(dt) {
    var d = new Date(dt);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  var toastTimer;
  function toast(msg, erro) {
    var el = $('toast');
    el.textContent = msg;
    el.className = 'toast' + (erro ? ' erro' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3200);
  }

  function mostrarErro(id, msg) {
    var el = $(id);
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function aceitarSoNumeros(input) {
    input.addEventListener('input', function () {
      var limpo = input.value.replace(/[^\d.,]/g, '');
      if (limpo !== input.value) input.value = limpo;
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('input[inputmode="decimal"]'), aceitarSoNumeros);

  function mostrarView(nome) {
    ['auth', 'veiculo', 'painel'].forEach(function (v) {
      $('view-' + v).hidden = v !== nome;
    });
    $('app').className = 'app ' + (nome === 'painel' ? 'wide' : 'narrow');
    window.scrollTo(0, 0);
  }

  function mostrarAuth(modo) {
    var cadastro = modo === 'cadastro';
    $('card-login').hidden = cadastro;
    $('card-cadastro').hidden = !cadastro;
    $('switch-to-cadastro').hidden = cadastro;
    $('switch-to-login').hidden = !cadastro;
    mostrarErro('login-erro');
    mostrarErro('cadastro-erro');
    mostrarView('auth');
    $(cadastro ? 'cad-nome' : 'login-usuario').focus();
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-auth]'), function (b) {
    b.addEventListener('click', function () { mostrarAuth(b.getAttribute('data-auth')); });
  });

  function comBotao(form, promessa) {
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    return promessa.then(function (r) { btn.disabled = false; return r; },
      function (e) { btn.disabled = false; throw e; });
  }

  $('form-login').addEventListener('submit', function (e) {
    e.preventDefault();
    var usuario = $('login-usuario').value.trim();
    var senha = $('login-senha').value;
    if (!usuario || !senha) return mostrarErro('login-erro', 'Informe usuário e senha.');
    mostrarErro('login-erro');
    comBotao(this, api('POST', '/auth/login', { usuario: usuario, senha: senha }))
      .then(entrar)
      .catch(function (err) { mostrarErro('login-erro', err.message); });
  });

  $('form-cadastro').addEventListener('submit', function (e) {
    e.preventDefault();
    var dados = {
      nome: $('cad-nome').value.trim(),
      usuario: $('cad-usuario').value.trim().toLowerCase(),
      senha: $('cad-senha').value
    };
    if (!dados.nome || !dados.usuario || !dados.senha) return mostrarErro('cadastro-erro', 'Preencha todos os campos.');
    if (dados.senha !== $('cad-senha2').value) return mostrarErro('cadastro-erro', 'As senhas não conferem.');
    mostrarErro('cadastro-erro');
    comBotao(this, api('POST', '/auth/cadastro', dados))
      .then(entrar)
      .catch(function (err) { mostrarErro('cadastro-erro', err.message); });
  });

  function entrar(resp) {
    state.token = resp.token;
    gravarToken(resp.token);
    state.usuario = resp.usuario;
    $('form-login').reset();
    $('form-cadastro').reset();
    return carregarVeiculos().then(function () {
      if (!state.veiculos.length) abrirFormVeiculo(null, true);
      else abrirPainel();
    });
  }

  function sair(msg) {
    state.token = null;
    state.usuario = null;
    state.veiculos = [];
    gravarToken(null);
    mostrarAuth('login');
    if (msg) toast(msg, true);
  }
  $('btn-sair').addEventListener('click', function () { sair(); });

  function carregarVeiculos() {
    return api('GET', '/veiculos').then(function (r) { state.veiculos = r.veiculos; });
  }

  function veiculoAtivo() {
    var id = state.usuario && state.usuario.veiculoAtivoId;
    for (var i = 0; i < state.veiculos.length; i++) {
      if (state.veiculos[i].id === id) return state.veiculos[i];
    }
    return state.veiculos[0] || null;
  }

  var formVeiculo = $('form-veiculo');

  function valoresFormVeiculo() {
    var f = formVeiculo.elements;
    var tipo = formVeiculo.querySelector('input[name="tipo"]:checked').value;
    var semIpva = Calc.TIPOS_SEM_COMBUSTIVEL.indexOf(tipo) !== -1;
    return {
      nome: f.nome.value.trim(),
      tipo: tipo,
      combustivel: f.combustivel.value,
      precoCombustivel: f.precoCombustivel.value,
      consumoKmL: f.consumoKmL.value,
      manutValor: f.manutValor.value, manutKm: f.manutKm.value,
      pneusValor: f.pneusValor.value, pneusKm: f.pneusKm.value,
      seguroValor: f.seguroValor.value, seguroKm: f.seguroKm.value,
      ipvaValor: semIpva ? '' : f.ipvaValor.value,
      ipvaKm: semIpva ? '' : f.ipvaKm.value
    };
  }

  function atualizarFormVeiculo() {
    var v = valoresFormVeiculo();
    var semCombustivel = Calc.TIPOS_SEM_COMBUSTIVEL.indexOf(v.tipo) !== -1;
    $('bloco-combustivel').hidden = semCombustivel;
    var u = UNIDADES[v.combustivel] || UNIDADES.gasolina;
    $('lbl-preco').textContent = 'PREÇO (' + u.preco.toUpperCase() + ')';
    $('lbl-consumo').textContent = 'MÉDIA (' + u.consumo.toUpperCase() + ')';
    $('unid-consumo').textContent = u.consumo;
    formVeiculo.querySelector('[data-extra="ipva"]').hidden = semCombustivel;

    var c = Calc.custoPorKm(v);
    $('cs-total').textContent = fmtBRL(c.total) + '/km';
    ['combustivel', 'manutencao', 'pneus', 'seguro', 'ipva'].forEach(function (k) {
      var row = $('cs-' + k);
      row.lastElementChild.textContent = 'R$ ' + fmtN(c[k], 3);
      row.classList.toggle('zero', !c[k]);
    });
    $('cs-combustivel').hidden = semCombustivel;
    $('cs-ipva').hidden = semCombustivel;
  }
  formVeiculo.addEventListener('input', atualizarFormVeiculo);
  formVeiculo.addEventListener('change', atualizarFormVeiculo);

  function abrirFormVeiculo(veiculo, primeiro) {
    state.editandoVeiculoId = veiculo ? veiculo.id : null;
    formVeiculo.reset();
    mostrarErro('veiculo-erro');
    var f = formVeiculo.elements;
    var temExtras = false;
    if (veiculo) {
      f.nome.value = veiculo.nome;
      $('v-tipo-' + veiculo.tipo).checked = true;
      if (veiculo.combustivel !== 'nenhum') f.combustivel.value = veiculo.combustivel;
      f.precoCombustivel.value = fmtInput(veiculo.precoCombustivel);
      f.consumoKmL.value = fmtInput(veiculo.consumoKmL);
      ['manut', 'pneus', 'seguro', 'ipva'].forEach(function (k) {
        f[k + 'Valor'].value = fmtInput(veiculo[k + 'Valor']);
        f[k + 'Km'].value = fmtInput(veiculo[k + 'Km']);
        if (veiculo[k + 'Valor']) temExtras = true;
      });
    }
    $('extras').open = temExtras;
    $('veiculo-eyebrow').textContent = veiculo ? 'EDITAR VEÍCULO' : 'NOVO VEÍCULO';
    $('veiculo-titulo').textContent = veiculo ? veiculo.nome.toUpperCase() : 'CUSTO OPERACIONAL';
    $('veiculo-intro').hidden = !primeiro;
    $('btn-veiculo-cancelar').hidden = !!primeiro;
    $('btn-veiculo-excluir').parentNode.hidden = !veiculo;
    atualizarFormVeiculo();
    mostrarView('veiculo');
  }

  formVeiculo.addEventListener('submit', function (e) {
    e.preventDefault();
    var dados = valoresFormVeiculo();
    if (!dados.nome) return mostrarErro('veiculo-erro', 'Dê um nome ao veículo.');
    if (Calc.TIPOS_SEM_COMBUSTIVEL.indexOf(dados.tipo) === -1 &&
        (!(parseNum(dados.precoCombustivel) > 0) || !(parseNum(dados.consumoKmL) > 0))) {
      return mostrarErro('veiculo-erro', 'Preencha o preço do combustível e a média de consumo.');
    }
    mostrarErro('veiculo-erro');
    var id = state.editandoVeiculoId;
    var req = id ? api('PUT', '/veiculos/' + id, dados) : api('POST', '/veiculos', dados);
    comBotao(formVeiculo, req)
      .then(function (r) {
        return (id ? Promise.resolve() : selecionarVeiculo(r.veiculo.id, true))
          .then(carregarVeiculos)
          .then(function () {
            toast(id ? 'Veículo atualizado.' : 'Veículo cadastrado.');
            abrirPainel();
          });
      })
      .catch(function (err) { mostrarErro('veiculo-erro', err.message); });
  });

  $('btn-veiculo-cancelar').addEventListener('click', abrirPainel);

  $('btn-veiculo-excluir').addEventListener('click', function () {
    var id = state.editandoVeiculoId;
    if (!id) return;
    if (!confirm('Excluir este veículo? As corridas já registradas continuam no histórico.')) return;
    api('DELETE', '/veiculos/' + id)
      .then(function () { return api('GET', '/auth/me'); })
      .then(function (r) {
        state.usuario = r.usuario;
        return carregarVeiculos();
      })
      .then(function () {
        toast('Veículo excluído.');
        if (!state.veiculos.length) abrirFormVeiculo(null, true);
        else abrirPainel();
      })
      .catch(function (err) { mostrarErro('veiculo-erro', err.message); });
  });

  function selecionarVeiculo(id, silencioso) {
    return api('PUT', '/auth/me/veiculo-ativo', { veiculoId: id }).then(function (r) {
      state.usuario = r.usuario;
      if (!silencioso) {
        renderVeiculo();
        avaliar();
      }
    });
  }

  function abrirPainel() {
    mostrarView('painel');
    $('user-nome').textContent = state.usuario.nome;
    renderVeiculo();
    renderCfg();
    renderApps();
    avaliar();
    carregarHistorico();
  }

  function renderVeiculo() {
    var v = veiculoAtivo();
    if (!v) return;
    $('vs-icon').textContent = ICONES[v.tipo] || '🚗';
    $('vs-name').textContent = v.nome;
    $('vs-cost').textContent = 'custo ' + fmtBRL(v.custoKm.total) + '/km';
    renderMenuVeiculos();
  }

  var LAPIS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

  function renderMenuVeiculos() {
    var ativo = veiculoAtivo();
    var html = state.veiculos.map(function (v) {
      var sub = v.tipo === 'bicicleta' ? 'bicicleta' : v.tipo + ' · ' + v.combustivel;
      return '<div class="vm-item' + (ativo && v.id === ativo.id ? ' active' : '') + '">' +
        '<button class="vm-main" role="menuitem" data-selecionar="' + v.id + '">' +
          '<span class="vm-icon">' + (ICONES[v.tipo] || '') + '</span>' +
          '<span class="vm-txt"><span class="vm-name">' + esc(v.nome) + '</span>' +
          '<span class="vm-sub">' + esc(sub) + ' · ' + fmtBRL(v.custoKm.total) + '/km</span></span>' +
        '</button>' +
        '<button class="vm-edit" data-editar="' + v.id + '" aria-label="Editar ' + esc(v.nome) + '" title="Editar custo operacional">' + LAPIS + '</button>' +
      '</div>';
    }).join('');
    html += '<button class="vm-add" data-novo="1">+ ADICIONAR VEÍCULO</button>';
    $('vehicle-menu').innerHTML = html;
  }

  function toggleMenu(abrir) {
    var menu = $('vehicle-menu');
    var aberto = abrir === undefined ? menu.hidden : abrir;
    menu.hidden = !aberto;
    $('vehicle-switch').setAttribute('aria-expanded', String(aberto));
  }

  $('vehicle-switch').addEventListener('click', function (e) {
    e.stopPropagation();
    toggleMenu();
  });
  document.addEventListener('click', function (e) {
    if (!$('vehicle-menu').hidden && !$('vehicle-menu').contains(e.target)) toggleMenu(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') toggleMenu(false);
  });

  $('vehicle-menu').addEventListener('click', function (e) {
    var alvo = e.target.closest('button');
    if (!alvo) return;
    toggleMenu(false);
    if (alvo.hasAttribute('data-novo')) return abrirFormVeiculo(null, false);
    var editar = alvo.getAttribute('data-editar');
    if (editar) return abrirFormVeiculo(buscarVeiculo(+editar), false);
    var sel = alvo.getAttribute('data-selecionar');
    if (sel) {
      selecionarVeiculo(+sel).then(function () {
        toast('Veículo ativo: ' + veiculoAtivo().nome);
      }).catch(function (err) { toast(err.message, true); });
    }
  });

  function buscarVeiculo(id) {
    return state.veiculos.filter(function (v) { return v.id === id; })[0];
  }

  $('btn-editar-veiculo').addEventListener('click', function () {
    var v = veiculoAtivo();
    if (v) abrirFormVeiculo(v, false);
  });

  function renderApps() {
    $('app-chips').innerHTML = APPS.map(function (a) {
      return '<button class="chip" data-app="' + a.id + '" aria-pressed="' + (a.id === state.appAtual) + '">' + a.nome + '</button>';
    }).join('');
  }
  $('app-chips').addEventListener('click', function (e) {
    var b = e.target.closest('[data-app]');
    if (!b) return;
    state.appAtual = b.getAttribute('data-app');
    renderApps();
  });

  var campos = ['in-km', 'in-valor', 'in-tempo', 'in-km-coleta', 'in-tempo-coleta'];
  campos.forEach(function (id) { $(id).addEventListener('input', avaliar); });

  function setBulb(cor) {
    $('bulb-red').classList.toggle('on', cor === 'red');
    $('bulb-amber').classList.toggle('on', cor === 'amber');
    $('bulb-green').classList.toggle('on', cor === 'green');
  }

  var ROTULOS = {
    green: 'Compensa. Vai!',
    amber: 'No limite — avalie bem',
    red: 'Não compensa'
  };

  function avaliar() {
    var v = veiculoAtivo();
    var r = v && state.usuario ? Calc.avaliarCorrida({
      km: $('in-km').value,
      valor: $('in-valor').value,
      tempo: $('in-tempo').value,
      kmColeta: $('in-km-coleta').value,
      tempoColeta: $('in-tempo-coleta').value
    }, v.custoKm.total, state.usuario.cfg) : null;

    state.corrida = r;
    var vt = $('verdict-text');
    if (!r) {
      setBulb(null);
      vt.className = 'verdict-text idle';
      vt.textContent = 'Preencha os dados da corrida';
      ['out-lucro', 'out-kmrate', 'out-hrate'].forEach(function (id) {
        $(id).textContent = '--';
        $(id).classList.remove('neg');
      });
      $('out-custo').textContent = v ? 'custo do veículo: ' + fmtBRL(v.custoKm.total) + '/km' : '';
      $('btn-register').disabled = true;
      $('btn-decline').disabled = true;
      return;
    }
    setBulb(r.veredito);
    vt.className = 'verdict-text ' + r.veredito;
    vt.textContent = ROTULOS[r.veredito];
    $('out-lucro').textContent = fmtN(r.lucro, 2);
    $('out-kmrate').textContent = fmtN(r.lucroKm, 2);
    $('out-hrate').textContent = fmtN(r.lucroH, 2);
    ['out-lucro', 'out-kmrate', 'out-hrate'].forEach(function (id) {
      $(id).classList.toggle('neg', r.lucro < 0);
    });
    $('out-custo').textContent = 'custo ' + fmtBRL(r.custo) + ' = ' + fmtN(r.kmTotal, 1) + ' km × ' + fmtBRL(r.custoKm);
    $('btn-register').disabled = false;
    $('btn-decline').disabled = false;
  }

  function limparCampos() {
    campos.forEach(function (id) { $(id).value = ''; });
    avaliar();
  }
  $('btn-clear').addEventListener('click', function () {
    limparCampos();
    $('in-km').focus();
  });

  function registrar(status) {
    var v = veiculoAtivo();
    if (!state.corrida || !v) return;
    $('btn-register').disabled = true;
    $('btn-decline').disabled = true;
    api('POST', '/corridas', {
      veiculoId: v.id,
      app: state.appAtual,
      km: $('in-km').value,
      valor: $('in-valor').value,
      tempo: $('in-tempo').value,
      kmColeta: $('in-km-coleta').value,
      tempoColeta: $('in-tempo-coleta').value,
      status: status
    }).then(function () {
      limparCampos();
      toast(status === 'aceita' ? 'Corrida registrada.' : 'Corrida recusada anotada.');
      return carregarHistorico();
    }).catch(function (err) {
      avaliar();
      toast(err.message, true);
    });
  }
  $('btn-register').addEventListener('click', function () { registrar('aceita'); });
  $('btn-decline').addEventListener('click', function () { registrar('recusada'); });

  function carregarHistorico() {
    return Promise.all([api('GET', '/dias'), api('GET', '/corridas?limite=200')])
      .then(function (r) {
        renderDias(r[0]);
        renderCorridas(r[1].corridas);
      })
      .catch(function (err) { toast(err.message, true); });
  }

  function renderDias(d) {
    $('day-lucro').textContent = fmtBRL(d.hoje.lucro);
    $('day-ganho').textContent = fmtBRL(d.hoje.ganho);
    $('day-km').textContent = fmtN(d.hoje.km, 1);
    $('day-media').textContent = d.hoje.km > 0 ? fmtN(d.hoje.lucro / d.hoje.km, 2) : '--';

    $('week-lucro').textContent = fmtBRL(d.semana.lucro);
    $('week-km').textContent = fmtN(d.semana.km, 1);
    $('week-media').textContent = d.semana.km > 0 ? fmtN(d.semana.lucro / d.semana.km, 2) : '--';

    if (!d.dias.length) {
      $('days-list').innerHTML = '<div class="history-empty">Nenhum dia salvo ainda</div>';
      return;
    }
    $('days-list').innerHTML = d.dias.map(function (dia) {
      var media = dia.km > 0 ? fmtN(dia.lucro / dia.km, 2) : '--';
      return '<div class="hrow" style="grid-template-columns:1fr auto;">' +
        '<div class="info">' +
          '<div class="line1">' + fmtData(dia.data) + '</div>' +
          '<div class="line2">' + dia.corridas + ' corridas · ' + fmtN(dia.km, 1) + ' km · bruto ' + fmtBRL(dia.ganho) + ' · líq. R$/km ' + media + '</div>' +
        '</div>' +
        '<div class="status aceita">' + fmtBRL(dia.lucro) + '</div>' +
      '</div>';
    }).join('');
  }

  function renderCorridas(lista) {
    if (!lista.length) {
      $('history-list').innerHTML = '<div class="history-empty">Nenhuma corrida registrada ainda</div>';
      return;
    }
    $('history-list').innerHTML = lista.map(function (c) {
      var km = c.km + c.kmColeta;
      return '<div class="hrow">' +
        '<div class="dot ' + c.veredito + '"></div>' +
        '<div class="info">' +
          '<div class="line1"><span class="app-tag">' + esc(NOME_APP[c.app] || c.app) + '</span>' +
            fmtBRL(c.valor) + ' · ' + fmtN(km, 1) + ' km · líq. ' + fmtBRL(c.lucro) + '</div>' +
          '<div class="line2">' + fmtHora(c.criadoEm) + (c.veiculoNome ? ' · ' + esc(c.veiculoNome) : '') +
            ' · R$/km ' + fmtN(c.lucroKm, 2) + ' · R$/h ' + fmtN(c.lucroH, 2) + '</div>' +
        '</div>' +
        '<div class="status ' + c.status + '">' + (c.status === 'aceita' ? 'ACEITA' : 'RECUSADA') + '</div>' +
      '</div>';
    }).join('');
  }

  $('btn-reset-day').addEventListener('click', function () {
    if (!confirm('Salvar o dia de hoje no histórico e zerar o painel "Hoje"?')) return;
    api('POST', '/dias/fechar')
      .then(function () { toast('Dia salvo no histórico.'); return carregarHistorico(); })
      .catch(function (err) { toast(err.message, true); });
  });

  $('btn-clear-history').addEventListener('click', function () {
    if (!confirm('Apagar o histórico de corridas? As corridas aceitas de hoje continuam contando no painel "Hoje".')) return;
    api('DELETE', '/corridas')
      .then(function () { toast('Histórico apagado.'); return carregarHistorico(); })
      .catch(function (err) { toast(err.message, true); });
  });

  $('gear').addEventListener('click', function () {
    var aberto = $('settings').classList.toggle('open');
    $('gear').setAttribute('aria-expanded', String(aberto));
  });

  var CFG_CAMPOS = { amberKm: 'cfg-amber-km', greenKm: 'cfg-green-km', amberH: 'cfg-amber-h', greenH: 'cfg-green-h' };

  function renderCfg() {
    Object.keys(CFG_CAMPOS).forEach(function (k) {
      $(CFG_CAMPOS[k]).value = fmtInput(state.usuario.cfg[k]);
    });
  }

  Object.keys(CFG_CAMPOS).forEach(function (k) {
    $(CFG_CAMPOS[k]).addEventListener('change', function () {
      var cfg = {};
      Object.keys(CFG_CAMPOS).forEach(function (c) {
        var n = parseNum($(CFG_CAMPOS[c]).value);
        cfg[c] = n > 0 ? n : state.usuario.cfg[c];
      });
      api('PUT', '/auth/me/config', cfg)
        .then(function (r) {
          state.usuario = r.usuario;
          renderCfg();
          avaliar();
        })
        .catch(function (err) { toast(err.message, true); renderCfg(); });
    });
  });

  function iniciar() {
    state.token = lerToken();
    if (!state.token) return mostrarAuth('login');
    api('GET', '/auth/me')
      .then(function (r) {
        state.usuario = r.usuario;
        return carregarVeiculos();
      })
      .then(function () {
        if (!state.veiculos.length) abrirFormVeiculo(null, true);
        else abrirPainel();
      })
      .catch(function () {
        if (state.token) sair();
      });
  }

  iniciar();
})();
