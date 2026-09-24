// Recebe os eventos dos 5 fluxos PA-Resgate-NotificaMissaoAerea* do Power
// Automate (um POST por etapa) e grava/atualiza MissaoAerea no banco
// `resgate`. Sem autenticacao por enquanto (decisao do usuario, 2026-09-24)
// — ver CONTEXTO_SESSAO_2026-09-24_MissaoAerea_Resgate_DB.md.
import express, { Request, Response, NextFunction } from 'express';
import { prismaResgate } from './dbResgate';

const router = express.Router();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// RESGATE_DATABASE_URL pode nao estar configurada ainda em algum ambiente
// (ver dbResgate.ts) — 503 em vez de deixar a rota estourar com "cannot
// read property of null".
function requireResgateDb(req: Request, res: Response, next: NextFunction): void {
  if (!prismaResgate) {
    res.status(503).json({ error: 'RESGATE_DATABASE_URL nao configurada' });
    return;
  }
  next();
}

// Cada um dos 5 fluxos manda um "status" fixo (o mesmo texto usado na
// condicao de disparo do fluxo, ver tabela na Secao 1 do contexto da
// sessao) — mapeado pro campo de timestamp correspondente em MissaoAerea.
const STATUS_TO_FIELD: Record<string, 'criadaAt' | 'saidaBaseAt' | 'chegadaOrigemAt' | 'saidaOrigemAt' | 'chegadaDestinoAt'> = {
  'Missão aérea criada': 'criadaAt',
  'Saída da Base aérea': 'saidaBaseAt',
  'Chegada na origem': 'chegadaOrigemAt',
  'Saída da origem': 'saidaOrigemAt',
  'Chegada no destino final': 'chegadaDestinoAt',
};

router.post(
  '/api/missao-aerea/evento',
  requireResgateDb,
  asyncHandler(async (req, res) => {
    const { solicitacaoId, status, timestamp, operacaoId, aeronaveId } = req.body ?? {};

    const id = Number(solicitacaoId);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'solicitacaoId invalido' });
      return;
    }

    const field = typeof status === 'string' ? STATUS_TO_FIELD[status] : undefined;
    if (!field) {
      res.status(400).json({ error: `status desconhecido: ${status}` });
      return;
    }

    const at = timestamp ? new Date(timestamp) : new Date();
    if (Number.isNaN(at.getTime())) {
      res.status(400).json({ error: 'timestamp invalido' });
      return;
    }

    const data = {
      [field]: at,
      ...(operacaoId != null ? { operacaoId: Number(operacaoId) } : {}),
      ...(aeronaveId != null ? { aeronaveId: Number(aeronaveId) } : {}),
    };

    await prismaResgate!.missaoAerea.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });

    res.status(204).end();
  })
);

export default router;
