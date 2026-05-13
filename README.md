# 🌫️ Bot Refúgio da Névoa - Sistema de XP e Progressão

![Discord.js](https://img.shields.io/badge/Discord.js-v14-blue?logo=discord&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-LTS-green?logo=node.js&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Firestore-orange?logo=firebase&logoColor=white)

Um bot completo de nivelamento e ranqueamento para o Discord, com uma temática imersiva inspirada no universo de sobrevivência e terror (Névoa/Entidade). Ele recompensa usuários ativos no chat de texto e nas chamadas de voz com **XP, Níveis e Cargos Automáticos**.

A grande vantagem deste bot é sua arquitetura **Multi-Servidor (Multi-Guild)**. Todos os canais, cargos e pontuações são configurados dinamicamente e salvos no Firebase, permitindo que ele funcione em dezenas de servidores de forma totalmente independente, sem precisar alterar nenhuma linha de código!

---

## ✨ Funcionalidades Principais

* **💬 XP por Mensagem:** Sistema inteligente com anti-flood (cooldown) e prevenção de mensagens repetidas.
* **🎤 XP por Call de Voz:** Recompensa contínua a cada minuto que o usuário passa em chamadas de voz ativas (ignora canais selecionados pelo Admin).
* **⚡ Sistema de Multiplicadores:** Bônus global de XP (2.2x para Booster e 2.0x para VIP Legacy).
* **🏆 Recompensas Automáticas:** O bot cria e entrega de cargos temáticos a cada 10 níveis alcançados (até o nível 150).
* **📊 Ranking Automático:** Atualiza o top 10 do servidor a cada 6 horas em um canal específico.
* **💾 Banco de Dados em Nuvem Isolado:** Salva o progresso no **Firebase Firestore**, garantindo que o XP ganho no Servidor A seja separado do XP ganho no Servidor B.
* **🛡️ Painel Administrativo:** Setup visual e ferramentas exclusivas para admins corrigirem, adicionarem ou resetarem o XP dos membros.

---

## 📈 Como o XP é Calculado?

O sistema foi desenhado para ser justo e recompensar a verdadeira atividade:

### 1. Mensagens de Texto
* **Ganho:** Entre **15 a 25 XP** (aleatório) por mensagem enviada.
* **Cooldown:** 10 segundos entre cada mensagem válida (evita spam).

### 2. Chamadas de Voz
* **Ganho:** **10 XP** a cada 1 minuto conectado em uma call válida.
* **Restrições:** Entrar em canais ignorados (como AFK ou música) não contabiliza XP.

---

## 🏆 Progressão, Níveis e Conquistas

O ganho de níveis é contínuo, mas o reconhecimento público da Entidade acontece em momentos cruciais.

### A Lógica de 1 em 1 vs. 10 em 10
* **Progressão Silenciosa (1 em 1):** O usuário ganha níveis de 1 em 1. A dificuldade escala (do Nível 1 ao 10 são 1.000 XP por nível; a partir do 11, o requisito aumenta progressivamente).
* **Marcos de Conquista (10 em 10):** Para evitar flood no chat e tornar as recompensas mais exclusivas, **o bot só envia a mensagem de Level Up e só atualiza o cargo a cada 10 níveis alcançados**.

### Tabela Completa de Cargos e Conquistas
As conquistas vão do Nível 10 ao 150, inspiradas em *Perks* famosos do universo do terror:

* **Nível 1:** Inexperienced (0 XP)
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

---

## 💻 Comandos Públicos (Para todos os membros)

* **`/perfil`** - Mostra seus status atuais na Névoa (Nível, XP, Progresso, Tempo em Call e Mensagens).
* **`/manual`** - Exibe as regras e tabelas de conquistas do servidor.
* **`/ranking_completo`** - Gera uma lista com os 50 usuários com mais XP no servidor.

---

## 🛠️ Guia de Configuração (Apenas Administradores)

Esqueça o trabalho duro de procurar e colar IDs de canais no código fonte! Toda a configuração é feita diretamente no Discord usando Slash Commands. 

Ao convidar o bot para um novo servidor, siga exatamente esta ordem:

### Passo 1: Definindo o Esqueleto do Bot
Use o comando **`/setup_servidor`**. O Discord pedirá que você selecione 4 canais:
* `canal_perfil`: Onde o pessoal poderá usar `/perfil` e `/manual`.
* `canal_ranking`: Onde o bot postará o Top 10 automático.
* `canal_levelup`: Onde o bot anunciará as subidas de nível.
* `canal_auditoria`: Canal fechado onde o bot enviará logs de moderação de XP.

### Passo 2: Criando a Hierarquia de Níveis
Use o comando **`/setup_cargos`**. O bot criará automaticamente os 16 cargos de nível do zero, já com cores e nomes formatados, e os salvará no Firebase atrelados ao seu servidor.
> ⚠️ **MUITO IMPORTANTE:** Vá nas *Configurações do Servidor > Cargos* e puxe a role do bot para ficar **ACIMA** de todos esses cargos recém-criados. Se o bot ficar abaixo deles, ele não terá permissão para entregá-los aos membros.

### Passo 3: Criando Bônus de XP
Use o comando **`/setup_multiplicadores`**. O bot criará os cargos "Booster XP" (2.2x) e "VIP LEGACY" (2.0x). Entregue esses cargos manualmente a quem merecer, e o bot calculará o XP em dobro sozinho!

### Passo 4: Travando os Canais de XP e Enviando as Regras
Use o comando **`/setup_orientacoes`**.
* No `canal_alvo`, escolha onde as regras devem ser postadas (ex: `#orientacoes-xp`).
* Em `canais_xp`, digite e marque os canais que concedem XP (ex: `#chat-geral #jogos`).
* Em `canais_ignorados`, marque os que não dão XP (ex: `#afk #musica`).
O bot vai enviar a cartilha oficial de regras da Entidade no canal alvo e a partir de agora só distribuirá XP nos lugares permitidos.

---

## 🛡️ Gerenciamento e Moderação (Apenas Administradores)

* **`/manual_adm`** - Uma versão expandida do `/manual`, visível apenas para admins, contendo todos os comandos secretos.
* **`/ranking`** - Exibe rapidamente o Top 10 atual no chat.
* **`/admin_xp [add | remove | set | reset]`** - O painel de controle do XP. Permite adicionar, retirar, definir um valor exato ou zerar o XP de um usuário, exigindo um motivo para o Log de Auditoria.
* **`/admin_ver`** - Puxa a "ficha criminal" de um usuário (mostrando XP, Nível e stats) de forma oculta no chat.
* **`/admin_corrigir_niveis`** - Varre o banco de dados do servidor e recalcula o Nível de todos os usuários com base no XP que possuem (útil em caso de falhas ou se o bot ficou offline).
* **`/admin_corrigir_cargos`** - Remove cargos antigos dos usuários do servidor e aplica o cargo correspondente ao Nível correto.
* **`/admin_migrar_db`** - *(Uso Extremo)* Move um banco de dados global antigo para a nova estrutura isolada por Servidor (Guild ID).

---

## ⚙️ Instalação (Para Hospedagem)

### Passo 1: Configurando Variáveis de Ambiente (.env)
1. Crie um arquivo chamado `.env` na raiz do projeto.
2. Acesse o portal de desenvolvedores do Discord, pegue seu Token e adicione.
3. Acesse o Firebase, crie um projeto Firestore, gere uma Chave Privada (Conta de Serviço) e preencha o arquivo exatamente neste formato:

```env
TOKEN=SEU_TOKEN_DO_DISCORD_AQUI
FIREBASE_PROJECT_ID=nome-do-seu-projeto-123
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xyz@seu-projeto-123.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0B...\n-----END PRIVATE KEY-----\n"