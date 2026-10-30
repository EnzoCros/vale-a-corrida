const path = require('path');
const fs = require('fs');
const { chromium, devices } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const PASTA = path.join(__dirname, '..', 'evidencias');
const USUARIO = 'joao.' + String(Date.now()).slice(-5);
const SENHA = 'entrega123';

async function print(page, nome, opts = {}) {
  await page.waitForTimeout(350);
  const arquivo = path.join(PASTA, nome);
  await page.screenshot({ path: arquivo, fullPage: !!opts.fullPage });
  console.log('  ✓ ' + path.relative(process.cwd(), arquivo));
}

async function preencher(page, campos) {
  for (const [seletor, valor] of Object.entries(campos)) {
    await page.fill(seletor, valor);
  }
}

(async () => {
  fs.mkdirSync(PASTA, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: { width: 390, height: 844 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  const page = await context.newPage();
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => console.error('Erro na página:', e.message));

  console.log('Gerando evidências em ' + BASE_URL + ' (usuário ' + USUARIO + ')');

  await page.goto(BASE_URL);
  await page.waitForSelector('#view-auth:not([hidden])');
  await print(page, '02-tela-login.png');

  await page.click('[data-auth="cadastro"]');
  await preencher(page, {
    '#cad-nome': 'João Entregador',
    '#cad-usuario': USUARIO,
    '#cad-senha': SENHA,
    '#cad-senha2': SENHA,
  });
  await print(page, '03-tela-cadastro-usuario.png');

  await page.click('#form-cadastro button[type="submit"]');
  await page.waitForSelector('#view-veiculo:not([hidden])');
  await print(page, '04-primeiro-acesso-leva-ao-cadastro-de-veiculo.png');

  await preencher(page, {
    '#v-nome': 'Onix 1.0',
    '#v-preco': '5,89',
    '#v-consumo': '12,5',
  });
  await page.click('#extras summary');
  await preencher(page, {
    '#v-manut-valor': '350,00',
    '#v-manut-km': '10.000',
    '#v-pneus-valor': '1.600,00',
    '#v-pneus-km': '40.000',
    '#v-seguro-valor': '2.400,00',
    '#v-seguro-km': '30.000',
    '#v-ipva-valor': '1.800,00',
    '#v-ipva-km': '30.000',
  });
  await print(page, '05-cadastro-veiculo-custo-operacional.png', { fullPage: true });

  await page.click('#btn-veiculo-salvar');
  await page.waitForSelector('#view-painel:not([hidden])');
  await page.waitForSelector('#toast', { state: 'hidden', timeout: 5000 });

  await preencher(page, { '#in-km': '8,5', '#in-valor': '21,90', '#in-tempo': '24' });
  await print(page, '01-campos-decimais-com-virgula.png');
  await print(page, '10-painel-principal-corrida-calculada.png', { fullPage: true });

  await page.click('#btn-register');
  await page.waitForSelector('#history-list .hrow');

  await page.click('#vehicle-switch');
  await page.click('.vm-add');
  await page.waitForSelector('#view-veiculo:not([hidden])');
  await page.click('label[for="v-tipo-moto"]');
  await preencher(page, { '#v-nome': 'CG 160', '#v-preco': '5,89', '#v-consumo': '38' });
  await page.click('#extras summary');
  await preencher(page, { '#v-manut-valor': '180', '#v-manut-km': '3.000', '#v-pneus-valor': '450', '#v-pneus-km': '15.000' });
  await page.click('#btn-veiculo-salvar');
  await page.waitForSelector('#view-painel:not([hidden])');
  await page.waitForSelector('#toast', { state: 'hidden', timeout: 5000 });

  await page.click('#vehicle-switch');
  await page.waitForSelector('#vehicle-menu:not([hidden])');
  await print(page, '06-seletor-multiplos-veiculos.png');

  await page.click('#vehicle-switch');
  await page.click('#btn-editar-veiculo');
  await page.waitForSelector('#view-veiculo:not([hidden])');
  await print(page, '07-editar-veiculo-pelo-lapis.png', { fullPage: true });
  await page.click('#btn-veiculo-cancelar');
  await page.waitForSelector('#view-painel:not([hidden])');

  await page.click('[data-app="uber"]');
  await preencher(page, {
    '#in-km': '6,2', '#in-valor': '14,50', '#in-tempo': '18',
    '#in-km-coleta': '1,8', '#in-tempo-coleta': '6',
  });
  await print(page, '09-corrida-uber-com-deslocamento-ate-coleta.png');
  await page.click('#btn-register');
  await page.waitForSelector('#history-list .hrow:nth-child(2)');

  await page.click('[data-app="99"]');
  await preencher(page, { '#in-km': '12', '#in-valor': '11', '#in-tempo': '30' });
  await page.click('#btn-decline');
  await page.waitForSelector('#history-list .hrow:nth-child(3)');

  await page.click('#btn-reset-day');
  await page.waitForSelector('#days-list .hrow');

  await page.click('#vehicle-switch');
  await page.click('#vehicle-menu .vm-main:has-text("Onix 1.0")');
  await page.waitForFunction(() => document.getElementById('vs-name').textContent === 'Onix 1.0');
  await page.click('[data-app="ifood"]');
  await preencher(page, { '#in-km': '4,3', '#in-valor': '12,00', '#in-tempo': '15' });
  await page.click('#btn-register');
  await page.waitForSelector('#history-list .hrow:nth-child(4)');

  await page.click('#btn-sair');
  await page.waitForSelector('#view-auth:not([hidden])');
  await preencher(page, { '#login-usuario': USUARIO, '#login-senha': SENHA });
  await page.click('#form-login button[type="submit"]');
  await page.waitForSelector('#view-painel:not([hidden])');
  await page.waitForSelector('#days-list .hrow');
  await page.waitForSelector('#toast', { state: 'hidden', timeout: 5000 }).catch(() => {});
  await print(page, '08-historico-persistido-no-banco.png', { fullPage: true });

  await browser.close();
  console.log('Pronto.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
