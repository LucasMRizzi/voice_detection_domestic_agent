# Detecção de comandos de voz para automação doméstica

Projeto acadêmico de reconhecimento de comandos de voz curtos em português para controle de dispositivos domésticos (luz, ventilador e cortina). O repositório reúne o formulário usado para coletar as gravações e os notebooks de preparação dos dados e treinamento dos modelos.

> AJUDE NA COLETA DE DADOS SENDO UM VOLUNTÁRIO:
https://coletadevoz.lucas-m-rizzi.workers.dev/

Os comandos reconhecidos são:

| Dispositivo | Comandos |
|---|---|
| Luz | Acender a luz · Apagar a luz |
| Ventilador | Ligar o ventilador · Desligar o ventilador |
| Cortina | Abrir a cortina · Fechar a cortina |

## Estrutura

```
.
├── formulario_coleta/   # site estático para gravação das vozes dos voluntários
└── notebooks/           # processamento dos dados e treinamento dos modelos
```

## Formulário de coleta

`formulario_coleta/` contém um site estático (HTML, CSS e JavaScript puros, sem build) em que cada voluntário informa nome, sexo e idade, aceita o termo de consentimento e grava as seis frases duas vezes, totalizando 12 áudios por participante.

As gravações vão para um bucket privado no Supabase, e os metadados ficam em tabelas protegidas por políticas RLS. Cada participante acessa apenas a própria participação. O site pode ser publicado gratuitamente na Cloudflare Pages.

As instruções de configuração, publicação, o esquema do banco e as regras de recuperação de gravações estão em [`formulario_coleta/README.md`](formulario_coleta/README.md).

## Notebooks

Os notebooks foram feitos para rodar no Google Colab, com os dados guardados no Google Drive.

- **`voice_data_processing.ipynb`**: monta o dataset.
  - Exporta as gravações do Supabase, converte para WAV mono 16 kHz e gera `dados/metadata.csv`. Exige `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` nos segredos do Colab ou em variáveis de ambiente.
  - Adiciona exemplos negativos (falas fora do escopo) do Common Voice pt-BR, com frases que lembram os comandos removidas e um limite de clipes por locutor.
  - Baixa os ruídos do [MUSAN](http://www.openslr.org/17/) usados na aumentação.
  - Compacta a pasta `dados/` no Drive.
- **`voice_detection_M2_baseline.ipynb`**: treina o modelo de referência (baseline).
  - Padroniza os áudios em 2 s, divide os dados por locutor (60% treino, 20% validação, 20% teste) e adiciona ruído com SNR de 20, 10 e 0 dB.
  - Extrai estatísticas de MFCC e treina uma regressão logística, com um limiar de rejeição escolhido na validação para recusar falas que não são comandos.
  - Avalia por F1 macro, taxa de falsa aceitação e taxa de falsa rejeição em cada condição de ruído.

Estrutura esperada dos dados pelos notebooks:

```
dados/
  ├── metadata.csv     # uma linha por áudio original
  ├── audios/          # áudios em WAV mono 16 kHz
  └── musan/noise/     # ruídos do MUSAN
```

## Dados e sigilo

> ⚠️ **Os dados coletados são sigilosos e não fazem parte deste repositório.**

As gravações de voz e os dados pessoais dos voluntários (nome, sexo e idade) foram coletados com consentimento apenas para **uso acadêmico restrito à equipe do projeto, sem publicação**. Por isso:

- nenhum áudio, `metadata.csv` ou exportação do banco deve ser incluído no repositório, compartilhado ou publicado;
- os dados ficam somente no Supabase (Storage privado) e no Drive da equipe;
- as chaves do Supabase, principalmente a `service_role`, nunca devem ser commitadas nem colocadas no frontend;
- os notebooks devem ser salvos sem saídas que exponham dados dos participantes.

Os conjuntos públicos usados como complemento (Common Voice e MUSAN) devem ser baixados das fontes originais e seguem as próprias licenças.

## Licença

O código está sob a licença [MIT](LICENSE). A licença não se aplica aos dados coletados.
