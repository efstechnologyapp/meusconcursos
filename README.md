# Meus Concursos

App simples para organizar os concursos que vou fazer: data e horário da prova, local, instruções gerais, transporte, hospedagem e link do edital, com contagem regressiva até cada prova.

## Login

O app abre numa tela de login com Google. No primeiro acesso em cada aparelho, um código de 6 dígitos é enviado ao e-mail da conta e precisa ser digitado para liberar a tela inicial. Depois do login, os concursos e anexos são sincronizados automaticamente entre todos os aparelhos da conta (Google Drive, via Apps Script). Para ativar, siga **CONFIGURAR-LOGIN.md** (Google Cloud + Apps Script, gratuitos) e preencha o `config.js`.

## Como usar

- Acesse o link do GitHub Pages deste repositório no Chrome.
- Clique no ícone de instalar na barra de endereço (ou menu ⋮ → **Transmitir, salvar e compartilhar → Instalar página como app**).
- No celular: menu ⋮ → **Adicionar à tela inicial**.

## Vagas

O app lê o quadro de vagas do edital para o cargo escolhido (tabela por cargo, tabela por categoria ou texto corrido) e mostra o total, a ampla concorrência, as vagas para pessoas com deficiência, negros, indígenas e quilombolas e se há cadastro de reserva (CR). Aparece no cartão, nos detalhes e no formulário (seção Tipo de cargo), onde pode ser corrigido.

## Fases por tipo de cargo

No cadastro, escolha o tipo de cargo e o formulário monta as fases daquela carreira (Delegado, Juiz, Promotor, Analista/Técnico ou Outro). Cada fase tem data, horário, horário de fechamento dos portões, local, caráter e situação (aguardando, aprovado, reprovado). Dá para renomear, apagar e acrescentar fases.

## O que cada fase guarda

- Data, horário de início e de término e fechamento dos portões.
- Local de prova: informado na própria fase. Fases no mesmo dia ou no dia seguinte usam o mesmo local; com intervalo de 2 dias ou mais (ou fase ainda sem data), abre um campo de local novo.
- Composição da prova: total de questões objetivas e os blocos/grupos com as disciplinas; nas provas escritas, a quantidade de questões, o tipo e o máximo de linhas.
- Resultado: acertos (com aproveitamento), nota e classificação. Ao juntar o PDF do resultado, o app procura seu nº de inscrição (campo que aparece quando a situação passa a "Inscrição homologada") e preenche nota e classificação.

- Fases no mesmo dia aparecem unificadas: data e local uma vez só, e o que é específico de cada prova (nome, situação, caráter, composição, resultado, observações) em destaque logo abaixo. Se começam no mesmo horário, os horários também são comuns; se são em turnos diferentes (ex.: objetiva de manhã e discursiva à tarde), cada prova mostra seu turno, início, término e fechamento dos portões.

## Transporte e hospedagem

Ficam fora do formulário do concurso. Ao abrir o concurso na tela inicial, cada viagem (fases no mesmo local: mesmo dia ou dia seguinte) tem três ícones ao lado das fases:

- **Livro com caneta (local de prova):** nome do local, endereço com preenchimento pelo CEP e sala/bloco. Vale para todas as fases da viagem.

- **Avião (transporte):** escolha avião ou carro. No carro, data, horário e locais de ida e de volta. No avião, a ida e a volta são montadas por trechos, como no Google Voos: cada trecho tem cia aérea, nº do voo, aeroportos e horários de partida e chegada; **+ Conexão** acrescenta o trecho seguinte, já partindo do aeroporto de chegada do anterior. O app mostra o resumo (ex.: "FOR 06:10 → MCP 13:15 · 1 parada: conexão de 1h35 em BSB (troca para LATAM)") e o localizador. As datas já vêm sugeridas (dia anterior à primeira prova e dia seguinte à última).
- **Hotel (hospedagem):** nome, endereço com preenchimento pelo CEP (ViaCEP), check-in e check-out (data e horário), plataforma, código da reserva e responsável. O botão **Preencher com print ou PDF da reserva** lê a confirmação (Booking, Airbnb, Hoteis.com, e-mail…) e preenche o que encontrar, destacando os campos para conferência. Há um link para abrir o endereço no mapa e um botão **Copiar endereço** (também no local de prova), para colar no Uber.

**Deslocamentos:** com o voo (aeroporto de chegada), a hospedagem e o local de prova preenchidos, o app mostra a distância e o tempo de carro do aeroporto até a hospedagem e da hospedagem até o local de prova, além do horário sugerido de saída em cada dia de prova (trajeto + 30 min de folga antes dos portões). Os endereços são localizados no OpenStreetMap (Nominatim) e a rota é calculada pelo OSRM, gratuitos e sem trânsito em tempo real; os links **Trânsito agora (Google Maps)**, **Waze** e **Pedir Uber** abrem a rota com o trânsito do momento.

## Preencher com o edital

Ao cadastrar um concurso, clique em **Preencher com o edital (PDF)** e escolha o arquivo do edital. O app lê o texto no próprio navegador e identifica o tipo de cargo, monta as fases e tenta preencher concurso, cargo, banca, datas e horários das fases, fechamento dos portões, cidade e instruções gerais. Quando o edital não traz a data de uma fase (prova oral, inscrição definitiva etc.), o app guarda a regra do edital nas observações da fase. Os portões são preenchidos pelo horário informado ou calculados pela regra geral do edital (ex.: fecham 30 minutos antes do início). Para completar as datas depois, abra o concurso, clique em Editar e envie o edital de convocação: o app preenche só o que estiver vazio. Os campos preenchidos ficam destacados para conferência. PDFs escaneados (imagem) não funcionam.

## Editais complementares

Junte retificações, editais de convocação, listas de inscrições homologadas e resultados no campo **Editais complementares**. Nas listas, o app procura você pelo nome da conta Google ou pelo nº de inscrição: na de homologação, preenche o nº de inscrição e a situação; no resultado, marca a fase como aprovada (ou reprovada, se você não constar na lista de habilitados) e preenche nota, acertos e classificação na sua lista (ex.: ampla concorrência). O app atualiza datas, horários, portões e composição das fases conforme o novo edital, destaca o que mudou e guarda a lista de alterações de cada edital.

## Situação e boleto

A situação segue a ordem: pendente de inscrição → pendente de pagamento → pagamento realizado, aguardando homologação → inscrição homologada, aguardando local de prova → local de prova divulgado. Em **Pendente de pagamento**, anexe o boleto em PDF ou em imagem (print ou foto; a imagem é lida por reconhecimento de texto no navegador): o app mostra o vencimento e o valor e deixa a linha digitável pronta para copiar e colar no app do banco.

## Dados

Os concursos ficam salvos no navegador e sincronizados com a nuvem da conta. O edital e o boleto anexados ficam guardados no navegador (IndexedDB) e não entram no arquivo de backup. Use **Fazer backup** para baixar uma cópia em `.json` e **Restaurar backup** para recuperar ou levar para outro aparelho.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | O app inteiro (tela, estilo e lógica) |
| `manifest.json` | Nome, cores e ícones para o Chrome instalar como app |
| `edital.js` | Lê o PDF do edital e encontra os dados da prova |
| `boleto.js` | Lê o boleto em PDF (linha digitável, vencimento e valor) |
| `viagem.js` | Transporte (voos com conexões ou carro) e hospedagem de cada viagem |
| `config.js` | ID do cliente Google e URL do Apps Script (preencher) |
| `apps-script/Codigo.gs` | Servidor que envia e confere o código por e-mail (colar no Apps Script) |
| `CONFIGURAR-LOGIN.md` | Passo a passo para ativar o login |
| `sw.js` | Permite abrir o app sem internet |
| `icon-192.png`, `icon-512.png` | Ícones do app |
