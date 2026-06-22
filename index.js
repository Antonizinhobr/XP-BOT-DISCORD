require('dotenv').config();

const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, MessageFlags, SlashCommandBuilder, REST, Routes, ChannelType, AttachmentBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');

// ==========================================
// 1. INICIALIZAÇÃO DO BANCO LOCAL (SQLITE)
// ==========================================
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath);

db.exec(`
    CREATE TABLE IF NOT EXISTS servidores_config (
        guild_id TEXT PRIMARY KEY,
        config_data TEXT
    );
    CREATE TABLE IF NOT EXISTS usuarios_xp (
        user_guild_id TEXT PRIMARY KEY,
        guild_id TEXT,
        user_id TEXT,
        xp INTEGER DEFAULT 0,
        nivel INTEGER DEFAULT 1,
        mensagens INTEGER DEFAULT 0,
        tempo_call INTEGER DEFAULT 0,
        data_entrada INTEGER
    );
`);
console.log('✅ Banco de dados local (SQLite) carregado e pronto para uso!');

// ==========================================
// 2. CONFIGURAÇÃO DO CLIENTE DISCORD
// ==========================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

process.on('unhandledRejection', (error) => console.error('❌ Promessa rejeitada não tratada:', error));
process.on('uncaughtException', (error) => console.error('❌ Exceção não capturada:', error));

const cooldowns = new Map();
const ultimaMensagem = new Map();
const voiceSessions = new Map();

const COOLDOWN_TEMPO = 10000;
const XP_MIN = 15;
const XP_MAX = 25;
const XP_POR_MINUTO_CALL = 10;
const MULTIPLICADOR_BOOSTER = 2.2;
const MULTIPLICADOR_VIP_LEGACY = 2.0;

const CONQUISTAS = {
    1: 'Inexperienced', 10: 'Deja Vu', 20: 'Quick & Quiet', 30: 'Self-Care', 40: 'Bond', 50: 'Leader',
    60: 'Adrenaline', 70: 'Borrowed Time', 80: 'BBQ & Chili', 90: 'Dying Light',
    100: 'Devour Hope', 110: 'Corrupt Intervention', 120: 'No One Escapes Death',
    130: 'Nemesis', 140: 'Blood Warden', 150: 'Decisive Strike'
};

// ==========================================
// 3. SISTEMA DE BACKUP AUTOMÁTICO GLOBAL
// ==========================================
async function enviarBackup() {
    try {
        const canalBackupId = process.env.CANAL_BACKUP_ID;
        if (!canalBackupId) return;

        const canal = await client.channels.fetch(canalBackupId).catch(() => null);
        if (!canal || !canal.isTextBased()) return;

        const arquivoBackup = new AttachmentBuilder(dbPath);
        await canal.send({ 
            content: `📦 **Backup Automático (Global - SQLite)**\nData: ${new Date().toLocaleString('pt-BR')}`, 
            files: [arquivoBackup] 
        });
        console.log('✅ Backup global enviado com segurança para o seu canal central!');
    } catch (error) {
        console.error('❌ Erro ao enviar backup:', error);
    }
}

// ==========================================
// 4. FUNÇÕES DE BANCO DE DADOS (SQLITE)
// ==========================================
async function obterConfigServidor(guildId) {
    const row = db.prepare('SELECT config_data FROM servidores_config WHERE guild_id = ?').get(guildId);
    if (row) return JSON.parse(row.config_data);
    return null;
}

function salvarConfigServidor(guildId, novosDados) {
    const atual = db.prepare('SELECT config_data FROM servidores_config WHERE guild_id = ?').get(guildId);
    const dadosAtuais = atual ? JSON.parse(atual.config_data) : {};
    const merged = { ...dadosAtuais, ...novosDados };
    db.prepare('INSERT OR REPLACE INTO servidores_config (guild_id, config_data) VALUES (?, ?)').run(guildId, JSON.stringify(merged));
    return merged;
}

function garantirUsuario(userId, guildId) {
    const userGuildId = `${userId}-${guildId}`;
    const row = db.prepare('SELECT * FROM usuarios_xp WHERE user_guild_id = ?').get(userGuildId);
    if (row) return row;
    
    const now = Date.now();
    db.prepare(`
        INSERT INTO usuarios_xp (user_guild_id, guild_id, user_id, xp, nivel, mensagens, tempo_call, data_entrada) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userGuildId, guildId, userId, 0, 1, 0, 0, now);
    
    return { user_guild_id: userGuildId, guild_id: guildId, user_id: userId, xp: 0, nivel: 1, mensagens: 0, tempo_call: 0, data_entrada: now };
}

function atualizarUsuario(userGuildId, xp, nivel, mensagens, tempo_call) {
    db.prepare('UPDATE usuarios_xp SET xp = ?, nivel = ?, mensagens = ?, tempo_call = ? WHERE user_guild_id = ?')
      .run(xp, nivel, mensagens, tempo_call, userGuildId);
}

function calcularXPNecessarioParaNivel(nivel) {
    if (nivel <= 1) return 0;
    if (nivel <= 10) return nivel * 1000;
    let xpTotal = 10000;
    for (let lvl = 11; lvl <= nivel; lvl++) {
        if (lvl <= 20) xpTotal += 1500;
        else if (lvl <= 30) xpTotal += 2000;
        else if (lvl <= 40) xpTotal += 2500;
        else if (lvl <= 50) xpTotal += 3000;
        else if (lvl <= 60) xpTotal += 3500;
        else if (lvl <= 70) xpTotal += 4000;
        else if (lvl <= 80) xpTotal += 4500;
        else if (lvl <= 90) xpTotal += 5000;
        else if (lvl <= 100) xpTotal += 5500;
        else if (lvl <= 110) xpTotal += 6000;
        else if (lvl <= 120) xpTotal += 6500;
        else if (lvl <= 130) xpTotal += 7000;
        else if (lvl <= 140) xpTotal += 7500;
        else if (lvl <= 150) xpTotal += 8000;
        else xpTotal += 8500;
    }
    return xpTotal;
}

function calcularNivelPorXP(xp) {
    for (let nivel = 1; nivel <= 200; nivel++) {
        if (xp < calcularXPNecessarioParaNivel(nivel + 1)) return nivel;
    }
    return 200;
}

function calcularXPProximoNivel(xp, nivelAtual) {
    const xpProximo = calcularXPNecessarioParaNivel(nivelAtual + 1);
    return { faltando: Math.max(0, xpProximo - xp), proximoNivel: nivelAtual + 1 };
}

function formatarNumero(num) { return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
function formatarData(timestamp) { return new Date(timestamp).toLocaleDateString('pt-BR'); }

function obterConquista(nivel) {
    const niveisOrdenados = Object.keys(CONQUISTAS).sort((a, b) => Number(b) - Number(a));
    for (const n of niveisOrdenados) {
        if (nivel >= Number(n)) return CONQUISTAS[n];
    }
    return 'Inexperienced (No One Left Behind)';
}

function isAdmin(member) {
    return member && member.permissions.has(PermissionFlagsBits.Administrator);
}

async function getMultiplicadorXP(userId, guild) {
    try {
        const membro = await guild.members.fetch(userId).catch(() => null);
        if (!membro) return 1;

        const config = await obterConfigServidor(guild.id);
        if (!config) return 1;

        if (config.cargo_booster && membro.roles.cache.has(config.cargo_booster)) return MULTIPLICADOR_BOOSTER;
        if (config.cargo_vip_legacy && membro.roles.cache.has(config.cargo_vip_legacy)) return MULTIPLICADOR_VIP_LEGACY;
        return 1;
    } catch (error) { return 1; }
}

async function isCargoBloqueadoXP(member, guildId) {
    try {
        if (!member) return false;
        const config = await obterConfigServidor(guildId);
        if (!config || !config.cargos_sem_xp || config.cargos_sem_xp.length === 0) return false;
        return config.cargos_sem_xp.some(cargoId => member.roles.cache.has(cargoId));
    } catch (error) { return false; }
}

async function gerenciarCargosPorNivel(membro, nivelNovo, nivelAntigo) {
    try {
        const config = await obterConfigServidor(membro.guild.id);
        if (!config || !config.cargos_recompensa) return;

        const todosCargosNivel = Object.values(config.cargos_recompensa);
        for (const cargoId of todosCargosNivel) {
            const cargo = membro.guild.roles.cache.get(cargoId);
            if (cargo && membro.roles.cache.has(cargoId)) await membro.roles.remove(cargo).catch(() => {});
        }

        let milestoneAtual = Math.floor(nivelNovo / 10) * 10;
        if (nivelNovo < 10) milestoneAtual = 1;

        if (config.cargos_recompensa[milestoneAtual]) {
            const cargoNovo = membro.guild.roles.cache.get(config.cargos_recompensa[milestoneAtual]);
            if (cargoNovo && !membro.roles.cache.has(cargoNovo.id)) await membro.roles.add(cargoNovo).catch(() => {});
        }
    } catch (error) { console.error('❌ Erro ao gerenciar cargos:', error); }
}

async function verificarLevelUp(userId, guild, nivelAntigo, nivelNovo) {
    try {
        const membro = await guild.members.fetch(userId).catch(() => null);
        if (membro && nivelNovo > nivelAntigo) await gerenciarCargosPorNivel(membro, nivelNovo, nivelAntigo);
        
        const niveisMilestone = [];
        for (let i = Math.floor(nivelAntigo / 10) + 1; i <= Math.floor(nivelNovo / 10); i++) {
            const milestone = i * 10;
            if (milestone > 0) niveisMilestone.push(milestone);
        }
        if (niveisMilestone.length === 0) return;

        const config = await obterConfigServidor(guild.id);
        if (!config || !config.canal_levelup) return;

        const canalEvolucao = await client.channels.fetch(config.canal_levelup).catch(() => null);
        if (!canalEvolucao || !membro || !canalEvolucao.isTextBased?.()) return;

        for (const milestone of niveisMilestone) {
            const conquista = CONQUISTAS[milestone];
            if (!conquista) continue;
            
            let msgDesc = `A entidade do nevoeiro sussurra o seu nome, <@${userId}>...\nSua dedicação foi reconhecida e você ascendeu para o **Nível ${milestone}**!\n\n🏆 **Nova Conquista:** ${conquista}`;
            let ganhouCargo = false;
            
            if (config.cargos_recompensa && config.cargos_recompensa[milestone]) {
                const cargoId = config.cargos_recompensa[milestone];
                if (guild.roles.cache.has(cargoId)) {
                    msgDesc += `\n\n🩸 Você foi condecorado com o cargo <@&${cargoId}>!`;
                    ganhouCargo = true;
                }
            }
            
            const embed = new EmbedBuilder()
                .setColor(ganhouCargo ? '#ff0033' : '#8a0000')
                .setTitle('🔥 ASCENSÃO NA ENTIDADE DO NEVOEIRO!')
                .setDescription(msgDesc)
                .setThumbnail(membro.user.displayAvatarURL({ dynamic: true, size: 512 }))
                .setFooter({ text: 'Sistema de XP SQLite', iconURL: guild.iconURL({ dynamic: true }) })
                .setTimestamp();
                
            if (ganhouCargo) embed.setImage('https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExcXZ5ams1d2k4N3BxMDdoaXYzcDdzaHBmamNpMG9lc2MzOHR1dXNyZyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/dauO3PZO8aKrlFZ9tX/giphy.gif');
            
            await canalEvolucao.send({ content: `🎉 <@${userId}> acaba de subir para o nível **${milestone}**! 🎉`, embeds: [embed] }).catch(() => {});
        }
    } catch (error) { console.error('❌ Erro em verificarLevelUp:', error); }
}

async function enviarLogAdmin(interaction, operacao, usuario, quantidade, resultado, motivo = '') {
    try {
        const config = await obterConfigServidor(interaction.guildId);
        if (!config || !config.canal_logs) return;

        const canalLog = await client.channels.fetch(config.canal_logs).catch(() => null);
        if (!canalLog || !canalLog.isTextBased()) return;

        const embed = new EmbedBuilder()
            .setColor(operacao === 'reset' || operacao === 'reset_global' ? '#ff0000' : '#00ff00')
            .setTitle('📋 LOG ADMINISTRATIVO')
            .setDescription(`**Executado por:** ${interaction.user.tag} (${interaction.user.id})\n**Operação:** ${operacao.toUpperCase()}`)
            .addFields(
                { name: '👤 Usuário Alvo', value: `${usuario.tag || usuario.username} (${usuario.id})`, inline: true },
                { name: '📝 Motivo', value: motivo || 'Sem motivo especificado', inline: true }
            )
            .setTimestamp();
            
        if (['add', 'remove', 'set'].includes(operacao)) {
             embed.addFields(
                { name: '🎯 XP Movimentado', value: formatarNumero(quantidade), inline: true },
                { name: '📊 XP Antigo', value: formatarNumero(resultado.xpAntigo), inline: true },
                { name: '📊 XP Novo', value: formatarNumero(resultado.xpNovo), inline: true },
                { name: '🎯 Nível', value: resultado.nivel.toString(), inline: true }
            );
        } else if (operacao === 'reset') {
            embed.addFields(
                { name: '🔄 XP', value: 'Todos os XP foram zerados', inline: false },
                { name: '📊 XP Antigo', value: formatarNumero(resultado.xpAntigo), inline: true },
                { name: '📊 XP Novo', value: '0', inline: true }
            );
        } else if (operacao === 'reset_global') {
            embed.addFields(
                { name: '☢️ ALERTA DE RESET GLOBAL', value: 'O XP de TODOS os usuários do servidor foi apagado.', inline: false }
            );
        }
        await canalLog.send({ embeds: [embed] }).catch(() => {});
    } catch (error) { console.error('❌ Erro log admin:', error); }
}

async function adicionarXPMensagem(userId, guild, addXp) {
    try {
        const membro = await guild.members.fetch(userId).catch(() => null);
        if (membro && await isCargoBloqueadoXP(membro, guild.id)) return false;
        
        const dataUser = garantirUsuario(userId, guild.id);
        const multiplicador = await getMultiplicadorXP(userId, guild);
        let xpFinal = Math.floor(addXp * multiplicador);
        
        const novoXp = dataUser.xp + xpFinal;
        const novoNivel = calcularNivelPorXP(novoXp);
        
        atualizarUsuario(dataUser.user_guild_id, novoXp, novoNivel, dataUser.mensagens + 1, dataUser.tempo_call);
        
        if (novoNivel > dataUser.nivel) await verificarLevelUp(userId, guild, dataUser.nivel, novoNivel);
        return true;
    } catch (error) { return false; }
}

async function adicionarXPCall(userId, guild) {
    try {
        const membro = await guild.members.fetch(userId).catch(() => null);
        if (membro && await isCargoBloqueadoXP(membro, guild.id)) return false;
        
        const dataUser = garantirUsuario(userId, guild.id);
        const multiplicador = await getMultiplicadorXP(userId, guild);
        let xpGanho = Math.floor(XP_POR_MINUTO_CALL * multiplicador);
        
        const novoXp = dataUser.xp + xpGanho;
        const novoNivel = calcularNivelPorXP(novoXp);
        
        atualizarUsuario(dataUser.user_guild_id, novoXp, novoNivel, dataUser.mensagens, dataUser.tempo_call + 1);
        
        if (novoNivel > dataUser.nivel) await verificarLevelUp(userId, guild, dataUser.nivel, novoNivel);
        return true;
    } catch (error) { return false; }
}

async function enviarRankingAutomatico() {
    try {
        const servidores = db.prepare('SELECT * FROM servidores_config').all();
        
        for (const server of servidores) {
            const config = JSON.parse(server.config_data);
            const guildId = server.guild_id;
            if (!config.canal_ranking) continue;

            const canal = await client.channels.fetch(config.canal_ranking).catch(() => null);
            if (!canal) continue;

            const usuarios = db.prepare('SELECT * FROM usuarios_xp WHERE guild_id = ? ORDER BY xp DESC LIMIT 15').all(guildId);
            if (usuarios.length === 0) continue;

            const cargosBloqueados = config.cargos_sem_xp || [];
            let rankingTexto = '';
            let posicao = 1;
            
            for (const data of usuarios) {
                const membro = await canal.guild.members.fetch(data.user_id).catch(() => null);
                if (!membro) continue;
                
                if (cargosBloqueados.some(cargoId => membro.roles.cache.has(cargoId))) continue;
                
                rankingTexto += `${posicao}. **${membro.user.username}** - Nível ${data.nivel} (${formatarNumero(data.xp)} XP)\n`;
                posicao++;
                if (posicao > 10) break;
            }

            const embed = new EmbedBuilder()
                .setColor('#ff0033')
                .setTitle('🏆 RANKING NA ENTIDADE DO NEVOEIRO')
                .setDescription(rankingTexto || 'Nenhum usuário no ranking ainda')
                .setFooter({ text: 'Ranking atualizado automaticamente' })
                .setTimestamp();

            const messages = await canal.messages.fetch({ limit: 1 }).catch(() => []);
            const ultimaMsg = messages.first();
            
            if (ultimaMsg && ultimaMsg.author.id === client.user.id && ultimaMsg.embeds.length > 0) {
                await ultimaMsg.edit({ embeds: [embed] }).catch(() => {});
            } else {
                await canal.send({ embeds: [embed] }).catch(() => {});
            }
        }
    } catch (error) { console.error('❌ Erro no ranking automático:', error); }
}

async function gerenciarXP(userId, guild, quantidade, operacao) {
    try {
        const dataUser = garantirUsuario(userId, guild.id);
        let novoXp = dataUser.xp;
        let novoNivel = dataUser.nivel;
        
        switch(operacao) {
            case 'add': novoXp += quantidade; break;
            case 'remove': novoXp = Math.max(0, novoXp - quantidade); break;
            case 'set': novoXp = Math.max(0, quantidade); break;
            case 'reset': novoXp = 0; break;
        }
        
        novoNivel = calcularNivelPorXP(novoXp);
        
        let tempoCall = operacao === 'reset' ? 0 : dataUser.tempo_call;
        let msgs = operacao === 'reset' ? 0 : dataUser.mensagens;
        
        atualizarUsuario(dataUser.user_guild_id, novoXp, novoNivel, msgs, tempoCall);
        
        if (novoNivel !== dataUser.nivel) {
            const membro = await guild.members.fetch(userId).catch(() => null);
            if (membro) await gerenciarCargosPorNivel(membro, novoNivel, dataUser.nivel);
            await verificarLevelUp(userId, guild, dataUser.nivel, novoNivel);
        }
        return { success: true, xpAntigo: dataUser.xp, xpNovo: novoXp, nivel: novoNivel };
    } catch (error) { return { success: false, message: 'Erro ao processar!' }; }
}

// ==========================================
// EVENTOS DO DISCORD
// ==========================================
client.once('ready', async () => {
    console.log(`🤖 Bot online como ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    
    const commands = [
        new SlashCommandBuilder().setName('perfil').setDescription('📜 Mostra seu perfil completo na Névoa'),
        new SlashCommandBuilder().setName('manual').setDescription('📖 Explica como funciona o sistema de níveis e XP'),
        new SlashCommandBuilder().setName('manual_adm').setDescription('⚙️ [ADMIN] Manual completo').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ranking').setDescription('🏆 Mostra o ranking do servidor'),
        new SlashCommandBuilder().setName('ranking_completo').setDescription('🏆 Mostra todos os usuários com XP'),
        
        new SlashCommandBuilder().setName('setup_servidor').setDescription('⚙️ [ADMIN] Configura canais')
            .addChannelOption(opt => opt.setName('canal_perfil').setDescription('Canal de comandos').setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addChannelOption(opt => opt.setName('canal_ranking').setDescription('Canal de ranking').setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addChannelOption(opt => opt.setName('canal_levelup').setDescription('Canal de level up').setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addChannelOption(opt => opt.setName('canal_auditoria').setDescription('Canal de logs').setRequired(true).addChannelTypes(ChannelType.GuildText))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        new SlashCommandBuilder().setName('setup_cargos').setDescription('⚙️ [ADMIN] Cria cargos de Nível 1 ao 150').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('setup_multiplicadores').setDescription('⚙️ [ADMIN] Cria cargos Booster e VIP').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder().setName('setup_orientacoes').setDescription('⚙️ [ADMIN] Define orientações e canais permitidos/ignorados')
            .addChannelOption(opt => opt.setName('canal_alvo').setDescription('Canal de postagem').setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addStringOption(opt => opt.setName('canais_xp').setDescription('Menções dos canais permitidos').setRequired(true))
            .addStringOption(opt => opt.setName('canais_ignorados').setDescription('Menções dos canais ignorados').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        new SlashCommandBuilder().setName('admin_cargos_sem_xp').setDescription('🚫 [ADMIN] Gerencia cargos bloqueados')
            .addSubcommand(sub => sub.setName('adicionar').setDescription('Bloquear cargo')
                .addRoleOption(opt => opt.setName('cargo').setDescription('Cargo').setRequired(true)))
            .addSubcommand(sub => sub.setName('remover').setDescription('Desbloquear cargo')
                .addRoleOption(opt => opt.setName('cargo').setDescription('Cargo').setRequired(true)))
            .addSubcommand(sub => sub.setName('listar').setDescription('Listar bloqueados'))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        new SlashCommandBuilder().setName('admin_xp').setDescription('⚙️ [ADMIN] Gerencia XP')
            .addSubcommand(sub => sub.setName('add').setDescription('Adiciona XP')
                .addUserOption(opt => opt.setName('usuario').setDescription('Usuário').setRequired(true))
                .addIntegerOption(opt => opt.setName('quantidade').setDescription('Quantidade').setRequired(true).setMinValue(1))
                .addStringOption(opt => opt.setName('motivo').setDescription('Motivo').setRequired(false)))
            .addSubcommand(sub => sub.setName('remove').setDescription('Remove XP')
                .addUserOption(opt => opt.setName('usuario').setDescription('Usuário').setRequired(true))
                .addIntegerOption(opt => opt.setName('quantidade').setDescription('Quantidade').setRequired(true))
                .addStringOption(opt => opt.setName('motivo').setDescription('Motivo').setRequired(false)))
            .addSubcommand(sub => sub.setName('set').setDescription('Define XP')
                .addUserOption(opt => opt.setName('usuario').setDescription('Usuário').setRequired(true))
                .addIntegerOption(opt => opt.setName('quantidade').setDescription('Quantidade').setRequired(true))
                .addStringOption(opt => opt.setName('motivo').setDescription('Motivo').setRequired(false)))
            .addSubcommand(sub => sub.setName('reset').setDescription('Reseta XP')
                .addUserOption(opt => opt.setName('usuario').setDescription('Usuário').setRequired(true))
                .addStringOption(opt => opt.setName('motivo').setDescription('Motivo').setRequired(false))),
        
        new SlashCommandBuilder().setName('admin_resetar_todos').setDescription('⚠️ [ADMIN] Zera o XP e nível de TODOS os membros do servidor')
            .addStringOption(opt => opt.setName('confirmacao').setDescription('Digite a palavra SIM em maiúsculo para confirmar').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        new SlashCommandBuilder().setName('admin_ver').setDescription('👁️ [ADMIN] Info de usuário')
            .addUserOption(opt => opt.setName('usuario').setDescription('Usuário').setRequired(true)),
        new SlashCommandBuilder().setName('admin_corrigir_niveis').setDescription('🔧 [ADMIN] Corrige níveis de todos'),
        new SlashCommandBuilder().setName('admin_corrigir_cargos').setDescription('🔧 [ADMIN] Corrige cargos baseados no nível')
    ].map(command => command.toJSON());

    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Comandos slash registrados com sucesso!');
    } catch (error) { console.error('❌ Erro ao registrar comandos:', error); }
    
    // Inicia loops automáticos
    await enviarRankingAutomatico();
    setInterval(() => enviarRankingAutomatico(), 6 * 60 * 60 * 1000); // Ranking a cada 6h
    
    await enviarBackup();
    setInterval(() => enviarBackup(), 1 * 60 * 60 * 1000); // Backup a cada 1h
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    // === COMANDOS DE CONFIGURAÇÃO ===
    if (interaction.commandName === 'setup_servidor') {
        const cPerfil = interaction.options.getChannel('canal_perfil');
        const cRanking = interaction.options.getChannel('canal_ranking');
        const cLevelup = interaction.options.getChannel('canal_levelup');
        const cAuditoria = interaction.options.getChannel('canal_auditoria');

        salvarConfigServidor(interaction.guildId, {
            canal_comandos: cPerfil.id,
            canal_ranking: cRanking.id,
            canal_levelup: cLevelup.id,
            canal_logs: cAuditoria.id
        });

        return interaction.reply({ content: `✅ Servidor configurado com sucesso!\n\n**Comandos:** <#${cPerfil.id}>\n**Ranking Automático:** <#${cRanking.id}>\n**Level Up:** <#${cLevelup.id}>\n**Auditoria:** <#${cAuditoria.id}>`, flags: MessageFlags.Ephemeral });
    }

    if (interaction.commandName === 'setup_cargos') {
        await interaction.deferReply();
        const cargosCriados = {};
        const niveisParaCriar = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150];
        
        try {
            for (const nivel of niveisParaCriar) {
                const cargo = await interaction.guild.roles.create({
                    name: `Nível ${nivel} - ${CONQUISTAS[nivel]}`,
                    color: '#ff0033',
                    reason: 'Criação automática para XP',
                });
                cargosCriados[nivel] = cargo.id;
            }
            salvarConfigServidor(interaction.guildId, { cargos_recompensa: cargosCriados });
            return interaction.editReply(`✅ **Cargos criados com sucesso!** O bot entregará automaticamente.`);
        } catch (error) { return interaction.editReply(`❌ Erro ao criar cargos. Verifique a permissão "Gerenciar Cargos".`); }
    }

    if (interaction.commandName === 'setup_multiplicadores') {
        await interaction.deferReply();
        try {
            const cargoBooster = await interaction.guild.roles.create({ name: 'Booster XP', color: '#ff73fa' });
            const cargoVip = await interaction.guild.roles.create({ name: 'VIP LEGACY', color: '#ffd700' });
            salvarConfigServidor(interaction.guildId, { cargo_booster: cargoBooster.id, cargo_vip_legacy: cargoVip.id });
            return interaction.editReply(`✅ **Cargos criados!**\n▫️ <@&${cargoBooster.id}>\n▫️ <@&${cargoVip.id}>`);
        } catch (error) { return interaction.editReply(`❌ Erro ao criar cargos multiplicadores.`); }
    }

    if (interaction.commandName === 'setup_orientacoes') {
        await interaction.deferReply();
        try {
            const canalAlvo = interaction.options.getChannel('canal_alvo');
            const matchXP = (interaction.options.getString('canais_xp').match(/<#\d+>/g) || []);
            const matchIgnorados = (interaction.options.getString('canais_ignorados').match(/<#\d+>/g) || []);
            
            salvarConfigServidor(interaction.guildId, {
                canais_xp: matchXP.map(m => m.replace(/\D/g, '')),
                canais_ignorados: matchIgnorados.map(m => m.replace(/\D/g, ''))
            });

            const config = await obterConfigServidor(interaction.guildId);
            if (!config || !config.cargos_recompensa) return interaction.editReply('❌ Rode o **/setup_cargos** primeiro!');

            const c = config.cargos_recompensa;
            const bName = config.cargo_booster ? `<@&${config.cargo_booster}>` : `@Server Booster`;

            const embed = new EmbedBuilder()
                .setColor('#000000')
                .setTitle('🌫️ Progressão no Nevoeiro 🌫️')
                .setDescription(`A Entidade observa tudo...\n\n🩸 **Canais que dão XP:**\n${matchXP.join(' ')}\n\n⚠️ **Canais ignorados:**\n${matchIgnorados.join(' ')}\n\n👇 **Cargos por Nível** 👇\n▫️ <@&${c['1']||'?'}> (Nvl 1)\n▫️ <@&${c['50']||'?'}> (Nvl 50)\n▫️ <@&${c['100']||'?'}> (Nvl 100)\n▫️ <@&${c['150']||'?'}> (Nvl 150)\n\n• Booster (${bName}) ganha ${MULTIPLICADOR_BOOSTER}x mais XP!`);
            
            await canalAlvo.send({ content: '||@everyone||', embeds: [embed] });
            return interaction.editReply(`✅ Mensagem de orientações enviada!`);
        } catch (error) { return interaction.editReply(`❌ Erro ao gerar mensagem.`); }
    }

    if (interaction.commandName === 'admin_cargos_sem_xp') {
        if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Acesso Negado', flags: MessageFlags.Ephemeral });
        
        const sub = interaction.options.getSubcommand();
        const config = await obterConfigServidor(interaction.guildId) || {};
        let lista = config.cargos_sem_xp || [];
        
        if (sub === 'adicionar') {
            const cargo = interaction.options.getRole('cargo');
            if (!lista.includes(cargo.id)) {
                lista.push(cargo.id);
                salvarConfigServidor(interaction.guildId, { cargos_sem_xp: lista });
            }
            return interaction.reply({ content: `✅ Cargo ${cargo} bloqueado de ganhar XP.`, flags: MessageFlags.Ephemeral });
        }
        if (sub === 'remover') {
            const cargo = interaction.options.getRole('cargo');
            lista = lista.filter(id => id !== cargo.id);
            salvarConfigServidor(interaction.guildId, { cargos_sem_xp: lista });
            return interaction.reply({ content: `✅ Cargo ${cargo} removido do bloqueio.`, flags: MessageFlags.Ephemeral });
        }
        if (sub === 'listar') {
            const txt = lista.length > 0 ? lista.map(id => `<@&${id}>`).join('\n') : 'Nenhum cargo bloqueado.';
            return interaction.reply({ content: `📋 **Cargos bloqueados:**\n${txt}`, flags: MessageFlags.Ephemeral });
        }
    }

    // === COMANDOS GERAIS (Perfil e Rank) ===
    const config = await obterConfigServidor(interaction.guildId);
    if (['perfil', 'manual', 'ranking', 'ranking_completo'].includes(interaction.commandName)) {
        if (config && config.canal_comandos && interaction.channelId !== config.canal_comandos) {
            return interaction.reply({ content: `❌ Comandos restritos ao canal <#${config.canal_comandos}>!`, flags: MessageFlags.Ephemeral });
        } else if (!config) {
            return interaction.reply({ content: `⚠️ Servidor não configurado. Adms usem **/setup_servidor**.`, flags: MessageFlags.Ephemeral });
        }
    }

    if (interaction.commandName === 'perfil') {
        const dataUser = garantirUsuario(interaction.user.id, interaction.guildId);
        const membro = await interaction.guild.members.fetch(interaction.user.id);
        
        const { faltando, proximoNivel } = calcularXPProximoNivel(dataUser.xp, dataUser.nivel);
        const xpBase = calcularXPNecessarioParaNivel(dataUser.nivel);
        const xpProximo = calcularXPNecessarioParaNivel(proximoNivel);
        const percent = proximoNivel > dataUser.nivel ? Math.floor((dataUser.xp - xpBase) / (xpProximo - xpBase) * 100) : 100;
        const barra = '▰'.repeat(Math.floor(percent / 5)) + '▱'.repeat(20 - Math.floor(percent / 5));
        
        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setAuthor({ name: membro.user.username, iconURL: membro.user.displayAvatarURL({ dynamic: true }) })
            .setTitle('📜 Perfil na Névoa')
            .setThumbnail(membro.user.displayAvatarURL({ size: 1024 }))
            .addFields(
                { name: '🏷️ Identidade', value: `**Usuário:** ${membro.user.tag}\n**Conquista:** ${obterConquista(dataUser.nivel)}`, inline: false },
                { name: '📊 Progressão', value: `**Nível:** ${dataUser.nivel}\n**XP Total:** ${formatarNumero(dataUser.xp)}\n**Próximo Nível:** ${proximoNivel}\n**Faltam:** ${formatarNumero(faltando)} XP`, inline: true },
                { name: '📈 Progresso', value: `▰${barra}▰ **${percent}%**`, inline: false },
                { name: '🎮 Atividade', value: `**Mensagens:** ${dataUser.mensagens}\n**Tempo Call:** ${Math.floor(dataUser.tempo_call/60)}h ${dataUser.tempo_call%60}m\n**Início XP:** ${formatarData(dataUser.data_entrada)}`, inline: false }
            )
            .setFooter({ text: 'Sistema de Progressão SQLite' });
            
        await interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'ranking' || interaction.commandName === 'ranking_completo') {
        const limite = interaction.commandName === 'ranking' ? 10 : 50;
        const usuarios = db.prepare(`SELECT * FROM usuarios_xp WHERE guild_id = ? ORDER BY xp DESC LIMIT ${limite}`).all(interaction.guildId);
        if (usuarios.length === 0) return interaction.reply({ content: '❌ Nenhum usuário encontrado!' });

        let rankingTexto = '';
        let posicao = 1;
        const cargosBloqueados = config?.cargos_sem_xp || [];

        for (const data of usuarios) {
            const membro = await interaction.guild.members.fetch(data.user_id).catch(() => null);
            if (!membro || cargosBloqueados.some(cId => membro.roles.cache.has(cId))) continue;
            rankingTexto += `${posicao}. **${membro.user.username}** - Nível ${data.nivel} (${formatarNumero(data.xp)} XP)\n`;
            posicao++;
        }

        const embed = new EmbedBuilder()
            .setColor('#ff0033')
            .setTitle(limite === 10 ? '🏆 TOP 10 DA NÉVOA' : '🏆 RANKING COMPLETO')
            .setDescription(rankingTexto || 'Nenhum usuário qualificado.')
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }

    // === COMANDOS ADMINISTRATIVOS ===
    if (['admin_xp', 'admin_resetar_todos', 'admin_ver', 'admin_corrigir_niveis', 'admin_corrigir_cargos'].includes(interaction.commandName)) {
        if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Acesso Negado!', flags: MessageFlags.Ephemeral });
    }

    if (interaction.commandName === 'admin_xp') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const sub = interaction.options.getSubcommand();
        const user = interaction.options.getUser('usuario');
        const qtd = interaction.options.getInteger('quantidade') || 0;
        const motivo = interaction.options.getString('motivo') || '';
        
        const res = await gerenciarXP(user.id, interaction.guild, qtd, sub);
        if (res.success) {
            await interaction.editReply(`✅ XP alterado! Novo XP: ${formatarNumero(res.xpNovo)} (Nível ${res.nivel})`);
            await enviarLogAdmin(interaction, sub, user, qtd, res, motivo);
        } else {
            await interaction.editReply('❌ Erro na operação.');
        }
    }

    if (interaction.commandName === 'admin_resetar_todos') {
        const confirmacao = interaction.options.getString('confirmacao');
        
        if (confirmacao !== 'SIM') {
            return interaction.reply({ 
                content: '❌ **Operação Cancelada.** Para evitar acidentes, você precisa digitar exatamente a palavra **SIM** na caixa de confirmação do comando.', 
                flags: MessageFlags.Ephemeral 
            });
        }
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        try {
            // Zera as informações de todos os usuários atrelados ao servidor atual
            const info = db.prepare('UPDATE usuarios_xp SET xp = 0, nivel = 1, mensagens = 0, tempo_call = 0 WHERE guild_id = ?').run(interaction.guildId);
            
            await interaction.editReply(`✅ **Aviso de Extinção no Nevoeiro!**\n\nTodos os **${info.changes} usuários** registrados no sistema tiveram o XP, Nível, e histórico de call/mensagens completamente apagados e restaurados para 0.\n\n⚠️ **ATENÇÃO:** O banco de dados foi limpo, mas os membros ainda estão com os **cargos** nos perfis deles do Discord. Para consertar isso, execute o comando \`/admin_corrigir_cargos\` logo em seguida.`);
            
            await enviarLogAdmin(interaction, 'reset_global', { tag: 'TODOS OS USUÁRIOS DO SERVIDOR', id: 'TODOS' }, 0, { xpAntigo: 0, xpNovo: 0, nivel: 1 }, 'Comando de Wipe Global acionado');
        } catch (error) {
            console.error(error);
            await interaction.editReply('❌ Ocorreu um erro no banco de dados ao tentar resetar os usuários.');
        }
    }

    if (interaction.commandName === 'admin_ver') {
        const user = interaction.options.getUser('usuario');
        const d = garantirUsuario(user.id, interaction.guildId);
        await interaction.reply({ 
            content: `📊 **Info de ${user.tag}**\nNível: ${d.nivel}\nXP: ${formatarNumero(d.xp)}\nMensagens: ${d.mensagens}\nMinutos Call: ${d.tempo_call}`, 
            flags: MessageFlags.Ephemeral 
        });
    }

    if (interaction.commandName === 'admin_corrigir_niveis') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        let corrigidos = 0;
        const usuarios = db.prepare('SELECT * FROM usuarios_xp WHERE guild_id = ?').all(interaction.guildId);
        
        for (const u of usuarios) {
            const nivelCerto = calcularNivelPorXP(u.xp);
            if (u.nivel !== nivelCerto) {
                db.prepare('UPDATE usuarios_xp SET nivel = ? WHERE user_guild_id = ?').run(nivelCerto, u.user_guild_id);
                corrigidos++;
            }
        }
        await interaction.editReply(`✅ ${corrigidos} níveis corrigidos no banco de dados SQLite!`);
    }

    if (interaction.commandName === 'admin_corrigir_cargos') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (!config?.cargos_recompensa) return interaction.editReply('❌ Cargos não configurados.');
        
        let arrumados = 0;
        const usuarios = db.prepare('SELECT * FROM usuarios_xp WHERE guild_id = ?').all(interaction.guildId);
        
        for (const u of usuarios) {
            const membro = await interaction.guild.members.fetch(u.user_id).catch(() => null);
            if (membro) {
                await gerenciarCargosPorNivel(membro, u.nivel, 1);
                arrumados++;
            }
        }
        await interaction.editReply(`✅ Cargos sincronizados para ${arrumados} usuários ativos no servidor!`);
    }

    if (['manual', 'manual_adm'].includes(interaction.commandName)) {
        await interaction.reply({ content: `📖 Leia as regras no canal correspondente. XP base: ${XP_MIN}-${XP_MAX}. Resets de flood: ${COOLDOWN_TEMPO/1000}s. Calls: ${XP_POR_MINUTO_CALL}/min.`, flags: MessageFlags.Ephemeral });
    }
});

// ==========================================
// MONITORAMENTO DE EVENTOS (XP Automático)
// ==========================================
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    
    const config = await obterConfigServidor(message.guild.id);
    if (config) {
        if (config.canais_ignorados?.includes(message.channelId)) return;
        if (config.canais_xp?.length > 0 && !config.canais_xp.includes(message.channelId)) return;
    }

    if (ultimaMensagem.get(message.author.id) === message.content) return;
    ultimaMensagem.set(message.author.id, message.content);
    
    if (cooldowns.has(message.author.id) && Date.now() < cooldowns.get(message.author.id) + COOLDOWN_TEMPO) return;
    cooldowns.set(message.author.id, Date.now());
    
    const xpGanho = Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN;
    await adicionarXPMensagem(message.author.id, message.guild, xpGanho);
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
        const userId = newState.id || oldState.id;
        const guild = newState.guild || oldState.guild;
        if (!userId || !guild) return;

        if (!oldState.channelId && newState.channelId) {
            const config = await obterConfigServidor(guild.id);
            if (config) {
                if (config.canais_ignorados?.includes(newState.channelId)) return;
                if (config.canais_xp?.length > 0 && !config.canais_xp.includes(newState.channelId)) return;
            }

            const interval = setInterval(async () => {
                const membro = await guild.members.fetch(userId).catch(() => null);
                if (!membro?.voice.channelId) {
                    if (voiceSessions.has(userId)) { clearInterval(voiceSessions.get(userId).interval); voiceSessions.delete(userId); }
                    return;
                }
                await adicionarXPCall(userId, guild);
            }, 60000);
            
            voiceSessions.set(userId, { interval });
        }
        
        if (oldState.channelId && !newState.channelId && voiceSessions.has(userId)) {
            clearInterval(voiceSessions.get(userId).interval);
            voiceSessions.delete(userId);
        }
    } catch (error) { console.error('❌ Erro no voiceStateUpdate:', error); }
});

client.login(process.env.TOKEN);