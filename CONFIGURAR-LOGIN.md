# Como configurar o login, a confirmação de e-mail e a sincronização

O login usa dois serviços gratuitos do Google:

- **Google Cloud (ID do cliente OAuth)**: mostra o botão "Fazer login com o Google".
- **Google Apps Script**: envia o código de 6 dígitos para o e-mail, confere o código e guarda os concursos de cada usuário no Google Drive, para que apareçam em todos os aparelhos.

Leva uns 15 minutos. Você só faz isso uma vez.

## 1. Criar o ID do cliente no Google Cloud

1. Acesse https://console.cloud.google.com/ e crie um projeto (ou use um existente), por exemplo "Meus Concursos".
2. Menu **APIs e serviços → Tela de permissão OAuth** (ou "Google Auth Platform"):
   - Tipo de usuário: **Externo**.
   - Nome do app: Meus Concursos; e-mail de suporte: o seu.
   - Escopos: não precisa adicionar nada (o login básico usa só e-mail e perfil).
   - Em **Usuários de teste**, adicione o seu e-mail (e de quem mais for usar), enquanto o app estiver em modo de teste.
3. Menu **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**:
   - Tipo de aplicativo: **Aplicativo da Web**.
   - **Origens JavaScript autorizadas**: adicione o endereço do app no GitHub Pages, por exemplo `https://SEU-USUARIO.github.io` (sem barra no final e sem o nome do repositório).
   - Não precisa preencher "URIs de redirecionamento".
4. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`).

## 2. Publicar o Apps Script que envia o código

1. Acesse https://script.google.com/ e clique em **Novo projeto**. Dê o nome "Meus Concursos – Código de acesso".
2. Apague o conteúdo do arquivo `Código.gs` e cole todo o conteúdo de `apps-script/Codigo.gs` (está neste repositório).
3. Clique na engrenagem **Configurações do projeto → Propriedades do script → Adicionar propriedade**:
   - Propriedade: `GOOGLE_CLIENT_ID`
   - Valor: o ID do cliente copiado no passo 1.
4. Volte ao editor, escolha a função **autorizar** no menu de funções e clique em **Executar**. Aceite as permissões (envio de e-mail, acesso a serviços externos e Google Drive). Se aparecer "O Google não verificou este app", clique em **Avançado → Acessar (não seguro)**: o script é seu.
5. Clique em **Implantar → Nova implantação**:
   - Tipo: **App da Web**.
   - Executar como: **Eu**.
   - Quem pode acessar: **Qualquer pessoa**.
6. Copie a **URL do app da Web** (termina em `/exec`).

Os e-mails com o código saem da sua conta Google (limite gratuito de cerca de 100 por dia, mais que suficiente).

> **Já tinha publicado a versão anterior do script?** Cole o novo `Codigo.gs`, rode **autorizar** de novo (agora ele pede acesso ao Drive) e vá em **Implantar → Gerenciar implantações → lápis (Editar) → Versão: Nova versão → Implantar**. Assim a URL `/exec` continua a mesma e não é preciso mudar o `config.js`.

## 3. Preencher o config.js

Abra o arquivo `config.js` do repositório e preencha:

```js
window.CONFIG = {
  GOOGLE_CLIENT_ID: "123456789-abc...apps.googleusercontent.com",
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfy.../exec"
};
```

Salve (commit) no GitHub. Em um ou dois minutos o app passa a pedir o login.

## Como funciona para quem usa

1. Abre o app e clica em **Fazer login com o Google**.
2. No primeiro acesso naquele aparelho, recebe por e-mail um código de 6 dígitos (vale 10 minutos) e digita no app.
3. Com o código confirmado, a tela inicial é liberada. Nos próximos acessos no mesmo aparelho, não precisa do código de novo, até clicar em **Sair**.

Proteções incluídas: o servidor confere com o Google se o login é verdadeiro e emitido para este app, limita a 5 códigos por hora e a 5 tentativas por código, e guarda só o resumo criptográfico (hash) do código.

## Sincronização entre aparelhos

- Tudo o que você salva vai automaticamente para a nuvem e aparece nos outros aparelhos em que você entrar com a mesma conta: ao abrir o app, ao voltar para ele e a cada 30 segundos enquanto ele estiver aberto.
- Os PDFs e imagens anexados (edital, editais complementares, boleto, resultados) também vão para a nuvem e são baixados no outro aparelho quando você abre o link.
- Sem internet, o app continua funcionando; as alterações ficam guardadas e são enviadas quando a conexão voltar. O indicador no topo mostra a situação (verde: sincronizado; amarelo: enviando; vermelho: sem conexão). Clique nele para sincronizar na hora.
- Se o mesmo concurso for editado em dois aparelhos ao mesmo tempo, vale a última alteração salva. Exclusões são replicadas para todos os aparelhos.
- Os dados ficam no Google Drive da conta que publicou o Apps Script, na pasta **Meus Concursos – dados** (uma subpasta por usuário). Se outras pessoas usarem o seu app, os dados delas também ficam nessa pasta, na sua conta.

## Google Agenda (gravar as provas na agenda de cada usuário)

O app pode criar um evento no Google Agenda **da conta que entrou no app** para cada fase com data. Os eventos se atualizam quando a data ou o horário mudam e são apagados se a fase ou o concurso forem excluídos. Cada evento tem lembretes 1 dia e 3 horas antes. Fase sem horário vira evento de dia inteiro. O app só mexe nos eventos que ele mesmo criou.

Para ativar (uma vez só, no mesmo projeto do Google Cloud do login):

1. Em https://console.cloud.google.com/, com o projeto do app selecionado, vá em **APIs e serviços → Biblioteca**, procure **Google Calendar API** e clique em **Ativar**.
2. Vá em **Google Auth Platform → Acesso a dados** (ou **Tela de permissão OAuth → Escopos**), clique em **Adicionar ou remover escopos**, marque **`.../auth/calendar.events`** (Ver e editar eventos em todas as suas agendas) e salve. Se não aparecer na lista, cole `https://www.googleapis.com/auth/calendar.events` em "Adicionar escopos manualmente".
3. Confira em **Público-alvo / Usuários de teste** se o e-mail de quem vai usar está na lista (enquanto o app estiver em modo de teste).
4. No app, no fim da tela inicial, marque **Gravar as datas das provas no meu Google Agenda** e autorize na janela do Google. Pode aparecer "O Google não verificou este app": clique em **Continuar** (o app é seu).

O Apps Script não precisa de nenhuma mudança para isso.

O acesso que o Google libera vale cerca de 1 hora. Depois disso, quando houver mudança para gravar, o app pede de novo ao tocar em **Salvar** (a janela do Google abre e fecha sozinha) ou mostra o botão **Atualizar agenda agora**.
