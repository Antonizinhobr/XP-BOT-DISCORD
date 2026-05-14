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

| Nível | Nome do Cargo | XP Necessário (Total) |
| :--- | :--- | :--- |
| **1** | Inexperienced | 0 XP |
| **10** | Deja Vu | 10.000 XP |
| **20** | Quick & Quiet | 25.000 XP |
| **30** | Self-Care | 45.000 XP |
| **40** | Bond | 70.000 XP |
| **50** | Leader | 100.000 XP |
| **60** | Adrenaline | 135.000 XP |
| **70** | Borrowed Time | 175.000 XP |
| **80** | BBQ & Chili | 220.000 XP |
| **90** | Dying Light | 270.000 XP |
| **100** | Devour Hope | 325.000 XP |
| **110** | Corrupt Intervention | 385.000 XP |
| **120** | No One Escapes Death | 450.000 XP |
| **130** | Nemesis | 515.000 XP |
| **140** | Blood Warden | 590.000 XP |
| **150** | Decisive Strike | 670.000 XP |

---

## 💻 Comandos Públicos (Para todos os membros)

* **`/perfil`** - Mostra seus status atuais na Névoa (Nível, XP, Progresso, Tempo em Call e Mensagens).
* **`/manual`** - Exibe as regras e tabelas de conquistas do servidor.
* **`/ranking_completo`** - Gera uma lista com os 50 usuários com mais XP no servidor.

---

## 🛠️ Guia de Configuração (Apenas Administradores)

Toda a configuração é feita diretamente no Discord usando Slash Commands. Ao convidar o bot para um novo servidor, siga esta ordem:

### 1. Definindo o Esqueleto
Use **`/setup_servidor`** para definir os canais de Perfil, Ranking, Level UP e Auditoria.

### 2. Criando a Hierarquia
Use **`/setup_cargos`**. O bot criará os 16 cargos automaticamente.
> ⚠️ **IMPORTANTE:** Mova o cargo do Bot para o topo da lista de cargos nas configurações do servidor para que ele possa gerenciar as recompensas.

### 3. Bônus de XP
Use **`/setup_multiplicadores`** para criar os cargos de Booster (2.2x) e VIP (2.0x).

### 4. Travando Canais
Use **`/setup_orientacoes`** para definir quais canais dão XP e quais são ignorados.

---

## 🛡️ Gerenciamento e Moderação

* **`/admin_xp [add | remove | set | reset]`** - Gerencia o XP de usuários específicos.
* **`/admin_corrigir_niveis`** - Recalcula níveis com base no XP (útil após migrações).
* **`/admin_corrigir_cargos`** - Atualiza os cargos de todos os membros de acordo com o nível.

---

## ⚙️ Instalação e Hospedagem

> [!IMPORTANT]
> **O Bot Refúgio da Névoa é um serviço público!** Você **não precisa** baixar o código, configurar um banco de dados ou hospedar por conta própria para utilizá-lo. Basta adicioná-lo ao seu servidor através do link de convite oficial.
> 
> As instruções abaixo são destinadas apenas a desenvolvedores que desejam realizar o **Self-Hosting** (hospedagem própria) para criar uma instância privada com seu próprio banco de dados Firebase.

### Configurando Variáveis de Ambiente (.env)
1. Crie um arquivo `.env` na raiz do projeto.
2. Configure as credenciais do seu Bot no Portal de Desenvolvedores do Discord.
3. Gere uma chave privada no Console do Firebase (Project Settings > Service Accounts).

```env
TOKEN=SEU_TOKEN_DO_DISCORD_AQUI
FIREBASE_PROJECT_ID=nome-do-seu-projeto-123
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xyz@seu-projeto-123.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nSUA_CHAVE_AQUI\n-----END PRIVATE KEY-----\n"