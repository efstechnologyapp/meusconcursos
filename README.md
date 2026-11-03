# Meus Concursos

App simples para organizar os concursos que vou fazer: data e horário da prova, local, instruções gerais, hospedagem, transporte e link do edital, com contagem regressiva até cada prova.

## Como usar

- Acesse o link do GitHub Pages deste repositório no Chrome.
- Clique no ícone de instalar na barra de endereço (ou menu ⋮ → **Transmitir, salvar e compartilhar → Instalar página como app**).
- No celular: menu ⋮ → **Adicionar à tela inicial**.

## Fases por tipo de cargo

No cadastro, escolha o tipo de cargo e o formulário monta as fases daquela carreira (Delegado, Juiz, Promotor, Analista/Técnico ou Outro). Cada fase tem data, horário, horário de fechamento dos portões, local, caráter e situação (aguardando, aprovado, reprovado). Dá para renomear, apagar e acrescentar fases.

## Preencher com o edital

Ao cadastrar um concurso, clique em **Preencher com o edital (PDF)** e escolha o arquivo do edital. O app lê o texto no próprio navegador e identifica o tipo de cargo, monta as fases e tenta preencher concurso, cargo, banca, datas e horários das fases, fechamento dos portões, cidade e instruções gerais. Quando o edital não traz a data de uma fase (prova oral, inscrição definitiva etc.), o app guarda a regra do edital nas observações da fase. Os portões são preenchidos pelo horário informado ou calculados pela regra geral do edital (ex.: fecham 30 minutos antes do início). Para completar as datas depois, abra o concurso, clique em Editar e envie o edital de convocação: o app preenche só o que estiver vazio. Os campos preenchidos ficam destacados para conferência. PDFs escaneados (imagem) não funcionam.

## Dados

Os concursos ficam salvos no próprio navegador (localStorage). Use **Fazer backup** para baixar uma cópia em `.json` e **Restaurar backup** para recuperar ou levar para outro aparelho.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | O app inteiro (tela, estilo e lógica) |
| `manifest.json` | Nome, cores e ícones para o Chrome instalar como app |
| `edital.js` | Lê o PDF do edital e encontra os dados da prova |
| `sw.js` | Permite abrir o app sem internet |
| `icon-192.png`, `icon-512.png` | Ícones do app |
