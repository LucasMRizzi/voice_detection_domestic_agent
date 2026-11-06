# Verificação realizada

- Oito testes automatizados de JavaScript passaram: sequência das 12 etapas, duas repetições por frase, retomada, conclusão, validação dos campos, escolha do formato, demonstração e falhas/reenvio de upload.
- O SQL foi executado em PostgreSQL PGlite, com esquemas de teste simulando Auth e Storage do Supabase. Foram verificados: 12 posições por participante, cadastro idempotente, ruído original 0, confirmação somente após upload, isolamento de dados entre duas identidades, bloqueio de caminhos arbitrários, bloqueio de alterações e exclusões, verificação dos metadados e impedimento de acesso sem identidade.
- Cadastro, tela de gravação, pausa e retomada foram conferidos no navegador.
- A integração com o projeto Supabase real e a captação de áudio em dispositivos dos voluntários precisam ser verificadas após preencher config.js. Não foram fornecidas credenciais de um projeto Supabase real.
