const { Client, GatewayIntentBits, ActivityType, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('AquaBot is running!'));
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const prefix = 'aq';
const BLUE = 0x3498DB;

// ===== GAME STORAGE =====
const games = {
    imposter: {},
    rps: {},
    rumble: {},
    quiz: {},
    roulette: {},
    hangman: {},
    bomb: {}
};

const animeChars = ['naruto', 'goku', 'luffy', 'ichigo', 'eren', 'tanjiro', 'gojo', 'itachi', 'zoro', 'levi', 'killua', 'deku', 'saitama', 'sasuke', 'kakashi'];
const quizQuestions = [
    { q: 'Who is the 9-Tails jinchuriki in Naruto?', a: ['naruto', 'naruto uzumaki'] },
    { q: 'Who is the Straw Hat captain in One Piece?', a: ['luffy', 'monkey d luffy'] },
    { q: 'Who is the main character in Demon Slayer?', a: ['tanjiro', 'tanjiro kamado'] },
    { q: 'Who is the MC of Attack on Titan?', a: ['eren', 'eren yeager'] },
    { q: 'Who is Goku\'s son in Dragon Ball?', a: ['gohan', 'gohan'] }
];

// ===== SLASH COMMANDS =====
const commands = [
    new SlashCommandBuilder().setName('help').setDescription('Show all AquaBot commands'),
    new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),
    new SlashCommandBuilder().setName('play').setDescription('Play a game')
        .addStringOption(option =>
            option.setName('game')
                .setDescription('Choose a game')
                .setRequired(true)
                .addChoices(
                    { name: 'Imposter', value: 'imposter' },
                    { name: 'Rock Paper Scissors', value: 'rps' },
                    { name: 'Rumble', value: 'rumble' },
                    { name: 'Anime Quiz', value: 'quiz' },
                    { name: 'Russian Roulette', value: 'roulette' },
                    { name: 'Hangman', value: 'hangman' },
                    { name: 'Number Bomb', value: 'bomb' }
                ))
        .addUserOption(option => option.setName('user').setDescription('User for RPS').setRequired(false)),
    new SlashCommandBuilder().setName('avatar').setDescription('Get user avatar')
        .addUserOption(option => option.setName('user').setDescription('Target user').setRequired(false))
].map(cmd => cmd.toJSON());

client.on('ready', async () => {
    console.log(`${client.user.tag} is online!`);
    client.user.setActivity('created by kitaryo senpai', { type: ActivityType.Playing });
    
    // Register slash commands
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        console.log('Started refreshing application slash commands.');
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Successfully reloaded application slash commands.');
    } catch (error) {
        console.error(error);
    }
});

// ===== HELPER: Send Embed =====
function sendEmbed(channel, title, description) {
    const embed = new EmbedBuilder().setColor(BLUE).setTitle(title).setDescription(description);
    return channel.send({ embeds: [embed] });
}

function replyEmbed(message, title, description) {
    const embed = new EmbedBuilder().setColor(BLUE).setTitle(title).setDescription(description);
    return message.reply({ embeds: [embed] });
}

// ===== SLASH COMMAND HANDLER =====
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    
    const { commandName } = interaction;
    
    if (commandName === 'help') {
        const embed = new EmbedBuilder()
            .setColor(BLUE)
            .setTitle('AquaBot Commands')
            .setDescription('**Prefix:** `aq`\n**Games:** imposter, rps, rumble, quiz, roulette, hangman, bomb\n**Usage:** `/play game:<game>` or `aq play <game>`\n**Other:** /ping, /avatar')
            .setFooter({ text: 'created by kitaryo senpai' });
        await interaction.reply({ embeds: [embed] });
    }
    
    else if (commandName === 'ping') {
        const embed = new EmbedBuilder().setColor(BLUE).setTitle('🏓 Pong!').setDescription(`Latency: ${Date.now() - interaction.createdTimestamp}ms | API: ${client.ws.ping}ms`);
        await interaction.reply({ embeds: [embed] });
    }
    
    else if (commandName === 'avatar') {
        const user = interaction.options.getUser('user') || interaction.user;
        const embed = new EmbedBuilder().setColor(BLUE).setTitle(`${user.username}'s Avatar`).setImage(user.displayAvatarURL({ dynamic: true, size: 1024 }));
        await interaction.reply({ embeds: [embed] });
    }
    
    else if (commandName === 'play') {
        const game = interaction.options.getString('game');
        const channelId = interaction.channel.id;
        
        if (game === 'imposter') {
            if (games.imposter[channelId]) return interaction.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('Game already running in this channel!')], ephemeral: true });
            const embed = new EmbedBuilder()
                .setColor(BLUE)
                .setTitle('🕵️ Find the Imposter')
                .setDescription('React with ✅ to join! Minimum 4 players needed. Starting in 20s\nType `aq startimposter` to begin early');
            const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
            await msg.react('✅');
            games.imposter[channelId] = { players: [], started: false, msg };
        }
        
        else if (game === 'rps') {
            const opponent = interaction.options.getUser('user');
            if (!opponent) return interaction.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('Please select a user to challenge!')], ephemeral: true });
            if (opponent.bot) return interaction.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('You cannot play against bots!')], ephemeral: true });
            const embed = new EmbedBuilder()
                .setColor(BLUE)
                .setTitle('✂️ Rock Paper Scissors')
                .setDescription(`${interaction.user} vs ${opponent}\nBoth players check your DMs! Send r/p/s within 20s`);
            await interaction.reply({ embeds: [embed] });
            games.rps[channelId] = { p1: interaction.user.id, p2: opponent.id, p1Choice: null, p2Choice: null };
            interaction.user.send('Choose: `r` for rock, `p` for paper, `s` for scissors');
            opponent.send('Choose: `r` for rock, `p` for paper, `s` for scissors');
            setTimeout(() => {
                if (games.rps[channelId] && (!games.rps[channelId].p1Choice || !games.rps[channelId].p2Choice)) {
                    interaction.channel.send({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('⏰ Time up! Game cancelled due to inactivity.')] });
                    delete games.rps[channelId];
                }
            }, 20000);
        }
        
        else if (game === 'rumble') {
            const embed = new EmbedBuilder()
                .setColor(BLUE)
                .setTitle('💥 Rumble Battle Royale')
                .setDescription('React with ⚔️ to join! Starting in 15s');
            const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
            await msg.react('⚔️');
            games.rumble[channelId] = { players: [], started: false };
            setTimeout(async () => {
                const users = await msg.reactions.cache.get('⚔️').users.fetch();
                const players = users.filter(u => !u.bot).map(u => u.id);
                if (players.length < 2) return interaction.channel.send({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('Minimum 2 players required!')] });
                games.rumble[channelId].players = players;
                runRumble(interaction.channel, players);
            }, 15000);
        }
        
        else if (game === 'quiz') {
            if (games.quiz[channelId]) return interaction.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('Quiz already running in this channel!')], ephemeral: true });
            games.quiz[channelId] = { score: {}, currentQ: 0, questions: quizQuestions.sort(() => 0.5 - Math.random()).slice(0, 5) };
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle('🎌 Anime Quiz').setDescription('Quiz starting!')] });
            sendQuizQuestion(interaction.channel);
        }
        
        else if (game === 'roulette') {
            const embed = new EmbedBuilder()
                .setColor(BLUE)
                .setTitle('🔫 Russian Roulette')
                .setDescription('React with 🎯 to join! 2-6 players. Starting in 15s');
            const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
            await msg.react('🎯');
            setTimeout(async () => {
                const users = await msg.reactions.cache.get('🎯').users.fetch();
                const players = users.filter(u => !u.bot).map(u => u.id);
                if (players.length < 2) return interaction.channel.send({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('Minimum 2 players required!')] });
                games.roulette[channelId] = { players, bullet: Math.floor(Math.random() * 6), current: 0 };
                interaction.channel.send({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription(`Game started! <@${players[0]}> type \`aq shoot\` to pull the trigger`)] });
            }, 15000);
        }
        
        else if (game === 'hangman') {
            if (games.hangman[channelId]) return interaction.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('Hangman already running in this channel!')], ephemeral: true });
            const word = animeChars[Math.floor(Math.random() * animeChars.length)];
            games.hangman[channelId] = {
                word,
                guessed: [],
                lives: 7,
                display: word.split('').map(() => '_').join(' ')
            };
            const embed = new EmbedBuilder()
                .setColor(BLUE)
                .setTitle('🎮 Anime Hangman')
                .setDescription(`Word: \`${games.hangman[channelId].display}\`\nLives: ❤️❤️❤️❤️❤️❤️❤️\nGuess with: \`aq g <letter>\``);
            await interaction.reply({ embeds: [embed] });
        }
        
        else if (game === 'bomb') {
            if (games.bomb[channelId]) return interaction.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('Bomb game already running in this channel!')], ephemeral: true });
            games.bomb[channelId] = { number: 0, bomb: Math.floor(Math.random() * 21) + 20, turn: interaction.user.id };
            const embed = new EmbedBuilder()
                .setColor(BLUE)
                .setTitle('💣 Number Bomb')
                .setDescription(`Current: 0 | Bomb is between 20-40\n<@${interaction.user.id}>'s turn! Add 1-3: \`aq add <1-3>\``);
            await interaction.reply({ embeds: [embed] });
        }
    }
});

// ===== MESSAGE COMMAND HANDLER =====
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.toLowerCase().startsWith(prefix)) return;
    
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const channelId = message.channel.id;

    // ===== PLAY COMMAND =====
    if (command === 'play') {
        const game = args[0];
        
        if (game === 'imposter') {
            if (games.imposter[channelId]) return replyEmbed(message, '', 'Game already running in this channel!');
            const embed = new EmbedBuilder()
                .setColor(BLUE)
                .setTitle('🕵️ Find the Imposter')
                .setDescription('React with ✅ to join! Minimum 4 players needed. Starting in 20s\nType `aq startimposter` to begin early');
            const msg = await message.channel.send({ embeds: [embed] });
            await msg.react('✅');
            games.imposter[channelId] = { players: [], started: false, msg };
        }
        
        else if (game === 'rps') {
            const opponent = message.mentions.users.first();
            if (!opponent) return replyEmbed(message, '', 'Mention someone to challenge! `aq play rps @user`');
            if (opponent.bot) return replyEmbed(message, '', 'You cannot play against bots!');
            const embed = new EmbedBuilder()
                .setColor(BLUE)
                .setTitle('✂️ Rock Paper Scissors')
                .setDescription(`${message.author} vs ${opponent}\nBoth players check your DMs! Send r/p/s within 20s`);
            message.channel.send({ embeds: [embed] });
            games.rps[channelId] = { p1: message.author.id, p2: opponent.id, p1Choice: null, p2Choice: null };
            message.author.send('Choose: `r` for rock, `p` for paper, `s` for scissors');
            opponent.send('Choose: `r` for rock, `p` for paper, `s` for scissors');
            setTimeout(() => {
                if (games.rps[channelId] && (!games.rps[channelId].p1Choice || !games.rps[channelId].p2Choice)) {
                    sendEmbed(message.channel, '', '⏰ Time up! Game cancelled due to inactivity.');
                    delete games.rps[channelId];
                }
            }, 20000);
        }
        
        else if (game === 'rumble') {
            const embed = new EmbedBuilder()
                .setColor(BLUE)
                .setTitle('💥 Rumble Battle Royale')
                .setDescription('React with ⚔️ to join! Starting in 15s');
            const msg = await message.channel.send({ embeds: [embed] });
            await msg.react('⚔️');
            games.rumble[channelId] = { players: [], started: false };
            setTimeout(async () => {
                const users = await msg.reactions.cache.get('⚔️').users.fetch();
                const players = users.filter(u => !u.bot).map(u => u.id);
                if (players.length < 2) return sendEmbed(message.channel, '', 'Minimum 2 players required!');
                games.rumble[channelId].players = players;
                runRumble(message.channel, players);
            }, 15000);
        }
        
        else if (game === 'quiz') {
            if (games.quiz[channelId]) return replyEmbed(message, '', 'Quiz already running in this channel!');
            games.quiz[channelId] = { score: {}, currentQ: 0, questions: quizQuestions.sort(() => 0.5 - Math.random()).slice(0, 5) };
            sendQuizQuestion(message.channel);
        }
        
        else if (game === 'roulette') {
            const embed = new EmbedBuilder()
                .setColor(BLUE)
                .setTitle('🔫 Russian Roulette')
                .setDescription('React with 🎯 to join! 2-6 players. Starting in 15s');
            const msg = await message.channel.send({ embeds: [embed] });
            await msg.react('🎯');
            setTimeout(async () => {
                const users = await msg.reactions.cache.get('🎯').users.fetch();
                const players = users.filter(u => !u.bot).map(u => u.id);
                if (players.length < 2) return sendEmbed(message.channel, '', 'Minimum 2 players required!');
                games.roulette[channelId] = { players, bullet: Math.floor(Math.random() * 6), current: 0 };
                sendEmbed(message.channel, '', `Game started! <@${players[0]}> type \`aq shoot\` to pull the trigger`);
            }, 15000);
        }
        
        else if (game === 'hangman') {
            if (games.hangman[channelId]) return replyEmbed(message, '', 'Hangman already running in this channel!');
            const word = animeChars[Math.floor(Math.random() * animeChars.length)];
            games.hangman[channelId] = {
                word,
                guessed: [],
                lives: 7,
                display: word.split('').map(() => '_').join(' ')
            };
            const embed = new EmbedBuilder()
                .setColor(BLUE)
                .setTitle('🎮 Anime Hangman')
                .setDescription(`Word: \`${games.hangman[channelId].display}\`\nLives: ❤️❤️❤️❤️❤️❤️❤️\nGuess with: \`aq g <letter>\``);
            message.channel.send({ embeds: [embed] });
        }
        
        else if (game === 'bomb') {
            if (games.bomb[channelId]) return replyEmbed(message, '', 'Bomb game already running in this channel!');
            games.bomb[channelId] = { number: 0, bomb: Math.floor(Math.random() * 21) + 20, turn: message.author.id };
            const embed = new EmbedBuilder()
                .setColor(BLUE)
                .setTitle('💣 Number Bomb')
                .setDescription(`Current: 0 | Bomb is between 20-40\n<@${message.author.id}>'s turn! Add 1-3: \`aq add <1-3>\``);
            message.channel.send({ embeds: [embed] });
        }
        
        else {
            replyEmbed(message, '🎮 AquaBot Games', '**Available Games:**\nimposter, rps, rumble, quiz, roulette, hangman, bomb\n\nUsage: `aq play <game>`');
        }
    }
    
    // ===== GAME COMMANDS =====
    else if (command === 'startimposter' && games.imposter[channelId]) {
        const msg = games.imposter[channelId].msg;
        const users = await msg.reactions.cache.get('✅').users.fetch();
        const players = users.filter(u => !u.bot);
        if (players.size < 4) return replyEmbed(message, '', 'Minimum 4 players required!');
        const imposter = players.random();
        players.forEach(p => {
            const role = p.id === imposter.id ? 'IMPOSTER 🕵️' : 'CREWMATE 👨‍🚀';
            p.send(`Your role: **${role}**`);
        });
        sendEmbed(message.channel, '', `Game started! ${players.size} players. Check your DMs for your role. Discuss and vote with \`aq vote @user\``);
        games.imposter[channelId].started = true;
    }
    
    else if (command === 'shoot' && games.roulette[channelId]) {
        const game = games.roulette[channelId];
        if (message.author.id !== game.players[game.current]) return replyEmbed(message, '', 'It is not your turn!');
        if (game.current === game.bullet) {
            sendEmbed(message.channel, '💥 BANG!', `${message.author} got shot! Game over.`);
            delete games.roulette[channelId];
        } else {
            game.current++;
            sendEmbed(message.channel, '', `*click* Empty chamber! <@${game.players[game.current % game.players.length]}>'s turn`);
            game.current = game.current % game.players.length;
        }
    }
    
    else if ((command === 'g' || command === 'guess') && games.hangman[channelId]) {
        const letter = args[0]?.toLowerCase();
        if (!letter || letter.length !== 1) return replyEmbed(message, '', 'Please send one letter! `aq g a`');
        const game = games.hangman[channelId];
        if (game.guessed.includes(letter)) return replyEmbed(message, '', 'You already guessed that letter!');
        game.guessed.push(letter);
        if (game.word.includes(letter)) {
            game.display = game.word.split('').map(l => game.guessed.includes(l) ? l : '_').join(' ');
            if (!game.display.includes('_')) {
                sendEmbed(message.channel, '🎉 You Won!', `The word was: **${game.word}**`);
                delete games.hangman[channelId];
                return;
            }
        } else {
            game.lives--;
            if (game.lives === 0) {
                sendEmbed(message.channel, '💀 Game Over', `The word was: **${game.word}**`);
                delete games.hangman[channelId];
                return;
            }
        }
        const embed = new EmbedBuilder()
            .setColor(BLUE)
            .setTitle('🎮 Anime Hangman')
            .setDescription(`Word: \`${game.display}\`\nLives: ${'❤️'.repeat(game.lives)}\nGuessed: ${game.guessed.join(', ')}`);
        message.channel.send({ embeds: [embed] });
    }
    
    else if (command === 'add' && games.bomb[channelId]) {
        const game = games.bomb[channelId];
        if (message.author.id !== game.turn) return replyEmbed(message, '', 'It is not your turn!');
        const num = parseInt(args[0]);
        if (![1,2,3].includes(num)) return replyEmbed(message, '', 'You can only add 1, 2, or 3!');
        game.number += num;
        if (game.number >= game.bomb) {
            sendEmbed(message.channel, '💥 BOOM!', `${message.author} hit the bomb at ${game.number}! Game over.`);
            delete games.bomb[channelId];
        } else {
            sendEmbed(message.channel, '', `Current: ${game.number} | Bomb: 20-40\nNext player's turn!`);
        }
    }
    
    else if (command === 'answer' && games.quiz[channelId]) {
        const answer = args.join(' ').toLowerCase();
        const game = games.quiz[channelId];
        const correct = game.questions[game.currentQ].a.includes(answer);
        if (correct) {
            game.score[message.author.id] = (game.score[message.author.id] || 0) + 1;
            message.channel.send(`✅ Correct! <@${message.author.id}> +1 point`);
        }
        game.currentQ++;
        if (game.currentQ >= game.questions.length) endQuiz(message.channel, game);
        else setTimeout(() => sendQuizQuestion(message.channel), 2000);
    }
    
    // ===== BASIC COMMANDS =====
    else if (command === 'ping') {
        replyEmbed(message, '🏓 Pong!', `Latency: ${Date.now() - message.createdTimestamp}ms | API: ${client.ws.ping}ms`);
    }
    else if (command === 'av' || command === 'avatar') {
        const user = message.mentions.users.first() || message.author;
        const embed = new EmbedBuilder().setColor(BLUE).setTitle(`${user.username}'s Avatar`).setImage(user.displayAvatarURL({ dynamic: true, size: 1024 }));
        message.reply({ embeds: [embed] });
    }
    else if (command === 'help') {
        replyEmbed(message, 'AquaBot Commands', '**Prefix:** `aq`\n**Games:** imposter, rps, rumble, quiz, roulette, hangman, bomb\n**Usage:** `/play game:<game>` or `aq play <game>`\n**Other:** /ping, /avatar');
    }
    
    // ===== MODERATION =====
    else if (command === 'ban') {
        if (!message.member.permissions.has('BanMembers')) return replyEmbed(message, '❌ No Permission', 'You do not have permission to ban members!');
        const user = message.mentions.users.first();
        if (!user) return replyEmbed(message, '', 'Please mention a user to ban!');
        const reason = args.slice(1).join(' ') || 'No reason provided';
        replyEmbed(message, '🔨 Banned', `${user.tag} | Reason: ${reason}`);
    }
    else if (command === 'mute') {
        if (!message.member.permissions.has('ModerateMembers')) return replyEmbed(message, '❌ No Permission', 'You do not have permission to mute members!');
        const user = message.mentions.users.first();
        const duration = args[1] || '10m';
        replyEmbed(message, '🔇 Muted', `${user.tag} for ${duration}`);
    }
    else if (command === 'warn') {
        if (!message.member.permissions.has('ManageMessages')) return replyEmbed(message, '❌ No Permission', 'You do not have permission to warn members!');
        const user = message.mentions.users.first();
        const reason = args.slice(1).join(' ') || 'No reason provided';
        replyEmbed(message, '⚠️ Warned', `${user.tag} | Reason: ${reason}`);
    }
});

// DM Handler for RPS
client.on('messageCreate', async message => {
    if (message.channel.type !== 1 || message.author.bot) return;
    const choice = message.content.toLowerCase();
    if (!['r','p','s'].includes(choice)) return;
    
    for (const channelId in games.rps) {
        const game = games.rps[channelId];
        if (game.p1 === message.author.id) game.p1Choice = choice;
        if (game.p2 === message.author.id) game.p2Choice = choice;
        
        if (game.p1Choice && game.p2Choice) {
            const channel = await client.channels.fetch(channelId);
            const winner = getRPSWinner(game.p1Choice, game.p2Choice);
            let result;
            if (winner === 0) result = "It's a tie!";
            else if (winner === 1) result = `<@${game.p1}> wins!`;
            else result = `<@${game.p2}> wins!`;
            const embed = new EmbedBuilder().setColor(BLUE).setTitle('✂️ RPS Result').setDescription(`<@${game.p1}>: ${game.p1Choice.toUpperCase()}\n<@${game.p2}>: ${game.p2Choice.toUpperCase()}\n\n${result}`);
            channel.send({ embeds: [embed] });
            delete games.rps[channelId];
        }
    }
});

function getRPSWinner(p1, p2) {
    if (p1 === p2) return 0;
    if ((p1 === 'r' && p2 === 's') || (p1 === 'p' && p2 === 'r') || (p1 === 's' && p2 === 'p')) return 1;
    return 2;
}

function sendQuizQuestion(channel) {
    const game = games.quiz[channel.id];
    const q = game.questions[game.currentQ];
    const embed = new EmbedBuilder().setColor(BLUE).setTitle(`🎌 Anime Quiz Q${game.currentQ + 1}/5`).setDescription(`${q.q}\n\nAnswer with: \`aq answer <your answer>\``);
    channel.send({ embeds: [embed] });
}

function endQuiz(channel, game) {
    const sorted = Object.entries(game.score).sort((a,b) => b[1] - a[1]);
    let desc = '**Final Scores:**\n';
    sorted.forEach(([id, score], i) => desc += `${i+1}. <@${id}> - ${score} pts\n`);
    const embed = new EmbedBuilder().setColor(BLUE).setTitle('🏆 Quiz Over!').setDescription(desc || 'No one scored!');
    channel.send({ embeds: [embed] });
    delete games.quiz[channel.id];
}

async function runRumble(channel, players) {
    const startEmbed = new EmbedBuilder().setColor(BLUE).setTitle('💥 Rumble Started!').setDescription(`Players: ${players.map(p => `<@${p}>`).join(', ')}\nEliminations starting...`);
    await channel.send({ embeds: [startEmbed] });
    while (players.length > 1) {
        await new Promise(r => setTimeout(r, 3000));
        const eliminated = players.splice(Math.floor(Math.random() * players.length), 1)[0];
        const elimEmbed = new EmbedBuilder().setColor(BLUE).setDescription(`💀 <@${eliminated}> was eliminated! ${players.length} remaining`);
        await channel.send({ embeds: [elimEmbed] });
    }
    const winnerEmbed = new EmbedBuilder().setColor(BLUE).setTitle('👑 WINNER!').setDescription(`<@${players[0]}> wins the Rumble!`);
    channel.send({ embeds: [winnerEmbed] });
    delete games.rumble[channel.id];
}

client.login(process.env.TOKEN);
