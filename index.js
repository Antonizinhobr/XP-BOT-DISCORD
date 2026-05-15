require('dotenv').config();

const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, MessageFlags, SlashCommandBuilder, REST, Routes, ChannelType } = require('discord.js');
const admin = require('firebase-admin');

try {
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
        console.error('❌ Variáveis de ambiente do Firebase não configuradas corretamente!');
        process.exit(1);
    }
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        })
    });
    console.log('✅ Firebase inicializado com sucesso!');
} catch (error) {
    console.error('❌ Erro ao inicializar Firebase:', error);
    process.exit(1);
}

const db = admin.firestore();
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

setInterval(() => { console.log('💓 Heartbeat enviado em', new Date().toISOString()); }, 5 * 60 * 1000);

const cooldowns = new Map();
const ultimaMensagem = new Map();
const voiceSessions = new Map();

const COOLDOWN_TEMPO = 10000;
const XP_MIN = 15;
const XP_MAX = 25;
const XP_POR_MINUTO_CALL = 10;
const MULTIPLICADOR_BOOSTER = 2.2;
const MULTIPLICADOR_VIP_LEGACY = 2.0;

const ADMIN_IDS = []; 
const BOOSTERS_MANUAIS = [];

const CONQUISTAS = {
    1: 'Inexperienced', 10: 'Deja Vu', 20: 'Quick & Quiet', 30: 'Self-Care', 40: 'Bond', 50: 'Leader',
    60: 'Adrenaline', 70: 'Borrowed Time', 80: 'BBQ & Chili', 90: 'Dying Light',
    100: 'Devour Hope', 110: 'Corrupt Intervention', 120: 'No One Escapes Death',
    130: 'Nemesis', 140: 'Blood Warden', 150: 'Decisive Strike'
};

async function obterConfigServidor(guildId) {
    try {
        const doc = await db.collection('servidores_config').doc(guildId).get();
        if (doc.exists) return doc.data();
        return null;
    } catch (error) {
        console.error(`Erro ao buscar config do servidor ${guildId}:`, error);
        return null;
    }
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
        const xpNecessario = calcularXPNecessarioParaNivel(nivel + 1);
        if (xp < xpNecessario) return nivel;
    }
    return 200;
}

function calcularXPProximoNivel(xp, nivelAtual) {
    const xpProximo = calcularXPNecessarioParaNivel(nivelAtual + 1);
    const faltando = Math.max(0, xpProximo - xp);
    return { faltando, proximoNivel: nivelAtual + 1 };
}

function formatarNumero(num) { return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
function formatarData(data) { return data.toLocaleDateString('pt-BR'); }

function obterConquista(nivel) {
    const niveisOrdenados = Object.keys(CONQUISTAS).sort((a,b) => Number(b) - Number(a));
    for (const n of niveisOrdenados) {
        if (nivel >= Number(n)) return CONQUISTAS[n];
    }
    return 'Inexperienced (No One Left Behind)';
}

function isAdmin(member) {
    if (!member) return false;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    return false;
}

async function getMultiplicadorXP(userId, guild) {
    try {
        const membro = await guild.members.fetch(userId).catch(() => null);
        if (!membro) return 1;

        const config = await obterConfigServidor(guild.id);
        if (!config) return 1;

        const temBooster = config.cargo_booster && membro.roles.cache.has(config.cargo_booster);
        const temVipLegacy = config.cargo_vip_legacy && membro.roles.cache.has(config.cargo_vip_legacy);

        if (temBooster) return MULTIPLICADOR_BOOSTER;
        if (temVipLegacy) return MULTIPLICADOR_VIP_LEGACY;
        
        return 1;
    } catch (error) {
        return 1;
    }
}

async function gerenciarCargosPorNivel(membro, nivelNovo, nivelAntigo) {
    try {
        const config = await obterConfigServidor(membro.guild.id);
        if (!config || !config.cargos_recompensa) return; 

        const cargosNoServidor = config.cargos_recompensa;
        const todosCargosNivel = Object.values(cargosNoServidor);

        for (const cargoId of todosCargosNivel) {
            const cargo = membro.guild.roles.cache.get(cargoId);
            if (cargo && membro.roles.cache.has(cargoId)) {
                await membro.roles.remove(cargo).catch(() => {});
            }
        }
        
        let milestoneAtual = Math.floor(nivelNovo / 10) * 10;
        if (nivelNovo < 10) milestoneAtual = 1;

        if (cargosNoServidor[milestoneAtual]) {
            const cargoNovo = membro.guild.roles.cache.get(cargosNoServidor[milestoneAtual]);
            if (cargoNovo && !membro.roles.cache.has(cargoNovo.id)) {
                await membro.roles.add(cargoNovo).catch(() => {});
            }
        }
    } catch (error) {
        console.error('❌ Erro ao gerenciar cargos:', error);
    }
}

async function enviarLogAdmin(interaction, operacao, usuario, quantidade, resultado, motivo = '') {
    try {
        const config = await obterConfigServidor(interaction.guildId);
        if (!config || !config.canal_logs) return;

        const canalLog = await client.channels.fetch(config.canal_logs).catch(() => null);
        if (!canalLog || !canalLog.isTextBased()) return;

        const embed = new EmbedBuilder()
            .setColor(operacao === 'reset' ? '#ff0000' : '#00ff00')
            .setTitle('📋 LOG ADMINISTRATIVO')
            .setDescription(`**Comando executado por:** ${interaction.user.tag} (${interaction.user.id})\n**Operação:** ${operacao.toUpperCase()}`)
            .addFields(
                { name: '👤 Usuário Alvo', value: `${usuario.tag || usuario.username} (${usuario.id})`, inline: true },
                { name: '📝 Motivo', value: motivo || 'Sem motivo especificado', inline: true }
            )
            .setTimestamp();
            
        if (operacao === 'add' || operacao === 'remove' || operacao === 'set') {
             embed.addFields(
                { name: '🎯 XP Movimentado', value: formatarNumero(quantidade), inline: true },
                { name: '📊 XP Antigo', value: formatarNumero(resultado.xpAntigo), inline: true },
                { name: '📊 XP Novo', value: formatarNumero(resultado.xpNovo), inline: true },
                { name: '🎯 Nível Atual', value: resultado.nivel.toString(), inline: true }
            );
        } else if (operacao === 'reset') {
            embed.addFields(
                { name: '🔄 XP Resetado', value: 'Todos os XP foram zerados', inline: false },
                { name: '📊 XP Antigo', value: formatarNumero(resultado.xpAntigo), inline: true },
                { name: '📊 XP Novo', value: '0', inline: true },
                { name: '🎯 Nível Atual', value: '1', inline: true }
            );
        }

        embed.addFields({ name: '📅 Data/Hora', value: new Date().toLocaleString('pt-BR'), inline: true });
        await canalLog.send({ embeds: [embed] }).catch(console.error);
    } catch (error) {
        console.error('❌ Erro ao enviar log admin:', error);
    }
}

// 🟢 FUNÇÕES DO DB ATUALIZADAS PARA ISOLAR POR SERVIDOR (guildId)
async function garantirUsuario(userId, guildId) {
    try {
        const userRef = db.collection('servidores_xp').doc(guildId).collection('usuarios').doc(userId);
        const doc = await userRef.get();
        if (!doc.exists) {
            await userRef.set({
                xp: 0, nivel: 1,
                stats: { mensagens: 0, tempoCall: 0, dataEntrada: Date.now() },
                criado_em: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        return true;
    } catch (error) {
        return false;
    }
}

async function verificarLevelUp(userId, guild, nivelAntigo, nivelNovo) {
    try {
        const userRef = db.collection('servidores_xp').doc(guild.id).collection('usuarios').doc(userId);
        const doc = await userRef.get();
        if (!doc.exists) return;
        
        const membro = await guild.members.fetch(userId).catch(() => null);
        
        if (membro && nivelNovo > nivelAntigo) {
            await gerenciarCargosPorNivel(membro, nivelNovo, nivelAntigo);
        }
        
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
            let mensagemDescricao = `A Névoa sussurra o seu nome, <@${userId}>...\nSua dedicação foi reconhecida e você ascendeu para o **Nível ${milestone}**!\n\n🏆 **Nova Conquista:** ${conquista}`;
            let ganhouCargo = false;
            
            if (config.cargos_recompensa && config.cargos_recompensa[milestone]) {
                const cargoId = config.cargos_recompensa[milestone];
                const cargo = guild.roles.cache.get(cargoId);
                if (cargo) {
                    mensagemDescricao += `\n\n🩸 Você foi condecorado com o cargo <@&${cargoId}>!`;
                    ganhouCargo = true;
                }
            }
            
            const embed = new EmbedBuilder()
                .setColor(ganhouCargo ? '#ff0033' : '#8a0000')
                .setTitle('🔥 ASCENSÃO NA NÉVOA!')
                .setDescription(mensagemDescricao)
                .setThumbnail(membro.user.displayAvatarURL({ dynamic: true, size: 512 }))
                .setFooter({ text: 'Sistema de XP', iconURL: guild.iconURL({ dynamic: true }) })
                .setTimestamp();
                
            if (ganhouCargo) embed.setImage('https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExcXZ5ams1d2k4N3BxMDdoaXYzcDdzaHBmamNpMG9lc2MzOHR1dXNyZyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/dauO3PZO8aKrlFZ9tX/giphy.gif');
            await canalEvolucao.send({ content: `🎉 <@${userId}> acaba de subir para o nível **${milestone}**! 🎉`, embeds: [embed] }).catch(() => {});
        }
    } catch (error) {
        console.error('❌ Erro em verificarLevelUp:', error);
    }
}

async function adicionarXPMensagem(userId, guild, addXp) {
    try {
        await garantirUsuario(userId, guild.id);
        const multiplicador = await getMultiplicadorXP(userId, guild);
        let xpFinal = Math.floor(addXp * multiplicador);
        
        const userRef = db.collection('servidores_xp').doc(guild.id).collection('usuarios').doc(userId);
        const doc = await userRef.get();
        
        let xpAtual = doc.data().xp || 0;
        let nivelAtual = doc.data().nivel || 1;
        let stats = doc.data().stats || { mensagens: 0, tempoCall: 0, dataEntrada: Date.now() };
        stats.mensagens += 1;
        
        const novoXp = xpAtual + xpFinal;
        const novoNivel = calcularNivelPorXP(novoXp);
        
        await userRef.set({ xp: novoXp, nivel: novoNivel, stats: stats, ultima_atualizacao: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        if (novoNivel > nivelAtual) await verificarLevelUp(userId, guild, nivelAtual, novoNivel);
        return true;
    } catch (error) { return false; }
}

async function adicionarXPCall(userId, guild) {
    try {
        await garantirUsuario(userId, guild.id);
        const multiplicador = await getMultiplicadorXP(userId, guild);
        let xpGanho = Math.floor(XP_POR_MINUTO_CALL * multiplicador);
        
        const userRef = db.collection('servidores_xp').doc(guild.id).collection('usuarios').doc(userId);
        const doc = await userRef.get();
        
        let xpAtual = doc.data().xp || 0;
        let nivelAtual = doc.data().nivel || 1;
        let stats = doc.data().stats || { mensagens: 0, tempoCall: 0, dataEntrada: Date.now() };
        stats.tempoCall += 1;
        
        const novoXp = xpAtual + xpGanho;
        const novoNivel = calcularNivelPorXP(novoXp);
        
        await userRef.set({ xp: novoXp, nivel: novoNivel, stats: stats, ultima_atualizacao: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        if (novoNivel > nivelAtual) await verificarLevelUp(userId, guild, nivelAtual, novoNivel);
        return true;
    } catch (error) { return false; }
}

async function enviarRankingAutomatico() {
    try {
        const servidores = await db.collection('servidores_config').get();
        
        for (const docConf of servidores.docs) {
            const config = docConf.data();
            const guildId = docConf.id;
            if (!config.canal_ranking) continue;

            const canal = await client.channels.fetch(config.canal_ranking).catch(() => null);
            if (!canal) continue;

            const snapshot = await db.collection('servidores_xp').doc(guildId).collection('usuarios').orderBy('xp', 'desc').limit(15).get();
            if (snapshot.empty) continue;

            let rankingTexto = '';
            let posicao = 1;
            for (const userDoc of snapshot.docs) {
                const data = userDoc.data();
                if (data.is_sistema) continue;
                
                const membro = await canal.guild.members.fetch(userDoc.id).catch(() => null);
                if (!membro) continue; 
                
                rankingTexto += `${posicao}. **${membro.user.username}** - Nível ${data.nivel || 1} (${formatarNumero(data.xp || 0)} XP)\n`;
                posicao++;
                if (posicao > 10) break; 
            }

            const embed = new EmbedBuilder()
                .setColor('#ff0033')
                .setTitle('🏆 RANKING DA NÉVOA')
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
    } catch (error) {
        console.error('❌ Erro no ranking automático:', error);
    }
}

async function gerenciarXP(userId, guild, quantidade, operacao, motivo = '') {
    try {
        await garantirUsuario(userId, guild.id);
        const userRef = db.collection('servidores_xp').doc(guild.id).collection('usuarios').doc(userId);
        const doc = await userRef.get();
        
        let xpAtual = doc.data().xp || 0;
        let nivelAtual = doc.data().nivel || 1;
        let stats = doc.data().stats || { mensagens: 0, tempoCall: 0, dataEntrada: Date.now() };
        let novoXp = xpAtual;
        
        switch(operacao) {
            case 'add': novoXp = xpAtual + quantidade; break;
            case 'remove': novoXp = Math.max(0, xpAtual - quantidade); break;
            case 'set': novoXp = Math.max(0, quantidade); break;
            case 'reset': novoXp = 0; stats = { mensagens: 0, tempoCall: 0, dataEntrada: stats.dataEntrada || Date.now() }; break;
        }
        
        const novoNivel = calcularNivelPorXP(novoXp);
        await userRef.set({
            xp: novoXp, nivel: novoNivel, stats: stats,
            ultima_modificacao: { operacao, quantidade, motivo, data: new Date() }
        }, { merge: true });
        
        if (novoNivel !== nivelAtual) {
            const membro = await guild.members.fetch(userId).catch(() => null);
            if (membro) await gerenciarCargosPorNivel(membro, novoNivel, nivelAtual);
            await verificarLevelUp(userId, guild, nivelAtual, novoNivel);
        }
        return { success: true, xpAntigo: xpAtual, xpNovo: novoXp, nivel: novoNivel };
    } catch (error) { return { success: false, message: 'Erro ao processar!' }; }
}

async function corrigirNiveisTodos(guildId) {
    try {
        const snapshot = await db.collection('servidores_xp').doc(guildId).collection('usuarios').get();
        let corrigidos = 0;
        for (const doc of snapshot.docs) {
            const data = doc.data();
            if (data.is_sistema) continue;
            const xpAtual = data.xp || 0;
            const nivelCorreto = calcularNivelPorXP(xpAtual);
            const nivelAtual = data.nivel || 1;
            if (nivelCorreto !== nivelAtual) {
                await db.collection('servidores_xp').doc(guildId).collection('usuarios').doc(doc.id).update({ nivel: nivelCorreto });
                corrigidos++;
            }
        }
        return corrigidos;
    } catch (error) {
        return 0;
    }
}

async function corrigirCargosTodos(guild) {
    try {
        const config = await obterConfigServidor(guild.id);
        if (!config || !config.cargos_recompensa) {
            return { corrigidos: 0, erros: 0, message: 'Cargos de recompensa não configurados neste servidor.' };
        }

        const snapshot = await db.collection('servidores_xp').doc(guild.id).collection('usuarios').get();
        let corrigidos = 0;
        let erros = 0;
        const cargosNoServidor = config.cargos_recompensa;
        const todosCargosNivel = Object.values(cargosNoServidor);

        for (const doc of snapshot.docs) {
            const data = doc.data();
            if (data.is_sistema) continue;
            const userId = doc.id;
            const nivel = data.nivel || 1;
            
            const membro = await guild.members.fetch(userId).catch(() => null);
            if (!membro) continue; 

            try {
                for (const cargoId of todosCargosNivel) {
                    const cargo = guild.roles.cache.get(cargoId);
                    if (cargo && membro.roles.cache.has(cargoId)) {
                        await membro.roles.remove(cargo).catch(() => {});
                    }
                }
                
                let milestoneAtual = Math.floor(nivel / 10) * 10;
                if (nivel < 10) milestoneAtual = 1;

                if (cargosNoServidor[milestoneAtual]) {
                    const cargoNovo = guild.roles.cache.get(cargosNoServidor[milestoneAtual]);
                    if (cargoNovo && !membro.roles.cache.has(cargoNovo.id)) {
                        await membro.roles.add(cargoNovo).catch(() => {});
                        corrigidos++;
                    }
                }
            } catch (error) {
                erros++;
            }
        }
        return { corrigidos, erros, message: 'Concluído' };
    } catch (error) {
        return { corrigidos: 0, erros: 0, message: 'Erro interno' };
    }
}

async function rankingCompleto(interaction) {
    try {
        const snapshot = await db.collection('servidores_xp').doc(interaction.guildId).collection('usuarios').orderBy('xp', 'desc').get();
        if (snapshot.empty) return interaction.reply({ content: '❌ Nenhum usuário com XP encontrado!', flags: MessageFlags.Ephemeral });
        
        let rankingTexto = '';
        let posicao = 1;
        let totalUsuarios = 0;
        
        for (const doc of snapshot.docs) {
            const data = doc.data();
            if (data.is_sistema) continue;
            
            const membro = await interaction.guild.members.fetch(doc.id).catch(() => null);
            if (!membro) continue;
            
            const nome = membro.user.username;
            rankingTexto += `${posicao}. **${nome}** - Nível ${data.nivel || 1} (${formatarNumero(data.xp || 0)} XP)\n`;
            posicao++;
            totalUsuarios++;
            if (posicao > 50) break;
        }
        
        if (rankingTexto === '') {
            return interaction.reply({ content: '❌ Nenhum usuário com XP encontrado!', flags: MessageFlags.Ephemeral });
        }
        
        const embed = new EmbedBuilder()
            .setColor('#ff0033')
            .setTitle('🏆 RANKING COMPLETO DA NÉVOA')
            .setDescription(rankingTexto)
            .setFooter({ text: `Sistema de XP • Total de ${totalUsuarios} usuários com XP • Mostrando top 50` })
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        await interaction.reply({ content: '❌ Erro ao gerar ranking completo!', flags: MessageFlags.Ephemeral });
    }
}

client.once('ready', async () => {
    console.log(`🤖 Bot online como ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    const commands = [
        new SlashCommandBuilder().setName('perfil').setDescription('📜 Mostra seu perfil completo na Névoa'),
        new SlashCommandBuilder().setName('manual').setDescription('📖 Explica como funciona o sistema de níveis e XP para os usuários'),
        new SlashCommandBuilder().setName('manual_adm').setDescription('⚙️ [ADMIN] Manual completo com comandos de administração').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ranking').setDescription('🏆 [ADMIN] Mostra o ranking do servidor'),
        new SlashCommandBuilder().setName('ranking_completo').setDescription('🏆 Mostra todos os usuários com XP do servidor'),
        
        new SlashCommandBuilder().setName('setup_servidor').setDescription('⚙️ [ADMIN] Configura os canais do bot neste servidor')
            .addChannelOption(opt => opt.setName('canal_perfil').setDescription('Canal para comandos como perfil e manual').setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addChannelOption(opt => opt.setName('canal_ranking').setDescription('Canal para enviar o ranking automático').setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addChannelOption(opt => opt.setName('canal_levelup').setDescription('Canal para anúncios de subida de nível').setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addChannelOption(opt => opt.setName('canal_auditoria').setDescription('Canal para enviar logs de alterações dos admins').setRequired(true).addChannelTypes(ChannelType.GuildText))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        new SlashCommandBuilder().setName('setup_cargos').setDescription('⚙️ [ADMIN] Cria automaticamente todos os cargos de XP (Nível 1 ao 150)')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        new SlashCommandBuilder().setName('setup_multiplicadores').setDescription('⚙️ [ADMIN] Cria os cargos Booster e VIP Legacy automaticamente e salva no sistema')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        new SlashCommandBuilder().setName('setup_orientacoes').setDescription('⚙️ [ADMIN] Define canais de XP e envia a mensagem de orientações')
            .addChannelOption(opt => opt.setName('canal_alvo').setDescription('Canal onde a mensagem de orientações será postada').setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addStringOption(opt => opt.setName('canais_xp').setDescription('Cole aqui as menções dos canais permitidos (Ex: #chat #voz)').setRequired(true))
            .addStringOption(opt => opt.setName('canais_ignorados').setDescription('Cole aqui as menções dos canais ignorados (Ex: #afk #musica)').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        // NOVO COMANDO: MIGRAÇÃO DE BANCO DE DADOS ANTIGO
        new SlashCommandBuilder().setName('admin_migrar_db').setDescription('🚨 [ADMIN] Migra todo o XP antigo global para este servidor')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        new SlashCommandBuilder().setName('admin_xp').setDescription('⚙️ [ADMIN] Gerencia XP de usuários')
            .addSubcommand(sub => sub.setName('add').setDescription('➕ Adiciona XP')
                .addUserOption(opt => opt.setName('usuario').setDescription('👤 Usuário que receberá o XP').setRequired(true))
                .addIntegerOption(opt => opt.setName('quantidade').setDescription('🔢 Quantidade de XP a adicionar').setRequired(true).setMinValue(1))
                .addStringOption(opt => opt.setName('motivo').setDescription('📝 Motivo da adição').setRequired(false)))
            .addSubcommand(sub => sub.setName('remove').setDescription('➖ Remove XP')
                .addUserOption(opt => opt.setName('usuario').setDescription('👤 Usuário que perderá o XP').setRequired(true))
                .addIntegerOption(opt => opt.setName('quantidade').setDescription('🔢 Quantidade de XP a remover').setRequired(true))
                .addStringOption(opt => opt.setName('motivo').setDescription('📝 Motivo da remoção').setRequired(false)))
            .addSubcommand(sub => sub.setName('set').setDescription('🎯 Define XP exato')
                .addUserOption(opt => opt.setName('usuario').setDescription('👤 Usuário que terá o XP definido').setRequired(true))
                .addIntegerOption(opt => opt.setName('quantidade').setDescription('🔢 Valor exato do XP').setRequired(true))
                .addStringOption(opt => opt.setName('motivo').setDescription('📝 Motivo da alteração').setRequired(false)))
            .addSubcommand(sub => sub.setName('reset').setDescription('🔄 Reseta XP')
                .addUserOption(opt => opt.setName('usuario').setDescription('👤 Usuário que terá o XP zerado').setRequired(true))
                .addStringOption(opt => opt.setName('motivo').setDescription('📝 Motivo do reset').setRequired(false))),
        
        new SlashCommandBuilder().setName('admin_ver').setDescription('👁️ [ADMIN] Ver informações de um usuário').addUserOption(opt => opt.setName('usuario').setDescription('👤 Usuário para verificar a informação').setRequired(true)),
        new SlashCommandBuilder().setName('admin_corrigir_niveis').setDescription('🔧 [ADMIN] Corrige níveis de todos os usuários'),
        new SlashCommandBuilder().setName('admin_corrigir_cargos').setDescription('🔧 [ADMIN] Corrige cargos de todos os usuários baseado no nível (No servidor atual)')
    ].map(command => command.toJSON());

    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Comandos slash registrados com sucesso!');
    } catch (error) { 
        console.error('❌ Erro ao registrar comandos:', error); 
    }
    
    await enviarRankingAutomatico();
    setInterval(() => enviarRankingAutomatico(), 6 * 60 * 60 * 1000);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'setup_servidor') {
        const cPerfil = interaction.options.getChannel('canal_perfil');
        const cRanking = interaction.options.getChannel('canal_ranking');
        const cLevelup = interaction.options.getChannel('canal_levelup');
        const cAuditoria = interaction.options.getChannel('canal_auditoria');

        await db.collection('servidores_config').doc(interaction.guildId).set({
            canal_comandos: cPerfil.id,
            canal_ranking: cRanking.id,
            canal_levelup: cLevelup.id,
            canal_logs: cAuditoria.id
        }, { merge: true });

        return interaction.reply({ content: `✅ Servidor configurado com sucesso!\n\n**Comandos (Perfil):** <#${cPerfil.id}>\n**Ranking Automático:** <#${cRanking.id}>\n**Level Up:** <#${cLevelup.id}>\n**Auditoria (Logs):** <#${cAuditoria.id}>` });
    }

    if (interaction.commandName === 'setup_cargos') {
        await interaction.deferReply();
        const cargosCriados = {};
        const niveisParaCriar = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150];
        
        try {
            for (const nivel of niveisParaCriar) {
                const nomeConquista = CONQUISTAS[nivel];
                const nomeCargo = `Nível ${nivel} - ${nomeConquista}`;
                
                const cargo = await interaction.guild.roles.create({
                    name: nomeCargo,
                    color: '#ff0033',
                    reason: 'Criação automática para o sistema de XP',
                });
                
                cargosCriados[nivel] = cargo.id;
            }

            await db.collection('servidores_config').doc(interaction.guildId).set({
                cargos_recompensa: cargosCriados
            }, { merge: true });

            return interaction.editReply(`✅ **Cargos criados com sucesso!**\nOs 16 cargos foram adicionados ao servidor e vinculados ao banco de dados. O bot já vai entregá-los automaticamente quando alguém subir de nível!`);
        } catch (error) {
            console.error('Erro ao criar cargos:', error);
            return interaction.editReply(`❌ Erro ao criar cargos. Verifique se o bot possui a permissão de "Gerenciar Cargos".`);
        }
    }

    if (interaction.commandName === 'setup_multiplicadores') {
        await interaction.deferReply();
        try {
            const cargoBooster = await interaction.guild.roles.create({
                name: 'Booster XP',
                color: '#ff73fa',
                reason: 'Criação automática para multiplicador de XP',
            });

            const cargoVip = await interaction.guild.roles.create({
                name: 'VIP LEGACY',
                color: '#ffd700',
                reason: 'Criação automática para multiplicador de XP',
            });

            await db.collection('servidores_config').doc(interaction.guildId).set({
                cargo_booster: cargoBooster.id,
                cargo_vip_legacy: cargoVip.id
            }, { merge: true });

            return interaction.editReply(`✅ **Cargos de multiplicador criados e configurados!**\n▫️ <@&${cargoBooster.id}> (Multiplicador ${MULTIPLICADOR_BOOSTER}x)\n▫️ <@&${cargoVip.id}> (Multiplicador ${MULTIPLICADOR_VIP_LEGACY}x)\n\nEntregue esses cargos aos membros desejados e o bot calculará o bônus automaticamente!`);
        } catch (error) {
            console.error('Erro ao criar multiplicadores:', error);
            return interaction.editReply(`❌ Erro ao criar cargos. Verifique as permissões do bot.`);
        }
    }

    if (interaction.commandName === 'setup_orientacoes') {
        await interaction.deferReply();
        try {
            const canalAlvo = interaction.options.getChannel('canal_alvo');
            const strXP = interaction.options.getString('canais_xp');
            const strIgnorados = interaction.options.getString('canais_ignorados');

            const matchXP = strXP.match(/<#\d+>/g) || [];
            const matchIgnorados = strIgnorados.match(/<#\d+>/g) || [];
            const arrXP = matchXP.map(m => m.replace(/\D/g, ''));
            const arrIgnorados = matchIgnorados.map(m => m.replace(/\D/g, ''));

            if (arrXP.length === 0 && arrIgnorados.length === 0) {
                return interaction.editReply('❌ Você precisa marcar pelo menos um canal com #nome nos campos para o bot registrar.');
            }

            await db.collection('servidores_config').doc(interaction.guildId).set({
                canais_xp: arrXP,
                canais_ignorados: arrIgnorados
            }, { merge: true });

            const config = await obterConfigServidor(interaction.guildId);
            if (!config || !config.cargos_recompensa) {
                return interaction.editReply('❌ Você precisa rodar o comando **/setup_cargos** antes de gerar as orientações!');
            }
            
            const c = config.cargos_recompensa;
            const boosterId = config.cargo_booster;
            const boosterName = boosterId ? `<@&${boosterId}>` : `@Server Booster`;

            let msgDesc = `A Entidade observa tudo. Cada passo seu, cada palavra, cada interação… nada passa despercebido.\n\nNeste servidor, sua atividade define seu destino. Quanto mais você conversa, participa e compartilha conteúdos nos canais permitidos, mais você avança dentro do Nevoeiro.\n\nA cada novo nível, a Entidade concede marcas visíveis do seu progresso — cores únicas que destacam seu nome e mostram que você não é apenas mais um sobrevivente perdido… ou talvez já esteja se tornando algo além disso.\n\n`;

            msgDesc += `🩸 **Canais que concedem XP**\n${matchXP.join(' ')}\n\n`;
            msgDesc += `⚠️ **Canais que NÃO concedem XP**\n${matchIgnorados.join(' ')}\n\n`;

            msgDesc += `👇 **Caminhos da Entidade (Cargos por Nível)** 👇\n\n`;
            msgDesc += `**Sobreviventes Perdidos**\n▫️ <@&${c['1'] || '?'}> 🛡️ (Level 1)\n▫️ <@&${c['10'] || '?'}> 🛡️ (Level 10)\n▫️ <@&${c['20'] || '?'}> 🛡️ (Level 20)\n▫️ <@&${c['30'] || '?'}> 🛡️ (Level 30)\n\n`;
            msgDesc += `**Marcados pelo Nevoeiro**\n▫️ <@&${c['40'] || '?'}> ⚔️ (Level 40)\n▫️ <@&${c['50'] || '?'}> ⚔️ (Level 50)\n▫️ <@&${c['60'] || '?'}> ⚔️ (Level 60)\n▫️ <@&${c['70'] || '?'}> ⚔️ (Level 70)\n\n`;
            msgDesc += `**Obsessões errantes**\n▫️ <@&${c['80'] || '?'}> 🔥 (Level 80)\n▫️ <@&${c['90'] || '?'}> 🔥 (Level 90)\n▫️ <@&${c['100'] || '?'}> 🔮 (Level 100)\n▫️ <@&${c['110'] || '?'}> 🔮 (Level 110)\n\n`;
            msgDesc += `**Escolhidos da Entidade**\n▫️ <@&${c['120'] || '?'}> 👑 (Level 120)\n▫️ <@&${c['130'] || '?'}> 👑 (Level 130)\n▫️ <@&${c['140'] || '?'}> 🩸 (Level 140)\n▫️ <@&${c['150'] || '?'}> 💀 (Level 150)\n\n`;
            
            msgDesc += `🧬 **Evolução dentro do Nevoeiro**\n\n`;
            msgDesc += `• **Sobreviventes Perdidos:** você acaba de entrar no domínio da Entidade. Suas marcas ainda são sutis… mas o olhar dela já está sobre você.\n`;
            msgDesc += `• **Marcados pelo Nevoeiro:** sua presença se fortalece. A Entidade começa a reconhecer seus feitos, e isso se reflete em marcas mais intensas e visíveis.\n`;
            msgDesc += `• **Escolhidos da Entidade:** poucos chegam até aqui. Seu nome ecoa no Nevoeiro, e sua presença é impossível de ignorar.\n`;
            msgDesc += `• Membros com cargo ${boosterName} ganham ${MULTIPLICADOR_BOOSTER}x mais XP!\n\n`;
            
            msgDesc += `💀 *Continue interagindo. Continue avançando.*\n`;
            msgDesc += `A questão não é mais se a Entidade está te observando… mas o que ela pretende fazer com você...`;

            const embedOrientacoes = new EmbedBuilder()
                .setColor('#000000')
                .setTitle('🌫️ Progressão no Nevoeiro 🌫️')
                .setDescription(msgDesc);

            await canalAlvo.send({ content: '||@everyone||', embeds: [embedOrientacoes] });
            return interaction.editReply(`✅ Mensagem enviada para <#${canalAlvo.id}> e restrições de canais de XP ativadas com sucesso!`);
            
        } catch (error) {
            console.error('Erro no setup_orientacoes:', error);
            return interaction.editReply(`❌ Ocorreu um erro ao gerar a mensagem.`);
        }
    }

    // 🟢 NOVO COMANDO PARA RECUPERAR OS DADOS DO SERVIDOR PRINCIPAL
    if (interaction.commandName === 'admin_migrar_db') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
            const oldSnapshot = await db.collection('usuarios_xp').get();
            if (oldSnapshot.empty) {
                return interaction.editReply('❌ Nenhum dado antigo encontrado no banco.');
            }

            let count = 0;
            for (const doc of oldSnapshot.docs) {
                const data = doc.data();
                if (data.is_sistema) continue; // Ignora logs de sistema antigos
                
                const newRef = db.collection('servidores_xp').doc(interaction.guildId).collection('usuarios').doc(doc.id);
                await newRef.set(data, { merge: true });
                count++;
            }
            
            return interaction.editReply(`✅ **Migração concluída com sucesso!**\nForam transferidos **${count}** perfis de usuários antigos para o sistema isolado deste servidor.\n\nUse \x60/admin_corrigir_niveis\x60 e \x60/admin_corrigir_cargos\x60 logo em seguida para alinhar tudo!`);
        } catch (error) {
            console.error('Erro na migração:', error);
            return interaction.editReply(`❌ Ocorreu um erro ao transferir o banco de dados.`);
        }
    }

    const config = await obterConfigServidor(interaction.guildId);

    if (['admin_xp', 'admin_ver', 'admin_corrigir_niveis', 'admin_corrigir_cargos', 'manual_adm'].includes(interaction.commandName)) {
        if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ **Acesso Negado!**\nEste comando é restrito apenas para **Administradores**.', flags: MessageFlags.Ephemeral });
        if (config && interaction.channelId !== config.canal_comandos) return interaction.reply({ content: `❌ Comandos restritos ao canal configurado!`, flags: MessageFlags.Ephemeral });
    }

    if (['perfil', 'manual', 'ranking', 'ranking_completo'].includes(interaction.commandName)) {
        if (config && config.canal_comandos && interaction.channelId !== config.canal_comandos) {
            return interaction.reply({ content: `❌ Comandos restritos ao canal <#${config.canal_comandos}>!`, flags: MessageFlags.Ephemeral });
        } else if (!config) {
            return interaction.reply({ content: `⚠️ Servidor não configurado. Peça para um Admin usar **/setup_servidor**.`, flags: MessageFlags.Ephemeral });
        }
    }

    if (interaction.commandName === 'manual') {
        const embed = new EmbedBuilder()
            .setColor('#ff0033')
            .setTitle('📖 MANUAL DO SOBREVIVENTE')
            .setDescription('Bem-vindo ao sistema de progressão!\n*Quanto mais ativo, mais forte você se torna...*')
            .addFields(
                { name: '🎯 COMO GANHAR XP', value: '\x60\x60\x60\n📝 Mensagens: 15-25 XP (cooldown de 10 segundos)\n🎤 Call de Voz: 10 XP por minuto (tempo real)\n⚡ Booster: 2.2x mais XP!\n👑 VIP LEGACY: 2.0x mais XP!\n\x60\x60\x60', inline: false },
                { name: '📊 NÍVEIS E CONQUISTAS', value: '\x60\x60\x60\n🏆 Nível 1: Inexperienced (0 XP)\n🏆 Nível 10: Deja Vu (10.000 XP)\n🏆 Nível 20: Quick & Quiet (25.000 XP)\n🏆 Nível 30: Self-Care (45.000 XP)\n🏆 Nível 40: Bond (70.000 XP)\n🏆 Nível 50: Leader (100.000 XP)\n🏆 Nível 60: Adrenaline (135.000 XP)\n🏆 Nível 70: Borrowed Time (175.000 XP)\n🏆 Nível 80: BBQ & Chili (220.000 XP)\n🏆 Nível 90: Dying Light (270.000 XP)\n🏆 Nível 100: Devour Hope (325.000 XP)\n🏆 Nível 110: Corrupt Intervention (385.000 XP)\n🏆 Nível 120: No One Escapes Death (450.000 XP)\n🏆 Nível 130: Nemesis (515.000 XP)\n🏆 Nível 140: Blood Warden (590.000 XP)\n🏆 Nível 150: Decisive Strike (670.000 XP)\n\x60\x60\x60', inline: false },
                { name: '👥 COMANDOS PÚBLICOS', value: '\x60\x60\x60\n/perfil - Ver seu perfil completo\n/manual - Este manual interativo\n/ranking_completo - Ver todos com XP\n\x60\x60\x60', inline: true },
                { name: '⚙️ REGRAS DO SISTEMA', value: '\x60\x60\x60\n• Progressão de 1 em 1 nível\n• Cargos e anúncios a cada 10 níveis\n• Anti-flood ativado (10 segundos)\n• Mensagens repetidas são ignoradas\n\x60\x60\x60', inline: false }
            )
            .setFooter({ text: 'Sistema de Progressão' })
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'manual_adm') {
        const embed = new EmbedBuilder()
            .setColor('#8a0000')
            .setTitle('📖 MANUAL DO SOBREVIVENTE - [ADMIN]')
            .setDescription('Bem-vindo ao sistema de progressão!\n*Visão completa com ferramentas administrativas.*')
            .addFields(
                { name: '🎯 COMO GANHAR XP', value: '\x60\x60\x60\n📝 Mensagens: 15-25 XP (cooldown de 10 segundos)\n🎤 Call de Voz: 10 XP por minuto (tempo real)\n⚡ Booster: 2.2x mais XP!\n👑 VIP LEGACY: 2.0x mais XP!\n\x60\x60\x60', inline: false },
                { name: '📊 NÍVEIS E CONQUISTAS', value: '\x60\x60\x60\n🏆 Nível 1: Inexperienced (0 XP)\n🏆 Nível 10: Deja Vu (10.000 XP)\n🏆 Nível 20: Quick & Quiet (25.000 XP)\n🏆 Nível 30: Self-Care (45.000 XP)\n🏆 Nível 40: Bond (70.000 XP)\n🏆 Nível 50: Leader (100.000 XP)\n🏆 Nível 60: Adrenaline (135.000 XP)\n🏆 Nível 70: Borrowed Time (175.000 XP)\n🏆 Nível 80: BBQ & Chili (220.000 XP)\n🏆 Nível 90: Dying Light (270.000 XP)\n🏆 Nível 100: Devour Hope (325.000 XP)\n🏆 Nível 110: Corrupt Intervention (385.000 XP)\n🏆 Nível 120: No One Escapes Death (450.000 XP)\n🏆 Nível 130: Nemesis (515.000 XP)\n🏆 Nível 140: Blood Warden (590.000 XP)\n🏆 Nível 150: Decisive Strike (670.000 XP)\n\x60\x60\x60', inline: false },
                { name: '👥 COMANDOS PÚBLICOS', value: '\x60\x60\x60\n/perfil - Ver seu perfil\n/manual - Manual do usuário\n/ranking_completo - Ver todos\n\x60\x60\x60', inline: true },
                { name: '🛡️ COMANDOS ADMIN', value: '\x60\x60\x60\n/ranking - Top 10\n/admin_xp add/remove/set/reset\n/admin_ver - Info de usuário\n/admin_corrigir_niveis\n/admin_corrigir_cargos\n/admin_migrar_db\n/manual_adm - Este menu\n\x60\x60\x60', inline: true },
                { name: '🛠️ CONFIGURANDO UM NOVO SERVIDOR (ADMINS)', value: '\x60\x60\x60\n1️⃣ Use /setup_servidor para escolher os canais.\n2️⃣ Use /setup_cargos para o bot criar os 16 cargos de nível automaticamente.\n3️⃣ Use /setup_multiplicadores para criar os cargos extras.\n4️⃣ Use /setup_orientacoes para gerar a postagem de regras.\n⚠️ O cargo do bot precisa ter a permissão "Gerenciar Cargos" e estar no TOPO da lista de cargos!\n\x60\x60\x60', inline: false }
            )
            .setFooter({ text: 'Sistema de Progressão (Admin)' })
            .setTimestamp();
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (interaction.commandName === 'manual_adm') {
        const embed = new EmbedBuilder()
            .setColor('#8a0000')
            .setTitle('📖 MANUAL DO SOBREVIVENTE - [ADMIN]')
            .setDescription('Bem-vindo ao sistema de progressão!\n*Visão completa com ferramentas administrativas.*')
            .addFields(
                { name: '🎯 COMO GANHAR XP', value: '\x60\x60\x60\n📝 Mensagens: 15-25 XP (cooldown de 10 segundos)\n🎤 Call de Voz: 10 XP por minuto (tempo real)\n⚡ Booster: 2.2x mais XP!\n👑 VIP LEGACY: 2.0x mais XP!\n\x60\x60\x60', inline: false },
                { name: '📊 NÍVEIS E CONQUISTAS', value: '\x60\x60\x60\n🏆 Nível 1: Inexperienced\n🏆 Nível 10: Deja Vu\n🏆 Nível 20: Quick & Quiet\n🏆 Nível 30: Self-Care\n🏆 Nível 40: Bond\n🏆 Nível 50: Leader\n🏆 Nível 60: Adrenaline\n🏆 Nível 70: Borrowed Time\n🏆 Nível 80: BBQ & Chili\n🏆 Nível 90: Dying Light\n🏆 Nível 100: Devour Hope\n🏆 Nível 110: Corrupt Intervention\n🏆 Nível 120: No One Escapes Death\n🏆 Nível 130: Nemesis\n🏆 Nível 140: Blood Warden\n🏆 Nível 150: Decisive Strike\n\x60\x60\x60', inline: false },
                { name: '👥 COMANDOS PÚBLICOS', value: '\x60\x60\x60\n/perfil - Ver seu perfil\n/manual - Manual do usuário\n/ranking_completo - Ver todos\n\x60\x60\x60', inline: true },
                { name: '🛡️ COMANDOS ADMIN', value: '\x60\x60\x60\n/ranking - Top 10\n/admin_xp add/remove/set/reset\n/admin_ver - Info de usuário\n/admin_corrigir_niveis\n/admin_corrigir_cargos\n/admin_migrar_db\n/manual_adm - Este menu\n\x60\x60\x60', inline: true },
                { name: '🛠️ CONFIGURANDO UM NOVO SERVIDOR (ADMINS)', value: '\x60\x60\x60\n1️⃣ Use /setup_servidor para escolher os canais.\n2️⃣ Use /setup_cargos para o bot criar os 16 cargos de nível automaticamente.\n3️⃣ Use /setup_multiplicadores para criar os cargos extras.\n4️⃣ Use /setup_orientacoes para gerar a postagem de regras.\n⚠️ O cargo do bot precisa ter a permissão "Gerenciar Cargos" e estar no TOPO da lista de cargos!\n\x60\x60\x60', inline: false }
            )
            .setFooter({ text: 'Sistema de Progressão (Admin)' })
            .setTimestamp();
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (interaction.commandName === 'perfil') {
        try {
            await garantirUsuario(interaction.user.id, interaction.guildId);
            const membro = await interaction.guild.members.fetch(interaction.user.id);
            const doc = await db.collection('servidores_xp').doc(interaction.guildId).collection('usuarios').doc(interaction.user.id).get();
            
            const xp = doc.exists ? doc.data().xp || 0 : 0;
            const nivel = doc.exists ? doc.data().nivel || 1 : 1;
            const stats = doc.exists ? doc.data().stats || { mensagens: 0, tempoCall: 0, dataEntrada: Date.now() } : { mensagens: 0, tempoCall: 0, dataEntrada: Date.now() };
            
            const conquista = obterConquista(nivel);
            const { faltando, proximoNivel } = calcularXPProximoNivel(xp, nivel);
            const xpBase = calcularXPNecessarioParaNivel(nivel);
            const xpProximo = calcularXPNecessarioParaNivel(proximoNivel);
            const percentual = proximoNivel > nivel ? Math.floor((xp - xpBase) / (xpProximo - xpBase) * 100) : 100;
            const barraProgresso = '▰'.repeat(Math.floor(percentual / 5)) + '▱'.repeat(20 - Math.floor(percentual / 5));
            const tempoCallHoras = Math.floor(stats.tempoCall / 60);
            const tempoCallMinutos = stats.tempoCall % 60;
            
            const dataEntradaServidor = membro.joinedAt;
            const tempoNoServidor = Date.now() - dataEntradaServidor.getTime();
            const diasNoServidor = Math.floor(tempoNoServidor / (1000 * 60 * 60 * 24));
            const mesesNoServidor = Math.floor(diasNoServidor / 30);
            
            const embed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setAuthor({ name: membro.user.username, iconURL: membro.user.displayAvatarURL({ dynamic: true }) })
                .setTitle('📜 Perfil da Névoa')
                .setThumbnail(membro.user.displayAvatarURL({ dynamic: true, size: 1024 }))
                .addFields(
                    { name: '🏷️ Identidade', value: `**Usuário:** ${membro.user.tag}\n**Conquista:** ${conquista}`, inline: false },
                    { name: '📊 Progressão', value: `**Nível:** ${formatarNumero(nivel)}\n**XP Total:** ${formatarNumero(xp)}\n**Próximo:** Nível ${proximoNivel > nivel ? proximoNivel : 'MAX'}\n**Faltam:** ${formatarNumero(faltando)} XP`, inline: true },
                    { name: '📈 Progresso', value: `▰${barraProgresso}▰\n**${percentual}%**`, inline: false },
                    { name: '🎮 Atividade', value: `**Mensagens:** ${formatarNumero(stats.mensagens)}\n**Tempo em call:** ${tempoCallHoras}h ${tempoCallMinutos}m\n**Entrou em:** ${formatarData(dataEntradaServidor)}\n**Tempo no servidor:** ${mesesNoServidor > 0 ? `${mesesNoServidor} meses e ${diasNoServidor % 30} dias` : `${diasNoServidor} dias`}`, inline: false }
                )
                .setFooter({ text: 'Sistema de Progressão', iconURL: interaction.guild.iconURL({ dynamic: true }) })
                .setTimestamp();
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('❌ Erro no comando /perfil:', error);
            await interaction.reply({ content: '❌ Erro ao buscar perfil.', flags: MessageFlags.Ephemeral });
        }
    }

    if (interaction.commandName === 'ranking_completo') {
        await rankingCompleto(interaction);
    }

    if (interaction.commandName === 'ranking') {
        const snapshot = await db.collection('servidores_xp').doc(interaction.guildId).collection('usuarios').orderBy('xp', 'desc').limit(10).get();
        if (snapshot.empty) return interaction.reply({ content: '❌ Nenhum usuário no ranking!' });
        let rankingTexto = '';
        let posicao = 1;
        for (const doc of snapshot.docs) {
            const data = doc.data();
            if (data.is_sistema) continue;
            const membro = await interaction.guild.members.fetch(doc.id).catch(() => null);
            if (!membro) continue; 
            
            const nome = membro.user.username;
            rankingTexto += `${posicao}. **${nome}** - Nível ${data.nivel || 1} (${formatarNumero(data.xp || 0)} XP)\n`;
            posicao++;
        }
        const embed = new EmbedBuilder()
            .setColor('#ff0033')
            .setTitle('🏆 RANKING DA NÉVOA')
            .setDescription(rankingTexto || 'Ninguém foi encontrado neste servidor.')
            .setFooter({ text: 'Os mais devotos da Entidade' })
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'admin_corrigir_niveis') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const corrigidos = await corrigirNiveisTodos(interaction.guildId);
        await interaction.editReply({ 
            content: `✅ **Correção concluída!**\n\n${corrigidos} usuários tiveram o nível corrigido.\n\nOs níveis agora estão consistentes com o XP de cada usuário.` 
        });
        await enviarLogAdmin(interaction, 'corrigir_niveis', { tag: 'Sistema', id: 'sistema' }, corrigidos, { success: true, xpAntigo: 0, xpNovo: 0, nivel: 0 }, `Corrigidos ${corrigidos} usuários`);
    }

    if (interaction.commandName === 'admin_corrigir_cargos') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const resultado = await corrigirCargosTodos(interaction.guild);
        if (resultado.message !== 'Concluído') {
            return interaction.editReply({ content: `❌ **Atenção:** ${resultado.message}` });
        }
        await interaction.editReply({ 
            content: `✅ **Correção de cargos concluída no servidor atual!**\n\n📊 ${resultado.corrigidos} usuários tiveram os cargos corrigidos.\n⚠️ ${resultado.erros} erros encontrados.` 
        });
        await enviarLogAdmin(interaction, 'corrigir_cargos', { tag: 'Sistema', id: 'sistema' }, resultado.corrigidos, { success: true, xpAntigo: 0, xpNovo: 0, nivel: 0 }, `Corrigidos ${resultado.corrigidos} cargos, ${resultado.erros} erros`);
    }

    if (interaction.commandName === 'admin_xp') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const sub = interaction.options.getSubcommand();
        const usuario = interaction.options.getUser('usuario');
        const quantidade = interaction.options.getInteger('quantidade') || 0;
        const motivo = interaction.options.getString('motivo') || 'Sem motivo';
        
        let resultado;
        if (sub === 'add') resultado = await gerenciarXP(usuario.id, interaction.guild, quantidade, 'add', motivo);
        else if (sub === 'remove') resultado = await gerenciarXP(usuario.id, interaction.guild, quantidade, 'remove', motivo);
        else if (sub === 'set') resultado = await gerenciarXP(usuario.id, interaction.guild, quantidade, 'set', motivo);
        else resultado = await gerenciarXP(usuario.id, interaction.guild, 0, 'reset', motivo);
        
        if (resultado.success) {
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Comando Executado')
                .setDescription(`**Operação:** ${sub.toUpperCase()}\n**Usuário:** ${usuario.tag}\n**Motivo:** ${motivo}`)
                .addFields(
                    { name: '📊 XP Antigo', value: formatarNumero(resultado.xpAntigo), inline: true },
                    { name: '📊 XP Atual', value: formatarNumero(resultado.xpNovo), inline: true },
                    { name: '🎯 Nível', value: resultado.nivel.toString(), inline: true }
                )
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
            await enviarLogAdmin(interaction, sub, usuario, quantidade, resultado, motivo);
        } else {
            await interaction.editReply({ content: `❌ ${resultado.message}` });
        }
    }

    if (interaction.commandName === 'admin_ver') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const usuario = interaction.options.getUser('usuario');
        await garantirUsuario(usuario.id, interaction.guildId);
        const doc = await db.collection('servidores_xp').doc(interaction.guildId).collection('usuarios').doc(usuario.id).get();
        const xp = doc.exists ? doc.data().xp || 0 : 0;
        const nivel = doc.exists ? doc.data().nivel || 1 : 1;
        const stats = doc.exists ? doc.data().stats || { mensagens: 0, tempoCall: 0 } : { mensagens: 0, tempoCall: 0 };
        const nivelCorreto = calcularNivelPorXP(xp);
        const statusNivel = nivel === nivelCorreto ? '✅ Correto' : `⚠️ Deveria ser ${nivelCorreto}`;
        
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`📊 ${usuario.tag}`)
            .setThumbnail(usuario.displayAvatarURL())
            .addFields(
                { name: '🎯 Nível', value: `${formatarNumero(nivel)} ${statusNivel}`, inline: true },
                { name: '✨ XP Total', value: formatarNumero(xp), inline: true },
                { name: '💬 Mensagens', value: formatarNumero(stats.mensagens), inline: true },
                { name: '🎤 Tempo em Call', value: `${Math.floor(stats.tempoCall / 60)}h ${stats.tempoCall % 60}m`, inline: true },
                { name: '📈 Próximo Nível', value: `${formatarNumero(calcularXPNecessarioParaNivel(nivel + 1) - xp)} XP faltando`, inline: true }
            )
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    
    const config = await obterConfigServidor(message.guild.id);
    if (config) {
        if (config.canais_ignorados && config.canais_ignorados.includes(message.channelId)) return;
        if (config.canais_xp && config.canais_xp.length > 0 && !config.canais_xp.includes(message.channelId)) return;
    }

    const ultimaMsg = ultimaMensagem.get(message.author.id);
    if (ultimaMsg === message.content) return;
    ultimaMensagem.set(message.author.id, message.content);
    
    if (cooldowns.has(message.author.id)) {
        if (Date.now() < cooldowns.get(message.author.id) + COOLDOWN_TEMPO) return;
    }
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
                if (config.canais_ignorados && config.canais_ignorados.includes(newState.channelId)) return;
                if (config.canais_xp && config.canais_xp.length > 0 && !config.canais_xp.includes(newState.channelId)) return;
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

client.on('error', (error) => console.error('❌ Erro no cliente:', error));
client.login(process.env.TOKEN);