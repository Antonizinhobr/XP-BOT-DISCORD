# 🌫️ Bot Refúgio da Névoa - Sistema de XP e Progressão

![Discord.js](https://img.shields.io/badge/Discord.js-v14-blue?logo=discord&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-LTS-green?logo=node.js&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Firestore-orange?logo=firebase&logoColor=white)

Um bot completo de nivelamento e ranqueamento para o Discord, com uma temática imersiva inspirada no universo de sobrevivência e terror (Névoa/Entidade). Ele recompensa usuários ativos no chat de texto e nas chamadas de voz com **XP, Níveis e Cargos Automáticos**.

---

## ✨ Funcionalidades Principais

* **💬 XP por Mensagem:** Sistema inteligente com anti-flood (cooldown) e prevenção de mensagens repetidas.
* **🎤 XP por Call de Voz:** Recompensa contínua a cada minuto que o usuário passa em chamadas de voz ativas (ignora canais AFK/Música).
* **⚡ Sistema de Boosters:** Multiplicador global de XP (3x) para membros VIPs ou Nitro Boosters.
* **🏆 Recompensas Automáticas:** Entrega de cargos temáticos a cada 10 níveis alcançados (até o nível 150).
* **📊 Ranking Automático:** Atualiza o top 10 do servidor a cada 6 horas em um canal específico.
* **💾 Banco de Dados em Nuvem:** Salva o progresso em tempo real usando o **Firebase Firestore**, garantindo que nenhum XP seja perdido.
* **🛡️ Painel Administrativo:** Comandos `/slash` exclusivos para admins corrigirem, adicionarem ou resetarem o XP dos membros.

---

## 📂 Estrutura de Arquivos

Para você se guiar melhor, essa é a organização do projeto:

```text
bot-xp-black/
 ├── node_modules/       # Pasta gerada pelo Node com todas as dependências do projeto.
 ├── .env                # Suas variáveis de ambiente e senhas (🔒 NUNCA envie para o GitHub).
 ├── .gitignore          # Diz ao Git quais arquivos ignorar (como o .env e node_modules).
 ├── discloud.config     # Configuração para hospedar o bot na plataforma Discloud.
 ├── index.js            # O "coração" do bot, onde todo o código principal está rodando.
 ├── package-lock.json   # Trava as versões exatas das dependências instaladas.
 └── package.json        # Informações do projeto e lista de pacotes necessários.
```

---

## 📈 Como o XP é Calculado?

O sistema foi desenhado para ser justo e recompensar a verdadeira atividade:

### 1. Mensagens de Texto
* **Ganho:** Entre **15 a 25 XP** (aleatório) por mensagem enviada.
* **Cooldown:** 10 segundos entre cada mensagem válida (evita spam).

### 2. Chamadas de Voz
* **Ganho:** **10 XP** a cada 1 minuto conectado em uma call válida.
* **Restrições:** Entrar em canais ignorados (como AFK ou música) pausa a contagem.

### 3. Multiplicador de XP
* **Boosters:** Recebem **3x mais XP** em todas as ações.

---

## 🏆 Progressão, Níveis e Conquistas

O ganho de níveis é contínuo, mas o reconhecimento público da Entidade acontece em momentos cruciais.

### A Lógica de 1 em 1 vs. 10 em 10
* **Progressão Silenciosa (1 em 1):** O usuário ganha níveis de 1 em 1. A dificuldade escala (do Nível 1 ao 10 são 1.000 XP por nível; a partir do 11, o requisito aumenta progressivamente).
* **Marcos de Conquista (10 em 10):** Para evitar flood no chat e tornar as recompensas mais exclusivas, **o bot só envia a mensagem de Level Up e só adiciona um cargo novo a cada 10 níveis alcançados**.

### A Mensagem da Entidade
Quando um usuário atinge uma dezena (Nível 10, 20, 30...), o bot envia uma notificação temática no canal de avisos e entrega automaticamente o cargo correspondente. A mensagem enviada é esta:

> **🔥 ASCENSÃO NA NÉVOA!**
> 🎉 @here @Usuario acaba de subir para o nível **[X]**! 🎉
> 
> A Névoa sussurra o seu nome, @Usuario...
> Sua dedicação foi reconhecida e você ascendeu para o **Nível [X]**!
> 
> 🏆 **Nova Conquista:** [Nome do Perk]
> 🩸 Você foi condecorado com o cargo @NomeDoCargo! *(E um GIF comemorativo acompanha a mensagem).*

### Tabela Completa de Cargos e Conquistas
As conquistas vão do Nível 10 ao 150, inspiradas em *Perks* famosos do universo do terror:

* **Nível 10:** Deja Vu (10.000 XP)
* **Nível 20:** Quick & Quiet (25.000 XP)
* **Nível 30:** Self-Care (45.000 XP)
* **Nível 40:** Bond (70.000 XP)
* **Nível 50:** Leader (100.000 XP)
* **Nível 60:** Adrenaline (135.000 XP)
* **Nível 70:** Borrowed Time (175.000 XP)
* **Nível 80:** BBQ & Chili (220.000 XP)
* **Nível 90:** Dying Light (270.000 XP)
* **Nível 100:** Devour Hope (325.000 XP)
* **Nível 110:** Corrupt Intervention (385.000 XP)
* **Nível 120:** No One Escapes Death (450.000 XP)
* **Nível 130:** Nemesis (515.000 XP)
* **Nível 140:** Blood Warden (590.000 XP)
* **Nível 150:** Decisive Strike (670.000 XP)

*(Jogadores abaixo do Nível 10 possuem o título "Inexperienced (No One Left Behind)" no seu `/perfil`).*

*(OBS: Esses niveis, sao cargos que você cria dentro do seu servidor)*
---

## 💻 Comandos e Exemplos de Uso

Abaixo estão os Slash Commands disponíveis e como eles funcionam na prática dentro do Discord:

### 👤 Comandos Públicos (Para todos os membros)

* **`/perfil`**
  * *O que faz:* Mostra seus status atuais na Névoa.
  * *Exemplo de uso:* Você digita `/perfil`. O bot responde com um card visual (Embed) contendo sua foto, Nível Atual, XP Total, Barra de Progresso e tempo passado em calls.

* **`/manual`**
  * *O que faz:* Exibe as regras e tabelas de conquistas do servidor.
  * *Exemplo de uso:* Você digita `/manual`. O bot envia a lista com todos os cargos temáticos que podem ser ganhos.

### 🛡️ Comandos Administrativos (Apenas Staff)

* **`/ranking`**
  * *Exemplo de uso:* O admin digita `/ranking` no chat e o bot gera uma lista imediata com o Top 10 usuários com mais XP no servidor.

* **`/admin_xp add`**
  * *O que faz:* Dá XP extra para um usuário (ideal para premiar vencedores de eventos).
  * *Exemplo de uso:* `/admin_xp add usuario: @Player1 quantidade: 5000 motivo: Venceu o evento da noite` -> O Player1 recebe +5000 XP instantaneamente.

* **`/admin_xp remove`**
  * *O que faz:* Tira XP de um usuário (ideal para punições leves).
  * *Exemplo de uso:* `/admin_xp remove usuario: @PlayerSpammer quantidade: 1000 motivo: Flood no chat principal`.

* **`/admin_xp set`**
  * *O que faz:* Substitui o XP atual do usuário por um valor exato.
  * *Exemplo de uso:* `/admin_xp set usuario: @Player2 quantidade: 10000` -> Não importa quanto XP ele tinha, agora ele tem exatamente 10.000 XP (Nível 10).

* **`/admin_xp reset`**
  * *O que faz:* Zera completamente a conta do usuário.
  * *Exemplo de uso:* `/admin_xp reset usuario: @Player3 motivo: Punição severa` -> O usuário volta para o Nível 1 com 0 XP.

* **`/admin_ver`**
  * *Exemplo de uso:* `/admin_ver usuario: @Player1` -> Mostra ocultamente para o admin se o nível do jogador está sincronizado com o XP de forma correta, sem precisar olhar no Firebase.

* **`/admin_corrigir_niveis`**
  * *Exemplo de uso:* `/admin_corrigir_niveis` -> O bot varre o banco de dados inteiro silenciosamente. Se alguém tiver 20.000 de XP, mas estiver bugado no Nível 5, o bot corrige o perfil da pessoa para o Nível correto automaticamente.

---

## 🛠️ Guia Completo de Instalação e Configuração

### Passo 1: Criando o Bot no Discord
1. Acesse o [Discord Developer Portal](https://discord.com/developers/applications).
2. Clique no botão **"New Application"** (Nova Aplicação) no canto superior direito e dê um nome ao seu bot.
3. No menu lateral esquerdo, vá em **"Bot"**.
4. Clique em **"Reset Token"** e copie a sequência de letras e números que aparecer. **GUARDE ESSE TOKEN** (ele é a senha do seu bot, nunca o compartilhe).
5. Role a página para baixo até a seção **Privileged Gateway Intents**. Ative as três opções (isso é vital para o bot ler mensagens e ver quem está em call):
   * `Presence Intent`
   * `Server Members Intent`
   * `Message Content Intent`
6. Salve as alterações.
7. Para convidar o bot para o seu servidor: vá em **"OAuth2" -> "URL Generator"**. Marque os escopos `bot` e `applications.commands`. Em permissões de bot, marque `Administrator`. Copie o link gerado, abra no navegador e adicione ao seu servidor.

### Passo 2: Configurando o Banco de Dados (Firebase)
1. Acesse o [Firebase Console](https://console.firebase.google.com/) logado na sua conta Google.
2. Clique em **"Criar um projeto"** e dê um nome a ele.
3. No menu lateral, expanda a aba **"Criação"** (Build) e clique em **"Firestore Database"**.
4. Clique em **"Criar banco de dados"** em **Modo de Produção** (Production mode).
5. Pegue as chaves de acesso: Clique na engrenagem ⚙️ (Configurações do projeto) no canto superior esquerdo e vá em **"Contas de Serviço"** (Service Accounts).
6. Clique no botão azul **"Gerar nova chave privada"**. Isso baixará um arquivo `.json`.
7. Abra esse arquivo com o Bloco de Notas. Você precisará de: `project_id`, `client_email` e `private_key`.

### Passo 3: Configurando Variáveis de Ambiente (.env)
**⚠️ ATENÇÃO:** Por motivos de segurança, o arquivo que guarda as senhas (`.env`) está no `.gitignore` e não é enviado para o GitHub. Você precisa criá-lo manualmente.

1. Baixe ou clone este repositório:
   ```bash
   git clone [https://github.com/Antonizinhobr/XP-BOT-DISCORD.git](https://github.com/Antonizinhobr/XP-BOT-DISCORD.git)
   cd XP-BOT-DISCORD
   ```
2. Instale as dependências:
   ```bash
   npm install discord.js dotenv firebase-admin
   ```
3. Na pasta principal, crie um arquivo chamado exatamente `.env` e preencha seguindo **exatamente** este formato:

```env
TOKEN=COLE_AQUI_O_TOKEN_DO_SEU_BOT_DO_DISCORD
FIREBASE_PROJECT_ID=COLE_AQUI_O_PROJECT_ID
FIREBASE_CLIENT_EMAIL=COLE_AQUI_O_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nSuaChaveGiganteAqui\n-----END PRIVATE KEY-----\n"
```

### Passo 4: Configurando os IDs dentro do Código
Antes de ligar, abra o arquivo `index.js`, vá até a seção `CONFIGURAÇÕES` e substitua todas as constantes abaixo pelos IDs reais do seu servidor do Discord:

```javascript
const CANAL_PERMITIDO_COMANDOS = 'ID_DO_CANAL_DE_COMANDOS';
const CANAL_RANKING_AUTO = 'ID_DO_CANAL_DE_RANKING';
const CANAL_LEVEL_UP = 'ID_DO_CANAL_DE_LEVEL_UP';
const CARGO_BOOSTER_ID = 'ID_DO_CARGO_BOOSTER';

const ADMIN_IDS = [
    'SEU_ID_DO_DISCORD_AQUI'
];

const CANAIS_PERMITIDOS_XP = [
    'ID_CANAL_TEXTO_1', 
    'ID_CANAL_TEXTO_2', 
    'ID_CANAL_TEXTO_3'
];

const CANAIS_IGNORADOS = [
    'ID_CANAL_AFK', 
    'ID_CANAL_MUSICA'
];

const BOOSTERS_MANUAIS = [
    'ID_USUARIO_BOOSTER_MANUAL'
];

const RECOMPENSAS = {
    10: 'ID_CARGO_NIVEL_10',
    20: 'ID_CARGO_NIVEL_20',
    30: 'ID_CARGO_NIVEL_30',
    40: 'ID_CARGO_NIVEL_40',
    50: 'ID_CARGO_NIVEL_50',
    60: 'ID_CARGO_NIVEL_60',
    70: 'ID_CARGO_NIVEL_70',
    80: 'ID_CARGO_NIVEL_80',
    90: 'ID_CARGO_NIVEL_90',
    100: 'ID_CARGO_NIVEL_100',
    110: 'ID_CARGO_NIVEL_110',
    120: 'ID_CARGO_NIVEL_120',
    130: 'ID_CARGO_NIVEL_130',
    140: 'ID_CARGO_NIVEL_140',
    150: 'ID_CARGO_NIVEL_150'
};
```

### Passo 5: Testando Localmente
Execute no terminal da sua máquina para garantir que tudo funciona:
```bash
node index.js
```
Se tudo estiver correto, você verá no terminal: `🤖 Bot online como O_Nome_Do_Seu_Bot#1234` e `✅ Firebase inicializado com sucesso!`.

### Passo 6: Hospedando na Discloud ☁️ (Para ficar online 24/7)
Para manter o bot rodando mesmo com o seu PC desligado, você pode hospedá-lo na [Discloud](https://discloudbot.com/).

1. Certifique-se de que o arquivo `discloud.config` na raiz do seu projeto está configurado corretamente. Exemplo:
```ini
NAME=RefugioDaNevoa
TYPE=bot
MAIN=index.js
RAM=100
AUTORESTART=false
VERSION=latest
APT=tools
```
2. **Compacte os arquivos:** Selecione todos os arquivos essenciais do seu bot (`index.js`, `package.json`, `discloud.config` e o seu arquivo `.env` configurado).
   * **⚠️ IMPORTANTE:** NÃO inclua a pasta `node_modules` no arquivo `.zip`. A Discloud instala as dependências automaticamente baseada no seu `package.json`.
3. Adicione esses arquivos selecionados em um arquivo **.zip**.
4. Acesse o painel da Discloud (faça login com o Discord).
5. Clique em **"Add App"** (Adicionar App) e envie o seu arquivo `.zip`.
6. Após o upload, é só iniciar o aplicativo no painel e seu bot estará imortal na Névoa, online 24 horas por dia!

---
*Desenvolvido para fortalecer a comunidade na Névoa.* 🩸
