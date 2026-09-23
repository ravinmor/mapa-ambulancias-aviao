-- As colunas DateTime do Prisma mapeiam para "timestamp" (sem timezone) no
-- Postgres. O driver grava os digitos em UTC, mas sem timezone marcado na
-- coluna, o Postgres interpreta esses digitos usando o TimeZone da sessao
-- ao comparar/exibir (ex: NOW() - coluna). No Postgres portatil (fora do
-- Docker), o initdb herdou o fuso do Windows (America/Sao_Paulo) --
-- resultado: datas gravadas em UTC eram lidas como se already fossem hora
-- local, aparentando estar ~3h no futuro (bug encontrado 2026-08-27,
-- investigando por que a posicao das vans parecia nao atualizar).
--
-- O Postgres do Docker (postgres:16-alpine) ja vem em UTC por padrao sem
-- essa migration -- ela e um no-op inofensivo nesse caso.
--
-- CORRIGIDO 2026-09-21: o nome do banco era hardcoded como "vehicles"
-- (nome do banco local antigo) -- quebrava em qualquer banco com nome
-- diferente (ex: "resgate"). ALTER DATABASE exige nome literal, nao aceita
-- funcao direto, entao usa EXECUTE dinamico com current_database() pra
-- funcionar em qualquer banco onde a migration for aplicada.
DO $$
BEGIN
  EXECUTE 'ALTER DATABASE ' || quote_ident(current_database()) || ' SET timezone TO ''UTC''';
END $$;
