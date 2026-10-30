-- Vale a Corrida — schema MySQL 8
-- Rodado automaticamente por `npm run db:init` (e na subida do servidor).
-- Todos os CREATE usam IF NOT EXISTS, então pode rodar quantas vezes quiser.

CREATE TABLE IF NOT EXISTS usuarios (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome             VARCHAR(80)  NOT NULL,
  usuario          VARCHAR(40)  NOT NULL,
  senha_hash       CHAR(60)     NOT NULL,             -- hash bcrypt (sempre 60 caracteres)
  -- Critérios do semáforo, aplicados sobre o LUCRO LÍQUIDO
  cfg_amber_km     DECIMAL(8,2) NOT NULL DEFAULT 1.20, -- R$/km mínimo p/ amarelo
  cfg_green_km     DECIMAL(8,2) NOT NULL DEFAULT 1.60, -- R$/km mínimo p/ verde
  cfg_amber_h      DECIMAL(8,2) NOT NULL DEFAULT 15.00,-- R$/h  mínimo p/ amarelo
  cfg_green_h      DECIMAL(8,2) NOT NULL DEFAULT 22.00,-- R$/h  mínimo p/ verde
  veiculo_ativo_id INT UNSIGNED NULL,
  criado_em        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_usuarios_usuario (usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS veiculos (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id         INT UNSIGNED NOT NULL,
  nome               VARCHAR(60)  NOT NULL,           -- ex: "Onix", "CG 160"
  tipo               ENUM('carro','moto','bicicleta') NOT NULL,
  combustivel        ENUM('gasolina','etanol','diesel','gnv','eletrico','nenhum') NOT NULL,
  preco_combustivel  DECIMAL(8,3)  NULL,              -- R$/L (R$/m³ no GNV, R$/kWh no elétrico)
  consumo_km_l       DECIMAL(8,2)  NULL,              -- km/L (km/m³ no GNV, km/kWh no elétrico)
  -- Custos extras opcionais: valor gasto ÷ km do período
  manut_valor        DECIMAL(10,2) NULL,  manut_km  INT UNSIGNED NULL, -- manutenção preventiva ÷ km entre trocas
  pneus_valor        DECIMAL(10,2) NULL,  pneus_km  INT UNSIGNED NULL, -- jogo de pneus ÷ km de vida útil
  seguro_valor       DECIMAL(10,2) NULL,  seguro_km INT UNSIGNED NULL, -- seguro ÷ km rodados no período
  ipva_valor         DECIMAL(10,2) NULL,  ipva_km   INT UNSIGNED NULL, -- IPVA+licenciamento anual ÷ km no ano
  criado_em          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_veiculos_usuario (usuario_id),
  CONSTRAINT fk_veiculos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dias fechados ("salvar dia"). Uma linha por usuário por data.
CREATE TABLE IF NOT EXISTS dias (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED  NOT NULL,
  data        DATE          NOT NULL,
  ganho       DECIMAL(10,2) NOT NULL DEFAULT 0,  -- soma bruta das corridas aceitas
  custo       DECIMAL(10,2) NOT NULL DEFAULT 0,  -- custo operacional estimado
  lucro       DECIMAL(10,2) NOT NULL DEFAULT 0,  -- ganho - custo
  km          DECIMAL(10,2) NOT NULL DEFAULT 0,
  minutos     INT UNSIGNED  NOT NULL DEFAULT 0,
  corridas    INT UNSIGNED  NOT NULL DEFAULT 0,
  UNIQUE KEY uq_dias_usuario_data (usuario_id, data),
  CONSTRAINT fk_dias_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS corridas (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id    INT UNSIGNED  NOT NULL,
  veiculo_id    INT UNSIGNED  NULL,              -- NULL se o veículo for excluído depois
  dia_id        INT UNSIGNED  NULL,              -- NULL = dia ainda aberto ("Hoje")
  app           VARCHAR(30)   NOT NULL,          -- ifood, uber, 99, rappi, lalamove, loggi, outro
  data          DATE          NOT NULL,
  km            DECIMAL(8,2)  NOT NULL,          -- distância da corrida/entrega
  km_coleta     DECIMAL(8,2)  NOT NULL DEFAULT 0,-- deslocamento até a coleta/passageiro
  tempo_min     DECIMAL(8,1)  NOT NULL,
  tempo_coleta  DECIMAL(8,1)  NOT NULL DEFAULT 0,
  valor         DECIMAL(10,2) NOT NULL,          -- valor oferecido pelo app (bruto)
  custo_km      DECIMAL(8,4)  NOT NULL,          -- custo/km do veículo NO MOMENTO da corrida (snapshot)
  custo         DECIMAL(10,2) NOT NULL,
  lucro         DECIMAL(10,2) NOT NULL,
  lucro_km      DECIMAL(10,2) NOT NULL,
  lucro_h       DECIMAL(10,2) NOT NULL,
  veredito      ENUM('green','amber','red') NOT NULL,
  status        ENUM('aceita','recusada')   NOT NULL,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_corridas_usuario_data (usuario_id, data),
  KEY idx_corridas_dia (dia_id),
  CONSTRAINT fk_corridas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_corridas_veiculo FOREIGN KEY (veiculo_id) REFERENCES veiculos(id) ON DELETE SET NULL,
  CONSTRAINT fk_corridas_dia     FOREIGN KEY (dia_id)     REFERENCES dias(id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
