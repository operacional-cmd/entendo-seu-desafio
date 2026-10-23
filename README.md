# Entendo o seu desafio — Lean Optimus

Formulário público com recebimento de respostas e painel privado da equipe.

- Formulário: `/entendo-o-seu-desafio`
- Painel: `/painel`
- API: `/api/server?action=…`

## Executar verificações

Requer Node.js 22 ou superior. Execute `npm ci`, `npm test` e `npm run build`. O build copia apenas os arquivos públicos para `dist`; o backend é compilado pela Vercel a partir de `api/server.mjs`.

## Configuração na Vercel

O projeto usa Functions em São Paulo (`gru1`) e armazenamento Vercel Blob **privado**. Conecte o store ao projeto para receber `BLOB_STORE_ID` e a autenticação OIDC da Vercel. As credenciais de armazenamento nunca são entregues ao navegador.

Configure `ADMIN_AUTH_CONFIG` como variável **Secret**, somente em Production. O JSON deve conter `salt` (16 bytes em hexadecimal), `hash` (32 bytes em hexadecimal, derivado por `scrypt(password, salt, 32)`) e `secret` (32 bytes aleatórios em hexadecimal). Não guarde a senha ou esse JSON no repositório. A senha inicial foi entregue separadamente à equipe.

Prévia sem configuração de autenticação não recebe nem retorna respostas. Rotacionar `hash` ou `secret` invalida as sessões abertas. A sessão dura até oito horas e usa cookie Secure, HttpOnly e SameSite=Strict.

## Recebimento e acompanhamento

O formulário valida os dados no cliente e no servidor e só confirma o envio depois que a gravação termina. Repetir o mesmo envio não duplica a resposta. As respostas são gravadas como documentos JSON privados. O painel carrega 50 por vez, com busca e filtros sobre os itens carregados.

O painel exige login para consultar respostas, alterar status, adicionar anotações ou excluir registros. Atualizações usam ETag para evitar sobrescrever mudanças simultâneas; operações de escrita exigem origem válida e token CSRF. Tentativas de login e envios têm limites persistentes por janela de 15 minutos. Falhas do armazenamento não liberam o acesso.

Não há respostas anteriores à ativação do recebimento: a versão inicial era uma prévia sem persistência.
