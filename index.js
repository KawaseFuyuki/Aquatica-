const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, PermissionFlagsBits } = require('discord.js');
const { QuickDB } = require('quick.db');
const express = require('express');
const db = new QuickDB();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const TOKEN = process.env.TOKEN;
const PREFIX = 'aq ';

const BLUE = 0x3498db;

// Express keep-alive for Render
const app = express();
app.get('/', (req, res) => res.send('Aquatica Bot is alive!'));
app.listen(3000, () => console.log('Keep-alive server running'));

// Game states
let games = {};

client.once('ready', async () => {
    console.log(`Aquatica#${client.user.discriminator} is online!`);
    
    // Register slash commands
    const commands = [
        new SlashCommandBuilder()
            .setName('help')
            .setDescription('Get help with bot commands')
            .addStringOption(option =>
                option.setName('category')
                    .setDescription('Help category')
                    .addChoices(
                        { name: 'Games', value: 'games' },
                        { name: 'Mod', value: 'mod' },
                        { name: 'Utility', value: 'utility' }
                    )),
        new SlashCommandBuilder()
            .setName('play')
            .setDescription('Play a game')
            .addStringOption(option =>
                option.setName('game')
                    .setDescription('Game to play')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Quiz', value: 'quiz' },
                        { name: 'Imposter', value: 'imposter' },
                        { name: 'Hangman', value: 'hangman' },
                        { name: 'RPS', value: 'rps' },
                        { name: 'Rumble', value: 'rumble' },
                        { name: 'Roulette', value: 'roulette' },
                        { name: 'Bomb Defuse', value: 'bomb' }
                    ))
            .addStringOption(option =>
                option.setName('difficulty')
                    .setDescription('Quiz difficulty')
                    .addChoices(
                        { name: 'Easy', value: 'easy' },
                        { name: 'Normal', value: 'normal' },
                        { name: 'Hard', value: 'hard' },
                        { name: 'Extreme', value: 'extreme' }
                    ))
            .addStringOption(option =>
                option.setName('category')
                    .setDescription('Hangman category')
                    .addChoices(
                        { name: 'Anime', value: 'anime' },
                        { name: 'Normal', value: 'normal' }
                    ))
    ];

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Successfully reloaded application slash commands.');
    } catch (error) {
        console.error(error);
    }
});

// Slash command handler
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    
    const { commandName } = interaction;
    
    if (commandName === 'help') {
        const category = interaction.options.getString('category');
        let helpEmbed;
        
        if (!category) {
            helpEmbed = new EmbedBuilder()
                .setColor(BLUE)
                .setTitle('💙 Aquatica Help Menu')
                .setDescription('Use `/help <category>` for detailed help')
                .addFields(
                    { name: '🎮 Games', value: '`/help games` - All game commands', inline: true },
                    { name: '🛡️ Mod', value: '`/help mod` - Moderation commands', inline: true },
                    { name: '🔧 Utility', value: '`/help utility` - Utility commands', inline: true }
                );
        } else if (category === 'games') {
            helpEmbed = new EmbedBuilder()
                .setColor(BLUE)
                .setTitle('🎮 Games Help')
                .addFields(
                    { name: '/play game:quiz difficulty:easy', value: 'Anime quiz with A/B/C/D options' },
                    { name: '/play game:imposter', value: 'Among Us style game with kill + vote' },
                    { name: '/play game:hangman category:anime', value: 'Hangman with anime/normal words' },
                    { name: '/play game:rps', value: 'Rock Paper Scissors' },
                    { name: '/play game:rumble', value: 'Battle Royale Rumble' }
                );
        } else if (category === 'mod') {
            helpEmbed = new EmbedBuilder()
                .setColor(BLUE)
                .setTitle('🛡️ Moderation Help')
                .setDescription('Prefix: aq \n`aq ban @user`, `aq kick @user`, `aq mute @user`');
        } else {
            helpEmbed = new EmbedBuilder()
                .setColor(BLUE)
                .setTitle('🔧 Utility Help')
                .setDescription('`aq ping`, `aq avatar @user`, `aq serverinfo`');
        }
        await interaction.reply({ embeds: [helpEmbed] });
    }
    
    if (commandName === 'play') {
        const game = interaction.options.getString('game');
        const difficulty = interaction.options.getString('difficulty') || 'normal';
        const category = interaction.options.getString('category') || 'normal';
        
        if (game === 'imposter') {
            await startImposter(interaction);
        } else if (game === 'quiz') {
            await startQuiz(interaction, difficulty);
        } else if (game === 'hangman') {
            await startHangman(interaction, category);
        } else {
            const gameEmbed = new EmbedBuilder()
                .setColor(BLUE)
                .setTitle('🎮 Game Started')
                .setDescription(`Starting ${game} game!`);
            await interaction.reply({ embeds: [gameEmbed] });
        }
    }
});

// Prefix commands
client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;
    
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    // Imposter commands
    if (command === 'startimposter') {
        await handleStartImposter(message);
    } else if (command === 'kill') {
        await handleKill(message, args);
    } else if (command === 'startvote') {
        await handleStartVote(message);
    } else if (command === 'vote') {
        await handleVote(message, args);
    } else if (command === 'endvote') {
        await handleEndVote(message);
    } else if (command === 'players') {
        await handlePlayers(message);
    } else if (command === 'skip') {
        await handleSkip(message);
    } else if (command === 'answer') {
        await handleQuizAnswer(message, args);
    } else if (command === 'ping') {
        const pingEmbed = new EmbedBuilder()
            .setColor(BLUE)
            .setTitle('🏓 Pong!')
            .setDescription(`Latency: ${client.ws.ping}ms`);
        message.reply({ embeds: [pingEmbed] });
    }
});

async function startImposter(interaction) {
    const gameEmbed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle('🕵️ Imposter Game')
        .setDescription('React with ✅ to join! Minimum 3 players needed.')
        .setFooter({ text: 'Use: aq startimposter after joining' });
    
    const msg = await interaction.reply({ embeds: [gameEmbed], fetchReply: true });
    await msg.react('✅');
    
    games[interaction.channelId] = {
        type: 'imposter',
        players: [],
        phase: 'joining',
        messageId: msg.id
    };
}

async function handleStartImposter(message) {
    const game = games[message.channelId];
    if (!game || game.type !== 'imposter') {
        const errorEmbed = new EmbedBuilder()
            .setColor(BLUE)
            .setTitle('❌ Error')
            .setDescription('No imposter game running. Use `/play game:imposter`');
        return message.reply({ embeds: [errorEmbed] });
    }
    
    const msg = await message.channel.messages.fetch(game.messageId);
    const reactions = msg.reactions.cache.get('✅');
    const users = await reactions.users.fetch();
    const players = users.filter(u => !u.bot).map(u => u.id);
    
    if (players.length < 3) {
        const errorEmbed = new EmbedBuilder()
            .setColor(BLUE)
            .setTitle('❌ Error')
            .setDescription('Need at least 3 players!');
        return message.reply({ embeds: [errorEmbed] });
    }
    
    const imposterIndex = Math.floor(Math.random() * players.length);
    const imposterId = players[imposterIndex];
    
    game.players = players.map(id => ({
        id,
        alive: true,
        isImposter: id === imposterId
    }));
    game.phase = 'playing';
    game.votes = {};
    game.votedBy = {};
    
    // Save to DB
    await db.set(`imposter_${message.channelId}`, game);
    
    // DM roles
    for (const player of game.players) {
        const user = await client.users.fetch(player.id);
        const roleEmbed = new EmbedBuilder()
            .setColor(BLUE)
            .setTitle(player.isImposter ? '🔪 You are IMPOSTER' : '👨‍🚀 You are CREWMATE')
            .setDescription(player.isImposter ? 
                'Kill crewmates with `aq kill @user` after meetings!
Win by eliminating all crewmates.' : 
                'Find and vote out the imposter!
Use `aq vote @user` during meetings.');
        try {
            await user.send({ embeds: [roleEmbed] });
        } catch {}
    }
    
    const startEmbed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle('🎮 Game Started!')
        .setDescription(`Roles sent to DMs!

**Alive Players:** ${players.map(id => `<@${id}>`).join(', ')}

Imposter can use \`aq kill @user\` after meetings.`)
        .setFooter({ text: 'Use aq startvote to begin voting' });
    message.reply({ embeds: [startEmbed] });
}

async function handleKill(message, args) {
    let game = games[message.channelId] || await db.get(`imposter_${message.channelId}`);
    if (!game || game.type !== 'imposter' || game.phase !== 'playing') {
        const errorEmbed = new EmbedBuilder()
            .setColor(BLUE)
            .setTitle('❌ Error')
            .setDescription('No active imposter game!');
        return message.reply({ embeds: [errorEmbed] });
    }
    
    const killer = game.players.find(p => p.id === message.author.id);
    if (!killer || !killer.isImposter || !killer.alive) {
        const errorEmbed = new EmbedBuilder()
            .setColor(BLUE)
            .setTitle('❌ Error')
            .setDescription('Only alive imposters can kill!');
        return message.reply({ embeds: [errorEmbed] });
    }
    
    const target = message.mentions.users.first();
    if (!target) {
        const errorEmbed = new EmbedBuilder()
            .setColor(BLUE)
            .setTitle('❌ Error')
            .setDescription('Mention someone to kill! `aq kill @user`');
        return message.reply({ embeds: [errorEmbed] });
    }
    
    const targetPlayer = game.players.find(p => p.id === target.id);
    if (!targetPlayer || !targetPlayer.alive) {
        const errorEmbed = new EmbedBuilder()
            .setColor(BLUE)
            .setTitle('❌ Error')
            .setDescription('Target is not alive or not in game!');
        return message.reply({ embeds: [errorEmbed] });
    }
    
    if (targetPlayer.isImposter) {
        const errorEmbed = new EmbedBuilder()
            .setColor(BLUE)
            .setTitle('❌ Error')
            .setDescription('You cannot kill yourself!');
        return message.reply({ embeds: [errorEmbed] });
    }
    
    targetPlayer.alive = false;
    
    const killEmbed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle('💀 KILL')
        .setDescription(`<@${message.author.id}> killed <@${target.id}>!`)
        .setFooter({ text: `${game.players.filter(p => p.alive).length} players remaining` });
    message.reply({ embeds: [killEmbed] });
    
    // Check win conditions
    await checkImposterWin(message.channel, game);
    games[message.channelId] = game;
    await db.set(`imposter_${message.channelId}`, game);
}

async function handleStartVote(message) {
    let game = games[message.channelId] || await db.get(`imposter_${message.channelId}`);
    if (!game || game.type !== 'imposter' || game.phase !== 'playing') {
        const errorEmbed = new EmbedBuilder()
            .setColor(BLUE)
            .setTitle('❌ Error')
            .setDescription('No active imposter game!');
        return message.reply({ embeds: [errorEmbed] });
    }
    
    game.phase = 'voting';
    game.votes = {};
    game.votedBy = {};
    
    const alivePlayers = game.players.filter(p => p.alive);
    const voteEmbed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle('🗳️ VOTING STARTED')
        .setDescription(`**Alive:** ${alivePlayers.map(p => `<@${p.id}>`).join(', ')}

Use: \`aq vote @user\`
End with: \`aq endvote\`
Skip with: \`aq skip\``);
    message.reply({ embeds: [voteEmbed] });
    
    games[message.channelId] = game;
    await db.set(`imposter_${message.channelId}`, game);
}

async function handleVote(message, args) {
    let game = games[message.channelId] || await db.get(`imposter_${message.channelId}`);
    if (!game || game.phase !== 'voting') {
        const errorEmbed = new EmbedBuilder()
            .setColor(BLUE)
            .setTitle('❌ Error')
            .setDescription('Voting is not active! Use `aq startvote`');
        return message.reply({ embeds: [errorEmbed] });
    }
    
    const voter = game.players.find(p => p.id === message.author.id);
    if (!voter || !voter.alive) {
        const errorEmbed = new EmbedBuilder()
            .setColor(BLUE)
            .setTitle('❌ Error')
            .setDescription('Only alive players can vote!');
        return message.reply({ embeds: [errorEmbed] });
    }
    
    const target = message.mentions.users.first();
    if (!target) {
        const errorEmbed = new EmbedBuilder()
            .setColor(BLUE)
            .setTitle('❌ Error')
            .setDescription('Mention someone to vote! `aq vote @user`');
        return message.reply({ embeds: [errorEmbed] });
    }
    
    const targetPlayer = game.players.find(p => p.id === target.id);
    if (!targetPlayer || !targetPlayer.alive) {
        const errorEmbed = new EmbedBuilder()
            .setColor(BLUE)
            .setTitle('❌ Error')
            .setDescription('Target is not alive!');
        return message.reply({ embeds: [errorEmbed] });
    }
    
    // Remove old vote
    if (game.votedBy[message.author.id]) {
        const oldTarget = game.votedBy[message.author.id];
        game.votes[oldTarget]--;
    }
    
    // Add new vote
    game.votes[target.id] = (game.votes[target.id] || 0) + 1;
    game.votedBy[message.author.id] = target.id;
    
    const voteEmbed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle('🗳️ VOTE CAST')
        .setDescription(`<@${message.author.id}> voted for <@${target.id}>`);
    message.reply({ embeds: [voteEmbed] });
    
    games[message.channelId] = game;
    await db.set(`imposter_${message.channelId}`, game);
}

async function handleEndVote(message) {
    let game = games[message.channelId] || await db.get(`imposter_${message.channelId}`);
    if (!game || game.phase !== 'voting') {
        const errorEmbed = new EmbedBuilder()
            .setColor(BLUE)
            .setTitle('❌ Error')
            .setDescription('Voting is not active!');
        return message.reply({ embeds: [errorEmbed] });
    }
    
    const voteCounts = Object.entries(game.votes).sort((a, b) => b[1] - a[1]);
    
    if (voteCounts.length === 0) {
        const skipEmbed = new EmbedBuilder()
            .setColor(BLUE)
            .setTitle('⏭️ SKIPPED')
            .setDescription('No votes cast. No one ejected.');
        message.reply({ embeds: [skipEmbed] });
        game.phase = 'playing';
        games[message.channelId] = game;
        await db.set(`imposter_${message.channelId}`, game);
        return;
    }
    
    const maxVotes = voteCounts[0][1];
    const topVoted = voteCounts.filter(([_, count]) => count === maxVotes);
    
    if (topVoted.length > 1) {
        const tieEmbed = new EmbedBuilder()
            .setColor(BLUE)
            .setTitle('⏭️ TIE - SKIPPED')
            .setDescription(`Tie between ${topVoted.map(([id]) => `<@${id}>`).join(' and ')}
No one ejected.`);
        message.reply({ embeds: [tieEmbed] });
        game.phase = 'playing';
        games[message.channelId] = game;
        await db.set(`imposter_${message.channelId}`, game);
        return;
    }
    
    const ejectedId = topVoted[0][0];
    const ejectedPlayer = game.players.find(p => p.id === ejectedId);
    ejectedPlayer.alive = false;
    
    // Build vote display
    let voteDisplay = '';
    for (const [targetId, count] of voteCounts) {
        const voters = Object.entries(game.votedBy)
            .filter(([_, tId]) => tId === targetId)
            .map(([voterId]) => `<@${voterId}>`);
        voteDisplay += `\n<@${targetId}> - ${count} vote${count > 1 ? 's' : ''}\n${voters.map(v => `└ ${v} voted`).join('\n')}\n`;
    }
    
    const resultEmbed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle('⚖️ VOTING RESULTS')
        .setDescription(`${voteDisplay}\n💀 <@${ejectedId}> was ejected!\nThey were: **${ejectedPlayer.isImposter ? 'IMPOSTER' : 'CREWMATE'}**\n\n${game.players.filter(p => p.alive).length} players remaining.`);
    message.reply({ embeds: [resultEmbed] });
    
    game.phase = 'playing';
    await checkImposterWin(message.channel, game);
    games[message.channelId] = game;
    await db.set(`imposter_${message.channelId}`, game);
}

async function handlePlayers(message) {
    let game = games[message.channelId] || await db.get(`imposter_${message.channelId}`);
    if (!game) {
        const errorEmbed = new EmbedBuilder()
            .setColor(BLUE)
            .setTitle('❌ Error')
            .setDescription('No game running!');
        return message.reply({ embeds: [errorEmbed] });
    }
    
    const alivePlayers = game.players.filter(p => p.alive);
    const playersEmbed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle('👥 ALIVE PLAYERS')
        .setDescription(alivePlayers.map(p => `• <@${p.id}>`).join('\n') || 'No one alive')
        .setFooter({ text: `Total: ${alivePlayers.length} players` });
    message.reply({ embeds: [playersEmbed] });
}

async function handleSkip(message) {
    let game = games[message.channelId] || await db.get(`imposter_${message.channelId}`);
    if (!game || game.phase !== 'voting') {
        const errorEmbed = new EmbedBuilder()
            .setColor(BLUE)
            .setTitle('❌ Error')
            .setDescription('Voting is not active!');
        return message.reply({ embeds: [errorEmbed] });
    }
    
    const skipEmbed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle('⏭️ VOTING SKIPPED')
        .setDescription('No one ejected.');
    message.reply({ embeds: [skipEmbed] });
    
    game.phase = 'playing';
    games[message.channelId] = game;
    await db.set(`imposter_${message.channelId}`, game);
}

async function checkImposterWin(channel, game) {
    const alivePlayers = game.players.filter(p => p.alive);
    const aliveImposters = alivePlayers.filter(p => p.isImposter);
    const aliveCrewmates = alivePlayers.filter(p => !p.isImposter);
    
    // Imposter wins: 1v1 or equal numbers
    if (aliveImposters.length >= aliveCrewmates.length && aliveCrewmates.length > 0) {
        const winEmbed = new EmbedBuilder()
            .setColor(BLUE)
            .setTitle('💀 IMPOSTER WINS!')
            .setDescription(`${aliveCrewmates.length} Crewmate${aliveCrewmates.length > 1 ? 's' : ''} vs ${aliveImposters.length} Imposter${aliveImposters.length > 1 ? 's' : ''}\nNot enough crewmates to vote them out.\n\n**The Imposter was:** <@${aliveImposters[0].id}>`);
        channel.send({ embeds: [winEmbed] });
        delete games[channel.id];
        await db.delete(`imposter_${channel.id}`);
        return true;
    }
    
    // Crewmates win: all imposters dead
    if (aliveImposters.length === 0) {
        const winEmbed = new EmbedBuilder()
            .setColor(BLUE)
            .setTitle('🏆 CREWMATES WIN!')
            .setDescription('All imposters eliminated!\n\n**Survivors:**\n' + aliveCrewmates.map(p => `<@${p.id}>`).join('\n'));
        channel.send({ embeds: [winEmbed] });
        delete games[channel.id];
        await db.delete(`imposter_${channel.id}`);
        return true;
    }
    
    return false;
}

async function startQuiz(interaction, difficulty) {
    const questions = {
        easy: [
            { q: 'Naruto's favorite food?', a: 'B', options: ['Sushi', 'Ramen', 'Dango', 'Rice'] },
            { q: 'Luffy's devil fruit?', a: 'A', options: ['Gomu Gomu', 'Mera Mera', 'Gura Gura', 'Ope Ope'] },
            { q: 'Goku's saiyan name?', a: 'C', options: ['Raditz', 'Bardock', 'Kakarot', 'Broly'] }
        ],
        normal: [
            { q: 'Levi's squad name in S4?', a: 'A', options: ['Special Operations Squad', 'Survey Corps', 'Garrison', 'Military Police'] },
            { q: 'Gojo's technique?', a: 'B', options: ['Cursed Energy', 'Limitless + Six Eyes', 'Domain Amplification', 'Black Flash'] }
        ],
        hard: [
            { q: 'Kurapika's chain ability for stealing?', a: 'D', options: ['Judgment', 'Dowsing', 'Holy', 'Steal Chain'] },
            { q: 'Lelouch's Geass limitation?', a: 'A', options: ['Once per person', 'Eye contact only', 'Range limit', 'Time limit'] }
        ],
        extreme: [
            { q: 'Monogatari: Koyomi's vampire name?', a: 'C', options: ['Shinobu', 'Kiss-shot', 'Koyomi Vamp', 'Heart-under-blade'] },
            { q: 'JoJo P7: Johnny's Stand?', a: 'A', options: ['Tusk', 'Ball Breaker', 'Dirty Deeds', 'D4C'] }
        ]
    };
    
    const quizEmbed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle('🎌 Anime Quiz - ' + difficulty.toUpperCase())
        .setDescription('10 questions coming up! React A/B/C/D or use `aq answer <letter>`')
        .setFooter({ text: 'Difficulty: ' + difficulty });
    
    await interaction.reply({ embeds: [quizEmbed] });
}

async function startHangman(interaction, category) {
    const words = {
        anime: ['gojo', 'luffy', 'naruto', 'itachi', 'levi'],
        normal: ['pizza', 'tiger', 'guitar', 'ocean', 'castle']
    };
    
    const word = words[category][Math.floor(Math.random() * words[category].length)];
    const hangmanEmbed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle('🎮 Hangman - ' + category.toUpperCase())
        .setDescription(`Word: ${'_ '.repeat(word.length)}\n\nGuess letters!`)
        .setFooter({ text: 'Lives: 6' });
    
    await interaction.reply({ embeds: [hangmanEmbed] });
}

async function handleQuizAnswer(message, args) {
    const answerEmbed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle('✅ Answer Recorded')
        .setDescription(`You answered: ${args[0]?.toUpperCase() || 'None'}`);
    message.reply({ embeds: [answerEmbed] });
}

client.login(TOKEN);
