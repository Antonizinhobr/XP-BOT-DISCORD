require('dotenv').config();

const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, MessageFlags, SlashCommandBuilder, REST, Routes } = require('discord.js');
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

process.on('unhandledRejection', (error) => {
    console.error('❌ Promessa rejeitada não tratada:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Exceção não capturada:', error);
});

setInterval(() => {
    console.log('💓 Heartbeat enviado em', new Date().toISOString());
}, 5 * 60 * 1000);

const cooldowns = new Map();
const ultimaMensagem = new Map();
const voiceSessions = new Map();

const COOLDOWN_TEMPO = 10000;
const XP_MIN = 15;
const XP_MAX = 25;
const XP_POR_MINUTO_CALL = 10;
const MULTIPLICADOR_BOOSTER = 2.2;
const MULTIPLICADOR_VIP_LEGACY = 2.0;

const CANAL_PERMITIDO_COMANDOS = '1495875498021093587';
const CANAL_RANKING_AUTO = '1495875650530185367';
const CANAL_LEVEL_UP = '1171355134199091241';
const CARGO_BOOSTER_ID = '1484332657616617574';
const CARGO_VIP_LEGACY_ID = '1495994246883315782';
const CANAL_LOGS_ADMIN = '1497013267460129011';

const ADMIN_IDS = [];

const CANAIS_PERMITIDOS_XP = [
    '1495875498021093587', '1171355134199091241', '1483471183507882004',
    '1475161108804272360', '1483975413360361612', '1485384640897351822',
    '1491427353774002397', '1493655811363311636', '1493987145705193494',
    '1493989461170716853', '1481609695008391292', '1481609758241980416',
    '1481609809504501790', '1489425952743231598', '1490184191458148382',
    '1171350608289210392', '1481715873386467471', '1481716438568927406',
    '1482054540105613455', '1480914969297158264', '1171348338189283348',
    '1171353763886399529', '1198083237201838090', '1171354225385685104',
    '1171354377336930304', '1490734159851687936', '1496484238143393936',
    '1496251465616855223', '1496251176440696833', '1496251246623985837',
    '1498409706383872000', '1498409826567586044', '1498642462103699666',
    '1498642485528891505', '1498409856321851442', '1498410084655567048',
    '1498642550616227939', '1498642614675701800', '1497757782588391474'
];

const CANAIS_IGNORADOS = [
    '1223315877265674320', '1223316371673186438', '1490878560972570655',
    '1495875498021093587', '1495875650530185367', '1495890265917882398',
    '1495891921816518786', '1171348760270487593', '1491071534792445952'
];

const BOOSTERS_MANUAIS = [];

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
        if (xp < xpNecessario) {
            return nivel;
        }
    }
    return 200;
}

function calcularXPProximoNivel(xp, nivelAtual) {
    const xpProximo = calcularXPNecessarioParaNivel(nivelAtual + 1);
    const faltando = Math.max(0, xpProximo - xp);
    return { faltando, proximoNivel: nivelAtual + 1 };
}

function formatarNumero(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function formatarData(data) {
    return data.toLocaleDateString('pt-BR');
}

const CONQUISTAS = {
    10: 'Deja Vu',
    20: 'Quick & Quiet',
    30: 'Self-Care',
    40: 'Bond',
    50: 'Leader',
    60: 'Adrenaline',
    70: 'Borrowed Time',
    80: 'BBQ & Chili',
    90: 'Dying Light',
    100: 'Devour Hope',
    110: 'Corrupt Intervention',
    120: 'No One Escapes Death',
    130: 'Nemesis',
    140: 'Blood Warden',
    150: 'Decisive Strike'
};

const RECOMPENSAS = {
    10: '1495883256686710894',
    20: '1495883156451229818',
    30: '1495883604893634610',
    40: '1495884038836322458',
    50: '1495885023465705533',
    60: '1495885140721930250',
    70: '1495885188700573887',
    80: '1495885725755900004',
    90: '1495885856643485756',
    100: '1495885944807620830',
    110: '1495886029985415188',
    120: '1495886129411522766',
    130: '1495886393560269012',
    140: '1496533691571110070',
    150: '1495886489223954494'
};

function obterConquista(nivel) {
    const niveisOrdenados = Object.keys(CONQUISTAS).sort((a,b) => Number(b) - Number(a));
    for (const n of niveisOrdenados) {
        if (nivel >= Number(n)) return CONQUISTAS[n];
    }
    return 'Inexperienced (No One Left Behind)';
}

function isAdmin(member) {
    if (ADMIN_IDS.includes(member.id)) return true;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    return false;
}

async function getMultiplicadorXP(userId, guild) {
    try {
        const membro = await guild.members.fetch(userId).catch(() => null);
        if (!membro) return 1;
        const temBooster = membro.roles.cache.has(CARGO_BOOSTER_ID) || BOOSTERS_MANUAIS.includes(userId);
        const temVipLegacy = membro.roles.cache.has(CARGO_VIP_LEGACY_ID);
        if (temBooster) return MULTIPLICADOR_BOOSTER;
        if (temVipLegacy) return MULTIPLICADOR_VIP_LEGACY;
        return 1;
    } catch (error) {
        console.error('❌ Erro ao verificar multiplicador:', error);
        return 1;
    }
}

async function isBooster(userId, guild) {
    try {
        const membro = await guild.members.fetch(userId).catch(() => null);
        if (!membro) return false;
        if (BOOSTERS_MANUAIS.includes(userId)) return true;
        return membro.roles.cache.has(CARGO_BOOSTER_ID);
    } catch (error) {
        return false;
    }
}

async function gerenciarCargosPorNivel(membro, nivelNovo, nivelAntigo) {
    try {
        const todosCargosNivel = Object.values(RECOMPENSAS).filter(id => id !== 'ID_CARGO');
        for (const cargoId of todosCargosNivel) {
            const cargo = membro.guild.roles.cache.get(cargoId);
            if (cargo && membro.roles.cache.has(cargoId)) {
                await membro.roles.remove(cargo).catch(() => {});
            }
        }
        const milestoneAtual = Math.floor(nivelNovo / 10) * 10;
        if (milestoneAtual >= 10 && RECOMPENSAS[milestoneAtual] && RECOMPENSAS[milestoneAtual] !== 'ID_CARGO') {
            const cargoNovo = membro.guild.roles.cache.get(RECOMPENSAS[milestoneAtual]);
            if (cargoNovo && !membro.roles.cache.has(RECOMPENSAS[milestoneAtual])) {
                await membro.roles.add(cargoNovo).catch(() => {});
            }
        }
    } catch (error) {
        console.error('❌ Erro ao gerenciar cargos:', error);
    }
}

async function enviarLogAdmin(interaction, operacao, usuario, quantidade, resultado, motivo = '') {
    try {
        const canalLog = await client.channels.fetch(CANAL_LOGS_ADMIN).catch(() => null);
        if (!canalLog || !canalLog.isTextBased()) return;
        const embed = new EmbedBuilder()
            .setColor(operacao === 'reset' ? '#ff0000' : '#00ff00')
            .setTitle('📋 LOG ADMINISTRATIVO')
            .setDescription(`**Comando executado por:** ${interaction.user.tag} (${interaction.user.id})\n**Operação:** ${operacao.toUpperCase()}`)
            .addFields(
                { name: '👤 Usuário Alvo', value: `${usuario.tag} (${usuario.id})`, inline: true },
                { name: '📝 Motivo', value: motivo || 'Sem motivo especificado', inline: true }
            )
            .setTimestamp();
        if (operacao === 'add') {
            embed.addFields(
                { name: '➕ XP Adicionado', value: formatarNumero(quantidade), inline: true },
                { name: '📊 XP Antigo', value: formatarNumero(resultado.xpAntigo), inline: true },
                { name: '📊 XP Novo', value: formatarNumero(resultado.xpNovo), inline: true },
                { name: '🎯 Nível Atual', value: resultado.nivel.toString(), inline: true }
            );
        } else if (operacao === 'remove') {
            embed.addFields(
                { name: '➖ XP Removido', value: formatarNumero(quantidade), inline: true },
                { name: '📊 XP Antigo', value: formatarNumero(resultado.xpAntigo), inline: true },
                { name: '📊 XP Novo', value: formatarNumero(resultado.xpNovo), inline: true },
                { name: '🎯 Nível Atual', value: resultado.nivel.toString(), inline: true }
            );
        } else if (operacao === 'set') {
            embed.addFields(
                { name: '🎯 XP Definido', value: formatarNumero(quantidade), inline: true },
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
        embed.addFields(
            { name: '👮 Administrador', value: `${interaction.user.tag}`, inline: true },
            { name: '🆔 ID do Admin', value: interaction.user.id, inline: true },
            { name: '📅 Data/Hora', value: new Date().toLocaleString('pt-BR'), inline: true }
        );
        await canalLog.send({ embeds: [embed] }).catch(console.error);
    } catch (error) {
        console.error('❌ Erro ao enviar log admin:', error);
    }
}

async function garantirColecao() {
    try {
        const testRef = db.collection('usuarios_xp').limit(1);
        const snapshot = await testRef.get();
        if (snapshot.empty) {
            console.log('📁 Coleção "usuarios_xp" não encontrada. Criando...');
            const tempRef = db.collection('usuarios_xp').doc('_sistema_');
            await tempRef.set({
                xp: 0,
                nivel: 1,
                stats: { mensagens: 0, tempoCall: 0 },
                is_sistema: true,
                criado_em: admin.firestore.FieldValue.serverTimestamp()
            });
            await tempRef.delete();
            console.log('✅ Coleção "usuarios_xp" criada com sucesso!');
        } else {
            console.log('✅ Coleção "usuarios_xp" já existe.');
        }
    } catch (error) {
        console.error('❌ Erro ao verificar/criar coleção:', error);
    }
}

async function garantirUsuario(userId) {
    try {
        const userRef = db.collection('usuarios_xp').doc(userId);
        const doc = await userRef.get();
        if (!doc.exists) {
            await userRef.set({
                xp: 0,
                nivel: 1,
                stats: {
                    mensagens: 0,
                    tempoCall: 0,
                    dataEntrada: Date.now()
                },
                criado_em: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`📝 Documento criado para usuário ${userId}`);
        }
        return true;
    } catch (error) {
        console.error(`❌ Erro ao garantir usuário ${userId}:`, error);
        return false;
    }
}

async function verificarLevelUp(userId, guild, nivelAntigo, nivelNovo) {
    try {
        const userRef = db.collection('usuarios_xp').doc(userId);
        const doc = await userRef.get();
        if (!doc.exists) return;
        const xpAtual = doc.data().xp || 0;
        const xpNecessarioNivelAtual = calcularXPNecessarioParaNivel(nivelNovo);
        if (xpAtual < xpNecessarioNivelAtual) {
            console.log(`⚠️ Usuário ${userId} tem nível ${nivelNovo} mas XP (${xpAtual}) < necessário (${xpNecessarioNivelAtual}). Corrigindo...`);
            const nivelCorrigido = calcularNivelPorXP(xpAtual);
            await userRef.update({ nivel: nivelCorrigido });
            return;
        }
        const membro = await guild.members.fetch(userId).catch(() => null);
        if (membro && nivelNovo > nivelAntigo) {
            await gerenciarCargosPorNivel(membro, nivelNovo, nivelAntigo);
        }
        const niveisMilestone = [];
        for (let i = Math.floor(nivelAntigo / 10) + 1; i <= Math.floor(nivelNovo / 10); i++) {
            const milestone = i * 10;
            const xpNecessarioMilestone = calcularXPNecessarioParaNivel(milestone);
            if (xpAtual >= xpNecessarioMilestone) {
                niveisMilestone.push(milestone);
            }
        }
        if (niveisMilestone.length === 0) return;
        const canalEvolucao = await client.channels.fetch(CANAL_LEVEL_UP).catch(() => null);
        if (!canalEvolucao || !membro || !canalEvolucao.isTextBased?.()) return;
        for (const milestone of niveisMilestone) {
            const conquista = CONQUISTAS[milestone];
            if (!conquista) continue;
            let mensagemDescricao = `A Névoa sussurra o seu nome, <@${userId}>...\nSua dedicação foi reconhecida e você ascendeu para o **Nível ${milestone}**!\n\n🏆 **Nova Conquista:** ${conquista}`;
            let ganhouCargo = false;
            if (RECOMPENSAS[milestone] && RECOMPENSAS[milestone] !== 'ID_CARGO') {
                const cargoId = RECOMPENSAS[milestone];
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
                .setFooter({ text: 'Comunidade Black • Teia de Sangue', iconURL: guild.iconURL({ dynamic: true }) })
                .setTimestamp();
            if (ganhouCargo) embed.setImage('https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExcXZ5ams1d2k4N3BxMDdoaXYzcDdzaHBmamNpMG9lc2MzOHR1dXNyZyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/dauO3PZO8aKrlFZ9tX/giphy.gif');
            await canalEvolucao.send({ content: `🎉 @here <@${userId}> acaba de subir para o nível **${milestone}**! 🎉`, embeds: [embed] }).catch(() => {});
        }
    } catch (error) {
        console.error('❌ Erro em verificarLevelUp:', error);
    }
}

async function adicionarXPMensagem(userId, guild, addXp, canalAviso = null) {
    try {
        if (!userId || !guild) return false;
        await garantirUsuario(userId);
        const multiplicador = await getMultiplicadorXP(userId, guild);
        let xpFinal = Math.floor(addXp * multiplicador);
        const userRef = db.collection('usuarios_xp').doc(userId);
        const doc = await userRef.get();
        if (!doc.exists) return false;
        let xpAtual = doc.data().xp || 0;
        let nivelAtual = doc.data().nivel || 1;
        let stats = doc.data().stats || { mensagens: 0, tempoCall: 0, dataEntrada: Date.now() };
        stats.mensagens += 1;
        const novoXp = xpAtual + xpFinal;
        const novoNivel = calcularNivelPorXP(novoXp);
        await userRef.set({
            xp: novoXp,
            nivel: novoNivel,
            stats: stats,
            ultima_atualizacao: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        if (novoNivel > nivelAtual) {
            await verificarLevelUp(userId, guild, nivelAtual, novoNivel);
        }
        return true;
    } catch (error) {
        console.error('❌ Erro em adicionarXPMensagem:', error);
        return false;
    }
}

async function adicionarXPCall(userId, guild, canalAviso = null) {
    try {
        if (!userId || !guild) return false;
        await garantirUsuario(userId);
        const multiplicador = await getMultiplicadorXP(userId, guild);
        let xpGanho = Math.floor(XP_POR_MINUTO_CALL * multiplicador);
        const userRef = db.collection('usuarios_xp').doc(userId);
        const doc = await userRef.get();
        if (!doc.exists) return false;
        let xpAtual = doc.data().xp || 0;
        let nivelAtual = doc.data().nivel || 1;
        let stats = doc.data().stats || { mensagens: 0, tempoCall: 0, dataEntrada: Date.now() };
        stats.tempoCall += 1;
        const novoXp = xpAtual + xpGanho;
        const novoNivel = calcularNivelPorXP(novoXp);
        await userRef.set({
            xp: novoXp,
            nivel: novoNivel,
            stats: stats,
            ultima_atualizacao: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        if (novoNivel > nivelAtual) {
            await verificarLevelUp(userId, guild, nivelAtual, novoNivel);
        }
        return true;
    } catch (error) {
        console.error('❌ Erro em adicionarXPCall:', error);
        return false;
    }
}

async function enviarRankingAutomatico() {
    try {
        const canal = await client.channels.fetch(CANAL_RANKING_AUTO).catch(() => null);
        if (!canal) return;
        const snapshot = await db.collection('usuarios_xp').orderBy('xp', 'desc').limit(10).get();
        if (snapshot.empty) return;
        let rankingTexto = '';
        let posicao = 1;
        for (const doc of snapshot.docs) {
            const data = doc.data();
            if (data.is_sistema) continue;
            const membro = await canal.guild.members.fetch(doc.id).catch(() => null);
            const nome = membro ? membro.user.username : 'Usuário Desconhecido';
            rankingTexto += `${posicao}. **${nome}** - Nível ${data.nivel || 1} (${formatarNumero(data.xp || 0)} XP)\n`;
            posicao++;
        }
        const embed = new EmbedBuilder()
            .setColor('#ff0033')
            .setTitle('🏆 RANKING DA NÉVOA')
            .setDescription(rankingTexto || 'Nenhum usuário no ranking ainda')
            .setFooter({ text: 'Comunidade Black • Ranking atualizado automaticamente' })
            .setTimestamp();
        const messages = await canal.messages.fetch({ limit: 1 }).catch(() => []);
        const ultimaMsg = messages.first();
        if (ultimaMsg && ultimaMsg.author.id === client.user.id && ultimaMsg.embeds.length > 0) {
            await ultimaMsg.edit({ embeds: [embed] }).catch(() => {});
        } else {
            await canal.send({ embeds: [embed] }).catch(() => {});
        }
    } catch (error) {
        console.error('❌ Erro no ranking automático:', error);
    }
}

async function gerenciarXP(userId, guild, quantidade, operacao, motivo = '') {
    try {
        await garantirUsuario(userId);
        const userRef = db.collection('usuarios_xp').doc(userId);
        const doc = await userRef.get();
        if (!doc.exists) return { success: false, message: 'Usuário não encontrado!' };
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
            xp: novoXp,
            nivel: novoNivel,
            stats: stats,
            ultima_atualizacao: admin.firestore.FieldValue.serverTimestamp(),
            ultima_modificacao: { operacao, quantidade, motivo, data: new Date(), xp_anterior: xpAtual, xp_novo: novoXp }
        }, { merge: true });
        if (novoNivel !== nivelAtual) {
            const membro = await guild.members.fetch(userId).catch(() => null);
            if (membro) {
                await gerenciarCargosPorNivel(membro, novoNivel, nivelAtual);
            }
            await verificarLevelUp(userId, guild, nivelAtual, novoNivel);
        }
        return { success: true, xpAntigo: xpAtual, xpNovo: novoXp, nivel: novoNivel };
    } catch (error) {
        console.error('❌ Erro em gerenciarXP:', error);
        return { success: false, message: 'Erro ao processar!' };
    }
}

async function corrigirNiveisTodos() {
    try {
        const snapshot = await db.collection('usuarios_xp').get();
        let corrigidos = 0;
        for (const doc of snapshot.docs) {
            const data = doc.data();
            if (data.is_sistema) continue;
            const xpAtual = data.xp || 0;
            const nivelCorreto = calcularNivelPorXP(xpAtual);
            const nivelAtual = data.nivel || 1;
            if (nivelCorreto !== nivelAtual) {
                await db.collection('usuarios_xp').doc(doc.id).update({ nivel: nivelCorreto });
                corrigidos++;
                console.log(`Corrigido ${doc.id}: Nível ${nivelAtual} → ${nivelCorreto} (XP: ${xpAtual})`);
            }
        }
        return corrigidos;
    } catch (error) {
        console.error('❌ Erro ao corrigir níveis:', error);
        return 0;
    }
}

async function corrigirCargosTodos() {
    try {
        const snapshot = await db.collection('usuarios_xp').get();
        let corrigidos = 0;
        let erros = 0;
        const todosCargosNivel = Object.values(RECOMPENSAS).filter(id => id !== 'ID_CARGO');
        for (const doc of snapshot.docs) {
            const data = doc.data();
            if (data.is_sistema) continue;
            const userId = doc.id;
            const nivel = data.nivel || 1;
            const membro = await client.guilds.cache.first().members.fetch(userId).catch(() => null);
            if (!membro) continue;
            try {
                for (const cargoId of todosCargosNivel) {
                    const cargo = membro.guild.roles.cache.get(cargoId);
                    if (cargo && membro.roles.cache.has(cargoId)) {
                        await membro.roles.remove(cargo).catch(() => {});
                    }
                }
                const milestoneAtual = Math.floor(nivel / 10) * 10;
                if (milestoneAtual >= 10 && RECOMPENSAS[milestoneAtual] && RECOMPENSAS[milestoneAtual] !== 'ID_CARGO') {
                    const cargoNovo = membro.guild.roles.cache.get(RECOMPENSAS[milestoneAtual]);
                    if (cargoNovo && !membro.roles.cache.has(RECOMPENSAS[milestoneAtual])) {
                        await membro.roles.add(cargoNovo).catch(() => {});
                        corrigidos++;
                    }
                }
            } catch (error) {
                erros++;
                console.error(`❌ Erro ao corrigir cargo de ${userId}:`, error);
            }
        }
        return { corrigidos, erros };
    } catch (error) {
        console.error('❌ Erro ao corrigir cargos:', error);
        return { corrigidos: 0, erros: 0 };
    }
}

async function rankingCompleto(interaction) {
    try {
        const snapshot = await db.collection('usuarios_xp').orderBy('xp', 'desc').get();
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
            .setFooter({ text: `Comunidade Black • Total de ${totalUsuarios} usuários com XP • Mostrando top 50` })
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error('❌ Erro no ranking completo:', error);
        await interaction.reply({ content: '❌ Erro ao gerar ranking completo!', flags: MessageFlags.Ephemeral });
    }
}

client.once('ready', async () => {
    console.log(`🤖 Bot online como ${client.user.tag}`);
    console.log(`📊 Multiplicadores: Booster = ${MULTIPLICADOR_BOOSTER}x | VIP LEGACY = ${MULTIPLICADOR_VIP_LEGACY}x`);
    await garantirColecao();
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    const commands = [
        new SlashCommandBuilder().setName('perfil').setDescription('📜 Mostra seu perfil completo na Névoa'),
        new SlashCommandBuilder().setName('manual').setDescription('📖 Explica como funciona o sistema de níveis e XP'),
        new SlashCommandBuilder().setName('ranking').setDescription('🏆 [ADMIN] Mostra o ranking do servidor'),
        new SlashCommandBuilder().setName('ranking_completo').setDescription('🏆 Mostra todos os usuários com XP do servidor'),
        new SlashCommandBuilder().setName('admin_xp').setDescription('⚙️ [ADMIN] Gerencia XP de usuários')
            .addSubcommand(sub => sub.setName('add').setDescription('➕ Adiciona XP')
                .addUserOption(opt => opt.setName('usuario').setDescription('👤 Usuário').setRequired(true))
                .addIntegerOption(opt => opt.setName('quantidade').setDescription('🔢 Quantidade de XP').setRequired(true).setMinValue(1))
                .addStringOption(opt => opt.setName('motivo').setDescription('📝 Motivo').setRequired(false)))
            .addSubcommand(sub => sub.setName('remove').setDescription('➖ Remove XP')
                .addUserOption(opt => opt.setName('usuario').setDescription('👤 Usuário').setRequired(true))
                .addIntegerOption(opt => opt.setName('quantidade').setDescription('🔢 Quantidade de XP').setRequired(true).setMinValue(1))
                .addStringOption(opt => opt.setName('motivo').setDescription('📝 Motivo').setRequired(false)))
            .addSubcommand(sub => sub.setName('set').setDescription('🎯 Define XP exato')
                .addUserOption(opt => opt.setName('usuario').setDescription('👤 Usuário').setRequired(true))
                .addIntegerOption(opt => opt.setName('quantidade').setDescription('🔢 Novo XP total').setRequired(true).setMinValue(0))
                .addStringOption(opt => opt.setName('motivo').setDescription('📝 Motivo').setRequired(false)))
            .addSubcommand(sub => sub.setName('reset').setDescription('🔄 Reseta XP')
                .addUserOption(opt => opt.setName('usuario').setDescription('👤 Usuário').setRequired(true))
                .addStringOption(opt => opt.setName('motivo').setDescription('📝 Motivo').setRequired(false))),
        new SlashCommandBuilder().setName('admin_ver').setDescription('👁️ [ADMIN] Ver informações de um usuário')
            .addUserOption(opt => opt.setName('usuario').setDescription('👤 Usuário').setRequired(true)),
        new SlashCommandBuilder().setName('admin_corrigir_niveis').setDescription('🔧 [ADMIN] Corrige níveis de todos os usuários'),
        new SlashCommandBuilder().setName('admin_corrigir_cargos').setDescription('🔧 [ADMIN] Corrige cargos de todos os usuários baseado no nível')
    ];
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Comandos slash registrados!');
    } catch (error) {
        console.error('❌ Erro ao registrar comandos:', error);
    }
    await enviarRankingAutomatico();
    setInterval(() => enviarRankingAutomatico(), 6 * 60 * 60 * 1000);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (['admin_xp', 'admin_ver', 'ranking', 'admin_corrigir_niveis', 'admin_corrigir_cargos'].includes(interaction.commandName)) {
        if (!isAdmin(interaction.member)) {
            return interaction.reply({ 
                content: '❌ **Acesso Negado!**\nEste comando é restrito apenas para **Administradores** do servidor.', 
                flags: MessageFlags.Ephemeral 
            });
        }
        if (interaction.channelId !== CANAL_PERMITIDO_COMANDOS) {
            return interaction.reply({ 
                content: `❌ Comandos só podem ser usados no canal <#${CANAL_PERMITIDO_COMANDOS}>!`, 
                flags: MessageFlags.Ephemeral 
            });
        }
    }
    if (['perfil', 'manual', 'ranking_completo'].includes(interaction.commandName)) {
        if (interaction.channelId !== CANAL_PERMITIDO_COMANDOS) {
            return interaction.reply({ 
                content: `❌ Comandos só podem ser usados no canal <#${CANAL_PERMITIDO_COMANDOS}>!`, 
                flags: MessageFlags.Ephemeral 
            });
        }
    }
    if (interaction.commandName === 'manual') {
        const embed = new EmbedBuilder()
            .setColor('#ff0033')
            .setTitle('📖 MANUAL DO SOBREVIVENTE')
            .setDescription('Bem-vindo ao sistema de progressão do **SERVIDOR BLACK**!\n*Quanto mais ativo, mais forte você se torna...*')
            .addFields(
                { name: '🎯 COMO GANHAR XP', value: '```\n📝 Mensagens: 15-25 XP (cooldown de 10 segundos)\n🎤 Call de Voz: 10 XP por minuto (tempo real)\n⚡ Booster: 3.0x mais XP!\n👑 VIP LEGACY: 2.0x mais XP!\n🚫 Canais de música/AFK não contam XP\n```', inline: false },
                { name: '📊 NÍVEIS E CONQUISTAS', value: '```\n🏆 Nível 10: Deja Vu (10.000 XP)\n🏆 Nível 20: Quick & Quiet (25.000 XP)\n🏆 Nível 30: Self-Care (45.000 XP)\n🏆 Nível 40: Bond (70.000 XP)\n🏆 Nível 50: Leader (100.000 XP)\n🏆 Nível 60: Adrenaline (135.000 XP)\n🏆 Nível 70: Borrowed Time (175.000 XP)\n🏆 Nível 80: BBQ & Chili (220.000 XP)\n🏆 Nível 90: Dying Light (270.000 XP)\n🏆 Nível 100: Devour Hope (325.000 XP)\n🏆 Nível 110: Corrupt Intervention (385.000 XP)\n🏆 Nível 120: No One Escapes Death (450.000 XP)\n🏆 Nível 130: Nemesis (515.000 XP)\n🏆 Nível 140: Blood Warden (590.000 XP)\n🏆 Nível 150: Decisive Strike (670.000 XP)\n```', inline: false },
                { name: '👥 COMANDOS PÚBLICOS', value: '```\n/perfil - Ver seu perfil completo\n/manual - Este manual interativo\n/ranking_completo - Ver todos com XP\n```', inline: true },
                { name: '🛡️ COMANDOS ADMINISTRATIVOS', value: '```\n/ranking - Top 10 do servidor\n/admin_xp add - Adicionar XP\n/admin_xp remove - Remover XP\n/admin_xp set - Definir XP exato\n/admin_xp reset - Resetar XP\n/admin_ver - Ver informações\n/admin_corrigir_niveis - Corrigir níveis\n/admin_corrigir_cargos - Corrigir cargos\n```\n⚠️ *Apenas administradores podem usar estes comandos*', inline: true },
                { name: '⚙️ REGRAS DO SISTEMA', value: '```\n• Progressão de 1 em 1 nível\n• Cargos e anúncios a cada 10 níveis\n• Anti-flood ativado (10 segundos)\n• Mensagens repetidas são ignoradas\n• Calls em canais de música/AFK não contam\n```', inline: false }
            )
            .setFooter({ text: 'Comunidade Black • Quanto mais ativo, mais forte você se torna!' })
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }
    if (interaction.commandName === 'ranking_completo') {
        await rankingCompleto(interaction);
    }
    if (interaction.commandName === 'perfil') {
        try {
            await garantirUsuario(interaction.user.id);
            const membro = await interaction.guild.members.fetch(interaction.user.id);
            const doc = await db.collection('usuarios_xp').doc(interaction.user.id).get();
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
                    { name: '🎮 Atividade', value: `**Mensagens:** ${formatarNumero(stats.mensagens)}\n**Tempo em call:** ${tempoCallHoras}h ${tempoCallMinutos}m\n**Entrou em:** ${formatarData(dataEntradaServidor)}\n**Tempo no Refúgio:** ${mesesNoServidor > 0 ? `${mesesNoServidor} meses e ${diasNoServidor % 30} dias` : `${diasNoServidor} dias`}`, inline: false }
                )
                .setFooter({ text: 'Servidor BLACK • Sistema de Progressão', iconURL: interaction.guild.iconURL({ dynamic: true }) })
                .setTimestamp();
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('❌ Erro no comando /perfil:', error);
            await interaction.reply({ content: '❌ Erro ao buscar perfil.', flags: MessageFlags.Ephemeral });
        }
    }
    if (interaction.commandName === 'ranking') {
        const snapshot = await db.collection('usuarios_xp').orderBy('xp', 'desc').limit(10).get();
        if (snapshot.empty) return interaction.reply({ content: '❌ Nenhum usuário no ranking!' });
        let rankingTexto = '';
        let posicao = 1;
        for (const doc of snapshot.docs) {
            const data = doc.data();
            if (data.is_sistema) continue;
            const membro = await interaction.guild.members.fetch(doc.id).catch(() => null);
            const nome = membro ? membro.user.username : 'Desconhecido';
            rankingTexto += `${posicao}. **${nome}** - Nível ${data.nivel || 1} (${formatarNumero(data.xp || 0)} XP)\n`;
            posicao++;
        }
        const embed = new EmbedBuilder()
            .setColor('#ff0033')
            .setTitle('🏆 RANKING DA NÉVOA')
            .setDescription(rankingTexto)
            .setFooter({ text: 'Comunidade Black • Os mais devotos da Entidade' })
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }
    if (interaction.commandName === 'admin_corrigir_niveis') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const corrigidos = await corrigirNiveisTodos();
        await interaction.editReply({ 
            content: `✅ **Correção concluída!**\n\n${corrigidos} usuários tiveram o nível corrigido.\n\nOs níveis agora estão consistentes com o XP de cada usuário.` 
        });
        await enviarLogAdmin(interaction, 'corrigir_niveis', { tag: 'Sistema', id: 'sistema' }, corrigidos, { success: true, xpAntigo: 0, xpNovo: 0, nivel: 0 }, `Corrigidos ${corrigidos} usuários`);
    }
    if (interaction.commandName === 'admin_corrigir_cargos') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const resultado = await corrigirCargosTodos();
        await interaction.editReply({ 
            content: `✅ **Correção de cargos concluída!**\n\n📊 ${resultado.corrigidos} usuários tiveram os cargos corrigidos.\n⚠️ ${resultado.erros} erros encontrados.\n\nAgora cada usuário possui apenas o cargo correspondente ao seu nível atual.` 
        });
        await enviarLogAdmin(interaction, 'corrigir_cargos', { tag: 'Sistema', id: 'sistema' }, resultado.corrigidos, { success: true, xpAntigo: 0, xpNovo: 0, nivel: 0 }, `Corrigidos ${resultado.corrigidos} cargos, ${resultado.erros} erros`);
    }
    if (interaction.commandName === 'admin_xp') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const sub = interaction.options.getSubcommand();
        const usuario = interaction.options.getUser('usuario');
        const quantidade = interaction.options.getInteger('quantidade');
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
        await garantirUsuario(usuario.id);
        const doc = await db.collection('usuarios_xp').doc(usuario.id).get();
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
        const canalLog = await client.channels.fetch(CANAL_LOGS_ADMIN).catch(() => null);
        if (canalLog && canalLog.isTextBased()) {
            const logEmbed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('👁️ VISUALIZAÇÃO DE PERFIL')
                .setDescription(`**Administrador:** ${interaction.user.tag} (${interaction.user.id})\n**Visualizou perfil de:** ${usuario.tag} (${usuario.id})`)
                .addFields(
                    { name: '📊 Dados visualizados', value: `Nível: ${nivel}\nXP: ${formatarNumero(xp)}\nMensagens: ${formatarNumero(stats.mensagens)}\nTempo Call: ${Math.floor(stats.tempoCall / 60)}h ${stats.tempoCall % 60}m`, inline: false }
                )
                .setTimestamp();
            await canalLog.send({ embeds: [logEmbed] }).catch(console.error);
        }
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    if (!CANAIS_PERMITIDOS_XP.includes(message.channelId)) return;
    if (CANAIS_IGNORADOS.includes(message.channelId)) return;
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
        if (!userId) return;
        const guild = newState.guild || oldState.guild;
        if (!guild) return;
        if (!oldState.channelId && newState.channelId && !CANAIS_IGNORADOS.includes(newState.channelId)) {
            const interval = setInterval(async () => {
                const membro = await guild.members.fetch(userId).catch(() => null);
                if (!membro?.voice.channelId || CANAIS_IGNORADOS.includes(membro.voice.channelId)) {
                    if (voiceSessions.has(userId)) {
                        clearInterval(voiceSessions.get(userId).interval);
                        voiceSessions.delete(userId);
                    }
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
        if (newState.channelId && CANAIS_IGNORADOS.includes(newState.channelId) && voiceSessions.has(userId)) {
            clearInterval(voiceSessions.get(userId).interval);
            voiceSessions.delete(userId);
        }
    } catch (error) {
        console.error('❌ Erro no voiceStateUpdate:', error);
    }
});

client.on('error', (error) => console.error('❌ Erro no cliente:', error));
client.on('disconnect', () => console.log('⚠️ Bot desconectado. Tentando reconectar...'));

console.log('⏳ Conectando à Entidade...');
client.login(process.env.TOKEN);