# Coleta de voz em português

Formulário estático, sem framework, build, CDN ou dependências de frontend. Nome, sexo e idade; duas rodadas de seis frases; 12 gravações por participante. Os arquivos em `dist/` são o site completo.

## Testar agora

O pacote vem com `demo: true` em `dist/config.js`. A demonstração usa o microfone e percorre as 12 etapas, mas NÃO envia nem persiste nome ou áudios. O aviso aparece em todas as telas. Recarregar descarta o teste.

Sirva a pasta `dist/` por HTTP local (`python3 -m http.server 8000 --directory dist`) e abra http://localhost:8000, ou publique em HTTPS. Abrir `index.html` por duplo clique não funciona de maneira confiável para módulos e microfone.

## Ativar a coleta real no Supabase

1. Crie um projeto Supabase. Execute `database/schema.sql` UMA VEZ no SQL Editor do projeto novo. Ele cria quatro tabelas, três funções, as políticas RLS e o bucket privado `voice-recordings`.
2. Em Authentication, habilite **Anonymous Sign-ins**. O voluntário não precisa cadastrar e-mail ou senha; uma identidade técnica protege sua participação. Não basta liberar acesso ao papel `anon`.
3. Nas configurações de API, copie a URL do projeto e a chave **publishable** (ou chave `anon` legada). Preencha `dist/config.js`:

```js
window.APP_CONFIG = {
  supabaseUrl: "https://SEU-PROJETO.supabase.co",
  supabasePublishableKey: "SUA_CHAVE_PUBLICAVEL",
  demo: false
};
```

Nunca coloque uma chave `service_role` ou secret no frontend. A chave publicável é intencionalmente pública; a proteção está nas políticas SQL e na sessão individual.

4. Confira o texto de consentimento com a equipe, o público da coleta e as regras da instituição; a versão incluída autoriza somente uso acadêmico restrito à equipe, sem publicação. Se mudar o texto, atualize `consent_version` no SQL. O campo idade admite de 1 a 120 anos; este formulário simples não implementa fluxo de autorização de responsável.
5. Teste com dois navegadores diferentes. Um participante não deve acessar os dados do outro. Confirme que 12 objetos e 12 linhas completas aparecem ao terminar. A API permite somente os 12 caminhos reservados por participante e arquivos de até 2 MiB.

## Publicar gratuitamente na Cloudflare Pages

No painel Cloudflare, crie um projeto Pages com **Direct Upload** e envie o CONTEÚDO de `dist/` (ou a pasta dist pela interface). Não envie a pasta inteira do projeto, pois o index.html precisa estar na raiz publicada. A pasta inclui `_headers`, que instrui HTTPS, política do microfone e cache adequado para configuração.

Não há comando de build nem servidor Java. O endereço `https://...pages.dev` abre o formulário; os uploads vão diretamente para seu Supabase. Se publicar por Git, a pasta de saída é `dist`. Depois de editar `config.js`, publique novamente. Não é necessário comprar domínio.

Não divulgue o link de demonstração como coleta real. Em modo real, configuração ausente bloqueia o início; não há fallback silencioso para a demonstração.

## Fluxo e recuperação

- Nome (2–100 caracteres), sexo (inclui "prefiro não informar") e idade inteira são obrigatórios, assim como o consentimento.
- Cada rodada contém exatamente: Acender a luz; Apagar a luz; Ligar o ventilador; Desligar o ventilador; Abrir a cortina; Fechar a cortina.
- A pessoa grava, para, ouve e pode refazer antes do primeiro envio. Limite de 10 segundos, mínimo técnico de 0,5 segundo. Essa checagem não confirma presença de fala; a equipe deve revisar os áudios.
- Só avança após upload E confirmação SQL. Em caso de falha, preserva o áudio na aba e oferece nova tentativa. Após a primeira tentativa, não permite refazer o áudio pendente para impedir troca acidental dos metadados.
- Recarregar recupera as etapas já enviadas, inclusive uploads recebidos antes de uma falha na confirmação. Um áudio ainda não enviado é perdido ao fechar a página. A sessão técnica fica no armazenamento do mesmo navegador; limpar os dados ou mudar de aparelho impede retomar aquela identidade.
- "Pausar participação" mantém o progresso enviado; "Outra pessoa vai participar" abre uma nova identidade depois da conclusão. Em dispositivo compartilhado, use esse botão; nome/sexo/idade não ficam gravados no localStorage.
- Gravação é interrompida ao sair da tela para evitar áudio cortado/gravado em segundo plano.

## Banco de dados

| Tabela | Conteúdo |
|---|---|
| `participants` | Nome, sexo, idade, identidade Auth, consentimento e conclusão |
| `phrases` | Seis frases fixas e seus rótulos |
| `recordings` | Uma linha por áudio, repetição, ruído, arquivo e estado do envio |
| `noise_types` | Catálogo de tipos de ruído |

`recordings.noise_type` é inteiro, NOT NULL e DEFAULT 0. **0 significa original, sem ruído artificial adicionado**, e não ausência absoluta de ruído ambiente. Não representa SNR de 0 dB. `snr_db` é um campo separado, inicialmente NULL.

Ao adicionar ruído no processamento, cadastre seu tipo e crie outra linha com `source_recording_id` apontando para o original. Nunca sobrescreva o áudio original. A interface de coleta só insere originais. As versões aumentadas são gerenciadas pela equipe via script/backend privilegiado. A política de upload do formulário não autoriza o envio dessas versões; use uma credencial administrativa em ambiente protegido para isso.

O índice único impede dois originais da mesma combinação participante + frase + repetição. Existem 12 linhas `pending` desde o cadastro, mas só linhas `complete` representam áudios recebidos. `complete_recording` verifica a presença do arquivo, tamanho e MIME reais antes da conclusão. A duração é informada pelo navegador; valide novamente no processamento.

Os objetos não possuem extensão no caminho; o formato fica no MIME e no banco. Ao baixar, use a extensão correspondente. Preserve o original. Converter para WAV mono/16 kHz para o treinamento exige decodificar e reamostrar; renomear a extensão não converte o áudio.

`database/queries.sql` traz acompanhamento e manifesto. Os áudios ficam em Storage privado; use o painel Supabase ou uma rotina autenticada da equipe para exportar. Separação de treino/validação/teste deve ser por `participant_id`, mantendo versões com ruído e repetições juntas.

## Limites e operação

Antes da coleta, verifique cotas, pausa por inatividade e limites de criação de identidades anônimas do plano escolhido. Teste a quantidade esperada de pessoas no mesmo Wi-Fi; pode haver limites por IP. O formulário não inclui CAPTCHA; habilitar CAPTCHA no Auth exige adaptar o frontend para enviar o token. Exclusão de uma participação deve remover os objetos via Storage API e depois os registros; apagar só a linha SQL não remove o arquivo físico.

## Validação

Execute `node --test tests/*.test.js` para testes de sequência, validação e retomada. A configuração de Supabase precisa ser testada no projeto real antes de convidar voluntários. Não há credenciais incluídas neste pacote.
